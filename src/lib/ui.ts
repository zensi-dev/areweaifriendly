/** Project list columns from md up: disclosure chevron, project, area faces, verdict badge. Shared by header and rows. */
export const LIST_COLUMNS =
  'md:grid-cols-[1.25rem_minmax(0,1fr)_11.25rem_12rem] lg:grid-cols-[1.25rem_minmax(0,1fr)_12.75rem_13rem]';
/** The three area faces inside their list column, so header labels sit over their faces. */
export const AREA_COLUMNS = 'grid grid-cols-[repeat(3,3.75rem)] justify-items-center lg:grid-cols-[repeat(3,4.25rem)]';
/** Verdict badge width; the header label shares it so both start on the same edge. */
export const VERDICT_WIDTH = 'sm:w-[11.5rem]';

/** Page container widths. */
export const WIDE = 'mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8';
export const READING = 'mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8';
