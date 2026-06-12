import { Plugin, TFile, WorkspaceLeaf, debounce } from "obsidian";
import { VIEW_TYPE_CALENDAR } from "./constants";
import { BetterCalendarSettings, DEFAULT_SETTINGS, HighlightRule, normalizeSettings } from "./settings";
import { NoteMetaCache } from "./highlights";
import { CalendarView } from "./view";
import { BetterCalendarSettingTab } from "./settingsTab";
import { DailyNoteSettings, getDailyNoteSettings } from "./dailyNotes";

export default class BetterCalendarPlugin extends Plugin {
	settings: BetterCalendarSettings = DEFAULT_SETTINGS;
	metaCache!: NoteMetaCache;
	/** id -> rule, for fast dot lookups during rendering. */
	highlightById = new Map<string, HighlightRule>();

	private readonly debouncedRefresh = debounce(() => this.refreshViews(), 150, false);

	async onload(): Promise<void> {
		await this.loadSettings();

		this.metaCache = new NoteMetaCache(this.app);
		this.applyHighlightSettings();

		this.registerView(VIEW_TYPE_CALENDAR, (leaf) => new CalendarView(leaf, this));

		this.addCommand({
			id: "open",
			name: "Open calendar",
			callback: () => void this.activateView(),
		});

		this.addSettingTab(new BetterCalendarSettingTab(this.app, this));

		this.registerEvent(this.app.vault.on("create", (f) => this.onVaultChange(f)));
		this.registerEvent(this.app.vault.on("delete", (f) => this.onVaultChange(f)));
		this.registerEvent(this.app.vault.on("rename", (f) => this.onVaultChange(f)));
		this.registerEvent(this.app.vault.on("modify", (f) => this.onVaultChange(f)));

		// Surface the calendar as a sidebar tab on startup, without stealing focus.
		this.app.workspace.onLayoutReady(() => void this.ensureLeaf());
	}

	onunload(): void {
		// Leaves of our view type are detached automatically by Obsidian.
	}

	/** Reveal the calendar view (and focus it), creating it in the right sidebar if needed. */
	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) return;
			await leaf.setViewState({ type: VIEW_TYPE_CALENDAR, active: true });
		}
		await workspace.revealLeaf(leaf);
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
		this.applyHighlightSettings();
		this.refreshViews();
	}

	/** Push the current highlight rules into the cache and lookup index. */
	private applyHighlightSettings(): void {
		this.metaCache.setRules(this.settings.highlights);
		this.highlightById = new Map(this.settings.highlights.map((r) => [r.id, r]));
	}

	private refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)) {
			const view = leaf.view;
			if (view instanceof CalendarView) view.refreshData();
		}
	}

	private onVaultChange(file: unknown): void {
		if (!(file instanceof TFile) || file.extension !== "md") return;
		this.metaCache.invalidate(file.path);
		this.debouncedRefresh();
	}
}
