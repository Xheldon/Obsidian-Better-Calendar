# Better Calendar

A space-efficient calendar for [Obsidian](https://obsidian.md) that shows your
daily notes, creates them from your template, and highlights days that match
your own rules.

It started from the idea behind the popular **Calendar** plugin, but fixes its
biggest annoyance: in a tall or wide pane the classic calendar just stretches a
single month and wastes the rest of the space. Better Calendar instead fills the
available area with **more months** while keeping each day cell a comfortable
size.

## Features

- **Daily-note dots.** Reads your core **Daily notes** settings (folder, date
  format, template) and shows a gray dot on every day that already has a note.
- **Click to open or create.** Click a day to open its note. If none exists yet,
  you're asked whether to create one — the new note is placed in your daily-notes
  folder and filled in from your template (`{{title}}`, `{{date}}`,
  `{{date:FORMAT}}`, `{{time}}`, …). The confirmation can be turned off.
- **Space-filling layout.** Days render **by week**, and weeks flow
  **left-to-right, wrapping** to the next line when the row is full:
  - A **wider** pane fits more weeks per row.
  - A **taller** pane fits more rows of weeks.
  - Each day cell stays within a **minimum / maximum size** you set, so space is
    filled with more calendar — not bigger boxes. Left-over space gently grows
    the cells up to the maximum.
- **Smart "today" placement.** By default today's week is shown as the **3rd
  week** (a couple of weeks of past context first) — which puts it on the 3rd
  row in a narrow pane and near the top in wider ones. The ‹ › buttons move the
  view by one month; **Today** snaps back.
- **Month cues without clutter.** Instead of a header per month, the **1st of
  each month** shows the month's short name, and **hovering anywhere in a month**
  traces an outline around exactly that month's days.
- **Custom highlights.** Add rules that test each daily note against a regular
  expression and drop a **colored dot** on matching days — for example
  `^## 今日运动` to see at a glance which days you exercised.

## Requirements

The core **Daily notes** plugin must be enabled (Settings → Core plugins →
Daily notes). Better Calendar reads its *New file location*, *Date format*, and
*Template file location* to find and create your notes.

## Usage

- Better Calendar appears as a tab in the right sidebar (the calendar icon in
  the sidebar's tab strip); you can also open or focus it with the command
  **“Better Calendar: Open calendar.”** Drag it anywhere, including the main
  editor area, where the extra width lets it show several months at once.
- Click a day to open/create its note. `Ctrl`/`Cmd`-click opens it in a new tab.
- Hover a month to see its outline; the dots under each date show note presence
  and any matched highlight rules.

## Settings

| Setting | What it does |
| --- | --- |
| **Start week on** | First day of the week, or follow the locale default. |
| **Confirm before creating new note** | Ask before creating a missing daily note. |
| **Show week number** | Add a week-number column to each month block. |
| **Minimum / Maximum day size** | Clamp the day-cell edge (px). Drives how many months fit. |
| **Month outline / Day hover color** | Hover colors; default to the theme accent, or pick a custom color. |
| **Override locale** | Use a different locale for weekday / month names. |
| **Highlights** | Name + regex (+ flags) + color rules; matching days get a colored dot. |

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

The code is split into small modules: pure grid math (`layout.ts`), daily-note
access (`dailyNotes.ts`), highlight evaluation + caching (`highlights.ts`), the
view (`view.ts`), settings (`settings.ts` / `settingsTab.ts`), and the plugin
entry point (`main.ts`).

## License

MIT
