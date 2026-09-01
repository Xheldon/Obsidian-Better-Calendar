import { Component, Keymap, MarkdownRenderer, Notice, TFile, setIcon, setTooltip } from "obsidian";
import { moment } from "obsidian";
import type BetterCalendarPlugin from "./main";
import type { CalendarView } from "./view";
import { VIEW_TYPE_CALENDAR } from "./constants";
import { dayKey } from "./dailyNotes";
import {
	DiaryConfig,
	DiaryEntry,
	compileEntryPattern,
	createDiaryNote,
	formatEntry,
	getDiaryConfig,
	getDiaryNote,
	insertEntryIntoContent,
	parseEntries,
	segmentForTime,
} from "./diary";
import { HeatmapOptions, renderHeatmap } from "./heatmap";
import { buildDiaryIndex, computeStreaks, linkCounts } from "./stats";
import { effectiveLocale, weekStartDay } from "./dateUtils";
import { t } from "./i18n";
import { FileWordStats } from "./wordCount";

/**
 * The diary half of the sidebar: stats card, yearly heatmap, today's
 * timeline, and the sticky quick-input bar. The daily note is the single
 * source of truth — the panel only reads it and appends entries to it.
 */
export class DiaryPanel {
	private statsEl!: HTMLElement;
	private heatmapHeaderYearEl!: HTMLElement;
	private heatmapGridHost!: HTMLElement;
	private timelineHeaderEl!: HTMLElement;
	private timelineListEl!: HTMLElement;
	private inputHintEl!: HTMLElement;
	private textarea!: HTMLTextAreaElement;

	private scrollEl!: HTMLElement;
	/** Year shown in the heatmap; null = current year. */
	private heatmapYear: number | null = null;
	private lastHeatmap: HeatmapOptions | null = null;
	/** Bumped per refresh so stale async renders drop out. */
	private generation = 0;
	private lastToday: string = dayKey(moment());
	/** Diary index cache; rebuilt on structural vault changes or template changes. */
	private indexCache: { key: string; index: Map<string, TFile> } | null = null;
	/** Today's diary note as of the last refresh (used by hover/click handlers). */
	private todayFile: TFile | null = null;
	/** Owns the MarkdownRenderChild trees of the current timeline render. */
	private timelineComp: Component | null = null;
	/** Guards against double-submits (held Enter, double-clicked send). */
	private submitting = false;

	constructor(
		private plugin: BetterCalendarPlugin,
		private view: CalendarView,
	) {}

	private get app() {
		return this.plugin.app;
	}

	/** The stats card element — the view re-parents it in wide layouts. */
	get statsContainer(): HTMLElement | null {
		return this.statsEl ?? null;
	}

	// --- skeleton -------------------------------------------------------------

	build(scrollEl: HTMLElement, inputHost: HTMLElement): void {
		this.scrollEl = scrollEl;

		this.statsEl = scrollEl.createDiv({ cls: "bc-stats" });

		const heatmapSection = scrollEl.createDiv({ cls: "bc-heatmap" });
		const hmHeader = heatmapSection.createDiv({ cls: "bc-section-header" });
		hmHeader.createSpan({ cls: "bc-section-title", text: t("heatmapTitle") });
		const hmNav = hmHeader.createDiv({ cls: "bc-hm-nav" });
		const prev = hmNav.createEl("button", { cls: "bc-nav-btn", attr: { "aria-label": t("prevYear") } });
		setIcon(prev, "chevron-left");
		this.heatmapHeaderYearEl = hmNav.createSpan({ cls: "bc-hm-year" });
		const next = hmNav.createEl("button", { cls: "bc-nav-btn", attr: { "aria-label": t("nextYear") } });
		setIcon(next, "chevron-right");
		this.view.registerDomEvent(prev, "click", () => this.shiftHeatmapYear(-1));
		this.view.registerDomEvent(next, "click", () => this.shiftHeatmapYear(1));
		this.heatmapGridHost = heatmapSection.createDiv({ cls: "bc-heatmap-host" });
		this.view.registerDomEvent(this.heatmapGridHost, "click", (e) => this.onHeatmapClick(e));
		this.view.registerDomEvent(this.heatmapGridHost, "mouseover", (e) => this.onHeatmapHover(e));

		const timelineSection = scrollEl.createDiv({ cls: "bc-timeline" });
		const tlHeader = timelineSection.createDiv({ cls: "bc-section-header" });
		tlHeader.createSpan({ cls: "bc-section-title", text: t("timelineTitle") });
		this.timelineHeaderEl = tlHeader.createDiv({ cls: "bc-tl-date" });
		this.timelineListEl = timelineSection.createDiv({ cls: "bc-tl-list" });
		this.view.registerDomEvent(this.timelineListEl, "click", (e) => this.onTimelineClick(e));
		this.view.registerDomEvent(this.timelineListEl, "mouseover", (e) => this.onTimelineHover(e));

		this.buildInput(inputHost);
	}

