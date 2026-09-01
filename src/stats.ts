import { App, TFile } from "obsidian";
import { moment } from "obsidian";
import { dayKey } from "./dailyNotes";
import { DiaryConfig, diaryDateFromPath, diaryPathPrefix } from "./diary";

/** Every diary note in the vault, keyed by "YYYY-MM-DD". */
export function buildDiaryIndex(app: App, config: DiaryConfig): Map<string, TFile> {
	const prefix = diaryPathPrefix(config);
	const index = new Map<string, TFile>();
	for (const file of app.vault.getMarkdownFiles()) {
		if (prefix && !file.path.startsWith(prefix)) continue;
		const date = diaryDateFromPath(config, file.path);
		if (date) index.set(dayKey(date), file);
	}
	return index;
}

export interface Streaks {
	/** Consecutive days ending today (or yesterday, if today has no note yet). */
	current: number;
	longest: number;
}

export function computeStreaks(days: Set<string>, today: moment.Moment): Streaks {
	let current = 0;
	const cursor = today.clone();
	if (!days.has(dayKey(cursor))) cursor.subtract(1, "day");
	while (days.has(dayKey(cursor))) {
		current++;
		cursor.subtract(1, "day");
	}

	let longest = 0;
	for (const key of days) {
		const prev = moment(key, "YYYY-MM-DD", true).subtract(1, "day");
		if (days.has(dayKey(prev))) continue; // not the start of a run
		let length = 1;
		const walk = prev.add(2, "days"); // key's next day
		while (days.has(dayKey(walk))) {
			length++;
			walk.add(1, "day");
		}
		if (length > longest) longest = length;
	}
	return { current, longest };
}

export interface LinkCounts {
	/** Distinct notes today's diary links to. */
	outgoing: number;
	/** Distinct notes linking to today's diary. */
	backlinks: number;
}

export function linkCounts(app: App, file: TFile | null): LinkCounts {
	if (!file) return { outgoing: 0, backlinks: 0 };
	const resolved = app.metadataCache.resolvedLinks;
	const outgoing = Object.keys(resolved[file.path] ?? {}).length;
	let backlinks = 0;
	for (const [source, targets] of Object.entries(resolved)) {
		if (source !== file.path && targets[file.path]) backlinks++;
	}
	return { outgoing, backlinks };
}
