import { ABS_MAX_CELL, ABS_MIN_CELL } from "./constants";

/** "locale" defers to the active moment.js locale; otherwise 0 (Sun) .. 6 (Sat). */
export type WeekStart = "locale" | 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface HighlightRule {
	id: string;
	/** Human label shown in settings and as the dot's tooltip. */
	name: string;
	/** Source of a RegExp tested against each daily note's content. */
	pattern: string;
	/** RegExp flags, e.g. "m" or "i". "g" is stripped to keep `test` stateless. */
	flags: string;
	/** Dot color, any CSS color (we store a hex from the color picker). */
	color: string;
	enabled: boolean;
}

export interface BetterCalendarSettings {
	/** Words represented by a single activity dot. */
	wordsPerDot: number;
	/** First day of the week. */
	weekStart: WeekStart;
	/** Ask before creating a missing daily note. */
	confirmBeforeCreate: boolean;
	/** Render a leading week-number column in each month block. */
	showWeekNumber: boolean;
	/** "system" uses Obsidian's locale; otherwise a moment.js locale id. */
	localeOverride: string;
	/** Square day-cell edge is clamped to [minCellSize, maxCellSize] px. */
	minCellSize: number;
	maxCellSize: number;
	highlights: HighlightRule[];
}

export const DEFAULT_SETTINGS: BetterCalendarSettings = {
	wordsPerDot: 250,
	weekStart: "locale",
	confirmBeforeCreate: true,
	showWeekNumber: false,
	localeOverride: "system",
	minCellSize: 34,
	maxCellSize: 72,
	highlights: [],
};

/** Coerce persisted/raw settings into a valid, in-range object. */
export function normalizeSettings(
	raw: Partial<BetterCalendarSettings> | null | undefined,
): BetterCalendarSettings {
	const merged = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };

	let min = clampNumber(merged.minCellSize, ABS_MIN_CELL, ABS_MAX_CELL, DEFAULT_SETTINGS.minCellSize);
	let max = clampNumber(merged.maxCellSize, ABS_MIN_CELL, ABS_MAX_CELL, DEFAULT_SETTINGS.maxCellSize);
	if (max < min) [min, max] = [max, min];

	return {
		...merged,
		wordsPerDot: clampNumber(merged.wordsPerDot, 1, 100000, DEFAULT_SETTINGS.wordsPerDot),
		minCellSize: min,
		maxCellSize: max,
		highlights: Array.isArray(merged.highlights)
			? merged.highlights.map(normalizeRule)
			: [],
	};
}

function normalizeRule(rule: Partial<HighlightRule>): HighlightRule {
	return {
		id: rule.id ?? generateId(),
		name: rule.name ?? "",
		pattern: rule.pattern ?? "",
		flags: (rule.flags ?? "").replace(/g/g, ""),
		color: rule.color || "#3aa675",
		enabled: rule.enabled ?? true,
	};
}

export function generateId(): string {
	return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.round(n)));
}
