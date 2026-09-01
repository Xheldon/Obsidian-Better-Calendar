import { App, Notice, TFile, normalizePath } from "obsidian";
import { moment } from "obsidian";
import { BetterCalendarSettings, TimeSegment } from "./settings";
import { applyTemplate, ensureFolderExists, getDailyNoteSettings } from "./dailyNotes";
import { t } from "./i18n";

/**
 * Where and how diary notes live and how quick-input entries are written into
 * them. Resolved from the plugin settings, falling back to the core Daily
 * notes configuration when the path/template fields are left empty.
 */
export interface DiaryConfig {
	/** Path template with {{...}} moment tokens; normalized, always ends in ".md". */
	pathTemplate: string;
	/** Template file used when creating a missing note; may be "". */
	templatePath: string;
	/** Format a bare {{date}} in the note template renders with. */
	dateTokenFormat: string;
	headingLevel: number;
	/** Regex source matching the first line of a timestamped entry. */
	entryPattern: string;
	entryFormat: string;
	autoCreate: boolean;
	blankLine: boolean;
	timeOrder: boolean;
	segments: TimeSegment[];
}

/** True when the template contains at least one {{...}} date token. */
export function templateHasToken(template: string): boolean {
	TOKEN_RE.lastIndex = 0;
	return TOKEN_RE.test(template);
}

export function getDiaryConfig(app: App, settings: BetterCalendarSettings): DiaryConfig {
	const core = getDailyNoteSettings(app);
	// Normalize up front so path construction, date extraction and the prefix
	// filter all describe the same string (a leading "/" or "//" would otherwise
	// silently break the index while the calendar still works).
	let pathTemplate = normalizePath(settings.diaryPathTemplate.trim());
	// A template with no date token would map every day onto one file; treat it
	// as unconfigured and fall back to the core Daily notes plugin.
	if (pathTemplate === "/" || !templateHasToken(pathTemplate)) pathTemplate = "";
	if (!pathTemplate) {
		// Wrap the whole core format in one token: moment renders literal
		// characters (e.g. "年") and path separators inside a format just fine.
		const folder = core.folder ? normalizePath(core.folder).replace(/\/$/, "") + "/" : "";
		pathTemplate = `${folder}{{${core.format}}}`;
	}
	if (!pathTemplate.endsWith(".md")) pathTemplate += ".md";

	return {
		pathTemplate,
		templatePath: settings.diaryTemplatePath.trim() || core.template,
		dateTokenFormat: core.format,
		headingLevel: settings.diaryHeadingLevel,
		entryPattern: settings.entryLinePattern,
		entryFormat: settings.entryLineFormat,
		autoCreate: settings.autoCreateDiary,
		blankLine: settings.blankLineBetweenEntries,
		timeOrder: settings.insertInTimeOrder,
		segments: settings.timeSegments,
	};
}

// --- path template ----------------------------------------------------------

const TOKEN_RE = /{{\s*([^}]+?)\s*}}/g;

/** Vault path of the diary note for `date`. */
export function diaryPathForDate(config: DiaryConfig, date: moment.Moment): string {
	const path = config.pathTemplate.replace(TOKEN_RE, (_m, fmt: string) => date.format(fmt));
	return normalizePath(path);
}

/**
 * Literal "[" / "]" in a path can't be expressed inside a moment escape run,
 * so both the format literals and the parsed path swap them for these
 * placeholder characters (which never occur in vault paths).
 */
const OPEN_BRACKET = "\u0001";
const CLOSE_BRACKET = "\u0002";

function maskBrackets(s: string): string {
	return s.replace(/\[/g, OPEN_BRACKET).replace(/\]/g, CLOSE_BRACKET);
}

/**
 * Moment parse-format equivalent of the path template: literal runs are
 * bracket-escaped, {{...}} tokens are inserted raw. Lets us recover the date
 * from an arbitrary vault path with one strict moment parse.
 */
function templateToParseFormat(template: string): string {
	let out = "";
	let last = 0;
	TOKEN_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = TOKEN_RE.exec(template))) {
		out += escapeLiteral(template.slice(last, match.index));
		out += match[1];
		last = match.index + match[0].length;
	}
	out += escapeLiteral(template.slice(last));
	return out;
}

function escapeLiteral(s: string): string {
	if (!s) return "";
	return "[" + maskBrackets(s) + "]";
}

/** The format depends only on the template, which is constant across a vault scan. */
let parseFormatCache: { template: string; format: string } | null = null;

function parseFormatFor(template: string): string {
	if (parseFormatCache?.template !== template) {
		parseFormatCache = { template, format: templateToParseFormat(template) };
	}
	return parseFormatCache.format;
}

/** If `path` is a diary note under this config, its date; else null. */
export function diaryDateFromPath(config: DiaryConfig, path: string): moment.Moment | null {
	const parsed = moment(maskBrackets(path), parseFormatFor(config.pathTemplate), true);
	if (!parsed.isValid()) return null;
	// Round-trip check: with repeated tokens (e.g. a year folder + a dated
	// filename) moment accepts inconsistent values, so only paths that map back
	// to themselves count as diary notes.
	return diaryPathForDate(config, parsed) === path ? parsed : null;
}

