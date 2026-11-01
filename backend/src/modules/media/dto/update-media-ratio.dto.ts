import { IsIn } from 'class-validator';

/**
 * The three the shop actually films in. Not a free number: a frame has to be
 * one of a handful for the page to stay a page, and "whatever the file says"
 * is handled by the admin preselecting one of these rather than by widening
 * what the column can hold.
 */
export const DISPLAY_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type DisplayRatio = (typeof DISPLAY_RATIOS)[number];

export class UpdateMediaRatioDto {
  @IsIn(DISPLAY_RATIOS)
  displayRatio: DisplayRatio;
}
