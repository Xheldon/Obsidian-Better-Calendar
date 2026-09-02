import { getLanguage } from "obsidian";

/** UI language: "system" follows Obsidian's interface language. */
export type Language = "system" | "en" | "zh";

const en = {
	// Commands
	cmdOpen: "Open calendar",
	cmdWrite: "Write to today's diary",

	// Calendar chrome
	today: "Today",
	prevMonth: "Previous month",
	nextMonth: "Next month",
	goToToday: "Go to today",

	// Create-note modal
	modalTitle: "Create daily note?",
	modalBody: "No daily note exists for {0}.",
	cancel: "Cancel",
	create: "Create",

	// Notices
	noticeNoDiary: "Better Calendar: today's diary note does not exist.",
	noticeTemplateMissing: 'Better Calendar: template not found at "{0}".',
	noticeCreateFailed: 'Better Calendar: could not create note at "{0}".',

	// Stats card
	wordsToday: "words today · {0} entries",
	statStreak: "streak",
	statBestStreak: "best streak",
	statDaysYear: "days this year",
	statWordsYear: "words this year",
	statLinksOut: "links out",
	statBacklinks: "backlinks",
	tipStreak: "Consecutive days with a diary note",
	tipBestStreak: "Longest run of consecutive diary days ever",
	tipWordsYear: "{0} entries this year",
	tipLinksOut: "Notes today's diary links to",
	tipBacklinks: "Notes linking to today's diary",

	// Heatmap
	heatmapTitle: "Heatmap",
	prevYear: "Previous year",
	nextYear: "Next year",
	heatmapWords: "{0} · {1} words",

	// Timeline
	timelineTitle: "Today",
	openTodayDiary: "Open today's diary",
	emptyNoEntries: "No timestamped entries yet.",
	emptyNoNote: "No diary note for today yet.",

	// Quick input
	inputPlaceholder: "Write to today's diary…",
	addEntry: "Add entry",
	endOfNote: "end of note",

	// Settings: general
	language: "Language",
	languageDesc: "UI language of the plugin. Command names refresh after restarting Obsidian.",
	followObsidian: "Follow Obsidian",
	startWeekOn: "Start week on",
	startWeekOnDesc: "Which day to start the week on. 'Locale default' follows your moment.js locale.",
	localeDefault: "Locale default ({0})",
	confirmCreate: "Confirm before creating new note",
	confirmCreateDesc: "Show a confirmation dialog before creating a new daily note from the calendar or heatmap.",
	showWeekNumber: "Show week number",
	showWeekNumberDesc: "Add a leading column with the week number to each month block.",

	// Settings: daily notes info
	dailyNotesHeading: "Daily notes",
	dailyNotesWarning:
		"The core 'Daily notes' plugin is disabled and no diary path template is set. " +
		"Enable it in Settings → Core plugins, or set a diary path template below.",
	dailyNotesCustom: "Better Calendar looks for a day's diary note at the configured template path:",
	dailyNotesCore: "Better Calendar follows the core Daily notes plugin and looks for a day's note at:",
	dailyNotesMeta: "Folder: {0}   ·   Format: {1}   ·   Template: {2}",
	vaultRoot: "(vault root)",
	none: "(none)",

	// Settings: diary
	diaryHeading: "Diary",
	diaryIntro:
		"The quick-input box appends timestamped entries to today's diary note, " +
		"under the heading of the current time segment.",
	pathTemplate: "Diary path template",
	pathTemplateDesc:
		"Vault path of a day's note, with {{...}} moment tokens — " +
		"e.g. Diary/{{YYYY}}年/{{YYYY}}-{{MM}}-{{DD}}.md. Leave empty to follow the core Daily notes plugin.",
	pathTemplateInvalid: "Needs at least one {{...}} date token",
	templateFile: "Diary template file",
	templateFileDesc:
		"Template used when a missing diary note is created. Leave empty to follow the core Daily notes template.",
	autoCreate: "Auto-create today's diary",
	autoCreateDesc: "When submitting an entry and today's note doesn't exist yet, create it from the template.",
	headingLevel: "Heading level",
	headingLevelDesc: "Exact markdown heading level of the time-segment headings (2 = '## 上午').",
	entryPattern: "Entry line pattern",
	entryPatternDesc:
		"Regex matching the first line of a timestamped entry — used by the timeline, ordering, and word count.",
	entryFormat: "Entry line format",
	entryFormatDesc: "Shape of an inserted entry: {{content}} plus {{...}} moment tokens for the current time.",
	blankLine: "Blank line between entries",
	blankLineDesc: "Keep an empty line between timestamped entries.",
	timeOrder: "Insert in time order",
	timeOrderDesc:
		"Place new entries after the last entry with an earlier time, instead of always at the end of the section.",
	sendOnEnter: "Enter sends the entry",
	sendOnEnterDesc:
		"Enter submits the quick input (Shift+Enter inserts a newline). When off, use Cmd/Ctrl+Enter to submit.",

	// Settings: time segments
	segmentsHeading: "Time segments",
	segmentsIntro:
		"Entries submitted between a segment's start and end land under the heading with that segment's name. " +
		"Outside every segment, entries are appended to the end of the note.",
	addSegment: "Add time segment",
	headingNamePlaceholder: "Heading name",
	startTime: "Start time",
	endTime: "End time",
	deleteSegment: "Delete segment",

	// Settings: panel
	panelHeading: "Panel",
	showStats: "Show statistics",
	showStatsDesc: "Word count, streaks, links of today's diary.",
	showHeatmap: "Show heatmap",
	showHeatmapDesc: "GitHub-style yearly activity grid; darker means more words.",
	showTimeline: "Show timeline",
	showTimelineDesc: "Today's timestamped entries, read from the diary note.",
	showInput: "Show quick input",
	showInputDesc: "The sticky input box at the bottom of the pane.",
	countScope: "Word count scope",
	countScopeDesc: "What the word counter (stats and heatmap) reads.",
	scopeFile: "Whole note",
	scopeEntries: "Timestamped entries only",
	cellSizeName: "Calendar cell size",
	cellSizeDesc:
		"Edge length (px) of a day cell; the calendar is exactly 7 cells wide and never resizes with the pane. " +
		"Stats, heatmap, timeline and input adapt to the pane width; when there's room beside the calendar " +
		"the stats move next to it.",
	calendarHeight: "Calendar height",
	calendarHeightDesc: "Height (px) of the calendar strip.",

	// Settings: appearance
	appearanceHeading: "Appearance",
	dividerColor: "Month divider color",
	dividerColorDesc:
		"Color of the lines that separate months. Default: a subtle theme gray — turn the toggle off to pick a custom color.",
	hoverColor: "Day hover color",
	hoverColorDesc:
		"Highlight when hovering a single day. Defaults to your theme's accent — turn the toggle off to pick a custom color.",
	useDefaultColor: "Use the default color",

	// Settings: highlights
	highlightsHeading: "Highlights",
	highlightsIntro:
		"Add a colored dot to any day whose daily note matches a regular expression — for example '^## 今日运动' to mark the days you exercised.",
	addHighlight: "Add highlight",
	enableHighlight: "Enable this highlight",
	regexPlaceholder: "Regex pattern",
	deleteHighlight: "Delete highlight",
	flagM: "multiline — ^ and $ match the start/end of each line",
	flagI: "ignore case",
	flagS: "dotall — . also matches newlines",

	// Settings: advanced
	advancedHeading: "Advanced",
	overrideLocale: "Override locale",
	overrideLocaleDesc: "Use a locale different from Obsidian's for weekday and month names.",
	sameAsObsidian: "Same as Obsidian ({0})",
};