/** Static path prefix (up to the first token) — a cheap pre-filter for vault scans. */
export function diaryPathPrefix(config: DiaryConfig): string {
	const idx = config.pathTemplate.indexOf("{{");
	return idx === -1 ? config.pathTemplate : config.pathTemplate.slice(0, idx);
}

/** The existing diary note for `date`, or null. */
export function getDiaryNote(app: App, config: DiaryConfig, date: moment.Moment): TFile | null {
	const file = app.vault.getAbstractFileByPath(diaryPathForDate(config, date));
	return file instanceof TFile ? file : null;
}

/** Create (and return) the diary note for `date`, honoring the configured template. */
export async function createDiaryNote(
	app: App,
	config: DiaryConfig,
	date: moment.Moment,
): Promise<TFile | null> {
	const path = diaryPathForDate(config, date);

	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) return existing;

	await ensureFolderExists(app, path);

	let content = "";
	if (config.templatePath) {
		const templatePath = normalizePath(
			config.templatePath.endsWith(".md") ? config.templatePath : config.templatePath + ".md",
		);
		const templateFile = app.vault.getAbstractFileByPath(templatePath);
		if (templateFile instanceof TFile) {
			const title = path.split("/").pop()!.replace(/\.md$/, "");
			content = applyTemplate(await app.vault.cachedRead(templateFile), date, title, config.dateTokenFormat);
		} else {
			new Notice(t("noticeTemplateMissing", templatePath));
		}
	}

	try {
		return await app.vault.create(path, content);
	} catch (e) {
		// Lost a race or the path is otherwise occupied.
		const after = app.vault.getAbstractFileByPath(path);
		if (after instanceof TFile) return after;
		new Notice(t("noticeCreateFailed", path));
		console.error("Better Calendar: createDiaryNote failed", e);
		return null;
	}
}

// --- time segments ----------------------------------------------------------

/** "HH:mm" (or "H:mm") to minutes since midnight, or null. */
export function parseHM(value: string): number | null {
	const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!m) return null;
	const h = Number(m[1]);
	const min = Number(m[2]);
	if (h > 23 || min > 59) return null;
	return h * 60 + min;
}

/** The segment whose [start, end] window contains `minutes`, or null. */
export function segmentForTime(segments: TimeSegment[], minutes: number): TimeSegment | null {
	for (const seg of segments) {
		if (!seg.name.trim()) continue;
		const start = parseHM(seg.start);
		const end = parseHM(seg.end);
		if (start === null || end === null) continue;
		// start > end means the window wraps past midnight (e.g. 22:00–02:00).
		const hit = start <= end
			? minutes >= start && minutes <= end
			: minutes >= start || minutes <= end;
		if (hit) return seg;
	}
	return null;
}

