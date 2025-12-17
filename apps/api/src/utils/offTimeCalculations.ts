import { prisma } from '@frequency-tracker/database';
import { startOfDay, differenceInDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

/**
 * Get all off-time periods for a user's activity types with specific tags
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

  // Normalize dates to midnight in user's timezone
  const startMidnight = startOfDay(toZonedTime(startDate, userTimezone));
  const endMidnight = startOfDay(toZonedTime(endDate, userTimezone));

  // Extract calendar date components
  const startYear = startMidnight.getFullYear();
  const startMonth = startMidnight.getMonth();
  const startDay = startMidnight.getDate();

  const endYear = endMidnight.getFullYear();
  const endMonth = endMidnight.getMonth();
  const endDay = endMidnight.getDate();

  const periodStart = new Date(startYear, startMonth, startDay);
  const periodEnd = new Date(endYear, endMonth, endDay);

  for (const offTime of offTimes) {
    // Check if this off-time applies to the activity type (via tag)
    const appliesToType = offTime.tag.activityTypes.some(
      (type) => type.id === activityTypeId
    );

    if (!appliesToType) continue;

    // Off-time dates are stored as UTC midnight - extract calendar dates
    const offStartYear = offTime.startDate.getUTCFullYear();
    const offStartMonth = offTime.startDate.getUTCMonth();
    const offStartDay = offTime.startDate.getUTCDate();

    const offEndYear = offTime.endDate.getUTCFullYear();
    const offEndMonth = offTime.endDate.getUTCMonth();
    const offEndDay = offTime.endDate.getUTCDate();

    const offStart = new Date(offStartYear, offStartMonth, offStartDay);
    const offEnd = new Date(offEndYear, offEndMonth, offEndDay);

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

  // Extract just the calendar date components (YYYY-MM-DD) to compare
  const activityYear = activityMidnight.getFullYear();
  const activityMonth = activityMidnight.getMonth();
  const activityDay = activityMidnight.getDate();

  for (const offTime of offTimes) {
    // Check if this off-time applies to the activity type (via tag)
    const appliesToType = offTime.tag.activityTypes.some(
      (type) => type.id === activityTypeId
    );

    if (!appliesToType) continue;

    // Off-time dates are stored as UTC midnight (e.g., 2025-12-16T00:00:00.000Z)
    // Extract the calendar date they represent
    const startYear = offTime.startDate.getUTCFullYear();
    const startMonth = offTime.startDate.getUTCMonth();
    const startDay = offTime.startDate.getUTCDate();

    const endYear = offTime.endDate.getUTCFullYear();
    const endMonth = offTime.endDate.getUTCMonth();
    const endDay = offTime.endDate.getUTCDate();

    // Create Date objects for comparison using local date components
    const offStartDate = new Date(startYear, startMonth, startDay);
    const offEndDate = new Date(endYear, endMonth, endDay);
    const activityDate = new Date(activityYear, activityMonth, activityDay);

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
