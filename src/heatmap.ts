import { setTooltip } from "obsidian";
import { moment } from "obsidian";
import { dayKey } from "./dailyNotes";
import { startOfWeek } from "./dateUtils";
import { t } from "./i18n";

export interface HeatmapOptions {
	year: number;
	/** dayKey -> word count, for days that have a diary note. */
	counts: Map<string, number>;
	/** First day of the week, 0 (Sun) .. 6 (Sat). */
	weekStartDay: number;
	locale: string;
}

const CELL_GAP = 2;
/** Cells have a fixed, legible height; their width stretches to fill the row. */
const CELL_H = 10;

/**
 * GitHub-style yearly activity grid: one column per week, one row per weekday,
 * color depth by word count. Cell height is fixed; widths are fluid (1fr) so
 * the grid always spans the container exactly — no horizontal scrolling.
 * Cells carry `data-key` (YYYY-MM-DD); interaction (click to open, hover
 * preview) is delegated by the caller.
 */
export function renderHeatmap(container: HTMLElement, opts: HeatmapOptions): void {
	container.empty();

	const start = startOfWeek(moment({ year: opts.year, month: 0, day: 1 }), opts.weekStartDay);
	const end = moment({ year: opts.year, month: 11, day: 31 });
	const weeks = Math.ceil((end.diff(start, "days") + 1) / 7);

	// Approximate cell width, only used to pick the month-label style.
	const width = container.clientWidth;
	const cell = width > 0 ? (width - (weeks - 1) * CELL_GAP) / weeks : 8;

	const thresholds = levelThresholds(opts.counts, opts.year);
	const today = moment().startOf("day");

	const grid = container.createDiv({ cls: "bc-heatmap-grid" });
	grid.style.gridTemplateColumns = `repeat(${weeks}, minmax(0, 1fr))`;
	grid.style.gridTemplateRows = `14px repeat(7, ${CELL_H}px)`;
	grid.style.rowGap = `${CELL_GAP}px`;
	// Narrow columns keep a hairline gap so the cells don't drown in gutter.
	grid.style.columnGap = cell < 6 ? "1px" : `${CELL_GAP}px`;

	// Month labels: one per month, on the column of the week containing the 1st.
	let lastLabelCol = -2;
	for (let m = 0; m < 12; m++) {
		const first = moment({ year: opts.year, month: m, day: 1 });
		const col = Math.floor(first.diff(start, "days") / 7);
		if (col <= lastLabelCol + 1) continue; // avoid overlapping labels on tight grids
		const label = grid.createDiv({
			cls: "bc-heatmap-month",
			text: first.locale(opts.locale).format(cell >= 9 ? "MMM" : "M"),
		});
		label.style.gridColumn = `${col + 1} / span 4`;
		lastLabelCol = col;
	}

	const day = start.clone();
	for (let w = 0; w < weeks; w++) {
		for (let d = 0; d < 7; d++) {
			if (day.year() === opts.year) {
				const key = dayKey(day);
				const count = opts.counts.get(key);
				const el = grid.createDiv({ cls: "bc-heatmap-day" });
				el.style.gridRow = `${d + 2}`;
				el.style.gridColumn = `${w + 1}`;
				el.dataset.key = key;
				el.addClass(`bc-hm-l${levelFor(count, thresholds)}`);
				if (day.isSame(today, "day")) el.addClass("is-today");
				if (day.isAfter(today, "day")) el.addClass("is-future");
				const words = count ?? 0;
				setTooltip(el, count === undefined ? key : t("heatmapWords", key, words), { delay: 100 });
			}
			day.add(1, "day");
		}
	}
}

/** Quartile thresholds over the year's nonzero counts → levels 1..4. */
function levelThresholds(counts: Map<string, number>, year: number): number[] {
	const values: number[] = [];
	const prefix = `${year}-`;
	for (const [key, value] of counts) {
		if (key.startsWith(prefix) && value > 0) values.push(value);
	}
	if (!values.length) return [1, 1, 1];
	values.sort((a, b) => a - b);
	const q = (p: number) => values[Math.min(values.length - 1, Math.floor(values.length * p))];
	return [q(0.25), q(0.5), q(0.75)];
}

function levelFor(count: number | undefined, thresholds: number[]): number {
	if (count === undefined) return 0; // no note that day
	if (count <= 0) return 1; // note exists but empty
	if (count <= thresholds[0]) return 1;
	if (count <= thresholds[1]) return 2;
	if (count <= thresholds[2]) return 3;
	return 4;
}
