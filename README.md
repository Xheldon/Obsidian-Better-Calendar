# Better Calendar

A space-efficient calendar **and diary hub** for [Obsidian](https://obsidian.md):
a compact calendar on top, writing statistics, a GitHub-style yearly heatmap, a
timeline of today's timestamped entries, and a sticky quick-input box that
appends to today's diary note — under the right heading for the current time of
day.

The layout is stable by design: the calendar renders at a fixed width and
height, so dragging the sidebar never changes its cells. The stats, heatmap,
timeline and input adapt to the pane width, and in a wide enough pane the
statistics move into a second column beside the calendar.

## Features

- **Daily-note dots.** Reads your core **Daily notes** settings (folder, date
  format, template) and shows a gray dot on every day that already has a note.
- **Click to open or create.** Click a day to open its note. If none exists yet,
  you're asked whether to create one — the new note is placed in your daily-notes
  folder and filled in from your template (`{{title}}`, `{{date}}`,
  `{{date:FORMAT}}`, `{{time}}`, …). The confirmation can be turned off.
- **Stable strip layout.** The calendar is a fixed-width, fixed-height strip of
  continuous weeks (one week per row); its width and height are settings, not a
  function of how the pane happens to be sized.
- **Smart "today" placement.** By default today's week starts the **3rd row**,
  with two rows of recent weeks above it, so you land on today with its recent
  history already in view. The ‹ › buttons move the view by one month; **Today**
  snaps back.
- **Month cues without clutter.** Thin gray **divider lines** separate the
  months, and the **1st of each month** shows a faint centered watermark of the
  month's name (the year on Jan 1).
- **Custom highlights.** Add rules that test each daily note against a regular
  expression and drop a **colored dot** on matching days — for example
  `^## 今日运动` to see at a glance which days you exercised.

### Diary panel

Below the calendar, the pane doubles as a diary dashboard (every section can be
toggled off in settings):

- **Quick input.** A sticky input box at the bottom of the pane. Whatever note
  you're in, type and press Enter — the text is appended to **today's diary
  note** as a timestamped entry (`[16:38] …` by default). Entries land under the
  heading of the current **time segment** (e.g. `00:00–04:59 → ## 昨夜凌晨`,
  `12:00–19:29 → ## 下午`), are kept in **time order**, and today's note is
  created from your template automatically if it doesn't exist yet. The entry
  format, the heading level, the timestamp pattern and the segments are all
  configurable.
- **Statistics.** Words written today, current and longest streak, writing days
  and words this year, and how many notes today's diary **links to** / **is
  linked from**.
- **Yearly heatmap.** A GitHub-style activity grid — the darker the cell, the
  more words that day. Hover a day for the standard **page preview** of its
  note (Page preview core plugin), click to open it; ‹ › switches years.
- **Timeline.** Today's timestamped entries (lines matching the entry pattern),
  rendered as markdown and grouped by section — the diary note stays the single
  source of truth; the timeline only reads it.

## Requirements

By default Better Calendar follows the core **Daily notes** plugin (Settings →
Core plugins → Daily notes): its *New file location*, *Date format*, and
*Template file location* decide where notes are found and created.
Alternatively, set a **Diary path template** in the plugin settings (e.g.
`Diary/{{YYYY}}年/{{YYYY}}-{{MM}}-{{DD}}.md`) and Better Calendar uses that
everywhere instead — Daily notes doesn't need to be enabled then.

## Usage

- Better Calendar appears as a tab in the right sidebar (the calendar icon in
  the sidebar's tab strip); you can also open or focus it with the command
  **“Better Calendar: Open calendar.”** Drag it anywhere, including the main
  editor area, where the extra width lets it show several months at once.
- Click a day to open/create its note. `Ctrl`/`Cmd`-click opens it in a new tab.
- The command **“Better Calendar: Write to today's diary”** opens the pane and
  puts the cursor straight into the quick-input box.
- The day of the note you're currently viewing is ringed; dots under each date
  show note presence and any matched highlight rules.

## Settings

| Setting | What it does |
| --- | --- |
| **Language** | UI language: follow Obsidian (default), English, or 中文. |
| **Start week on** | First day of the week, or follow the locale default. |
| **Confirm before creating new note** | Ask before creating a missing daily note. |
| **Show week number** | Add a week-number column to each month block. |
| **Diary path template** | `{{...}}` moment tokens; empty = follow core Daily notes. |
| **Diary template file** | Template for auto-created notes; empty = core Daily notes template. |
| **Heading level** | Markdown level of the time-segment headings (2 = `## 上午`). |
| **Entry line pattern / format** | Regex that recognizes a timestamped entry, and the shape of inserted ones. |
| **Blank line between entries / Insert in time order** | Formatting of inserted entries. |
| **Time segments** | Named windows of the day; entries go under the matching heading. |
| **Panel sections** | Toggle statistics / heatmap / timeline / quick input individually. |
| **Word count scope** | Count the whole note, or timestamped entries only. |
| **Calendar cell size** | Edge length of a day cell; the calendar is exactly 7 cells wide and never resizes with the pane. Stats/heatmap/timeline/input adapt to the pane; when there's room the stats sit beside the calendar. |
| **Calendar height** | Height of the calendar strip. |
| **Month divider / Day hover color** | Divider defaults to a theme gray, hover to the theme accent; either can be custom. |
| **Override locale** | Use a different locale for weekday / month names. |
| **Highlights** | Regex (+ flags) + color rules; matching days get a colored dot. |

### Highlight rules

Each rule is a JavaScript regular expression tested against the **full text** of
the day's note. The `g` flag is ignored (matching is stateless); `m`
(multiline) and `i` (case-insensitive) are useful. Examples:

| Goal | Pattern | Flags |
| --- | --- | --- |
| Mark days with an exercise log | `^## 今日运动` | `m` |
| Mark days that mention a book | `#reading\b` | `i` |

## Installation

This repository contains the plugin **source**. To build and install it:

```bash
npm install
npm run build      # produces main.js
```

Then copy `main.js`, `manifest.json`, and `styles.css` into
`<your-vault>/.obsidian/plugins/better-calendar/` and enable **Better Calendar**
in Settings → Community plugins. (You can also point [BRAT](https://github.com/TfTHacker/obsidian42-brat)
at this repo.)

## Development

```bash
npm install
npm run dev        # esbuild watch → rebuilds main.js on change
npm run typecheck  # tsc --noEmit
```

The code is split into small modules: pure grid math (`layout.ts`), core
daily-notes access (`dailyNotes.ts`), the diary engine — path templates, time
segments, entry insertion/parsing (`diary.ts`), word counting + caching
(`wordCount.ts`), streak/link statistics (`stats.ts`), the heatmap renderer
(`heatmap.ts`), the diary panel — stats, heatmap, timeline, quick input
(`panel.ts`), highlight evaluation + caching (`highlights.ts`), the view
(`view.ts`), settings (`settings.ts` / `settingsTab.ts`), and the plugin entry
point (`main.ts`).

## License

MIT
