import { ItemView, WorkspaceLeaf, TFile, setIcon, debounce } from "obsidian";
import { moment } from "obsidian";
import type BetterCalendarPlugin from "./main";
import { CELL_MAX, CELL_MIN, VIEW_TYPE_CALENDAR } from "./constants";
import { computeGeometry, placeFocus, visualColumn, GridPlacement } from "./layout";
import { effectiveLocale, isWeekend, startOfWeek, weekdayLabels, weekStartDay } from "./dateUtils";
import { createDailyNote, dailyNotePath, dayKey, getDailyNote, getDateFromFile, DailyNoteSettings } from "./dailyNotes";
import { CreateNoteModal } from "./createNoteModal";

/** No gap between weeks — the grid reads as one continuous strip. */
const BLOCK_GAP = 0;
/** Width of the optional week-number column, in px. */
const WEEKNUM_W = 26;
/** Height of the weekday header row, in px. */
const WEEKDAY_ROW_H = 22;

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

	/** Start-of-week date of the top-left visible week. */
	private firstVisibleWeekStart: moment.Moment;
	/** When true, today is auto-pinned to the focus slot on every (re)layout. */
	private pinnedToToday = true;

	/** Daily-note config snapshot for the current render. */
	private dailySettings: DailyNoteSettings | null = null;
	private cellsByVisual = new Map<string, CellRef>();
	private cellsByKey = new Map<string, CellRef>();
	/** dayKey of the currently active daily note, if any. */
	private activeDayKey: string | null = null;
	/** Bumped on every grid rebuild so async dot updates can detect staleness. */
	private generation = 0;

	private resizeObserver: ResizeObserver | null = null;
	private readonly scheduleRender: () => void;

	constructor(leaf: WorkspaceLeaf, plugin: BetterCalendarPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.firstVisibleWeekStart = moment().startOf("day");
		this.scheduleRender = debounce(() => this.render(), 60, true);
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
		this.resizeObserver = new ResizeObserver(() => this.scheduleRender());
		this.resizeObserver.observe(this.bodyEl);
		// Highlight the day of the active daily note, and keep it in sync.
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateActiveDay()));
		this.updateActiveDay();
	}

	async onClose(): Promise<void> {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
	}

	/** Re-render (called on vault changes and settings saves). */
	refreshData(): void {
		this.render();
	}

	// --- chrome ---------------------------------------------------------------

	private buildChrome(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("better-calendar");

		const nav = root.createDiv({ cls: "bc-nav" });
		const title = nav.createDiv({ cls: "bc-title" });
		this.titleMonthEl = title.createSpan({ cls: "bc-title-month" });
		this.titleYearEl = title.createSpan({ cls: "bc-title-year" });

		const controls = nav.createDiv({ cls: "bc-controls" });
		const prev = controls.createEl("button", { cls: "bc-nav-btn", attr: { "aria-label": "Previous month" } });
		setIcon(prev, "chevron-left");
		this.registerDomEvent(prev, "click", () => this.shiftMonths(-1));

		const today = controls.createEl("button", {
			cls: "bc-nav-btn bc-today-btn",
			text: "Today",
			attr: { "aria-label": "Go to today" },
		});
		this.registerDomEvent(today, "click", () => this.goToToday());

		const next = controls.createEl("button", { cls: "bc-nav-btn", attr: { "aria-label": "Next month" } });
		setIcon(next, "chevron-right");
		this.registerDomEvent(next, "click", () => this.shiftMonths(1));

		this.bodyEl = root.createDiv({ cls: "bc-body" });
		this.gridEl = this.bodyEl.createDiv({ cls: "bc-grid" });

		this.registerDomEvent(this.gridEl, "click", (e) => this.onGridClick(e));
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
		this.dailySettings = this.plugin.dailyNoteSettings();
		const locale = effectiveLocale(settings.localeOverride);
		const firstDay = weekStartDay(settings.weekStart, locale);

		const width = this.bodyEl.clientWidth;
		const height = this.bodyEl.clientHeight;
		if (width < 1 || height < 1) {
			// Not laid out yet (e.g. view still hidden). The ResizeObserver will
			// fire once the view gains a size, so just bail out for now.
			return;
		}

		const overhead = (settings.showWeekNumber ? WEEKNUM_W : 0) + BLOCK_GAP;
		const geometry = computeGeometry(
			width,
			height - WEEKDAY_ROW_H,
			CELL_MIN,
			CELL_MAX,
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
		const file = getDailyNote(this.app, date, this.dailySettings!);
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

	private async openOrCreate(date: moment.Moment, newLeaf: boolean): Promise<void> {
		const dailySettings = this.plugin.dailyNoteSettings();
		const locale = effectiveLocale(this.plugin.settings.localeOverride);

		let file = getDailyNote(this.app, date, dailySettings);
		if (!file) {
			const path = dailyNotePath(date, dailySettings);
			if (this.plugin.settings.confirmBeforeCreate) {
				const confirmed = await new CreateNoteModal(this.app, date.clone().locale(locale), path).confirm();
				if (!confirmed) return;
			}
			file = await createDailyNote(this.app, date, dailySettings);
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

	/** dayKey of the active file if it is a daily note, else null. */
	private computeActiveDayKey(): string | null {
		const file = this.app.workspace.getActiveFile();
		if (!file) return null;
		const date = getDateFromFile(file, this.plugin.dailyNoteSettings());
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
