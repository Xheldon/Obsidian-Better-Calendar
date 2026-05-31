import { MAX_BLOCK_COLUMNS, MAX_BLOCK_ROWS } from "./constants";

const DAYS_PER_WEEK = 7;

export interface GridGeometry {
	/** Side-by-side week-groups per band (each group is one 7-day week). */
	columns: number;
	/** Number of bands (rows of week-groups); chosen to fill the height. */
	rows: number;
	/** Day-cell width, in px (fills each week-group's share of the width). */
	cellW: number;
	/** Day-cell height, in px (fills the available height). */
	cellH: number;
}

export interface GridPlacement extends GridGeometry {
	/** Total weeks rendered = columns * rows. */
	totalWeeks: number;
	/** Row-major linear index of the focused (today) week within the window. */
	focusLinear: number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Decide how many month blocks (columns) and week-rows (rows) to render and how
 * big each day-cell is, so the grid fills the available area while keeping the
 * cell edges within [minCell, maxCell].
 *
 * - Columns: as many whole blocks as fit at the minimum cell width — a wider
 *   pane shows more months side by side.
 * - Cell width: fills each column's share of the width (capped at maxCell).
 * - Rows: enough near-square rows to fill the height — a taller pane shows more
 *   weeks per column instead of leaving blank space below.
 * - Cell height: sized to fill the height across those rows (within the range),
 *   so cells may end up very slightly non-square rather than leaving a gap.
 */
export function computeGeometry(
	width: number,
	availableHeight: number,
	minCell: number,
	maxCell: number,
	weekColumnPx: number,
): GridGeometry {
	const safeMin = Math.max(1, minCell);
	const blockWidthAtMin = DAYS_PER_WEEK * safeMin + weekColumnPx;
	const usableWidth = Math.max(width, blockWidthAtMin);
	const usableHeight = Math.max(availableHeight, safeMin);

	const columns = clamp(Math.floor(usableWidth / blockWidthAtMin), 1, MAX_BLOCK_COLUMNS);
	const cellW = clamp(
		Math.floor((usableWidth - columns * weekColumnPx) / (columns * DAYS_PER_WEEK)),
		minCell,
		maxCell,
	);

	// Pick a row count that keeps cells about square, then size them to fill the height.
	const rows = clamp(Math.max(1, Math.round(usableHeight / cellW)), 1, MAX_BLOCK_ROWS);
	const cellH = clamp(Math.floor(usableHeight / rows), minCell, maxCell);

	return { columns, rows, cellW, cellH };
}

/** Bands of past context shown above today (today starts the 3rd row). */
const FOCUS_PAST_BANDS = 2;

/**
 * Row-major flow: weeks fill each band left-to-right, then wrap to the next
 * band. Today starts the 3rd row, with two rows of recent weeks above it; in a
 * one-week-wide pane that is literally the 3rd row, and short panes clamp to
 * the last available row.
 */
export function placeFocus(geometry: GridGeometry): GridPlacement {
	const totalWeeks = geometry.columns * geometry.rows;
	const band = Math.min(FOCUS_PAST_BANDS, Math.max(0, geometry.rows - 1));
	return {
		...geometry,
		totalWeeks,
		focusLinear: Math.min(band * geometry.columns, Math.max(0, totalWeeks - 1)),
	};
}

/**
 * Visual (on-screen) column of a day-cell, used for the month-hover outline.
 * Cells adjacent on screen aren't always chronological neighbors, so the
 * outline is computed from these visual coordinates rather than from dates.
 */
export function visualColumn(weekGroup: number, dayOfWeek: number): number {
	return weekGroup * DAYS_PER_WEEK + dayOfWeek;
}

export { DAYS_PER_WEEK };
