import { ItemView, WorkspaceLeaf, TFile, setIcon, debounce } from "obsidian";
import { moment } from "obsidian";
import type BetterCalendarPlugin from "./main";
import { VIEW_TYPE_CALENDAR } from "./constants";
import { computeGeometry, placeFocus, visualColumn, GridPlacement } from "./layout";
import { effectiveLocale, isWeekend, startOfWeek, weekdayLabels, weekStartDay } from "./dateUtils";
import { dayKey } from "./dailyNotes";
import {
	DiaryConfig,
	createDiaryNote,
	diaryDateFromPath,
	diaryPathForDate,
	getDiaryConfig,
	getDiaryNote,
} from "./diary";
import { CreateNoteModal } from "./createNoteModal";
import { DiaryPanel } from "./panel";
import { t } from "./i18n";

/** No gap between weeks — the grid reads as one continuous strip. */
const BLOCK_GAP = 0;
/** Width of the optional week-number column, in px. */
const WEEKNUM_W = 26;
/** Height of the weekday header row, in px. */
const WEEKDAY_ROW_H = 22;
/** Horizontal padding of .better-calendar (12px each side, see styles.css). */
const PANE_PADDING_H = 24;
/** Gap between the calendar column and the stats column (.bc-top). */
const COLUMN_GAP = 10;
/** Minimum width of the side stats column (.bc-side min-width). */
const SIDE_MIN_W = 72;

interface CellRef {
	el: HTMLElement;
	dotsEl: HTMLElement;
	key: string;
	monthKey: string;
	vrow: number;
	vcol: number;
	file: TFile | null;
}

export class CalendarView extends ItemView {
	private plugin: BetterCalendarPlugin;

	private titleMonthEl!: HTMLElement;
	private titleYearEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private gridEl!: HTMLElement;
	private sideEl!: HTMLElement;
	private panelScrollEl!: HTMLElement;
	private inputBarEl!: HTMLElement;
	private panel!: DiaryPanel;

	/** Start-of-week date of the top-left visible week. */
	private firstVisibleWeekStart: moment.Moment;
	/** When true, today is auto-pinned to the focus slot on every (re)layout. */
	private pinnedToToday = true;

	/** Diary config snapshot for the current render. */
	private diaryConfig: DiaryConfig | null = null;
	private cellsByVisual = new Map<string, CellRef>();
	private cellsByKey = new Map<string, CellRef>();
	/** dayKey of the currently active daily note, if any. */
	private activeDayKey: string | null = null;
	/** Bumped on every grid rebuild so async dot updates can detect staleness. */
	private generation = 0;

	private resizeObserver: ResizeObserver | null = null;
	private readonly schedulePanelResize: () => void;

	constructor(leaf: WorkspaceLeaf, plugin: BetterCalendarPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.firstVisibleWeekStart = moment().startOf("day");
		this.schedulePanelResize = debounce(() => this.panel?.onResize(), 120, true);
	}

	getViewType(): string {
		return VIEW_TYPE_CALENDAR;
	}

	getDisplayText(): string {
		return "Better Calendar";
	}

	getIcon(): string {
		return "calendar-days";
	}

