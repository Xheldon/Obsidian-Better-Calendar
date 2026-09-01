import type { Language } from "./i18n";

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

/** A named window of the day; quick-input entries land under the matching heading. */
export interface TimeSegment {
	id: string;
	/** Heading text the entries of this window are inserted under. */
	name: string;
	/** Inclusive start, "HH:mm". */
	start: string;
	/** Inclusive end, "HH:mm". */
	end: string;
}

/** What the word counter looks at. */
export type CountScope = "file" | "entries";

export interface BetterCalendarSettings {
	/** UI language; "system" follows Obsidian's interface language. */
	language: Language;
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

	// --- Diary quick input ---------------------------------------------------

	/**
	 * Vault path template of a day's diary note, with {{...}} moment tokens,
	 * e.g. "Diary/{{YYYY}}年/{{YYYY}}-{{MM}}-{{DD}}.md".
	 * "" = follow the core Daily notes plugin (folder + format).
	 */
	diaryPathTemplate: string;
	/** Template file used when auto-creating a diary note; "" = core daily notes template. */
	diaryTemplatePath: string;
	/** Exact markdown heading level the time-segment headings use (1-6). */
	diaryHeadingLevel: number;
	/** Regex (source) matching the first line of a timestamped entry. */
	entryLinePattern: string;
	/** Shape of an inserted entry; {{content}} plus {{...}} moment tokens. */
	entryLineFormat: string;
	/** Create today's diary (from the template) when submitting into a missing note. */
	autoCreateDiary: boolean;
	/** Keep an empty line between timestamped entries. */
	blankLineBetweenEntries: boolean;
	/** Insert new entries in time order instead of always appending. */
	insertInTimeOrder: boolean;
	timeSegments: TimeSegment[];

	// --- Diary panel ---------------------------------------------------------

	/** What the word counter reads: the whole note, or timestamped entries only. */
	countScope: CountScope;
	/** Enter submits the quick input (Shift+Enter for a newline). */
	sendOnEnter: boolean;
	showStats: boolean;
	showHeatmap: boolean;
	showTimeline: boolean;
	showInput: boolean;
	/** Height (px) of the calendar strip. */
	calendarHeight: number;
	/**
	 * Edge length (px) of a day cell. The calendar renders at exactly
	 * 7 × cellSize (+ week-number column) — it never resizes with the pane;
	 * the other sections (stats/heatmap/timeline/input) are adaptive.
	 */
	cellSize: number;
}

export const DEFAULT_SEGMENTS: TimeSegment[] = [
	{ id: "seg-latenight", name: "昨夜凌晨", start: "00:00", end: "04:59" },
	{ id: "seg-morning", name: "上午", start: "05:00", end: "11:59" },
	{ id: "seg-afternoon", name: "下午", start: "12:00", end: "19:29" },
	{ id: "seg-evening", name: "晚上", start: "19:30", end: "23:59" },
];

export const DEFAULT_SETTINGS: BetterCalendarSettings = {
	language: "system",
	weekStart: "locale",
	confirmBeforeCreate: true,
	showWeekNumber: false,
	localeOverride: "system",
	outlineColor: "",
	hoverColor: "",
	highlights: [],

	diaryPathTemplate: "",
	diaryTemplatePath: "",
	diaryHeadingLevel: 2,
	entryLinePattern: "^\\[\\d{2}:\\d{2}\\]",
	entryLineFormat: "[{{HH:mm}}] {{content}}",
	autoCreateDiary: true,
	blankLineBetweenEntries: true,
	insertInTimeOrder: true,
	timeSegments: DEFAULT_SEGMENTS.map((s) => ({ ...s })),

	countScope: "file",
	sendOnEnter: true,
	showStats: true,
	showHeatmap: true,
	showTimeline: true,
	showInput: true,
	calendarHeight: 240,
	cellSize: 36,
};

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
	const n = typeof value === "number" ? Math.round(value) : NaN;
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

/** Coerce persisted/raw settings into a valid, in-range object. */
export function normalizeSettings(
	raw: Partial<BetterCalendarSettings> | null | undefined,
): BetterCalendarSettings {
	const merged = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };

	return {
		...merged,
		highlights: Array.isArray(merged.highlights)
			? merged.highlights.map(normalizeRule)
			: [],
		diaryHeadingLevel: clampInt(merged.diaryHeadingLevel, 1, 6, 2),
		calendarHeight: clampInt(merged.calendarHeight, 140, 600, DEFAULT_SETTINGS.calendarHeight),
		cellSize: clampInt(merged.cellSize, 26, 48, DEFAULT_SETTINGS.cellSize),
		language: merged.language === "en" || merged.language === "zh" ? merged.language : "system",
		countScope: merged.countScope === "entries" ? "entries" : "file",
		timeSegments: Array.isArray(merged.timeSegments)
			? merged.timeSegments.map(normalizeSegment)
			: DEFAULT_SEGMENTS.map((s) => ({ ...s })),
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

function normalizeSegment(segment: Partial<TimeSegment>): TimeSegment {
	return {
		id: segment.id ?? generateId(),
		name: segment.name ?? "",
		start: TIME_RE.test(segment.start ?? "") ? segment.start! : "00:00",
		end: TIME_RE.test(segment.end ?? "") ? segment.end! : "23:59",
	};
}

export function generateId(): string {
	return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
