import { ItemView, WorkspaceLeaf, TFile, setIcon, debounce } from "obsidian";
import { moment } from "obsidian";
import type BetterCalendarPlugin from "./main";
import { MAX_ACTIVITY_DOTS, VIEW_TYPE_CALENDAR } from "./constants";
import { computeGeometry, placeFocus, visualColumn, GridPlacement } from "./layout";
import { effectiveLocale, isWeekend, startOfWeek, weekdayLabels, weekStartDay } from "./dateUtils";
import { createDailyNote, dailyNotePath, dayKey, getDailyNote, DailyNoteSettings } from "./dailyNotes";
import { NoteMeta } from "./highlights";
import { CreateNoteModal } from "./createNoteModal";

/** Gap between adjacent month blocks, in px. */
const BLOCK_GAP = 12;
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
	private cellsByMonth = new Map<string, CellRef[]>();
	private hoveredMonth: string | null = null;
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
		prev.addEventListener("click", () => this.shiftMonths(-1));

		const today = controls.createEl("button", {
			cls: "bc-nav-btn bc-today-btn",
			text: "Today",
			attr: { "aria-label": "Go to today" },
		});
		today.addEventListener("click", () => this.goToToday());

		const next = controls.createEl("button", { cls: "bc-nav-btn", attr: { "aria-label": "Next month" } });
		setIcon(next, "chevron-right");
		next.addEventListener("click", () => this.shiftMonths(1));

		this.bodyEl = root.createDiv({ cls: "bc-body" });
		this.gridEl = this.bodyEl.createDiv({ cls: "bc-grid" });

		this.gridEl.addEventListener("click", (e) => this.onGridClick(e));
		this.gridEl.addEventListener("mouseover", (e) => this.onGridHover(e));
		this.gridEl.addEventListener("mouseleave", () => this.setHoveredMonth(null));
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
			settings.minCellSize,
			settings.maxCellSize,
			overhead,
		);
		const placement = placeFocus(geometry);

		if (this.pinnedToToday) {
			const todayWeek = this.weekStartOf(moment().startOf("day"));
			this.firstVisibleWeekStart = todayWeek.clone().subtract(placement.targetLinear, "weeks");
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
		this.cellsByMonth.clear();
		this.hoveredMonth = null;

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

		const labels = weekdayLabels(firstDay, locale);
		for (let b = 0; b < p.columns; b++) {
			for (let d = 0; d < 7; d++) {
				const dow = (firstDay + d) % 7;
				const h = grid.createDiv({
					cls: "bc-weekday" + (isWeekend(dow) ? " is-weekend" : ""),
					text: labels[d],
				});
				h.style.gridRow = "1";
				h.style.gridColumn = `${blockDayCols[b][d]}`;
			}
		}

		const today = moment().startOf("day");
		for (let b = 0; b < p.columns; b++) {
			for (let r = 0; r < p.rows; r++) {
				const weekIndex = b * p.rows + r;
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
		if (date.month() % 2 === 1) el.addClass("is-alt-month");
		if (date.isSame(today, "day")) el.addClass("is-today");

		// New year: a translucent year watermark behind Jan 1.
		if (date.month() === 0 && date.date() === 1) {
			el.createSpan({ cls: "bc-year-badge", text: date.format("YYYY") });
		}

		const top = el.createDiv({ cls: "bc-day-top" });
		if (date.date() === 1) {
			top.createSpan({ cls: "bc-month-badge", text: date.clone().locale(locale).format("MMM") });
		}
		top.createSpan({ cls: "bc-day-num", text: `${date.date()}` });

		const dotsEl = el.createDiv({ cls: "bc-dots" });
		const file = getDailyNote(this.app, date, this.dailySettings!);
		if (file) {
			el.addClass("has-note");
			// Immediate presence dot; decorateDots() upgrades it with word count + rules.
			this.renderDots(dotsEl, { wordCount: 0, matchedRuleIds: [] }, true);
		}

		const vrow = row;
		const vcol = visualColumn(blockCol, day);
		const ref: CellRef = { el, dotsEl, key, monthKey, vrow, vcol, file };
		this.cellsByVisual.set(`${vrow}:${vcol}`, ref);
		const bucket = this.cellsByMonth.get(monthKey);
		if (bucket) bucket.push(ref);
		else this.cellsByMonth.set(monthKey, [ref]);
	}

	private renderDots(dotsEl: HTMLElement, meta: NoteMeta, exists: boolean): void {
		dotsEl.empty();
		if (exists) {
			const count = Math.max(
				1,
				Math.min(MAX_ACTIVITY_DOTS, Math.round(meta.wordCount / this.plugin.settings.wordsPerDot)),
			);
			for (let i = 0; i < count; i++) dotsEl.createDiv({ cls: "bc-dot bc-dot-activity" });
		}
		for (const id of meta.matchedRuleIds) {
			const rule = this.plugin.highlightById.get(id);
			if (!rule) continue;
			const dot = dotsEl.createDiv({ cls: "bc-dot bc-dot-rule" });
			dot.style.setProperty("--bc-dot-color", rule.color);
			dot.setAttribute("aria-label", rule.name || rule.pattern);
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
		for (const { ref, meta } of resolved) this.renderDots(ref.dotsEl, meta, true);
	}

	private updateTitle(p: GridPlacement, locale: string): void {
		// Representative day of the focus week (mid-week to avoid edge ambiguity).
		const focus = this.firstVisibleWeekStart.clone().add(p.targetLinear, "weeks").add(3, "days");
		this.titleMonthEl.setText(focus.clone().locale(locale).format("MMM"));
		this.titleYearEl.setText(focus.format("YYYY"));
	}

	// --- interaction ----------------------------------------------------------

	private onGridClick(e: MouseEvent): void {
		const cell = (e.target as HTMLElement).closest(".bc-day") as HTMLElement | null;
		const key = cell?.dataset.key;
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

	private onGridHover(e: MouseEvent): void {
		const cell = (e.target as HTMLElement).closest(".bc-day") as HTMLElement | null;
		this.setHoveredMonth(cell?.dataset.month ?? null);
	}

	private setHoveredMonth(monthKey: string | null): void {
		if (monthKey === this.hoveredMonth) return;

		if (this.hoveredMonth) {
			for (const ref of this.cellsByMonth.get(this.hoveredMonth) ?? []) {
				ref.el.removeClass("is-month-hover");
				ref.el.style.boxShadow = "";
			}
		}

		this.hoveredMonth = monthKey;
		if (!monthKey) return;

		for (const ref of this.cellsByMonth.get(monthKey) ?? []) {
			ref.el.addClass("is-month-hover");
			ref.el.style.boxShadow = this.edgeShadow(ref, monthKey);
		}
	}

	/**
	 * Build an inset box-shadow that draws a border only on the cell sides that
	 * face a different month (or the grid edge), tracing the month's perimeter
	 * without shifting layout. Uses visual neighbors, not chronological ones.
	 */
	private edgeShadow(ref: CellRef, monthKey: string): string {
		const w = 2;
		const color = "var(--interactive-accent)";
		const isEdge = (dr: number, dc: number): boolean => {
			const n = this.cellsByVisual.get(`${ref.vrow + dr}:${ref.vcol + dc}`);
			return !n || n.monthKey !== monthKey;
		};
		const parts: string[] = [];
		if (isEdge(-1, 0)) parts.push(`inset 0 ${w}px 0 0 ${color}`);
		if (isEdge(1, 0)) parts.push(`inset 0 -${w}px 0 0 ${color}`);
		if (isEdge(0, -1)) parts.push(`inset ${w}px 0 0 0 ${color}`);
		if (isEdge(0, 1)) parts.push(`inset -${w}px 0 0 0 ${color}`);
		return parts.join(", ");
	}
}