	/** Periodic heartbeat (registered once by the view): tracks midnight
	 * rollover and keeps the input hint's time fresh. */
	tick(): void {
		const today = dayKey(moment());
		if (today !== this.lastToday) {
			this.lastToday = today;
			this.view.refreshData();
		} else {
			this.updateInputHint();
		}
	}

	private buildInput(host: HTMLElement): void {
		this.inputHintEl = host.createDiv({ cls: "bc-input-hint" });

		const row = host.createDiv({ cls: "bc-input-row" });
		this.textarea = row.createEl("textarea", {
			cls: "bc-input",
			attr: { rows: "1", placeholder: t("inputPlaceholder") },
		});
		const send = row.createEl("button", { cls: "bc-send-btn", attr: { "aria-label": t("addEntry") } });
		setIcon(send, "corner-down-left");

		this.view.registerDomEvent(this.textarea, "input", () => this.autoGrow());
		this.view.registerDomEvent(this.textarea, "focus", () => this.updateInputHint());
		this.view.registerDomEvent(this.textarea, "keydown", (e) => {
			if (e.key !== "Enter") return;
			if (e.isComposing) return; // don't submit mid-IME-composition
			const shouldSend = this.plugin.settings.sendOnEnter
				? !e.shiftKey
				: e.metaKey || e.ctrlKey;
			if (shouldSend) {
				e.preventDefault();
				void this.submit();
			}
		});
		this.view.registerDomEvent(send, "click", () => void this.submit());
	}

	focusInput(): void {
		this.textarea?.focus();
	}

	private autoGrow(): void {
		this.textarea.style.height = "auto";
		this.textarea.style.height = `${Math.min(this.textarea.scrollHeight, 140)}px`;
	}

	// --- refresh --------------------------------------------------------------

	refresh(structural = true): void {
		if (structural) this.indexCache = null;
		void this.doRefresh();
	}

	/** Re-render the heatmap only (container width changed). */
	onResize(): void {
		if (this.lastHeatmap) renderHeatmap(this.heatmapGridHost, this.lastHeatmap);
	}

	private async doRefresh(): Promise<void> {
		const gen = ++this.generation;
		const settings = this.plugin.settings;
		const config = getDiaryConfig(this.app, settings);
		const entryRegex = compileEntryPattern(config.entryPattern);
		const locale = effectiveLocale(settings.localeOverride);

		const today = moment().startOf("day");
		const todayFile = getDiaryNote(this.app, config, today);
		this.todayFile = todayFile;
		if (!this.indexCache || this.indexCache.key !== config.pathTemplate) {
			this.indexCache = { key: config.pathTemplate, index: buildDiaryIndex(this.app, config) };
		}
		const index = this.indexCache.index;

		this.updateInputHint(config);

		const hmYear = this.heatmapYear ?? today.year();
		const currentYear = today.year();

		// Word stats for every note of the heatmap year + the current year
		// (for the stats card) + today. The cache keys off mtime, so steady-state
		// refreshes re-read only changed files. Skipped entirely when neither
		// consumer is visible.
		const statsByDay = new Map<string, FileWordStats>();
		const needWordStats = settings.showStats || settings.showHeatmap;
		const reads: Promise<unknown>[] = [];
		if (needWordStats) {
			for (const [key, file] of index) {
				const year = Number(key.slice(0, 4));
				if (year !== hmYear && year !== currentYear) continue;
				reads.push(
					this.plugin.wordCache.resolve(file, entryRegex).then((stats) => statsByDay.set(key, stats)),
				);
			}
		}
		let todayContent: string | null = null;
		if (todayFile && settings.showTimeline) {
			reads.push(this.app.vault.cachedRead(todayFile).then((c) => (todayContent = c)));
		}
		await Promise.all(reads);

		if (gen !== this.generation) return;

		const pick = (s: FileWordStats | undefined): number =>
			s === undefined ? 0 : settings.countScope === "entries" ? s.entryWords : s.words;

		if (settings.showStats) {
			this.renderStats(index, statsByDay, todayFile, today, currentYear, pick);
		}

		if (settings.showHeatmap) {
			const counts = new Map<string, number>();
			const prefix = `${hmYear}-`;
			for (const [key, stats] of statsByDay) {
				if (key.startsWith(prefix)) counts.set(key, pick(stats));
			}
			this.heatmapHeaderYearEl.setText(String(hmYear));
			this.lastHeatmap = {
				year: hmYear,
				counts,
				weekStartDay: weekStartDay(settings.weekStart, locale),
				locale,
			};
			renderHeatmap(this.heatmapGridHost, this.lastHeatmap);
		}

		if (settings.showTimeline) {
			const entries = todayContent === null ? [] : parseEntries(todayContent, entryRegex);
			await this.renderTimeline(entries, todayFile, today, locale);
		}
	}

