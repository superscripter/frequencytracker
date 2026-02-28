-- Add four seasonal frequency columns, copying current desiredFrequency value into each
ALTER TABLE "activity_types"
  ADD COLUMN "freqWinter" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "freqSpring" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "freqSummer" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "freqFall"   DOUBLE PRECISION NOT NULL DEFAULT 1;

-- Backfill all four columns with the existing desiredFrequency value for every row
UPDATE "activity_types"
SET
  "freqWinter" = "desiredFrequency",
  "freqSpring" = "desiredFrequency",
  "freqSummer" = "desiredFrequency",
  "freqFall"   = "desiredFrequency";

-- Drop the old single-value column
ALTER TABLE "activity_types" DROP COLUMN "desiredFrequency";
