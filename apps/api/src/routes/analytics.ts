import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@frequency-tracker/database';
import { toZonedTime } from 'date-fns-tz';
import { differenceInDays, startOfDay } from 'date-fns';
import { getUserOffTimes, filterActivitiesByOffTime, calculateOffTimeDays } from '../utils/offTimeCalculations.js';

interface AnalyticsData {
  activityType: string;
  icon: string | null;
  desiredFrequency: number;
  totalAvgFrequency: number;
  dateOfFirstActivity: string | null;
  numberOfActivities: number;
  tag: {
    id: string;
    name: string;
    color: string | null;
  } | null;
}

interface StreakData {
  activityType: string;
  icon: string | null;
  longestStreak: number;
  averageFrequency: number;
  streakStart: string | null;
  streakEnd: string | null;
  tag: {
    id: string;
    name: string;
    color: string | null;
  } | null;
}

interface CurrentStreakData {
  activityType: string;
  icon: string | null;
  currentStreak: number;
  averageFrequency: number;
  streakStart: string | null;
  lastActivity: string | null;
  tag: {
    id: string;
    name: string;
    color: string | null;
  } | null;
}

interface PerfectStreakData {
  activityType: string;
  icon: string | null;
  perfectStreak: number;
  averageFrequency: number;
  streakStart: string | null;
  lastActivity: string | null;
  tag: {
    id: string;
    name: string;
    color: string | null;
  } | null;
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
          tag: true,
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

              const rawInterval = differenceInDays(nextActivityMidnight, currentActivityMidnight);

              // Calculate off-time days for this interval
              const offTimeDaysInInterval = calculateOffTimeDays(
                type.id,
                currentActivityMidnight,
                nextActivityMidnight,
                offTimes,
                userTimezone
              );

              const interval = rawInterval - offTimeDaysInInterval;
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
          icon: type.icon,
          desiredFrequency: type.desiredFrequency,
          totalAvgFrequency,
          dateOfFirstActivity,
          numberOfActivities,
          tag: type.tag ? { id: type.tag.id, name: type.tag.name, color: type.tag.color } : null,
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
              const rawDaysInWindow = differenceInDays(windowEnd, windowStart);

              // Calculate off-time days for the entire window
              const offTimeDaysInWindow = calculateOffTimeDays(
                type.id,
                windowStart,
                windowEnd,
                offTimes,
                userTimezone
              );

              const daysInWindow = rawDaysInWindow - offTimeDaysInWindow;

