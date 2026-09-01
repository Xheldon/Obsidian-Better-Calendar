import { App } from "obsidian";
import { moment } from "obsidian";

export interface DailyNoteSettings {
	folder: string;
	format: string;
	template: string;
}

const DEFAULT_DAILY_FORMAT = "YYYY-MM-DD";

/** Reads the core "Daily notes" plugin configuration (folder / format / template). */
export function getDailyNoteSettings(app: App): DailyNoteSettings {
	// `internalPlugins` is not in the public typings, hence the cast.
	const internal = (app as unknown as {
		internalPlugins?: {
			getPluginById?: (id: string) => { instance?: { options?: Record<string, string> } } | undefined;
			plugins?: Record<string, { instance?: { options?: Record<string, string> } }>;
		};
	}).internalPlugins;

	const plugin = internal?.getPluginById?.("daily-notes") ?? internal?.plugins?.["daily-notes"];
	const options = plugin?.instance?.options ?? {};

	return {
		folder: (options.folder ?? "").trim(),
		format: (options.format || DEFAULT_DAILY_FORMAT).trim() || DEFAULT_DAILY_FORMAT,
		template: (options.template ?? "").trim(),
	};
}

/** True when the core Daily notes plugin is enabled. */
export function isDailyNotesEnabled(app: App): boolean {
	const internal = (app as unknown as {
		internalPlugins?: { getPluginById?: (id: string) => { enabled?: boolean } | undefined };
	}).internalPlugins;
	return Boolean(internal?.getPluginById?.("daily-notes")?.enabled);
}

/** A stable key (local calendar day) for indexing notes by date. */
export function dayKey(date: moment.Moment): string {
	return date.format("YYYY-MM-DD");
}

export async function ensureFolderExists(app: App, path: string): Promise<void> {
	const parts = path.split("/").slice(0, -1);
	let current = "";
	for (const part of parts) {
		if (!part) continue;
		current = current ? `${current}/${part}` : part;
		if (app.vault.getAbstractFileByPath(current)) continue;
		try {
			await app.vault.createFolder(current);
		} catch (e) {
			// May have been created concurrently; ignore if it now exists.
			if (!app.vault.getAbstractFileByPath(current)) throw e;
		}
	}
}

/**
 * Apply the core daily-note template tokens for `date`:
 *   {{title}}, {{date}}, {{date:FORMAT}}, {{time}}, {{time:FORMAT}}
 * plus an optional offset such as {{date+1d}} or {{date-2w:YYYY-MM-DD}}.
 */
export function applyTemplate(
	template: string,
	date: moment.Moment,
	title: string,
	defaultDateFormat: string,
): string {
	const now = moment();

	return template.replace(
		/{{\s*(date|time|title)\s*(?:([+-]\d+)([dwmy]))?\s*(?::\s*([^}]+?)\s*)?}}/gi,
		(_match, tokenRaw: string, offsetAmount: string, offsetUnit: string, fmt: string) => {
			const token = tokenRaw.toLowerCase();
			if (token === "title") return title;

			const base = (token === "time" ? now : date).clone();
			if (offsetAmount && offsetUnit) {
				base.add(Number(offsetAmount), offsetUnit as moment.unitOfTime.DurationConstructor);
			}
			if (fmt) return base.format(fmt);
			return base.format(token === "time" ? "HH:mm" : defaultDateFormat);
		},
	);
}
