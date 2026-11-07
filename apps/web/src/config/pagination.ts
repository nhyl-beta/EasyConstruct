/** Rows-per-page choices offered by every paginated table. */
export const PAGE_SIZE_OPTIONS = [5, 10, 20, 30, 40, 50] as const;

/** Page size every paginated table starts on; always one of PAGE_SIZE_OPTIONS. 5 is offered (B-17) but is not the default. */
export const DEFAULT_PAGE_SIZE: number = 10;