              // Calculate intervals between consecutive activities in this window
              const intervals: number[] = [];
              for (let i = startIdx; i < endIdx; i++) {
                const rawInterval = differenceInDays(activityMidnights[i + 1], activityMidnights[i]);

                // Calculate off-time days for this interval
                const offTimeDaysInInterval = calculateOffTimeDays(
                  type.id,
                  activityMidnights[i],
                  activityMidnights[i + 1],
                  offTimes,
                  userTimezone
                );

                const interval = rawInterval - offTimeDaysInInterval;
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
          icon: type.icon,
          longestStreak,
          averageFrequency: longestStreakAvgFreq,
          streakStart: longestStreakStart ? longestStreakStart.toISOString() : null,
          streakEnd: longestStreakEnd ? longestStreakEnd.toISOString() : null,
          tag: type.tag ? { id: type.tag.id, name: type.tag.name, color: type.tag.color } : null,
        };
      });

      // Calculate current streaks for each activity type
      // A current streak is an active streak (last activity was recent enough)
      // that spans at least 3 intervals (3 * desired frequency)
      const currentStreaks: CurrentStreakData[] = activityTypes
        .map((type) => {
          const activities = filterActivitiesByOffTime(type.activities, offTimes, userTimezone);
          const desiredFrequency = type.desiredFrequency;

          if (activities.length < 2) {
            return null;
          }

          // Get last activity
          const lastActivity = activities[activities.length - 1];
          const lastActivityInUserTz = toZonedTime(lastActivity.date, userTimezone);
          const lastActivityMidnight = startOfDay(lastActivityInUserTz);
          const daysSinceLastActivity = differenceInDays(midnightToday, lastActivityMidnight);

          // Check if last activity was recent enough
          if (daysSinceLastActivity > desiredFrequency) {
            return null;
          }

          // Find the longest continuous streak ending at the last activity
          const activityMidnights = activities.map((a) => {
            const inUserTz = toZonedTime(a.date, userTimezone);
            return startOfDay(inUserTz);
          });

          let currentStreakStart: Date | null = null;
          let currentStreakDays = 0;
          let currentStreakAvgFreq = 0;

          // Try each possible starting activity and find the longest valid window ending at last activity
          const endIdx = activities.length - 1;
          for (let startIdx = 0; startIdx <= endIdx - 1; startIdx++) {
            const windowStart = activityMidnights[startIdx];
            const windowEnd = activityMidnights[endIdx];
            const rawDaysInWindow = differenceInDays(windowEnd, windowStart);

            const offTimeDaysInWindow = calculateOffTimeDays(
              type.id,
              windowStart,
              windowEnd,
              offTimes,
              userTimezone
            );

            const daysInWindow = rawDaysInWindow - offTimeDaysInWindow;

            // Calculate intervals between consecutive activities in this window
            const intervals: number[] = [];
            for (let i = startIdx; i < endIdx; i++) {
              const rawInterval = differenceInDays(activityMidnights[i + 1], activityMidnights[i]);
              const offTimeDaysInInterval = calculateOffTimeDays(
                type.id,
                activityMidnights[i],
                activityMidnights[i + 1],
                offTimes,
                userTimezone
              );
              const interval = rawInterval - offTimeDaysInInterval;
              intervals.push(interval);
            }

            if (intervals.length > 0) {
              const sum = intervals.reduce((acc, val) => acc + val, 0);
              const avgFreq = sum / intervals.length;

              // Check if this window meets the desired frequency
              if (avgFreq <= desiredFrequency && daysInWindow > currentStreakDays) {
                currentStreakDays = daysInWindow;
                currentStreakStart = activities[startIdx].date;
                currentStreakAvgFreq = Math.round(avgFreq * 10) / 10;
              }
            }
          }

          // Only return if streak is at least 3 intervals
          const minStreakDays = desiredFrequency * 3;
          if (currentStreakDays >= minStreakDays) {
            return {
              activityType: type.name,
              icon: type.icon,
              currentStreak: currentStreakDays,
              averageFrequency: currentStreakAvgFreq,
              streakStart: currentStreakStart ? currentStreakStart.toISOString() : null,
              lastActivity: lastActivity.date.toISOString(),
              tag: type.tag ? { id: type.tag.id, name: type.tag.name, color: type.tag.color } : null,
            };
          }

          return null;
        })
        .filter((item): item is CurrentStreakData => item !== null);

      // Calculate perfect streaks (streaks that go back to first activity)
      // These are current streaks where the streak start matches the first activity date
      const perfectStreaks: PerfectStreakData[] = activityTypes
        .map((type) => {
          const activities = filterActivitiesByOffTime(type.activities, offTimes, userTimezone);
          const desiredFrequency = type.desiredFrequency;

          if (activities.length < 2) {
            return null;
          }

          // Get first and last activity
          const firstActivity = activities[0];
          const lastActivity = activities[activities.length - 1];
          const lastActivityInUserTz = toZonedTime(lastActivity.date, userTimezone);
          const lastActivityMidnight = startOfDay(lastActivityInUserTz);
          const daysSinceLastActivity = differenceInDays(midnightToday, lastActivityMidnight);

          // Check if last activity was recent enough
          if (daysSinceLastActivity > desiredFrequency) {
            return null;
          }

          // Calculate streak from first to last activity
          const activityMidnights = activities.map((a) => {
            const inUserTz = toZonedTime(a.date, userTimezone);
            return startOfDay(inUserTz);
          });

          const windowStart = activityMidnights[0];
          const windowEnd = activityMidnights[activities.length - 1];
          const rawDaysInWindow = differenceInDays(windowEnd, windowStart);

          const offTimeDaysInWindow = calculateOffTimeDays(
            type.id,
            windowStart,
            windowEnd,
            offTimes,
            userTimezone
          );

          const daysInWindow = rawDaysInWindow - offTimeDaysInWindow;

          // Calculate intervals between consecutive activities
          const intervals: number[] = [];
          for (let i = 0; i < activities.length - 1; i++) {
            const rawInterval = differenceInDays(activityMidnights[i + 1], activityMidnights[i]);
            const offTimeDaysInInterval = calculateOffTimeDays(
              type.id,
              activityMidnights[i],
              activityMidnights[i + 1],
              offTimes,
              userTimezone
            );
            const interval = rawInterval - offTimeDaysInInterval;
            intervals.push(interval);
          }

          if (intervals.length > 0) {
            const sum = intervals.reduce((acc, val) => acc + val, 0);
            const avgFreq = sum / intervals.length;

            // Check if this is a perfect streak (meets desired frequency for entire history)
            const minStreakDays = desiredFrequency * 3;
            if (avgFreq <= desiredFrequency && daysInWindow >= minStreakDays) {
              return {
                activityType: type.name,
                icon: type.icon,
                perfectStreak: daysInWindow,
                averageFrequency: Math.round(avgFreq * 10) / 10,
                streakStart: firstActivity.date.toISOString(),
                lastActivity: lastActivity.date.toISOString(),
                tag: type.tag ? { id: type.tag.id, name: type.tag.name, color: type.tag.color } : null,
              };
            }
          }

          return null;
        })
        .filter((item): item is PerfectStreakData => item !== null);

      return reply.send({ analytics, streaks, currentStreaks, perfectStreaks });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
