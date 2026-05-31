import { App, TFile } from "obsidian";
import { HighlightRule } from "./settings";

export interface CompiledRule {
	id: string;
	name: string;
	color: string;
	regex: RegExp;
}

/** Compile enabled, valid rules. Invalid patterns are skipped (reported elsewhere). */
export function compileRules(rules: HighlightRule[]): CompiledRule[] {
	const compiled: CompiledRule[] = [];
	for (const rule of rules) {
		if (!rule.enabled || !rule.pattern) continue;
		const error = validatePattern(rule.pattern, rule.flags);
		if (error) continue;
		compiled.push({
			id: rule.id,
			name: rule.name,
			color: rule.color,
			regex: new RegExp(rule.pattern, rule.flags.replace(/g/g, "")),
		});
	}
	return compiled;
}

/** Returns an error message if the pattern/flags are invalid, else null. */
export function validatePattern(pattern: string, flags: string): string | null {
	try {
		new RegExp(pattern, flags.replace(/g/g, ""));
		return null;
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
}

export interface NoteMeta {
	matchedRuleIds: string[];
}

const EMPTY_META: NoteMeta = { matchedRuleIds: [] };

/**
 * Caches per-file word count and matched highlight rules, keyed by the file's
 * mtime and the current rule set. Reads are async (vault.cachedRead); callers
 * use `peek` for an already-resolved value and `resolve` to load + cache.
 */
export class NoteMetaCache {
	private entries = new Map<string, { mtime: number; rulesVersion: number; meta: NoteMeta }>();
	private compiled: CompiledRule[] = [];
	private rulesVersion = 0;
	private pending = new Map<string, Promise<NoteMeta>>();

	constructor(private app: App) {}

	get rules(): CompiledRule[] {
		return this.compiled;
	}

	setRules(rules: HighlightRule[]): void {
		this.compiled = compileRules(rules);
		this.rulesVersion++;
	}

	/** Drop one file (on modify/delete/rename) or everything (when undefined). */
	invalidate(path?: string): void {
		if (path === undefined) {
			this.entries.clear();
			this.pending.clear();
		} else {
			this.entries.delete(path);
			this.pending.delete(path);
		}
	}

	private isFresh(file: TFile): boolean {
		const entry = this.entries.get(file.path);
		return !!entry && entry.mtime === file.stat.mtime && entry.rulesVersion === this.rulesVersion;
	}

	/** Synchronous cached value, or null if it needs resolving. */
	peek(file: TFile): NoteMeta | null {
		return this.isFresh(file) ? this.entries.get(file.path)!.meta : null;
	}

	/** Load and cache the file's meta (deduplicating concurrent reads). */
	resolve(file: TFile): Promise<NoteMeta> {
		const cached = this.peek(file);
		if (cached) return Promise.resolve(cached);

		const inFlight = this.pending.get(file.path);
		if (inFlight) return inFlight;

		const promise = (async () => {
			try {
				const content = await this.app.vault.cachedRead(file);
				const meta: NoteMeta = {
					matchedRuleIds: this.compiled
						.filter((rule) => rule.regex.test(content))
						.map((rule) => rule.id),
				};
				this.entries.set(file.path, { mtime: file.stat.mtime, rulesVersion: this.rulesVersion, meta });
				return meta;
			} catch (e) {
				console.error("Better Calendar: failed to read", file.path, e);
				return EMPTY_META;
			} finally {
				this.pending.delete(file.path);
			}
		})();

		this.pending.set(file.path, promise);
		return promise;
	}
}
