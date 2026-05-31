import { App, ColorComponent, PluginSettingTab, Setting, moment } from "obsidian";
import type BetterCalendarPlugin from "./main";
import { generateId, HighlightRule, WeekStart } from "./settings";
import { validatePattern } from "./highlights";
import { isDailyNotesEnabled } from "./dailyNotes";

export class BetterCalendarSettingTab extends PluginSettingTab {
	private plugin: BetterCalendarPlugin;

	constructor(app: App, plugin: BetterCalendarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.renderGeneral(containerEl);
		this.renderDailyNotesInfo(containerEl);
		this.renderAppearance(containerEl);
		this.renderHighlights(containerEl);
		this.renderAdvanced(containerEl);
	}

	private async commit(): Promise<void> {
		await this.plugin.saveSettings();
	}

	// --- General --------------------------------------------------------------

	private renderGeneral(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("General").setHeading();

		const locale = moment.locale();
		const localeFirstDay = moment().localeData().weekdays()[moment().localeData().firstDayOfWeek()];
		new Setting(containerEl)
			.setName("Start week on")
			.setDesc("Which day to start the week on. 'Locale default' follows your moment.js locale.")
			.addDropdown((dd) => {
				dd.addOption("locale", `Locale default (${localeFirstDay})`);
				const names = moment().locale(locale).localeData().weekdays();
				for (let i = 0; i < 7; i++) dd.addOption(String(i), names[i]);
				dd.setValue(String(this.plugin.settings.weekStart));
				dd.onChange(async (value) => {
					this.plugin.settings.weekStart = (value === "locale" ? "locale" : Number(value)) as WeekStart;
					await this.commit();
				});
			});

		new Setting(containerEl)
			.setName("Confirm before creating new note")
			.setDesc("Show a confirmation dialog before creating a new daily note.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.confirmBeforeCreate).onChange(async (value) => {
					this.plugin.settings.confirmBeforeCreate = value;
					await this.commit();
				}),
			);

		new Setting(containerEl)
			.setName("Show week number")
			.setDesc("Add a leading column with the week number to each month block.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.showWeekNumber).onChange(async (value) => {
					this.plugin.settings.showWeekNumber = value;
					await this.commit();
				}),
			);
	}

	// --- Appearance -----------------------------------------------------------

	private renderAppearance(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Appearance").setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text:
				"Day cells stay within this size range. A wider pane fits more months side-by-side and a taller pane adds more rows, instead of stretching the cells.",
		});

		new Setting(containerEl)
			.setName("Minimum day size")
			.setDesc("Smallest day-cell edge, in pixels.")
			.addText((text) =>
				text.setValue(String(this.plugin.settings.minCellSize)).onChange(async (value) => {
					const n = Number(value);
					if (Number.isFinite(n) && n > 0) {
						this.plugin.settings.minCellSize = Math.round(n);
						await this.commit();
					}
				}),
			);

		new Setting(containerEl)
			.setName("Maximum day size")
			.setDesc("Largest day-cell edge, in pixels.")
			.addText((text) =>
				text.setValue(String(this.plugin.settings.maxCellSize)).onChange(async (value) => {
					const n = Number(value);
					if (Number.isFinite(n) && n > 0) {
						this.plugin.settings.maxCellSize = Math.round(n);
						await this.commit();
					}
				}),
			);

		this.addColorSetting(
			containerEl,
			"Month outline color",
			"Outline drawn around a month on hover. Defaults to your theme's accent — turn the toggle off to pick a custom color.",
			() => this.plugin.settings.outlineColor,
			(v) => {
				this.plugin.settings.outlineColor = v;
			},
		);
		this.addColorSetting(
			containerEl,
			"Day hover color",
			"Highlight when hovering a single day. Defaults to your theme's accent — turn the toggle off to pick a custom color.",
			() => this.plugin.settings.hoverColor,
			(v) => {
				this.plugin.settings.hoverColor = v;
			},
		);
	}

	/** A "use theme accent (toggle) + custom color (picker)" row; "" stored = follow theme. */
	private addColorSetting(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		get: () => string,
		set: (value: string) => void,
	): void {
		const themeHex = this.themeAccentHex();
		let picker: ColorComponent;
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle((t) =>
				t
					.setTooltip("Use theme accent color")
					.setValue(get() === "")
					.onChange(async (useTheme) => {
						set(useTheme ? "" : get() || themeHex);
						await this.commit();
						picker.setDisabled(useTheme);
						picker.setValue(get() || themeHex);
					}),
			)
			.addColorPicker((cp) => {
				picker = cp;
				cp
					.setValue(get() || themeHex)
					.setDisabled(get() === "")
					.onChange(async (value) => {
						set(value);
						await this.commit();
					});
			});
	}

	/** Reads the theme accent color as a #rrggbb hex via a hidden probe element. */
	private themeAccentHex(): string {
		const probe = this.containerEl.createDiv();
		probe.style.color = "var(--interactive-accent)";
		probe.style.display = "none";
		const rgb = getComputedStyle(probe).color;
		probe.remove();
		const parts = rgb.match(/\d+/g);
		if (!parts || parts.length < 3) return "#3aa675";
		return "#" + parts.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
	}

	// --- Highlights -----------------------------------------------------------

	private renderHighlights(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Highlights").setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text:
				"Add a colored dot to any day whose daily note matches a regular expression — for example '^## 今日运动' to mark the days you exercised.",
		});

		const list = containerEl.createDiv({ cls: "bc-highlight-list" });
		for (const rule of this.plugin.settings.highlights) {
			this.renderHighlightRule(list, rule);
		}

		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText("Add highlight")
				.setCta()
				.onClick(async () => {
					const rule: HighlightRule = {
						id: generateId(),
						name: "",
						pattern: "",
						flags: "m",
						color: "#3aa675",
						enabled: true,
					};
					this.plugin.settings.highlights.push(rule);
					await this.commit();
					// Append just the new row, so scroll position and the other
					// rows' in-progress edits are preserved (no full re-render).
					this.renderHighlightRule(list, rule);
				}),
		);
	}

	private renderHighlightRule(container: HTMLElement, rule: HighlightRule): void {
		const setting = new Setting(container).setClass("bc-highlight-rule");

		setting.addToggle((t) =>
			t
				.setTooltip("Enable this highlight")
				.setValue(rule.enabled)
				.onChange(async (value) => {
					rule.enabled = value;
					await this.commit();
				}),
		);

		setting.addText((text) => {
			text
				.setPlaceholder("Regex pattern")
				.setValue(rule.pattern)
				.onChange(async (value) => {
					rule.pattern = value;
					const error = validatePattern(value, rule.flags);
					text.inputEl.toggleClass("bc-invalid", Boolean(value) && Boolean(error));
					text.inputEl.title = error ?? "";
					await this.commit();
				});
			text.inputEl.addClass("bc-pattern-input");
			const error = validatePattern(rule.pattern, rule.flags);
			text.inputEl.toggleClass("bc-invalid", Boolean(rule.pattern) && Boolean(error));
		});

		// Regex flags as toggle chips (m / i / s); g is excluded as it does nothing for matching.
		const flagInfo: Record<string, string> = {
			m: "multiline — ^ and $ match the start/end of each line",
			i: "ignore case",
			s: "dotall — . also matches newlines",
		};
		const flagsEl = setting.controlEl.createDiv({ cls: "bc-flags" });
		for (const flag of ["m", "i", "s"]) {
			const chip = flagsEl.createEl("button", { cls: "bc-flag-chip", text: flag });
			chip.setAttribute("aria-label", flagInfo[flag]);
			chip.toggleClass("is-on", rule.flags.includes(flag));
			chip.addEventListener("click", async () => {
				const on = rule.flags.includes(flag);
				rule.flags = (on ? rule.flags.replace(flag, "") : rule.flags + flag).replace(/g/g, "");
				chip.toggleClass("is-on", !on);
				await this.commit();
			});
		}

		setting.addColorPicker((picker) =>
			picker.setValue(rule.color).onChange(async (value) => {
				rule.color = value;
				await this.commit();
			}),
		);

		setting.addExtraButton((b) =>
			b
				.setIcon("trash-2")
				.setTooltip("Delete highlight")
				.onClick(async () => {
					this.plugin.settings.highlights = this.plugin.settings.highlights.filter((r) => r.id !== rule.id);
					await this.commit();
					setting.settingEl.remove(); // remove just this row — no full re-render
				}),
		);
	}

	// --- Daily notes (diagnostic) ---------------------------------------------

	private renderDailyNotesInfo(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Daily notes").setHeading();

		if (!isDailyNotesEnabled(this.app)) {
			containerEl.createEl("p", {
				cls: "setting-item-description bc-warning",
				text:
					"The core 'Daily notes' plugin is disabled. Enable it in Settings → Core plugins so Better Calendar can detect and create your notes.",
			});
		}

		const s = this.plugin.dailyNoteSettings();
		const info = containerEl.createDiv({ cls: "setting-item-description bc-daily-info" });
		info.createDiv({ text: "Better Calendar marks a day as having a note when a file exists at:" });
		const folder = s.folder ? s.folder.replace(/\/$/, "") + "/" : "";
		info.createEl("div", { cls: "bc-daily-path", text: `${folder}${s.format}.md` });
		info.createDiv({ text: `Folder: ${s.folder || "(vault root)"}   ·   Format: ${s.format}   ·   Template: ${s.template || "(none)"}` });
	}

	// --- Advanced -------------------------------------------------------------

	private renderAdvanced(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Advanced").setHeading();

		new Setting(containerEl)
			.setName("Override locale")
			.setDesc("Use a locale different from Obsidian's for weekday and month names.")
			.addDropdown((dd) => {
				dd.addOption("system", `Same as Obsidian (${moment.locale()})`);
				for (const loc of moment.locales()) dd.addOption(loc, loc);
				dd.setValue(this.plugin.settings.localeOverride);
				dd.onChange(async (value) => {
					this.plugin.settings.localeOverride = value;
					await this.commit();
				});
			});
	}
}