/** First "H:mm"-looking time on the line, as minutes, or null. */
export function lineMinutes(line: string): number | null {
	const m = /([01]?\d|2[0-3]):([0-5]\d)/.exec(line);
	return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const DEFAULT_ENTRY_PATTERN = /^\[\d{2}:\d{2}\]/;

/** Compiled entry-start regex; falls back to the timestamp default when empty/invalid. */
export function compileEntryPattern(source: string): RegExp {
	if (!source.trim()) return DEFAULT_ENTRY_PATTERN;
	try {
		return new RegExp(source);
	} catch {
		return DEFAULT_ENTRY_PATTERN;
	}
}

// --- entry formatting & insertion -------------------------------------------

/** Render the entry-line format: {{content}} plus any {{...}} moment tokens. */
export function formatEntry(format: string, now: moment.Moment, content: string): string {
	// Placeholder that cannot occur in user text or in a moment format result.
	const SENTINEL = "\u0000";
	let sawContent = false;
	let line = format.replace(TOKEN_RE, (_m, token: string) => {
		if (token === "content") {
			sawContent = true;
			return SENTINEL;
		}
		return now.format(token);
	});
	if (!sawContent) line = line.replace(/\s*$/, "") + " " + SENTINEL;
	return line.split(SENTINEL).join(content);
}

export interface InsertOptions {
	/** Target heading text; null = append at the end of the note. */
	headingName: string | null;
	headingLevel: number;
	/** The formatted entry (may span multiple lines). */
	entryText: string;
	entryRegex: RegExp;
	blankLine: boolean;
	timeOrder: boolean;
	nowMinutes: number;
}

interface EntryBlock {
	start: number;
	/** Exclusive; trailing blank lines trimmed off. */
	end: number;
	minutes: number | null;
}

/** Pure text transform: insert one entry into the note body per the options. */
export function insertEntryIntoContent(source: string, opts: InsertOptions): string {
	const lines = source.length ? source.split("\n") : [];
	const entryLines = opts.entryText.split("\n");

	if (opts.headingName === null) {
		return appendAtEnd(lines, entryLines).join("\n");
	}

	const hashes = "#".repeat(opts.headingLevel);
	const headingRe = new RegExp(`^#{${opts.headingLevel}}\\s+(.*?)\\s*$`);
	let headingIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		const m = headingRe.exec(lines[i]);
		if (m && m[1] === opts.headingName) {
			headingIdx = i;
			break;
		}
	}

	if (headingIdx === -1) {
		// Heading missing (e.g. no template): create it at the end of the note.
		const out = [...lines];
		trimTrailingBlanks(out);
		if (out.length) out.push("");
		out.push(`${hashes} ${opts.headingName}`, "");
		out.push(...entryLines);
		out.push("");
		return out.join("\n");
	}

	// The section runs until the next heading of the same or a shallower level.
	let sectionEnd = lines.length;
	for (let i = headingIdx + 1; i < lines.length; i++) {
		const m = /^(#{1,6})\s/.exec(lines[i]);
		if (m && m[1].length <= opts.headingLevel) {
			sectionEnd = i;
			break;
		}
	}

	// Existing entries in the section. A block runs to the next entry start
	// (or section end), with trailing blank lines trimmed off.
	const blocks: EntryBlock[] = [];
	for (let i = headingIdx + 1; i < sectionEnd; i++) {
		if (opts.entryRegex.test(lines[i])) {
			blocks.push({ start: i, end: sectionEnd, minutes: lineMinutes(lines[i]) });
		}
	}
	for (let b = 0; b < blocks.length; b++) {
		let end = b + 1 < blocks.length ? blocks[b + 1].start : sectionEnd;
		while (end > blocks[b].start + 1 && lines[end - 1].trim() === "") end--;
		blocks[b].end = end;
	}

	let insertAt: number;
	if (blocks.length === 0) {
		// Insert after whatever non-entry content the section already holds.
		let end = sectionEnd;
		while (end > headingIdx + 1 && lines[end - 1].trim() === "") end--;
		insertAt = end;
	} else if (opts.timeOrder) {
		let after: EntryBlock | null = null;
		for (const block of blocks) {
			if (block.minutes !== null && block.minutes <= opts.nowMinutes) after = block;
		}
		insertAt = after ? after.end : blocks[0].start;
	} else {
		insertAt = blocks[blocks.length - 1].end;
	}

	const insertion: string[] = [];
	const prevLine = insertAt > 0 ? lines[insertAt - 1] : null;
	const prevIsHeading = insertAt - 1 === headingIdx;
	if (prevLine !== null && prevLine.trim() !== "" && (opts.blankLine || prevIsHeading)) {
		insertion.push("");
	}
	insertion.push(...entryLines);
	const nextLine = insertAt < lines.length ? lines[insertAt] : null;
	if (nextLine !== null && nextLine.trim() !== "") {
		// Separate from the following entry (per setting) or from a heading (always).
		if (opts.blankLine || /^#{1,6}\s/.test(nextLine)) insertion.push("");
	}

	return [...lines.slice(0, insertAt), ...insertion, ...lines.slice(insertAt)].join("\n");
}

function appendAtEnd(lines: string[], entryLines: string[]): string[] {
	const out = [...lines];
	trimTrailingBlanks(out);
	if (out.length) out.push("");
	out.push(...entryLines);
	out.push("");
	return out;
}

function trimTrailingBlanks(lines: string[]): void {
	while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
}

// --- entry parsing (timeline) -----------------------------------------------

export interface DiaryEntry {
	/** Minutes since midnight parsed off the entry's first line, or null. */
	minutes: number | null;
	/** "HH:mm" chip text (empty when no time was found). */
	time: string;
	/** Entry text with the timestamp prefix stripped. */
	text: string;
	/** Text of the nearest preceding heading (any level), or "". */
	section: string;
}

/**
 * All timestamped entries of a note, in file order. An entry starts at a line
 * matching `entryRegex` and continues until a blank line, a heading, or the
 * next entry.
 */
export function parseEntries(content: string, entryRegex: RegExp): DiaryEntry[] {
	const lines = content.split("\n");
	const entries: DiaryEntry[] = [];
	let section = "";
	let i = 0;

	// Skip YAML frontmatter.
	if (lines[0]?.trim() === "---") {
		for (let j = 1; j < lines.length; j++) {
			if (lines[j].trim() === "---") {
				i = j + 1;
				break;
			}
		}
	}

	for (; i < lines.length; i++) {
		const line = lines[i];
		const headingMatch = /^#{1,6}\s+(.*?)\s*$/.exec(line);
		if (headingMatch) {
			section = headingMatch[1];
			continue;
		}
		const startMatch = entryRegex.exec(line);
		if (!startMatch) continue;

		// The pattern may be unanchored — slice relative to where it matched.
		const matchEnd = startMatch.index + startMatch[0].length;
		const minutes = lineMinutes(line.slice(startMatch.index, matchEnd + 8));
		const parts = [line.slice(matchEnd).trim()];
		while (
			i + 1 < lines.length &&
			lines[i + 1].trim() !== "" &&
			!/^#{1,6}\s/.test(lines[i + 1]) &&
			!entryRegex.test(lines[i + 1])
		) {
			parts.push(lines[++i]);
		}
		entries.push({
			minutes,
			time: minutes === null ? "" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
			text: parts.join("\n"),
			section,
		});
	}
	return entries;
}
