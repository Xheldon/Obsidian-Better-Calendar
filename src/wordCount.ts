import { App, TFile } from "obsidian";
import { parseEntries } from "./diary";

/** CJK ideographs, kana and hangul — each character counts as one word. */
const CJK_RE = /[\u2E80-\u2EFF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/g;

/**
 * CJK-aware word count: each CJK character counts as one, every other run of
 * letters/digits counts as one word.
 */
export function countWords(text: string): number {
	const cjk = text.match(CJK_RE)?.length ?? 0;
	const rest = text.replace(CJK_RE, " ").match(/[A-Za-z0-9_'\u00C0-\u024F]+/g)?.length ?? 0;
	return cjk + rest;
}

export function stripFrontmatter(text: string): string {
	if (!text.startsWith("---")) return text;
	const end = text.indexOf("\n---", 3);
	if (end === -1) return text;
	const after = text.indexOf("\n", end + 1);
	return after === -1 ? "" : text.slice(after + 1);
}

/** Light markdown cleanup so syntax doesn't inflate the count. */
function stripMarkdownNoise(text: string, entryRegex: RegExp): string {
	const perLine = new RegExp(entryRegex.source);
	return text
		.split("\n")
		.map((line) =>
			line
				.replace(perLine, "") // timestamp prefixes
				.replace(/^#{1,6}\s+/, "") // heading markers
				.replace(/\]\([^)]*\)/g, "]"), // markdown link targets
		)
		.join("\n");
}

export interface FileWordStats {
	/** Whole note (frontmatter excluded). */
	words: number;
	/** Timestamped entries only. */
	entryWords: number;
	entryCount: number;
}

const EMPTY_STATS: FileWordStats = { words: 0, entryWords: 0, entryCount: 0 };

export function computeWordStats(content: string, entryRegex: RegExp): FileWordStats {
	const body = stripFrontmatter(content);
	const entries = parseEntries(content, entryRegex);
	return {
		words: countWords(stripMarkdownNoise(body, entryRegex)),
		entryWords: entries.reduce((sum, e) => sum + countWords(stripMarkdownNoise(e.text, entryRegex)), 0),
		entryCount: entries.length,
	};
}

/**
 * Per-file word statistics, cached by mtime and the entry pattern in effect.
 * Backs the heatmap and the stats card, so a year-wide refresh only re-reads
 * files that actually changed.
 */
export class WordStatsCache {
	private entries = new Map<string, { mtime: number; patternKey: string; stats: FileWordStats }>();
	private pending = new Map<string, Promise<FileWordStats>>();

	constructor(private app: App) {}

	/** Drop one file (on modify/delete/rename) or everything (when undefined). */
	invalidate(path?: string): void {
		if (path === undefined) {
			this.entries.clear();
			this.pending.clear();
		} else {
			this.entries.delete(path);
			for (const key of [...this.pending.keys()]) {
				if (key.endsWith(`\u0000${path}`)) this.pending.delete(key);
			}
		}
	}

	resolve(file: TFile, entryRegex: RegExp): Promise<FileWordStats> {
		const patternKey = entryRegex.source;
		const cached = this.entries.get(file.path);
		if (cached && cached.mtime === file.stat.mtime && cached.patternKey === patternKey) {
			return Promise.resolve(cached.stats);
		}

		const pendingKey = `${patternKey}\u0000${file.path}`;
		const inFlight = this.pending.get(pendingKey);
		if (inFlight) return inFlight;

		// Snapshot the mtime before reading: if the file changes mid-read, the
		// stale content is stored under the old mtime and the next resolve
		// re-reads instead of serving pre-edit stats as fresh.
		const mtime = file.stat.mtime;
		const promise = (async () => {
			try {
				const content = await this.app.vault.cachedRead(file);
				const stats = computeWordStats(content, entryRegex);
				this.entries.set(file.path, { mtime, patternKey, stats });
				return stats;
			} catch (e) {
				console.error("Better Calendar: failed to read", file.path, e);
				return EMPTY_STATS;
			} finally {
				this.pending.delete(pendingKey);
			}
		})();

		this.pending.set(pendingKey, promise);
		return promise;
	}
}