export type TranslationKey = keyof typeof en;

const zh: Record<TranslationKey, string> = {
	cmdOpen: "打开日历",
	cmdWrite: "写入今日日记",

	today: "今天",
	prevMonth: "上个月",
	nextMonth: "下个月",
	goToToday: "回到今天",

	modalTitle: "创建日记？",
	modalBody: "{0} 还没有日记。",
	cancel: "取消",
	create: "创建",

	noticeNoDiary: "Better Calendar：今天的日记还不存在。",
	noticeTemplateMissing: "Better Calendar：找不到模板 \"{0}\"。",
	noticeCreateFailed: "Better Calendar：无法在 \"{0}\" 创建笔记。",

	wordsToday: "今日字数 · {0} 条",
	statStreak: "连续天数",
	statBestStreak: "最长连续",
	statDaysYear: "今年天数",
	statWordsYear: "今年字数",
	statLinksOut: "出链",
	statBacklinks: "反链",
	tipStreak: "连续写日记的天数",
	tipBestStreak: "历史上最长的连续记录",
	tipWordsYear: "今年共 {0} 条",
	tipLinksOut: "今日日记链接的笔记数",
	tipBacklinks: "链接到今日日记的笔记数",

	heatmapTitle: "热力图",
	prevYear: "上一年",
	nextYear: "下一年",
	heatmapWords: "{0} · {1} 字",

	timelineTitle: "今天",
	openTodayDiary: "打开今日日记",
	emptyNoEntries: "还没有时间戳条目。",
	emptyNoNote: "今天还没有日记。",

	inputPlaceholder: "写点什么到今日日记…",
	addEntry: "添加条目",
	endOfNote: "文末",

	language: "语言",
	languageDesc: "插件界面语言。命令名称在重启 Obsidian 后更新。",
	followObsidian: "跟随 Obsidian",
	startWeekOn: "每周开始于",
	startWeekOnDesc: "一周从哪天开始。「区域默认」跟随 moment.js 的区域设置。",
	localeDefault: "区域默认（{0}）",
	confirmCreate: "创建前确认",
	confirmCreateDesc: "从日历或热力图创建缺失的日记前，先弹出确认对话框。",
	showWeekNumber: "显示周数",
	showWeekNumberDesc: "在每个月块前加一列周数。",

	dailyNotesHeading: "日记（Daily notes）",
	dailyNotesWarning:
		"核心插件「日记」未启用，且未设置日记路径模板。请在 设置 → 核心插件 中启用，或在下方设置日记路径模板。",
	dailyNotesCustom: "Better Calendar 按配置的路径模板查找某天的日记：",
	dailyNotesCore: "Better Calendar 跟随核心「日记」插件，按以下路径查找某天的笔记：",
	dailyNotesMeta: "文件夹：{0}   ·   格式：{1}   ·   模板：{2}",
	vaultRoot: "（仓库根目录）",
	none: "（无）",

	diaryHeading: "日记",
	diaryIntro: "快捷输入框会把带时间戳的条目追加到今日日记中当前时间段对应的 Heading 下。",
	pathTemplate: "日记路径模板",
	pathTemplateDesc:
		"某天日记的仓库路径，使用 {{...}} moment 令牌——例如 Diary/{{YYYY}}年/{{YYYY}}-{{MM}}-{{DD}}.md。留空则跟随核心「日记」插件。",
	pathTemplateInvalid: "至少需要一个 {{...}} 日期令牌",
	templateFile: "日记模板路径",
	templateFileDesc: "自动创建日记时使用的模板文件。留空则跟随核心「日记」插件的模板。",
	autoCreate: "自动创建今日日记",
	autoCreateDesc: "提交条目时若今日日记不存在，按模板自动创建。",
	headingLevel: "Heading 层级",
	headingLevelDesc: "时间段 Heading 的确切 markdown 层级（2 = '## 上午'）。",
	entryPattern: "行匹配模式",
	entryPatternDesc: "匹配时间戳条目首行的正则——用于时间轴、排序和字数统计。",
	entryFormat: "行格式",
	entryFormatDesc: "插入条目的格式：{{content}} 加上表示当前时间的 {{...}} moment 令牌。",
	blankLine: "条目之间保留空行",
	blankLineDesc: "在时间戳条目之间保留一个空行。",
	timeOrder: "按时间顺序插入",
	timeOrderDesc: "把新条目插到时间更早的最后一条之后，而不是总追加到小节末尾。",
	sendOnEnter: "Enter 发送",
	sendOnEnterDesc: "Enter 提交快捷输入（Shift+Enter 换行）。关闭后用 Cmd/Ctrl+Enter 提交。",

	segmentsHeading: "时间段",
	segmentsIntro:
		"在某时间段起止之间提交的条目会写入与该时间段同名的 Heading 下。不在任何时间段内时，条目追加到笔记末尾。",
	addSegment: "添加时间段",
	headingNamePlaceholder: "Heading 名称",
	startTime: "开始时间",
	endTime: "结束时间",
	deleteSegment: "删除时间段",

	panelHeading: "面板",
	showStats: "显示统计",
	showStatsDesc: "今日日记的字数、连续天数、链接数等。",
	showHeatmap: "显示热力图",
	showHeatmapDesc: "GitHub 风格的年度活动图；颜色越深字数越多。",
	showTimeline: "显示时间轴",
	showTimelineDesc: "从日记中读取今天的时间戳条目。",
	showInput: "显示快捷输入",
	showInputDesc: "面板底部吸底的输入框。",
	countScope: "字数统计范围",
	countScopeDesc: "字数统计（统计卡片和热力图）读取的内容。",
	scopeFile: "整篇笔记",
	scopeEntries: "仅时间戳条目",
	cellSizeName: "日历格子尺寸",
	cellSizeDesc:
		"日期格子的边长（px）；日历恒为 7 格宽，不随窗格缩放。统计、热力图、时间轴、输入框自适应窗格宽度；日历右侧放得下时统计会挪到旁边。",
	calendarHeight: "日历高度",
	calendarHeightDesc: "日历条带的高度（px）。",

	appearanceHeading: "外观",
	dividerColor: "月份分隔线颜色",
	dividerColorDesc: "分隔月份的线条颜色。默认是主题的浅灰——关闭开关可自选颜色。",
	hoverColor: "日期悬停颜色",
	hoverColorDesc: "悬停单个日期时的高亮。默认跟随主题强调色——关闭开关可自选颜色。",
	useDefaultColor: "使用默认颜色",

	highlightsHeading: "高亮",
	highlightsIntro: "给日记内容匹配正则的日期加彩色圆点——例如 '^## 今日运动' 标记锻炼过的日子。",
	addHighlight: "添加高亮",
	enableHighlight: "启用此高亮",
	regexPlaceholder: "正则表达式",
	deleteHighlight: "删除高亮",
	flagM: "多行——^ 和 $ 匹配每一行的开头/结尾",
	flagI: "忽略大小写",
	flagS: "dotall——. 也匹配换行",

	advancedHeading: "高级",
	overrideLocale: "覆盖区域设置",
	overrideLocaleDesc: "用与 Obsidian 不同的区域设置显示星期与月份名称。",
	sameAsObsidian: "与 Obsidian 相同（{0}）",
};

const DICTS: Record<"en" | "zh", Record<TranslationKey, string>> = { en, zh };

let active: Record<TranslationKey, string> = en;

/** Obsidian's own interface language, mapped onto our supported set. */
function systemLanguage(): "en" | "zh" {
	return getLanguage().toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function setLanguage(language: Language): void {
	active = DICTS[language === "system" ? systemLanguage() : language];
}

/** Translate `key`, substituting {0}, {1}, … with `args`. */
export function t(key: TranslationKey, ...args: (string | number)[]): string {
	let text = active[key];
	for (let i = 0; i < args.length; i++) {
		text = text.split(`{${i}}`).join(String(args[i]));
	}
	return text;
}
