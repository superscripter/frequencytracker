-- Migration: Add activity type support to off_times table
-- This allows off-time periods to be set per activity type in addition to per tag

-- Step 1: Make tagId nullable
ALTER TABLE "off_times" ALTER COLUMN "tagId" DROP NOT NULL;

-- Step 2: Add activityTypeId column (nullable)
ALTER TABLE "off_times" ADD COLUMN "activityTypeId" TEXT;

-- Step 3: Add foreign key constraint for activityTypeId
ALTER TABLE "off_times" ADD CONSTRAINT "off_times_activityTypeId_fkey"
  FOREIGN KEY ("activityTypeId") REFERENCES "activity_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 4: Add index for activityTypeId for better query performance
CREATE INDEX "off_times_activityTypeId_idx" ON "off_times"("activityTypeId");

-- Note: At least one of tagId or activityTypeId should be set for each off-time record
-- This constraint is enforced at the application level
