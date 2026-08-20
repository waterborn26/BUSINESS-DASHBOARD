// Operating policy — the business's own thresholds, in one place.
//
// These are user-configurable settings in the live build (Settings → Financial
// assumptions). They live here rather than inside an engine so every engine reads the
// same number: a cash "floor" that means one thing to the reorder planner and another
// to the cash-flow warning is how dashboards start contradicting themselves.

/** Available cash the business will not spend down past. */
export const CASH_FLOOR = 2_000_000; // $20,000

/** Default supplier lead time, in days. Per-vendor overrides come with the PO connector. */
export const LEAD_TIME_DAYS = 35;

/** Days of cover a reorder targets after the goods land. */
export const REORDER_COVER_DAYS = 55;
