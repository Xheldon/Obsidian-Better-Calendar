import { MAX_BLOCK_COLUMNS, MAX_BLOCK_ROWS } from "./constants";

const DAYS_PER_WEEK = 7;

export interface GridGeometry {
	/** Side-by-side month blocks (the "columns" the user reasons about). */
	columns: number;
	/** Week-rows per block; chosen to fill the available height. */
	rows: number;
	/** Day-cell width, in px (fills each column's share of the width). */
	cellW: number;
	/** Day-cell height, in px (fills the available height). */
	cellH: number;
}

export interface GridPlacement extends GridGeometry {
	/** Total weeks rendered = columns * rows. */
	totalWeeks: number;
	/** 0-based block-column the focused week is pinned to: ceil(columns/2) - 1. */
	targetCol: number;
	/** 0-based row the focused week is pinned to: min(2, rows - 1) (i.e. the 3rd row). */
	targetRow: number;
	/** Column-major linear index of the focused week within the window. */
	targetLinear: number;
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

/**
 * Where the focused week sits in the window: middle block-column (middle-left
 * when even, matching the user's 4-cols→2 / 5-cols→3 rule) and the 3rd row.
 */
export function placeFocus(geometry: GridGeometry): GridPlacement {
	const targetCol = Math.ceil(geometry.columns / 2) - 1;
	const targetRow = Math.min(2, geometry.rows - 1);
	return {
		...geometry,
		totalWeeks: geometry.columns * geometry.rows,
		targetCol,
		targetRow,
		// Column-major: walk down a block's rows, then jump to the next block.
		targetLinear: targetCol * geometry.rows + targetRow,
	};
}

/**
 * Map a cell's grid position to its linear week index (column-major) so we can
 * resolve its date from the first visible week.
 *
 *   weekIndex = blockCol * rows + row
 */
export function weekIndexAt(blockCol: number, row: number, rows: number): number {
	return blockCol * rows + row;
}

/**
 * Visual (on-screen) coordinates of a day-cell, used for the month-hover
 * outline. Neighboring cells on screen are not chronological neighbors across
 * block boundaries, so the outline must be computed from these, not from dates.
 */
export function visualColumn(blockCol: number, dayOfWeek: number): number {
	return blockCol * DAYS_PER_WEEK + dayOfWeek;
}

export { DAYS_PER_WEEK };
