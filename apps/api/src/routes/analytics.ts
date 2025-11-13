import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@frequency-tracker/database';
import { toZonedTime } from 'date-fns-tz';
import { differenceInDays, startOfDay } from 'date-fns';

interface AnalyticsData {
  activityType: string;
  desiredFrequency: number;
  totalAvgFrequency: number;
  dateOfFirstActivity: string | null;
  numberOfActivities: number;
}

interface StreakData {
  activityType: string;
  longestStreak: number;
  averageFrequency: number;
  streakStart: string | null;
  streakEnd: string | null;
}

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  // Get analytics data for all activity types
  fastify.get('/', async (request, reply) => {
    await request.jwtVerify();

    try {
      const { userId } = request.user as { userId: string };

      // Get user to access timezone
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const userTimezone = user.timezone || 'America/New_York';

      // Calculate midnight today in user's timezone for "days ago" calculation
      const nowUtc = new Date();
      const nowInUserTz = toZonedTime(nowUtc, userTimezone);
      const midnightToday = startOfDay(nowInUserTz);

      // Get all activity types for the user
      const activityTypes = await prisma.activityType.findMany({
        where: { userId },
        include: {
          activities: {
            orderBy: { date: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      });

      // Calculate analytics for each activity type
      const analytics: AnalyticsData[] = activityTypes.map((type) => {
        const activities = type.activities;
        const numberOfActivities = activities.length;

        let totalAvgFrequency = 0;
        let dateOfFirstActivity: string | null = null;

        if (numberOfActivities > 0) {
          dateOfFirstActivity = activities[0].date.toISOString();

          // Calculate total avg frequency as: days since first activity / number of activities
          const firstActivityInUserTz = toZonedTime(activities[0].date, userTimezone);
          const firstActivityMidnight = startOfDay(firstActivityInUserTz);
          const daysSinceFirst = differenceInDays(midnightToday, firstActivityMidnight);

          // Only calculate if we have at least 1 day and at least 1 activity
          if (daysSinceFirst > 0 && numberOfActivities > 0) {
            totalAvgFrequency = Math.round((daysSinceFirst / numberOfActivities) * 10) / 10;
          }
        }

        return {
          activityType: type.name,
          desiredFrequency: type.desiredFrequency,
          totalAvgFrequency,
          dateOfFirstActivity,
          numberOfActivities,
        };
      });

      // Calculate streaks for each activity type
      const streaks: StreakData[] = activityTypes.map((type) => {
        const activities = type.activities;
        const desiredFrequency = type.desiredFrequency;

        let longestStreak = 0;
        let longestStreakAvgFreq = 0;
        let longestStreakStart: Date | null = null;
        let longestStreakEnd: Date | null = null;

        // Need at least 2 activities to calculate a streak
        if (activities.length >= 2) {
          let currentStreakStart = activities[0].date;
          let currentStreakEnd = activities[0].date;
          let currentStreakActivities = [activities[0].date];

          for (let i = 1; i < activities.length; i++) {
            const currentActivity = activities[i];
            const prevActivity = activities[i - 1];

            // Calculate average frequency between consecutive activities
            const prevActivityInUserTz = toZonedTime(prevActivity.date, userTimezone);
            const currentActivityInUserTz = toZonedTime(currentActivity.date, userTimezone);
            const daysBetween = differenceInDays(
              startOfDay(currentActivityInUserTz),
              startOfDay(prevActivityInUserTz)
            );

            // Calculate running average frequency for the streak so far
            const streakStartInUserTz = toZonedTime(currentStreakStart, userTimezone);
            const currentActivityMidnight = startOfDay(currentActivityInUserTz);
            const streakStartMidnight = startOfDay(streakStartInUserTz);
            const totalDaysInStreak = differenceInDays(currentActivityMidnight, streakStartMidnight);
            const runningAvgFreq = totalDaysInStreak > 0 && currentStreakActivities.length > 0
              ? totalDaysInStreak / currentStreakActivities.length
              : 0;

            // Check if adding this activity keeps us at or below desired frequency
            if (runningAvgFreq <= desiredFrequency) {
              // Continue the streak
              currentStreakEnd = currentActivity.date;
              currentStreakActivities.push(currentActivity.date);
            } else {
              // Streak broken - check if it was the longest
              const streakEndInUserTz = toZonedTime(currentStreakEnd, userTimezone);
              const streakDuration = differenceInDays(
                startOfDay(streakEndInUserTz),
                streakStartMidnight
              );

              if (streakDuration > longestStreak) {
                longestStreak = streakDuration;
                longestStreakStart = currentStreakStart;
                longestStreakEnd = currentStreakEnd;
                // Calculate average frequency for the longest streak
                longestStreakAvgFreq = streakDuration > 0 && currentStreakActivities.length > 0
                  ? Math.round((streakDuration / currentStreakActivities.length) * 10) / 10
                  : 0;
              }

              // Start a new streak
              currentStreakStart = currentActivity.date;
              currentStreakEnd = currentActivity.date;
              currentStreakActivities = [currentActivity.date];
            }
          }

          // Check the final streak and potentially extend to current day
          const finalStreakStartInUserTz = toZonedTime(currentStreakStart, userTimezone);
          const streakStartMidnight = startOfDay(finalStreakStartInUserTz);

          // Try extending the streak to current day (midnight today)
          const daysFromStreakStartToToday = differenceInDays(midnightToday, streakStartMidnight);
          const extendedAvgFreq = daysFromStreakStartToToday > 0 && currentStreakActivities.length > 0
            ? daysFromStreakStartToToday / currentStreakActivities.length
            : 0;

          let finalStreakEnd = currentStreakEnd;
          let finalStreakDuration = 0;
          let finalStreakAvgFreq = 0;

          // If extending to today doesn't exceed desired frequency, use today as end
          if (extendedAvgFreq <= desiredFrequency && daysFromStreakStartToToday >= 0) {
            finalStreakEnd = nowUtc; // Use current date/time
            finalStreakDuration = daysFromStreakStartToToday;
            finalStreakAvgFreq = extendedAvgFreq;
          } else {
            // Otherwise use the last activity date as the end
            const finalStreakEndInUserTz = toZonedTime(currentStreakEnd, userTimezone);
            finalStreakDuration = differenceInDays(
              startOfDay(finalStreakEndInUserTz),
              streakStartMidnight
            );
            finalStreakAvgFreq = finalStreakDuration > 0 && currentStreakActivities.length > 0
              ? finalStreakDuration / currentStreakActivities.length
              : 0;
          }

          // Only consider this streak if it meets the desired frequency
          if (finalStreakAvgFreq <= desiredFrequency && finalStreakDuration > longestStreak) {
            longestStreak = finalStreakDuration;
            longestStreakStart = currentStreakStart;
            longestStreakEnd = finalStreakEnd;
            longestStreakAvgFreq = Math.round(finalStreakAvgFreq * 10) / 10;
          }
        }

        return {
          activityType: type.name,
          longestStreak,
          averageFrequency: longestStreakAvgFreq,
          streakStart: longestStreakStart ? longestStreakStart.toISOString() : null,
          streakEnd: longestStreakEnd ? longestStreakEnd.toISOString() : null,
        };
      });

      return reply.send({ analytics, streaks });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