	// --- stats card -----------------------------------------------------------

	private renderStats(
		index: Map<string, TFile>,
		statsByDay: Map<string, FileWordStats>,
		todayFile: TFile | null,
		today: moment.Moment,
		currentYear: number,
		pick: (s: FileWordStats | undefined) => number,
	): void {
		const todayStats = statsByDay.get(dayKey(today));
		const streaks = computeStreaks(new Set(index.keys()), today);
		const links = linkCounts(this.app, todayFile);

		let yearDays = 0;
		let yearWords = 0;
		let yearEntries = 0;
		const prefix = `${currentYear}-`;
		for (const [key, stats] of statsByDay) {
			if (!key.startsWith(prefix)) continue;
			yearDays++;
			yearWords += pick(stats);
			yearEntries += stats.entryCount;
		}

		this.statsEl.empty();
		const hero = this.statsEl.createDiv({ cls: "bc-stats-hero" });
		hero.createSpan({ cls: "bc-stats-hero-num", text: formatNumber(pick(todayStats)) });
		hero.createSpan({
			cls: "bc-stats-hero-label",
			text: t("wordsToday", todayStats?.entryCount ?? 0),
		});

		const grid = this.statsEl.createDiv({ cls: "bc-stats-grid" });
		const tile = (value: string, label: string, tooltip?: string) => {
			const el = grid.createDiv({ cls: "bc-stat" });
			el.createDiv({ cls: "bc-stat-value", text: value });
			el.createDiv({ cls: "bc-stat-label", text: label });
			if (tooltip) setTooltip(el, tooltip);
		};
		tile(`${streaks.current}d`, t("statStreak"), t("tipStreak"));
		tile(`${streaks.longest}d`, t("statBestStreak"), t("tipBestStreak"));
		tile(String(yearDays), t("statDaysYear"));
		tile(formatNumber(yearWords), t("statWordsYear"), t("tipWordsYear", yearEntries));
		tile(String(links.outgoing), t("statLinksOut"), t("tipLinksOut"));
		tile(String(links.backlinks), t("statBacklinks"), t("tipBacklinks"));
	}

	// --- heatmap interaction --------------------------------------------------

	private heatmapKeyFromEvent(e: Event): string | null {
		const target = e.target;
		if (!(target instanceof HTMLElement)) return null;
		return target.closest<HTMLElement>(".bc-heatmap-day")?.dataset.key ?? null;
	}

	private onHeatmapClick(e: MouseEvent): void {
		const key = this.heatmapKeyFromEvent(e);
		if (!key) return;
		void this.view.openOrCreate(moment(key, "YYYY-MM-DD"), Keymap.isModEvent(e) === "tab");
	}

	private onHeatmapHover(e: MouseEvent): void {
		const key = this.heatmapKeyFromEvent(e);
		if (!key) return;
		// The refresh already indexed every diary note — no need to re-derive
		// the config and resolve paths on every mouseover.
		const file = this.indexCache?.index.get(key);
		if (!file) return;
		this.app.workspace.trigger("hover-link", {
			event: e,
			source: VIEW_TYPE_CALENDAR,
			hoverParent: this.view,
			targetEl: (e.target as HTMLElement).closest(".bc-heatmap-day"),
			linktext: file.path,
			sourcePath: file.path,
		});
	}

	private shiftHeatmapYear(delta: number): void {
		const current = this.heatmapYear ?? moment().year();
		const next = current + delta;
		this.heatmapYear = next === moment().year() ? null : next;
		this.refresh();
	}

	// --- timeline -------------------------------------------------------------

