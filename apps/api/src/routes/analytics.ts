import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@frequency-tracker/database';
import { toZonedTime } from 'date-fns-tz';
import { differenceInDays, startOfDay } from 'date-fns';
import { getUserOffTimes, filterActivitiesByOffTime } from '../utils/offTimeCalculations.js';

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

      // Get off-times for this user to exclude from calculations
      const offTimes = await getUserOffTimes(userId);

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
        // Filter out activities that occurred during off-time periods
        const activities = filterActivitiesByOffTime(type.activities, offTimes, userTimezone);
        const numberOfActivities = activities.length;

        let totalAvgFrequency = 0;
        let dateOfFirstActivity: string | null = null;

        if (numberOfActivities > 0) {
          dateOfFirstActivity = activities[0].date.toISOString();

          // Calculate total avg frequency as average interval between activities
          // Only considers the period from first to last activity (does not include time after last activity)
          if (numberOfActivities >= 2) {
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
      // A streak is the longest period between two activity dates where the average interval <= desired frequency
      // The start and end dates must be actual activity dates (not today)
      // Days since the most recent activity are NOT included in the calculation
      const streaks: StreakData[] = activityTypes.map((type) => {
        // Filter out activities that occurred during off-time periods
        const activities = filterActivitiesByOffTime(type.activities, offTimes, userTimezone);
        const desiredFrequency = type.desiredFrequency;

        let longestStreak = 0;
        let longestStreakAvgFreq = 0;
        let longestStreakStart: Date | null = null;
        let longestStreakEnd: Date | null = null;

        // Need at least 2 activities to calculate a meaningful streak with intervals
        if (activities.length >= 2) {
          // Pre-calculate all activity dates in user timezone as midnight
          const activityMidnights = activities.map((a) => {
            const inUserTz = toZonedTime(a.date, userTimezone);
            return startOfDay(inUserTz);
          });

          // For each possible starting activity, find the longest valid window ending at an activity
          for (let startIdx = 0; startIdx < activities.length; startIdx++) {
            const windowStart = activityMidnights[startIdx];

            // Try each possible ending activity (must be after start)
            for (let endIdx = startIdx + 1; endIdx < activities.length; endIdx++) {
              const windowEnd = activityMidnights[endIdx];
              const daysInWindow = differenceInDays(windowEnd, windowStart);

              // Calculate intervals between consecutive activities in this window
              const intervals: number[] = [];
              for (let i = startIdx; i < endIdx; i++) {
                const interval = differenceInDays(activityMidnights[i + 1], activityMidnights[i]);
                intervals.push(interval);
              }

              // Calculate the mean of all intervals
              if (intervals.length > 0) {
                const sum = intervals.reduce((acc, val) => acc + val, 0);
                const avgFreq = sum / intervals.length;

                // Check if this window meets the desired frequency
                if (avgFreq <= desiredFrequency && daysInWindow > longestStreak) {
                  longestStreak = daysInWindow;
                  longestStreakStart = activities[startIdx].date;
                  longestStreakEnd = activities[endIdx].date;
                  longestStreakAvgFreq = Math.round(avgFreq * 10) / 10;
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