	async onOpen(): Promise<void> {
		this.buildChrome();
		this.refreshData();
		// Registered once here (not in the rebuildable chrome): the panel's
		// midnight/clock heartbeat.
		this.registerInterval(window.setInterval(() => this.panel?.tick(), 30_000));
		// The calendar itself is fixed-size; resizes only toggle the two-column
		// mode and re-flow the width-adaptive heatmap.
		this.resizeObserver = new ResizeObserver(() => {
			this.applyLayout();
			this.schedulePanelResize();
		});
		this.resizeObserver.observe(this.contentEl);
		// Highlight the day of the active daily note, and keep it in sync.
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateActiveDay()));
		this.updateActiveDay();
	}

	async onClose(): Promise<void> {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
	}

	/** Re-render everything (called on vault changes and settings saves). */
	refreshData(structural = true): void {
		this.applyLayout();
		this.render();
		this.panel?.refresh(structural);
	}

	/** Move keyboard focus into the quick-input box. */
	focusInput(): void {
		this.panel?.focusInput();
	}

	/** Tear down and rebuild the whole DOM (e.g. after a language change). */
	rebuild(): void {
		this.buildChrome();
		this.refreshData();
	}

	// --- chrome ---------------------------------------------------------------

	private buildChrome(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("better-calendar");

		// Top row: the calendar column, plus (in wide panes) the stats column.
		const top = root.createDiv({ cls: "bc-top" });
		const calCol = top.createDiv({ cls: "bc-cal-col" });

		const nav = calCol.createDiv({ cls: "bc-nav" });
		const title = nav.createDiv({ cls: "bc-title" });
		this.titleMonthEl = title.createSpan({ cls: "bc-title-month" });
		this.titleYearEl = title.createSpan({ cls: "bc-title-year" });

		const controls = nav.createDiv({ cls: "bc-controls" });
		const prev = controls.createEl("button", { cls: "bc-nav-btn", attr: { "aria-label": t("prevMonth") } });
		setIcon(prev, "chevron-left");
		this.registerDomEvent(prev, "click", () => this.shiftMonths(-1));

		const today = controls.createEl("button", {
			cls: "bc-nav-btn bc-today-btn",
			text: t("today"),
			attr: { "aria-label": t("goToToday") },
		});
		this.registerDomEvent(today, "click", () => this.goToToday());

		const next = controls.createEl("button", { cls: "bc-nav-btn", attr: { "aria-label": t("nextMonth") } });
		setIcon(next, "chevron-right");
		this.registerDomEvent(next, "click", () => this.shiftMonths(1));

		this.bodyEl = calCol.createDiv({ cls: "bc-body" });
		this.gridEl = this.bodyEl.createDiv({ cls: "bc-grid" });
		this.registerDomEvent(this.gridEl, "click", (e) => this.onGridClick(e));

		this.sideEl = top.createDiv({ cls: "bc-side bc-hidden" });
		this.panelScrollEl = root.createDiv({ cls: "bc-panel" });
		this.inputBarEl = root.createDiv({ cls: "bc-input-bar" });
		this.panel = new DiaryPanel(this.plugin, this);
		this.panel.build(this.panelScrollEl, this.inputBarEl);

		this.applyLayout();
	}

	/** Exact rendered width of the calendar grid — 7 cells plus extras. */
	private calendarWidth(): number {
		const s = this.plugin.settings;
		return (s.showWeekNumber ? WEEKNUM_W : 0) + 7 * s.cellSize;
	}

	/** Split the pane between the calendar strip and the diary panel. */
	private applyLayout(): void {
		if (!this.bodyEl) return;
		const s = this.plugin.settings;
		const root = this.contentEl;

		const calWidth = this.calendarWidth();
		root.style.setProperty("--bc-maxw", `${calWidth}px`);
		this.bodyEl.style.height = `${s.calendarHeight}px`;

		// The stats move beside the calendar as soon as one tile column fits in
		// what's actually left: pane minus our own padding, the calendar, and
		// the column gap — so the side column never overflows the right edge.
		const leftover = root.clientWidth - PANE_PADDING_H - calWidth - COLUMN_GAP;
		const wide = s.showStats && leftover >= SIDE_MIN_W;
		root.toggleClass("bc-wide", wide);
		this.sideEl.toggleClass("bc-hidden", !wide);
		const statsEl = this.panel?.statsContainer;
		if (statsEl) {
			const target = wide ? this.sideEl : this.panelScrollEl;
			if (statsEl.parentElement !== target) {
				if (wide) target.appendChild(statsEl);
				else target.insertBefore(statsEl, target.firstChild);
			}
		}

		const panelVisible = (s.showStats && !wide) || s.showHeatmap || s.showTimeline;
		this.panelScrollEl.toggleClass("bc-hidden", !panelVisible);
		this.inputBarEl.toggleClass("bc-hidden", !s.showInput);
		this.panelScrollEl.toggleClass("bc-panel-show-stats", s.showStats);
		this.panelScrollEl.toggleClass("bc-panel-show-heatmap", s.showHeatmap);
		this.panelScrollEl.toggleClass("bc-panel-show-timeline", s.showTimeline);
	}

	// --- navigation -----------------------------------------------------------

	private goToToday(): void {
		this.pinnedToToday = true;
		this.render();
	}

	private shiftMonths(delta: number): void {
		this.pinnedToToday = false;
		this.firstVisibleWeekStart = this.weekStartOf(this.firstVisibleWeekStart.clone().add(delta, "month"));
		this.render();
	}

	private weekStartOf(date: moment.Moment): moment.Moment {
		const locale = effectiveLocale(this.plugin.settings.localeOverride);
		const firstDay = weekStartDay(this.plugin.settings.weekStart, locale);
		return startOfWeek(date, firstDay);
	}

	// --- rendering ------------------------------------------------------------

	private render(): void {
		if (!this.bodyEl) return;
		const settings = this.plugin.settings;
		this.diaryConfig = getDiaryConfig(this.app, settings);
		const locale = effectiveLocale(settings.localeOverride);
		const firstDay = weekStartDay(settings.weekStart, locale);

		// The calendar's geometry comes from the settings alone — cells and the
		// grid never resize with the pane. (A too-narrow pane clips it instead.)
		const width = this.calendarWidth();
		const height = settings.calendarHeight;

		const overhead = (settings.showWeekNumber ? WEEKNUM_W : 0) + BLOCK_GAP;
		// min = max = cellSize: cells are exactly the configured size; the
		// height only decides how many week rows are shown.
		const geometry = computeGeometry(
			width,
			height - WEEKDAY_ROW_H,
			settings.cellSize,
			settings.cellSize,
			overhead,
		);
		const placement = placeFocus(geometry);

		if (this.pinnedToToday) {
			const todayWeek = this.weekStartOf(moment().startOf("day"));
			this.firstVisibleWeekStart = todayWeek.clone().subtract(placement.focusLinear, "weeks");
		} else {
			this.firstVisibleWeekStart = this.weekStartOf(this.firstVisibleWeekStart);
		}

		const gen = this.renderGrid(placement, locale, firstDay, settings.showWeekNumber);
		this.updateTitle(placement, locale);
		void this.decorateDots(gen);
	}

	private renderGrid(
		p: GridPlacement,
		locale: string,
		firstDay: number,
		showWeekNumber: boolean,
	): number {
		const gen = ++this.generation;
		const grid = this.gridEl;
		grid.empty();
		this.cellsByVisual.clear();
		this.cellsByKey.clear();

		// Build the column tracks: [gap] [weeknum?] [7 day cells] per block.
		const tracks: string[] = [];
		const blockDayCols: number[][] = [];
		const blockWnCol: number[] = [];
		let colIndex = 1;
		for (let b = 0; b < p.columns; b++) {
			if (b > 0) {
				tracks.push(`${BLOCK_GAP}px`);
				colIndex++;
			}
			if (showWeekNumber) {
				blockWnCol[b] = colIndex++;
				tracks.push(`${WEEKNUM_W}px`);
			}
			const days: number[] = [];
			for (let d = 0; d < 7; d++) {
				days.push(colIndex++);
				tracks.push(`${p.cellW}px`);
			}
			blockDayCols[b] = days;
		}
		grid.style.gridTemplateColumns = tracks.join(" ");
		grid.style.gridTemplateRows = `${WEEKDAY_ROW_H}px repeat(${p.rows}, ${p.cellH}px)`;
		// Scale fonts/dots off the smaller edge so nothing overflows a cell.
		grid.style.setProperty("--bc-cell", `${Math.min(p.cellW, p.cellH)}px`);

		// Custom colors override the theme accent; empty inherits it via CSS var fallback.
		const { outlineColor, hoverColor } = this.plugin.settings;
		if (outlineColor) grid.style.setProperty("--bc-divider-color", outlineColor);
		else grid.style.removeProperty("--bc-divider-color");
		if (hoverColor) grid.style.setProperty("--bc-hover-color", hoverColor);
		else grid.style.removeProperty("--bc-hover-color");

		const labels = weekdayLabels(firstDay, locale);
		for (let b = 0; b < p.columns; b++) {
			for (let d = 0; d < 7; d++) {
				const dow = (firstDay + d) % 7;
				const h = grid.createDiv({
					cls: "bc-weekday" + (isWeekend(dow) ? " is-weekend" : ""),
					text: labels[d],
				});
				h.style.gridColumn = `${blockDayCols[b][d]}`;
			}
		}

		const today = moment().startOf("day");
		for (let b = 0; b < p.columns; b++) {
			for (let r = 0; r < p.rows; r++) {
				// Row-major: each band holds `columns` consecutive weeks, left to right.
				const weekIndex = r * p.columns + b;
				const weekStart = this.firstVisibleWeekStart.clone().add(weekIndex, "weeks");

				if (showWeekNumber) {
					const wn = grid.createDiv({
						cls: "bc-weeknum",
						text: `${weekStart.clone().locale(locale).isoWeek()}`,
					});
					wn.style.gridRow = `${r + 2}`;
					wn.style.gridColumn = `${blockWnCol[b]}`;
				}

				for (let d = 0; d < 7; d++) {
					const date = weekStart.clone().add(d, "days");
					this.renderDayCell(grid, date, b, r, d, blockDayCols[b][d], firstDay, locale, today);
				}
			}
		}

		// Persistent gray month dividers, drawn from both sides so corners seal.
		for (const ref of this.cellsByVisual.values()) {
			const shadow = this.monthDivider(ref);
			if (shadow) ref.el.style.boxShadow = shadow;
		}
		return gen;
	}

	private renderDayCell(
		grid: HTMLElement,
		date: moment.Moment,
		blockCol: number,
		row: number,
		day: number,
		gridColumn: number,
		firstDay: number,
		locale: string,
		today: moment.Moment,
	): void {
		const key = dayKey(date);
		const monthKey = date.format("YYYY-MM");
		const dow = (firstDay + day) % 7;

		const el = grid.createDiv({ cls: "bc-day" });
		el.style.gridRow = `${row + 2}`;
		el.style.gridColumn = `${gridColumn}`;
		el.dataset.key = key;
		el.dataset.month = monthKey;
		if (isWeekend(dow)) el.addClass("is-weekend");
		if (date.isSame(today, "day")) el.addClass("is-today");
		if (key === this.activeDayKey) el.addClass("is-active");

		// 1st of the month: a centered translucent watermark behind the number —
		// the year on Jan 1, the month's short name otherwise.
		if (date.date() === 1) {
			const isJan = date.month() === 0;
			el.createSpan({
				cls: isJan ? "bc-year-badge" : "bc-month-badge",
				text: isJan ? date.format("YYYY") : date.clone().locale(locale).format("MMM"),
			});
		}

		const top = el.createDiv({ cls: "bc-day-top" });
		top.createSpan({ cls: "bc-day-num", text: `${date.date()}` });

		const dotsEl = el.createDiv({ cls: "bc-dots" });
		const file = getDiaryNote(this.app, this.diaryConfig!, date);
		if (file) {
			el.addClass("has-note");
			// Show the gray presence dot now; decorateDots() adds rule dots async.
			this.renderDots(dotsEl, [], true);
		}

		const vrow = row;
		const vcol = visualColumn(blockCol, day);
		const ref: CellRef = { el, dotsEl, key, monthKey, vrow, vcol, file };
		this.cellsByVisual.set(`${vrow}:${vcol}`, ref);
		this.cellsByKey.set(key, ref);
	}

	private renderDots(dotsEl: HTMLElement, matchedRuleIds: string[], exists: boolean): void {
		dotsEl.empty();
		// One fixed gray dot signals "a note exists for this day".
		if (exists) dotsEl.createDiv({ cls: "bc-dot bc-dot-activity" });
		// Then one colored dot per matched highlight rule.
		for (const id of matchedRuleIds) {
			const rule = this.plugin.highlightById.get(id);
			if (!rule) continue;
			const dot = dotsEl.createDiv({ cls: "bc-dot bc-dot-rule" });
			dot.style.setProperty("--bc-dot-color", rule.color);
		}
	}

	private async decorateDots(gen: number): Promise<void> {
		const noted: CellRef[] = [];
		for (const ref of this.cellsByVisual.values()) {
			if (ref.file) noted.push(ref);
		}
		if (!noted.length) return;

		const resolved = await Promise.all(
			noted.map(async (ref) => ({ ref, meta: await this.plugin.metaCache.resolve(ref.file!) })),
		);
		if (gen !== this.generation) return; // grid was rebuilt meanwhile
		for (const { ref, meta } of resolved) this.renderDots(ref.dotsEl, meta.matchedRuleIds, true);
	}

	private updateTitle(p: GridPlacement, locale: string): void {
		// Representative day of the focus week (mid-week to avoid edge ambiguity).
		const focus = this.firstVisibleWeekStart.clone().add(p.focusLinear, "weeks").add(3, "days");
		this.titleMonthEl.setText(focus.clone().locale(locale).format("MMM"));
		this.titleYearEl.setText(focus.format("YYYY"));
	}

	// --- interaction ----------------------------------------------------------

	private onGridClick(e: MouseEvent): void {
		const target = e.target;
		if (!(target instanceof HTMLElement)) return;
		const key = target.closest<HTMLElement>(".bc-day")?.dataset.key;
		if (!key) return;
		const newLeaf = e.ctrlKey || e.metaKey;
		void this.openOrCreate(moment(key, "YYYY-MM-DD"), newLeaf);
	}

	/** Open the diary note for `date`, creating it (after the optional confirm) if missing. */
	async openOrCreate(date: moment.Moment, newLeaf: boolean): Promise<void> {
		const config = getDiaryConfig(this.app, this.plugin.settings);
		const locale = effectiveLocale(this.plugin.settings.localeOverride);

		let file = getDiaryNote(this.app, config, date);
		if (!file) {
			const path = diaryPathForDate(config, date);
			if (this.plugin.settings.confirmBeforeCreate) {
				const confirmed = await new CreateNoteModal(this.app, date.clone().locale(locale), path).confirm();
				if (!confirmed) return;
			}
			file = await createDiaryNote(this.app, config, date);
			if (!file) return;
			// The vault 'create' event will refresh the calendar and show the dot.
		}

		const leaf = this.app.workspace.getLeaf(newLeaf ? "tab" : false);
		await leaf.openFile(file);
	}

	/**
	 * Inset box-shadow drawing a 1px divider on the cell sides that face a
	 * different month. Every cell draws its own boundary edges, so each seam is
	 * painted from both sides and its corners stay sealed. Sides with no neighbor
	 * (the grid's outer edge) are left undrawn, so only month-to-month seams show.
	 */
	private monthDivider(ref: CellRef): string {
		const w = 1;
		const color = "var(--bc-divider-color, var(--background-modifier-border))";
		const isSeam = (dr: number, dc: number): boolean => {
			const n = this.cellsByVisual.get(`${ref.vrow + dr}:${ref.vcol + dc}`);
			return n !== undefined && n.monthKey !== ref.monthKey;
		};
		const parts: string[] = [];
		if (isSeam(-1, 0)) parts.push(`inset 0 ${w}px 0 0 ${color}`);
		if (isSeam(1, 0)) parts.push(`inset 0 -${w}px 0 0 ${color}`);
		if (isSeam(0, -1)) parts.push(`inset ${w}px 0 0 0 ${color}`);
		if (isSeam(0, 1)) parts.push(`inset -${w}px 0 0 0 ${color}`);
		return parts.join(", ");
	}

	/** dayKey of the active file if it is a diary note, else null. */
	private computeActiveDayKey(): string | null {
		const file = this.app.workspace.getActiveFile();
		if (!file) return null;
		const config = this.diaryConfig ?? getDiaryConfig(this.app, this.plugin.settings);
		const date = diaryDateFromPath(config, file.path);
		return date ? dayKey(date) : null;
	}

	/** Move the is-active highlight to the day of the current active note. */
	private updateActiveDay(): void {
		const next = this.computeActiveDayKey();
		// Keep the ring on the last daily note when focus moves to a non-note view.
		if (!next || next === this.activeDayKey) return;
		if (this.activeDayKey) this.cellsByKey.get(this.activeDayKey)?.el.removeClass("is-active");
		this.activeDayKey = next;
		this.cellsByKey.get(next)?.el.addClass("is-active");
	}
}
