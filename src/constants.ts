export const VIEW_TYPE_CALENDAR = "better-calendar-view";

/** Fixed day-cell sizing: height stays within this range (in px); width
 * stretches so the grid always fills the pane. Not user-configurable — the
 * layout adapts to the pane, keeping typography and density consistent. */
export const CELL_MIN = 34;
export const CELL_MAX = 52;

/** Hard caps so a huge pane never tries to render an absurd number of cells. */
export const MAX_BLOCK_COLUMNS = 6;
export const MAX_BLOCK_ROWS = 40;
