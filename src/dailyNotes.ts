import { App, normalizePath, Notice, TFile, TFolder } from "obsidian";
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

/**
 * The existing daily note for `date`, or null. Looks for a file at the canonical
 * folder + date-format path — the exact location a note would be created at — so
 * detection always agrees with creation.
 */
export function getDailyNote(app: App, date: moment.Moment, settings: DailyNoteSettings): TFile | null {
	const file = app.vault.getAbstractFileByPath(dailyNotePath(date, settings));
	return file instanceof TFile ? file : null;
}

/** The vault path a daily note for `date` would live at. */
export function dailyNotePath(date: moment.Moment, settings: DailyNoteSettings): string {
	const filename = date.format(settings.format);
	const folder = settings.folder ? settings.folder.replace(/\/$/, "") + "/" : "";
	return normalizePath(`${folder}${filename}.md`);
}

async function ensureFolderExists(app: App, path: string): Promise<void> {
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
	settings: DailyNoteSettings,
): string {
	const title = date.format(settings.format);
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
			return base.format(token === "time" ? "HH:mm" : settings.format);
		},
	);
}

/** Create (and return) a daily note for `date`, honoring the configured template. */
export async function createDailyNote(
	app: App,
	date: moment.Moment,
	settings: DailyNoteSettings,
): Promise<TFile | null> {
	const path = dailyNotePath(date, settings);

	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) return existing;

	await ensureFolderExists(app, path);

	let content = "";
	if (settings.template) {
		const templatePath = normalizePath(
			settings.template.endsWith(".md") ? settings.template : settings.template + ".md",
		);
		const templateFile = app.vault.getAbstractFileByPath(templatePath);
		if (templateFile instanceof TFile) {
			content = applyTemplate(await app.vault.cachedRead(templateFile), date, settings);
		} else {
			new Notice(`Better Calendar: template not found at "${templatePath}".`);
		}
	}

	try {
		return await app.vault.create(path, content);
	} catch (e) {
		// Lost a race or the path is otherwise occupied.
		const after = app.vault.getAbstractFileByPath(path);
		if (after instanceof TFile) return after;
		new Notice(`Better Calendar: could not create note at "${path}".`);
		console.error("Better Calendar: createDailyNote failed", e);
		return null;
	}
}

export function isFolder(value: unknown): value is TFolder {
	return value instanceof TFolder;
}
