/** "locale" defers to the active moment.js locale; otherwise 0 (Sun) .. 6 (Sat). */
export type WeekStart = "locale" | 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface HighlightRule {
	id: string;
	/** Source of a RegExp tested against each daily note's content. */
	pattern: string;
	/** RegExp flags, e.g. "m" or "i". "g" is stripped to keep `test` stateless. */
	flags: string;
	/** Dot color, any CSS color (we store a hex from the color picker). */
	color: string;
	enabled: boolean;
}

export interface BetterCalendarSettings {
	/** First day of the week. */
	weekStart: WeekStart;
	/** Ask before creating a missing daily note. */
	confirmBeforeCreate: boolean;
	/** Render a leading week-number column in each month block. */
	showWeekNumber: boolean;
	/** "system" uses Obsidian's locale; otherwise a moment.js locale id. */
	localeOverride: string;
	/** Month-hover outline color; "" follows the theme accent. */
	outlineColor: string;
	/** Single-day hover highlight color; "" follows the theme accent. */
	hoverColor: string;
	highlights: HighlightRule[];
}

export const DEFAULT_SETTINGS: BetterCalendarSettings = {
	weekStart: "locale",
	confirmBeforeCreate: true,
	showWeekNumber: false,
	localeOverride: "system",
	outlineColor: "",
	hoverColor: "",
	highlights: [],
};

/** Coerce persisted/raw settings into a valid, in-range object. */
export function normalizeSettings(
	raw: Partial<BetterCalendarSettings> | null | undefined,
): BetterCalendarSettings {
	// Cell sizing was configurable once; strip stray minCellSize/maxCellSize
	// keys from old data.json files so they aren't persisted again.
	const { minCellSize: _min, maxCellSize: _max, ...rest } =
		(raw ?? {}) as Partial<BetterCalendarSettings> & { minCellSize?: unknown; maxCellSize?: unknown };
	const merged = { ...DEFAULT_SETTINGS, ...rest };

	return {
		...merged,
		highlights: Array.isArray(merged.highlights)
			? merged.highlights.map(normalizeRule)
			: [],
	};
}

function normalizeRule(rule: Partial<HighlightRule>): HighlightRule {
	return {
		id: rule.id ?? generateId(),
		pattern: rule.pattern ?? "",
		flags: (rule.flags ?? "").replace(/g/g, ""),
		color: rule.color || "#3aa675",
		enabled: rule.enabled ?? true,
	};
}

export function generateId(): string {
	return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
