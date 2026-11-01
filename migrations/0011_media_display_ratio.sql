-- How tall a clip should be drawn next to the photos it sits with.
--
-- The gallery frame was square for everything, so a video filmed on a phone —
-- which is most of them — appeared letterboxed into a narrow strip with black
-- down both sides. The shop films product demos vertically and occasionally
-- horizontally, and only the file knows which.
--
-- Nullable, and null means the square the gallery has always drawn. Nothing
-- has to be filled in for a page to keep rendering exactly as it does today;
-- a row gains an opinion when one is detected or chosen.
--
-- Stored as the ratio rather than as width and height on purpose: the owner is
-- allowed to show a vertical clip in a square frame if that is what they want
-- for the look of the page, and pixel dimensions cannot express a choice that
-- disagrees with the file.
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "displayRatio" TEXT;

ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_displayRatio_check";
ALTER TABLE "media" ADD CONSTRAINT "media_displayRatio_check"
  CHECK ("displayRatio" IS NULL OR "displayRatio" IN ('16:9', '9:16', '1:1'));