	private async renderTimeline(
		entries: DiaryEntry[],
		todayFile: TFile | null,
		today: moment.Moment,
		locale: string,
	): Promise<void> {
		this.timelineHeaderEl.empty();
		this.timelineHeaderEl.createSpan({ text: today.clone().locale(locale).format("MMM D · ddd") });
		if (todayFile) {
			const open = this.timelineHeaderEl.createEl("button", {
				cls: "bc-nav-btn bc-tl-open",
				attr: { "aria-label": t("openTodayDiary") },
			});
			setIcon(open, "file-pen-line");
			// Recreated on every refresh, so plain listeners (discarded with the
			// element) beat registerDomEvent (held until the view unloads).
			open.addEventListener("click", (e) => {
				void this.view.openOrCreate(today.clone(), Keymap.isModEvent(e) === "tab");
			});
		}

		const list = this.timelineListEl;
		const gen = this.generation;
		list.empty();

		if (!entries.length) {
			list.createDiv({
				cls: "bc-tl-empty",
				text: todayFile ? t("emptyNoEntries") : t("emptyNoNote"),
			});
			return;
		}

		// Fresh component per render, so the previous render's
		// MarkdownRenderChild trees are unloaded instead of leaking until the
		// view closes. Parented to the view for cleanup when the leaf closes.
		if (this.timelineComp) {
			this.view.removeChild(this.timelineComp);
			this.timelineComp.unload();
		}
		const comp = this.view.addChild(new Component());
		this.timelineComp = comp;

		const sourcePath = todayFile?.path ?? "";
		let section = "";
		for (const entry of entries) {
			if (gen !== this.generation) return; // a newer refresh took over
			if (entry.section !== section) {
				section = entry.section;
				if (section) list.createDiv({ cls: "bc-tl-section", text: section });
			}
			const row = list.createDiv({ cls: "bc-tl-entry" });
			row.createDiv({ cls: "bc-tl-time", text: entry.time || "·" });
			const body = row.createDiv({ cls: "bc-tl-body" });
			await MarkdownRenderer.render(this.app, entry.text, body, sourcePath, comp);
		}
	}

	private timelineLink(e: Event): HTMLElement | null {
		const target = e.target;
		if (!(target instanceof HTMLElement)) return null;
		return target.closest<HTMLElement>("a.internal-link");
	}

	private onTimelineClick(e: MouseEvent): void {
		const link = this.timelineLink(e);
		if (!link) return;
		e.preventDefault();
		const href = link.getAttribute("data-href") ?? link.getAttribute("href");
		if (!href) return;
		void this.app.workspace.openLinkText(href, this.todayFile?.path ?? "", Keymap.isModEvent(e));
	}

	private onTimelineHover(e: MouseEvent): void {
		const link = this.timelineLink(e);
		if (!link) return;
		const href = link.getAttribute("data-href") ?? link.getAttribute("href");
		if (!href) return;
		this.app.workspace.trigger("hover-link", {
			event: e,
			source: VIEW_TYPE_CALENDAR,
			hoverParent: this.view,
			targetEl: link,
			linktext: href,
			sourcePath: this.todayFile?.path ?? "",
		});
	}

	// --- quick input ----------------------------------------------------------

	private updateInputHint(config?: DiaryConfig): void {
		if (!this.inputHintEl || !this.plugin.settings.showInput) return;
		const cfg = config ?? getDiaryConfig(this.app, this.plugin.settings);
		const now = moment();
		const segment = segmentForTime(cfg.segments, now.hours() * 60 + now.minutes());
		const target = segment ? segment.name : t("endOfNote");
		this.inputHintEl.setText(`→ ${target} · ${now.format("HH:mm")}`);
	}

	private async submit(): Promise<void> {
		const text = this.textarea.value.trim();
		if (!text || this.submitting) return;
		this.submitting = true;
		try {
			await this.doSubmit(text);
		} finally {
			this.submitting = false;
		}
	}

	private async doSubmit(text: string): Promise<void> {
		const config = getDiaryConfig(this.app, this.plugin.settings);
		const now = moment();
		const today = now.clone().startOf("day");

		let file = getDiaryNote(this.app, config, today);
		if (!file) {
			if (!config.autoCreate) {
				new Notice(t("noticeNoDiary"));
				return;
			}
			file = await createDiaryNote(this.app, config, today);
			if (!file) return;
		}

		const segment = segmentForTime(config.segments, now.hours() * 60 + now.minutes());
		const entryText = formatEntry(config.entryFormat, now, text);

		await this.app.vault.process(file, (data) =>
			insertEntryIntoContent(data, {
				headingName: segment?.name ?? null,
				headingLevel: config.headingLevel,
				entryText,
				entryRegex: compileEntryPattern(config.entryPattern),
				blankLine: config.blankLine,
				timeOrder: config.timeOrder,
				nowMinutes: now.hours() * 60 + now.minutes(),
			}),
		);

		this.textarea.value = "";
		this.autoGrow();
		// The vault modify event refreshes the view too, but do it now so the
		// new entry appears immediately, then keep it in sight.
		await this.doRefresh();
		this.scrollEl.scrollTo({ top: this.scrollEl.scrollHeight });
	}
}

function formatNumber(n: number): string {
	return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
