import { prisma } from '@frequency-tracker/database';
import { startOfDay, differenceInDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

/**
 * Get all off-time periods for a user's activity types with specific tags or activity types
 */
export async function getUserOffTimes(userId: string) {
  return await prisma.offTime.findMany({
    where: { userId },
    include: {
      tag: {
        include: {
          activityTypes: true,
        },
      },
      activityType: true,
    },
  });
}

/**
 * Calculate the number of off-time days to exclude from a calculation
 * between a start date and end date for a specific activity type
 */
export function calculateOffTimeDays(
  activityTypeId: string | undefined,
  startDate: Date,
  endDate: Date,
  offTimes: Awaited<ReturnType<typeof getUserOffTimes>>,
  userTimezone: string
): number {
  if (!activityTypeId) return 0;

  let excludedDays = 0;

  // Extract calendar dates from the period start/end (already normalized to midnight)
  const periodStartYear = startDate.getUTCFullYear();
  const periodStartMonth = startDate.getUTCMonth();
  const periodStartDay = startDate.getUTCDate();

  const periodEndYear = endDate.getUTCFullYear();
  const periodEndMonth = endDate.getUTCMonth();
  const periodEndDay = endDate.getUTCDate();

  // Create Date objects for comparison using UTC
  const periodStart = new Date(Date.UTC(periodStartYear, periodStartMonth, periodStartDay));
  const periodEnd = new Date(Date.UTC(periodEndYear, periodEndMonth, periodEndDay));

  for (const offTime of offTimes) {
    // Check if this off-time applies to the activity type
    // It applies if:
    // 1. It's set for a specific activity type that matches, OR
    // 2. It's set for a tag and the activity type has that tag
    const appliesToType =
      (offTime.activityTypeId && offTime.activityTypeId === activityTypeId) ||
      (offTime.tag && offTime.tag.activityTypes.some((type) => type.id === activityTypeId));

    if (!appliesToType) continue;

    // Off-time dates are stored as UTC midnight - extract calendar dates directly
    const offStartYear = offTime.startDate.getUTCFullYear();
    const offStartMonth = offTime.startDate.getUTCMonth();
    const offStartDay = offTime.startDate.getUTCDate();

    const offEndYear = offTime.endDate.getUTCFullYear();
    const offEndMonth = offTime.endDate.getUTCMonth();
    const offEndDay = offTime.endDate.getUTCDate();

    // Create Date objects using UTC
    const offStart = new Date(Date.UTC(offStartYear, offStartMonth, offStartDay));
    const offEnd = new Date(Date.UTC(offEndYear, offEndMonth, offEndDay));

    // Find the overlap between the period and the off-time
    const overlapStart = periodStart > offStart ? periodStart : offStart;
    const overlapEnd = periodEnd < offEnd ? periodEnd : offEnd;

    // If there's an overlap, count the days
    if (overlapStart <= overlapEnd) {
      const daysInOverlap = differenceInDays(overlapEnd, overlapStart) + 1; // +1 because both dates are inclusive
      excludedDays += daysInOverlap;
    }
  }

  return excludedDays;
}

/**
 * Check if a specific date falls within any off-time period for an activity type
 */
export function isDateInOffTime(
  activityTypeId: string | undefined,
  date: Date,
  offTimes: Awaited<ReturnType<typeof getUserOffTimes>>,
  userTimezone: string
): boolean {
  if (!activityTypeId) return false;

  // Convert the activity date to midnight in user's timezone
  const activityDateInUserTz = toZonedTime(date, userTimezone);
  const activityMidnight = startOfDay(activityDateInUserTz);

  // Extract calendar date components
  const activityYear = activityMidnight.getUTCFullYear();
  const activityMonth = activityMidnight.getUTCMonth();
  const activityDay = activityMidnight.getUTCDate();
  const activityDate = new Date(Date.UTC(activityYear, activityMonth, activityDay));

  for (const offTime of offTimes) {
    // Check if this off-time applies to the activity type
    // It applies if:
    // 1. It's set for a specific activity type that matches, OR
    // 2. It's set for a tag and the activity type has that tag
    const appliesToType =
      (offTime.activityTypeId && offTime.activityTypeId === activityTypeId) ||
      (offTime.tag && offTime.tag.activityTypes.some((type) => type.id === activityTypeId));

    if (!appliesToType) continue;

    // Off-time dates are stored as UTC midnight - extract calendar dates directly
    const startYear = offTime.startDate.getUTCFullYear();
    const startMonth = offTime.startDate.getUTCMonth();
    const startDay = offTime.startDate.getUTCDate();

    const endYear = offTime.endDate.getUTCFullYear();
    const endMonth = offTime.endDate.getUTCMonth();
    const endDay = offTime.endDate.getUTCDate();

    // Create Date objects for comparison using UTC
    const offStartDate = new Date(Date.UTC(startYear, startMonth, startDay));
    const offEndDate = new Date(Date.UTC(endYear, endMonth, endDay));

    // Check if date falls within this off-time period (inclusive on both ends)
    if (activityDate >= offStartDate && activityDate <= offEndDate) {
      return true;
    }
  }

  return false;
}

/**
 * Filter out activities that occurred during off-time periods
 */
export function filterActivitiesByOffTime<T extends { typeId: string; date: Date }>(
  activities: T[],
  offTimes: Awaited<ReturnType<typeof getUserOffTimes>>,
  userTimezone: string
): T[] {
  return activities.filter(
    (activity) => !isDateInOffTime(activity.typeId, activity.date, offTimes, userTimezone)
  );
}
