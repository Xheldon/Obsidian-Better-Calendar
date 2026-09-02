import { App, ColorComponent, PluginSettingTab, Setting, moment } from "obsidian";
import type BetterCalendarPlugin from "./main";
import { CountScope, generateId, HighlightRule, TimeSegment, WeekStart } from "./settings";
import { validatePattern } from "./highlights";
import { isDailyNotesEnabled } from "./dailyNotes";
import { templateHasToken } from "./diary";
import { Language, setLanguage, t } from "./i18n";

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
		this.renderDiary(containerEl);
		this.renderTimeSegments(containerEl);
		this.renderPanel(containerEl);
		this.renderAppearance(containerEl);
		this.renderHighlights(containerEl);
		this.renderAdvanced(containerEl);
	}

	private async commit(): Promise<void> {
		await this.plugin.saveSettings();
	}

	// --- General --------------------------------------------------------------

	private renderGeneral(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName(t("language"))
			.setDesc(t("languageDesc"))
			.addDropdown((dd) => {
				dd.addOption("system", t("followObsidian"));
				dd.addOption("en", "English");
				dd.addOption("zh", "中文");
				dd.setValue(this.plugin.settings.language);
				dd.onChange(async (value) => {
					this.plugin.settings.language = value as Language;
					setLanguage(this.plugin.settings.language);
					await this.commit();
					this.plugin.rebuildViews();
					this.display(); // re-render this tab in the new language
				});
			});

		const locale = moment.locale();
		const localeFirstDay = moment().localeData().weekdays()[moment().localeData().firstDayOfWeek()];
		new Setting(containerEl)
			.setName(t("startWeekOn"))
			.setDesc(t("startWeekOnDesc"))
			.addDropdown((dd) => {
				dd.addOption("locale", t("localeDefault", localeFirstDay));
				const names = moment().locale(locale).localeData().weekdays();
				for (let i = 0; i < 7; i++) dd.addOption(String(i), names[i]);
				dd.setValue(String(this.plugin.settings.weekStart));
				dd.onChange(async (value) => {
					this.plugin.settings.weekStart = (value === "locale" ? "locale" : Number(value)) as WeekStart;
					await this.commit();
				});
			});

		new Setting(containerEl)
			.setName(t("confirmCreate"))
			.setDesc(t("confirmCreateDesc"))
			.addToggle((t) =>
				t.setValue(this.plugin.settings.confirmBeforeCreate).onChange(async (value) => {
					this.plugin.settings.confirmBeforeCreate = value;
					await this.commit();
				}),
			);

		new Setting(containerEl)
			.setName(t("showWeekNumber"))
			.setDesc(t("showWeekNumberDesc"))
			.addToggle((t) =>
				t.setValue(this.plugin.settings.showWeekNumber).onChange(async (value) => {
					this.plugin.settings.showWeekNumber = value;
					await this.commit();
				}),
			);
	}

	// --- Diary quick input ------------------------------------------------------

	private renderDiary(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(t("diaryHeading")).setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: t("diaryIntro"),
		});

		new Setting(containerEl)
			.setName(t("pathTemplate"))
			.setDesc(t("pathTemplateDesc"))
			.addText((text) => {
				text
					.setPlaceholder("Diary/{{YYYY}}年/{{YYYY}}-{{MM}}-{{DD}}.md")
					.setValue(this.plugin.settings.diaryPathTemplate)
					.onChange(async (value) => {
						// Without a {{...}} token every day would map to one file;
						// flag it and fall back to the core Daily notes config.
						const invalid = Boolean(value.trim()) && !templateHasToken(value);
						text.inputEl.toggleClass("bc-invalid", invalid);
						text.inputEl.title = invalid ? t("pathTemplateInvalid") : "";
						this.plugin.settings.diaryPathTemplate = value;
						await this.commit();
					});
				text.inputEl.addClass("bc-wide-input");
			});

		new Setting(containerEl)
			.setName(t("templateFile"))
			.setDesc(t("templateFileDesc"))
			.addText((text) =>
				text
					.setPlaceholder("Helper/模板/日记模板.md")
					.setValue(this.plugin.settings.diaryTemplatePath)
					.onChange(async (value) => {
						this.plugin.settings.diaryTemplatePath = value;
						await this.commit();
					}),
			)
			.then((s) => s.controlEl.querySelector("input")?.addClass("bc-wide-input"));

		new Setting(containerEl)
			.setName(t("autoCreate"))
			.setDesc(t("autoCreateDesc"))
			.addToggle((t) =>
				t.setValue(this.plugin.settings.autoCreateDiary).onChange(async (value) => {
					this.plugin.settings.autoCreateDiary = value;
					await this.commit();
				}),
			);

		new Setting(containerEl)
			.setName(t("headingLevel"))
			.setDesc(t("headingLevelDesc"))
			.addSlider((slider) =>
				slider
					.setLimits(1, 6, 1)
					.setValue(this.plugin.settings.diaryHeadingLevel)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.diaryHeadingLevel = value;
						await this.commit();
					}),
			);

		new Setting(containerEl)
			.setName(t("entryPattern"))
			.setDesc(t("entryPatternDesc"))
			.addText((text) => {
				text
					.setPlaceholder("^\\[\\d{2}:\\d{2}\\]")
					.setValue(this.plugin.settings.entryLinePattern)
					.onChange(async (value) => {
						const error = validatePattern(value, "");
						text.inputEl.toggleClass("bc-invalid", Boolean(value) && Boolean(error));
						text.inputEl.title = error ?? "";
						this.plugin.settings.entryLinePattern = value;
						await this.commit();
					});
				text.inputEl.addClass("bc-pattern-input");
			});

		new Setting(containerEl)
			.setName(t("entryFormat"))
			.setDesc(t("entryFormatDesc"))
			.addText((text) =>
				text
					.setPlaceholder("[{{HH:mm}}] {{content}}")
					.setValue(this.plugin.settings.entryLineFormat)
					.onChange(async (value) => {
						this.plugin.settings.entryLineFormat = value;
						await this.commit();
					}),
			);

		new Setting(containerEl)
			.setName(t("blankLine"))
			.setDesc(t("blankLineDesc"))
			.addToggle((t) =>
				t.setValue(this.plugin.settings.blankLineBetweenEntries).onChange(async (value) => {
					this.plugin.settings.blankLineBetweenEntries = value;
					await this.commit();
				}),
			);

		new Setting(containerEl)
			.setName(t("timeOrder"))
			.setDesc(t("timeOrderDesc"))
			.addToggle((t) =>
				t.setValue(this.plugin.settings.insertInTimeOrder).onChange(async (value) => {
					this.plugin.settings.insertInTimeOrder = value;
					await this.commit();
				}),
			);

		new Setting(containerEl)
			.setName(t("sendOnEnter"))
			.setDesc(t("sendOnEnterDesc"))
			.addToggle((t) =>
				t.setValue(this.plugin.settings.sendOnEnter).onChange(async (value) => {
					this.plugin.settings.sendOnEnter = value;
					await this.commit();
				}),
			);
	}

	// --- Time segments ----------------------------------------------------------

	private renderTimeSegments(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(t("segmentsHeading")).setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: t("segmentsIntro"),
		});

		const list = containerEl.createDiv({ cls: "bc-segment-list" });
		for (const segment of this.plugin.settings.timeSegments) {
			this.renderTimeSegment(list, segment);
		}

		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText(t("addSegment"))
				.setCta()
				.onClick(async () => {
					const segment: TimeSegment = { id: generateId(), name: "", start: "00:00", end: "23:59" };
					this.plugin.settings.timeSegments.push(segment);
					await this.commit();
					this.renderTimeSegment(list, segment);
				}),
		);
	}

	private renderTimeSegment(container: HTMLElement, segment: TimeSegment): void {
		const setting = new Setting(container).setClass("bc-segment-row");

		setting.addText((text) => {
			text
				.setPlaceholder(t("headingNamePlaceholder"))
				.setValue(segment.name)
				.onChange(async (value) => {
					segment.name = value;
					await this.commit();
				});
			text.inputEl.addClass("bc-segment-name");
		});

		const addTime = (value: string, label: string, set: (v: string) => void) => {
			setting.addText((text) => {
				text.setValue(value).onChange(async (v) => {
					// A time input mid-edit (or cleared) reports "" — don't persist
					// that, or the segment silently stops matching.
					if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) return;
					set(v);
					await this.commit();
				});
				text.inputEl.type = "time";
				text.inputEl.setAttribute("aria-label", label);
				text.inputEl.addClass("bc-segment-time");
			});
		};
		addTime(segment.start, t("startTime"), (v) => { segment.start = v; });
		addTime(segment.end, t("endTime"), (v) => { segment.end = v; });

		setting.addExtraButton((b) =>
			b
				.setIcon("trash-2")
				.setTooltip(t("deleteSegment"))
				.onClick(async () => {
					this.plugin.settings.timeSegments = this.plugin.settings.timeSegments.filter((s) => s.id !== segment.id);
					await this.commit();
					setting.settingEl.remove();
				}),
		);
	}

	// --- Panel ------------------------------------------------------------------

	private renderPanel(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(t("panelHeading")).setHeading();

		const toggles: Array<[string, string, () => boolean, (v: boolean) => void]> = [
			[t("showStats"), t("showStatsDesc"), () => this.plugin.settings.showStats, (v) => { this.plugin.settings.showStats = v; }],
			[t("showHeatmap"), t("showHeatmapDesc"), () => this.plugin.settings.showHeatmap, (v) => { this.plugin.settings.showHeatmap = v; }],
			[t("showTimeline"), t("showTimelineDesc"), () => this.plugin.settings.showTimeline, (v) => { this.plugin.settings.showTimeline = v; }],
			[t("showInput"), t("showInputDesc"), () => this.plugin.settings.showInput, (v) => { this.plugin.settings.showInput = v; }],
		];
		for (const [name, desc, get, set] of toggles) {
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addToggle((t) =>
					t.setValue(get()).onChange(async (value) => {
						set(value);
						await this.commit();
					}),
				);
		}

		new Setting(containerEl)
			.setName(t("countScope"))
			.setDesc(t("countScopeDesc"))
			.addDropdown((dd) => {
				dd.addOption("file", t("scopeFile"));
				dd.addOption("entries", t("scopeEntries"));
				dd.setValue(this.plugin.settings.countScope);
				dd.onChange(async (value) => {
					this.plugin.settings.countScope = value as CountScope;
					this.plugin.wordCache.invalidate();
					await this.commit();
				});
			});

		new Setting(containerEl)
			.setName(t("cellSizeName"))
			.setDesc(t("cellSizeDesc"))
			.addSlider((slider) =>
				slider
					.setLimits(26, 48, 1)
					.setValue(this.plugin.settings.cellSize)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.cellSize = value;
						await this.commit();
					}),
			);

		new Setting(containerEl)
			.setName(t("calendarHeight"))
			.setDesc(t("calendarHeightDesc"))
			.addSlider((slider) =>
				slider
					.setLimits(140, 600, 10)
					.setValue(this.plugin.settings.calendarHeight)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.calendarHeight = value;
						await this.commit();
					}),
			);
	}

	// --- Appearance -----------------------------------------------------------

	private renderAppearance(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(t("appearanceHeading")).setHeading();

		this.addColorSetting(
			containerEl,
			t("dividerColor"),
			t("dividerColorDesc"),
			() => this.plugin.settings.outlineColor,
			(v) => {
				this.plugin.settings.outlineColor = v;
			},
		);
		this.addColorSetting(
			containerEl,
			t("hoverColor"),
			t("hoverColorDesc"),
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
		const defaultHex = "#3aa675";
		let picker: ColorComponent;
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle((toggle) =>
				toggle
					.setTooltip(t("useDefaultColor"))
					.setValue(get() === "")
					.onChange(async (useTheme) => {
						set(useTheme ? "" : get() || defaultHex);
						await this.commit();
						picker.setDisabled(useTheme);
						picker.setValue(get() || defaultHex);
					}),
			)
			.addColorPicker((cp) => {
				picker = cp;
				cp
					.setValue(get() || defaultHex)
					.setDisabled(get() === "")
					.onChange(async (value) => {
						set(value);
						await this.commit();
					});
			});
	}

	// --- Highlights -----------------------------------------------------------

	private renderHighlights(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(t("highlightsHeading")).setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: t("highlightsIntro"),
		});

		const list = containerEl.createDiv({ cls: "bc-highlight-list" });
		for (const rule of this.plugin.settings.highlights) {
			this.renderHighlightRule(list, rule);
		}

		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText(t("addHighlight"))
				.setCta()
				.onClick(async () => {
					const rule: HighlightRule = {
						id: generateId(),
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

		setting.addToggle((toggle) =>
			toggle
				.setTooltip(t("enableHighlight"))
				.setValue(rule.enabled)
				.onChange(async (value) => {
					rule.enabled = value;
					await this.commit();
				}),
		);

		setting.addText((text) => {
			text
				.setPlaceholder(t("regexPlaceholder"))
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
			m: t("flagM"),
			i: t("flagI"),
			s: t("flagS"),
		};
		const flagsEl = setting.controlEl.createDiv({ cls: "bc-flags" });
		for (const flag of ["m", "i", "s"]) {
			const chip = flagsEl.createEl("button", { cls: "bc-flag-chip", text: flag });
			chip.setAttribute("aria-label", flagInfo[flag]);
			chip.toggleClass("is-on", rule.flags.includes(flag));
			chip.addEventListener("click", () => {
				const on = rule.flags.includes(flag);
				rule.flags = (on ? rule.flags.replace(flag, "") : rule.flags + flag).replace(/g/g, "");
				chip.toggleClass("is-on", !on);
				void this.commit();
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
				.setTooltip(t("deleteHighlight"))
				.onClick(async () => {
					this.plugin.settings.highlights = this.plugin.settings.highlights.filter((r) => r.id !== rule.id);
					await this.commit();
					setting.settingEl.remove(); // remove just this row — no full re-render
				}),
		);
	}

	// --- Daily notes (diagnostic) ---------------------------------------------

	private renderDailyNotesInfo(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(t("dailyNotesHeading")).setHeading();

		if (!isDailyNotesEnabled(this.app) && !this.plugin.settings.diaryPathTemplate.trim()) {
			containerEl.createEl("p", {
				cls: "setting-item-description bc-warning",
				text: t("dailyNotesWarning"),
			});
		}

		const s = this.plugin.dailyNoteSettings();
		const info = containerEl.createDiv({ cls: "setting-item-description bc-daily-info" });
		const custom = this.plugin.settings.diaryPathTemplate.trim();
		info.createDiv({
			text: custom ? t("dailyNotesCustom") : t("dailyNotesCore"),
		});
		const folder = s.folder ? s.folder.replace(/\/$/, "") + "/" : "";
		info.createDiv({ cls: "bc-daily-path", text: custom || `${folder}${s.format}.md` });
		if (!custom) {
			info.createDiv({ text: t("dailyNotesMeta", s.folder || t("vaultRoot"), s.format, s.template || t("none")) });
		}
	}

	// --- Advanced -------------------------------------------------------------

	private renderAdvanced(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(t("advancedHeading")).setHeading();

		new Setting(containerEl)
			.setName(t("overrideLocale"))
			.setDesc(t("overrideLocaleDesc"))
			.addDropdown((dd) => {
				dd.addOption("system", t("sameAsObsidian", moment.locale()));
				for (const loc of moment.locales()) dd.addOption(loc, loc);
				dd.setValue(this.plugin.settings.localeOverride);
				dd.onChange(async (value) => {
					this.plugin.settings.localeOverride = value;
					await this.commit();
				});
			});
	}
}
