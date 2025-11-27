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

          // Calculate total avg frequency using interval mean
          // This measures the average number of days between consecutive activities
          if (numberOfActivities >= 1) {
            const intervals: number[] = [];

            // Calculate intervals between consecutive activities
            for (let i = 0; i < activities.length - 1; i++) {
              const currentActivityInUserTz = toZonedTime(activities[i].date, userTimezone);
              const currentActivityMidnight = startOfDay(currentActivityInUserTz);

              const nextActivityInUserTz = toZonedTime(activities[i + 1].date, userTimezone);
              const nextActivityMidnight = startOfDay(nextActivityInUserTz);

              const interval = differenceInDays(nextActivityMidnight, currentActivityMidnight);
              intervals.push(interval);
            }

            // Add the partial interval from the most recent activity to today
            const lastActivityInUserTz = toZonedTime(activities[activities.length - 1].date, userTimezone);
            const lastActivityMidnight = startOfDay(lastActivityInUserTz);
            const partialInterval = differenceInDays(midnightToday, lastActivityMidnight);
            intervals.push(partialInterval);

            // Calculate the mean of all intervals
            if (intervals.length > 0) {
              const sum = intervals.reduce((acc, val) => acc + val, 0);
              totalAvgFrequency = Math.round((sum / intervals.length) * 10) / 10;
            }
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
      // A streak is the longest window of time where the average frequency <= desired frequency
      // We need to find the optimal window, not just greedily extend from start
      const streaks: StreakData[] = activityTypes.map((type) => {
        const activities = type.activities;
        const desiredFrequency = type.desiredFrequency;

        let longestStreak = 0;
        let longestStreakAvgFreq = 0;
        let longestStreakStart: Date | null = null;
        let longestStreakEnd: Date | null = null;

        // Need at least 1 activity to calculate a streak
        if (activities.length >= 1) {
          // Pre-calculate all activity dates in user timezone as midnight
          const activityMidnights = activities.map((a) => {
            const inUserTz = toZonedTime(a.date, userTimezone);
            return startOfDay(inUserTz);
          });

          // For each possible starting activity, find the longest valid window
          for (let startIdx = 0; startIdx < activities.length; startIdx++) {
            const windowStart = activityMidnights[startIdx];

            // Helper function to calculate interval mean for a window of activities
            const calculateIntervalMean = (startIdx: number, endIdx: number, includeToday: boolean): number => {
              const intervals: number[] = [];

              // Calculate intervals between consecutive activities in the window
              for (let i = startIdx; i < endIdx; i++) {
                const interval = differenceInDays(activityMidnights[i + 1], activityMidnights[i]);
                intervals.push(interval);
              }

              // If including today, add the partial interval from the last activity to today
              if (includeToday) {
                const partialInterval = differenceInDays(midnightToday, activityMidnights[endIdx]);
                intervals.push(partialInterval);
              }

              // Calculate the mean of all intervals
              if (intervals.length === 0) return 0;
              const sum = intervals.reduce((acc, val) => acc + val, 0);
              return sum / intervals.length;
            };

            // Try extending to today first (if this is a current/ongoing streak)
            // Check if we can include all activities from startIdx to end AND extend to today
            const daysToToday = differenceInDays(midnightToday, windowStart);
            const avgFreqToToday = calculateIntervalMean(startIdx, activities.length - 1, true);

            if (avgFreqToToday <= desiredFrequency && daysToToday > 0) {
              // The entire window from this start to today is valid
              if (daysToToday > longestStreak) {
                longestStreak = daysToToday;
                longestStreakStart = activities[startIdx].date;
                longestStreakEnd = nowUtc; // Current time means streak extends to today
                longestStreakAvgFreq = Math.round(avgFreqToToday * 10) / 10;
              }
            } else {
              // Can't extend to today, find the furthest end point that works
              // Use binary search or linear scan to find the longest valid window
              for (let endIdx = activities.length - 1; endIdx >= startIdx; endIdx--) {
                const windowEnd = activityMidnights[endIdx];
                const daysInWindow = differenceInDays(windowEnd, windowStart);

                // Need at least 1 day span to have a meaningful frequency
                if (daysInWindow <= 0) continue;

                const avgFreq = calculateIntervalMean(startIdx, endIdx, false);

                if (avgFreq <= desiredFrequency) {
                  // This window is valid - check if it's the longest
                  if (daysInWindow > longestStreak) {
                    longestStreak = daysInWindow;
                    longestStreakStart = activities[startIdx].date;
                    longestStreakEnd = activities[endIdx].date;
                    longestStreakAvgFreq = Math.round(avgFreq * 10) / 10;
                  }
                  // Found the longest valid window for this start, no need to check shorter ones
                  break;
                }
              }
            }
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
