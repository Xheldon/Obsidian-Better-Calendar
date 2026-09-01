import { Plugin, TFile, WorkspaceLeaf, debounce } from "obsidian";
import { VIEW_TYPE_CALENDAR } from "./constants";
import { BetterCalendarSettings, DEFAULT_SETTINGS, HighlightRule, normalizeSettings } from "./settings";
import { NoteMetaCache } from "./highlights";
import { WordStatsCache } from "./wordCount";
import { CalendarView } from "./view";
import { BetterCalendarSettingTab } from "./settingsTab";
import { DailyNoteSettings, getDailyNoteSettings } from "./dailyNotes";
import { setLanguage, t } from "./i18n";

export default class BetterCalendarPlugin extends Plugin {
	settings: BetterCalendarSettings = DEFAULT_SETTINGS;
	metaCache!: NoteMetaCache;
	wordCache!: WordStatsCache;
	/** id -> rule, for fast dot lookups during rendering. */
	highlightById = new Map<string, HighlightRule>();

	/** True when a pending refresh must also rebuild the diary index (create/delete/rename). */
	private structuralChange = false;
	private readonly debouncedRefresh = debounce(() => {
		const structural = this.structuralChange;
		this.structuralChange = false;
		this.refreshViews(structural);
	}, 150, false);

	async onload(): Promise<void> {
		await this.loadSettings();
		setLanguage(this.settings.language);

		this.metaCache = new NoteMetaCache(this.app);
		this.wordCache = new WordStatsCache(this.app);
		this.applyHighlightSettings();

		this.registerView(VIEW_TYPE_CALENDAR, (leaf) => new CalendarView(leaf, this));

		// Lets the heatmap and timeline show the standard page preview on hover.
		this.registerHoverLinkSource(VIEW_TYPE_CALENDAR, {
			display: "Better Calendar",
			defaultMod: false,
		});

		this.addCommand({
			id: "open",
			name: t("cmdOpen"),
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: "focus-diary-input",
			name: t("cmdWrite"),
			callback: () => void this.activateView(true),
		});

		this.addSettingTab(new BetterCalendarSettingTab(this.app, this));

		this.registerEvent(this.app.vault.on("create", (f) => this.onVaultChange(f, true)));
		this.registerEvent(this.app.vault.on("delete", (f) => this.onVaultChange(f, true)));
		this.registerEvent(this.app.vault.on("rename", (f) => this.onVaultChange(f, true)));
		this.registerEvent(this.app.vault.on("modify", (f) => this.onVaultChange(f, false)));
		// Backlink/outgoing-link counts come from the metadata cache.
		this.registerEvent(this.app.metadataCache.on("resolved", () => this.debouncedRefresh()));

		// Surface the calendar as a sidebar tab on startup, without stealing focus.
		this.app.workspace.onLayoutReady(() => void this.ensureLeaf());
	}

	onunload(): void {
		// Leaves of our view type are detached automatically by Obsidian.
	}

	/** Reveal the calendar view (and focus it), creating it in the right sidebar if needed. */
	async activateView(focusInput = false): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) return;
			await leaf.setViewState({ type: VIEW_TYPE_CALENDAR, active: true });
		}
		await workspace.revealLeaf(leaf);
		if (focusInput && leaf.view instanceof CalendarView) leaf.view.focusInput();
	}

	/** Add the calendar to the right sidebar tab strip if it isn't open already. */
	private async ensureLeaf(): Promise<void> {
		if (this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length) return;
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: VIEW_TYPE_CALENDAR, active: false });
	}

	dailyNoteSettings(): DailyNoteSettings {
		return getDailyNoteSettings(this.app);
	}

	async loadSettings(): Promise<void> {
		const raw = (await this.loadData()) as Partial<BetterCalendarSettings> | null;
		this.settings = normalizeSettings(raw);
	}

	async saveSettings(): Promise<void> {
		// Note: do NOT re-run normalizeSettings here. It rebuilds the highlight
		// rule objects, which would detach the references held by the settings-tab
		// inputs and drop in-progress edits. Normalization happens on load instead.
		await this.saveData(this.settings);
		setLanguage(this.settings.language);
		this.applyHighlightSettings();
		// Debounced: settings-tab text inputs commit per keystroke, and a
		// structural refresh rebuilds the diary index (a full vault scan).
		this.structuralChange = true;
		this.debouncedRefresh();
	}

	/** Push the current highlight rules into the cache and lookup index. */
	private applyHighlightSettings(): void {
		this.metaCache.setRules(this.settings.highlights);
		this.highlightById = new Map(this.settings.highlights.map((r) => [r.id, r]));
	}

	private refreshViews(structural = true): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)) {
			const view = leaf.view;
			if (view instanceof CalendarView) view.refreshData(structural);
		}
	}

	/** Rebuild view DOM from scratch — needed after a UI language change. */
	rebuildViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)) {
			const view = leaf.view;
			if (view instanceof CalendarView) view.rebuild();
		}
	}

	private onVaultChange(file: unknown, structural: boolean): void {
		if (!(file instanceof TFile) || file.extension !== "md") return;
		this.metaCache.invalidate(file.path);
		this.wordCache.invalidate(file.path);
		if (structural) this.structuralChange = true;
		this.debouncedRefresh();
	}
}
