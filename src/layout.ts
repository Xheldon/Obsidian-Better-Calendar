import { MAX_BLOCK_COLUMNS, MAX_BLOCK_ROWS } from "./constants";

const DAYS_PER_WEEK = 7;

export interface GridGeometry {
	/** Side-by-side month blocks (the "columns" the user reasons about). */
	columns: number;
	/** Week-rows per block. */
	rows: number;
	/** Square day-cell edge, in px. */
	cell: number;
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
 * Decide how many month blocks (columns) and week-rows fit, and how big each
 * square day-cell should be, given the available area and the cell-size range.
 *
 * Strategy: pack as many whole blocks/rows as fit at the *minimum* cell size
 * (so extra space becomes more months, not bigger cells), then grow the cell
 * uniformly to consume leftover space up to the maximum. The remainder is
 * centered by the caller.
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

	const columns = clamp(
		Math.floor(usableWidth / blockWidthAtMin),
		1,
		MAX_BLOCK_COLUMNS,
	);
	const rows = clamp(
		Math.floor(usableHeight / safeMin),
		1,
		MAX_BLOCK_ROWS,
	);

	// Largest square cell that lets `columns` blocks and `rows` rows still fit.
	const cellByWidth = (usableWidth - columns * weekColumnPx) / (columns * DAYS_PER_WEEK);
	const cellByHeight = usableHeight / rows;
	const cell = clamp(Math.floor(Math.min(cellByWidth, cellByHeight)), minCell, maxCell);

	return { columns, rows, cell };
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
