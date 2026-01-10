import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { differenceInDays, subDays, startOfDay } from 'date-fns';
import { prisma } from '@frequency-tracker/database';
import { getUserOffTimes, filterActivitiesByOffTime, calculateOffTimeDays } from '../utils/offTimeCalculations.js';

interface RecommendationItem {
  activityType: {
    id: string;
    name: string;
    description: string | null;
    desiredFrequency: number;
    icon: string | null;
    tag?: {
      id: string;
      name: string;
      color: string | null;
    } | null;
  };
  lastPerformedDate: string | null;
  daysSinceLastActivity: number | null;
  averageFrequencyLast3: number | null;
  averageFrequencyLast10: number | null;
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  difference: number | null;
  status: 'ahead' | 'due_soon' | 'due_today' | 'overdue' | 'critically_overdue' | 'no_data';
  priorityScore: number;
  currentStreak: number;
  currentStreakStart: string | null;
  firstActivityDate: string | null;
}

export const recommendationsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      if (!request.user) {
        return reply.status(401).send({ error: 'Unauthorized - no user found' });
      }

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

      // Get all activity types for this user with their tags
      const activityTypes = await prisma.activityType.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      }) as Array<{
        id: string;
        userId: string;
        name: string;
        description: string | null;
        desiredFrequency: number;
        tagId: string | null;
        icon: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>;

      // Get all tags for this user
      const allTags = await prisma.$queryRaw<Array<{ id: string; name: string; color: string | null }>>`
        SELECT id, name, color FROM tags WHERE "userId" = ${userId}
      `;

      // Create a map of tag IDs to tag objects for quick lookup
      const tagMap = new Map(allTags.map((tag: { id: string; name: string; color: string | null }) => [tag.id, { id: tag.id, name: tag.name, color: tag.color }]));

      // Get all activities for the user
      const allActivitiesByType = await prisma.activity.findMany({
        where: {
          userId,
        },
        orderBy: {
          date: 'desc',
        },
        include: {
          type: true,
        },
      });

      // Filter out activities that occurred during off-time periods
      const filteredActivities = filterActivitiesByOffTime(allActivitiesByType, offTimes, userTimezone);

      // Group activities by type
      const activitiesByType = new Map<string, typeof filteredActivities>();
      for (const activity of filteredActivities) {
        if (!activitiesByType.has(activity.typeId)) {
          activitiesByType.set(activity.typeId, []);
        }
        activitiesByType.get(activity.typeId)!.push(activity);
      }

      // Calculate recommendations for each activity type
      const recommendations: RecommendationItem[] = activityTypes.map((type) => {
        const typeActivities = activitiesByType.get(type.id) || [];

        // Get the first activity date (oldest activity)
        const firstActivityDate = typeActivities.length > 0
          ? typeActivities[typeActivities.length - 1].date.toISOString()
          : null;

        let daysSinceLastActivity: number | null = null;
        let lastPerformedDate: string | null = null;
        let difference: number | null = null;
        let status: RecommendationItem['status'] = 'no_data';
        let priorityScore = 0;

        // Get the most recent activity for this type
        if (typeActivities.length > 0) {
          const lastActivity = typeActivities[0];
          const lastActivityInUserTz = toZonedTime(lastActivity.date, userTimezone);
          const lastActivityMidnight = startOfDay(lastActivityInUserTz);
          lastPerformedDate = lastActivity.date.toISOString();

          // Calculate days since last activity using UTC-based calendar dates to avoid timezone issues
          // Extract UTC date components from the user-timezone-adjusted dates
          const todayYear = midnightToday.getUTCFullYear();
          const todayMonth = midnightToday.getUTCMonth();
          const todayDay = midnightToday.getUTCDate();

          const lastYear = lastActivityMidnight.getUTCFullYear();
          const lastMonth = lastActivityMidnight.getUTCMonth();
          const lastDay = lastActivityMidnight.getUTCDate();

          // Create UTC Date objects for comparison
          const todayUTC = new Date(Date.UTC(todayYear, todayMonth, todayDay));
          const lastActivityUTC = new Date(Date.UTC(lastYear, lastMonth, lastDay));

          const rawDaysSince = differenceInDays(todayUTC, lastActivityUTC);

          // Subtract off-time days that fall between the last activity and today
          const offTimeDays = calculateOffTimeDays(
            type.id,
            lastActivityMidnight,
            midnightToday,
            offTimes,
            userTimezone
          );

          daysSinceLastActivity = rawDaysSince - offTimeDays;

          // Calculate difference (positive means overdue, negative means ahead)
          difference = daysSinceLastActivity - type.desiredFrequency;

          // Determine status based on difference
          // Positive difference = overdue, negative = ahead of schedule
          if (difference < -2) {
            // Way ahead of schedule
            status = 'ahead';
            priorityScore = difference; // Most negative = lowest priority
          } else if (difference >= -2 && difference < -1) {
            // Ahead but approaching time
            status = 'ahead';
            priorityScore = difference;
          } else if (difference >= -1 && difference < 1) {
            // Within 1 day of target (due today)
            status = 'due_today';
            priorityScore = 100 + difference;
          } else if (difference >= 1 && difference <= 2) {
            // 1-2 days overdue (due soon / tomorrow)
            status = 'due_soon';
            priorityScore = 150 + difference;
          } else if (difference > 2 && difference <= 4) {
            // 2-4 days overdue
            status = 'overdue';
            priorityScore = 200 + difference;
          } else {
            // More than 4 days overdue
            status = 'critically_overdue';
            priorityScore = 300 + difference;
          }
        } else {
          // No activities ever performed
          status = 'no_data';
          priorityScore = -1000; // Send to bottom
        }

        // Helper function to calculate interval mean from N activities
        // Calculates the average number of days between consecutive activities
        // Uses only completed intervals (does NOT include partial interval to today)
        // For Last N Avg, we use up to N intervals (from up to N+1 activities)
        const calculateAverageFrequency = (activities: typeof typeActivities, maxIntervalCount: number): number | null => {
          // We need at least 2 activities to calculate 1 interval
          if (activities.length < 2) {
            return null;
          }

          // Get up to (maxIntervalCount + 1) activities, or all we have if less
          // e.g., for Last 3 Avg: get up to 4 activities to calculate up to 3 intervals
          const activitiesToUse = Math.min(maxIntervalCount + 1, activities.length);
          const recentActivities = activities.slice(0, activitiesToUse);

          // Calculate intervals between consecutive activities
          const intervals: number[] = [];

          for (let i = 0; i < recentActivities.length - 1; i++) {
            const currentActivityInUserTz = toZonedTime(recentActivities[i].date, userTimezone);
            const currentActivityMidnight = startOfDay(currentActivityInUserTz);

            const nextActivityInUserTz = toZonedTime(recentActivities[i + 1].date, userTimezone);
            const nextActivityMidnight = startOfDay(nextActivityInUserTz);

            const rawInterval = differenceInDays(currentActivityMidnight, nextActivityMidnight);

            // Calculate off-time days for this interval
            const offTimeDaysInInterval = calculateOffTimeDays(
              type.id,
              nextActivityMidnight,
              currentActivityMidnight,
              offTimes,
              userTimezone
            );

            const interval = rawInterval - offTimeDaysInInterval;
            intervals.push(interval);
          }

          // Calculate the mean of all intervals
          const sum = intervals.reduce((acc, val) => acc + val, 0);
          const average = sum / intervals.length;

          // Round to 1 decimal place
          return Math.round(average * 10) / 10;
        };

        // Calculate Last 3 and Last 10 averages
        const averageFrequencyLast3 = calculateAverageFrequency(typeActivities, 3);
        const averageFrequencyLast10 = calculateAverageFrequency(typeActivities, 10);

        // Determine trend by comparing Last 3 to Last 10
        let trend: RecommendationItem['trend'] = 'insufficient_data';
        if (averageFrequencyLast3 !== null && averageFrequencyLast10 !== null) {
          const difference = Math.abs(averageFrequencyLast3 - averageFrequencyLast10);
          // Consider values within 0.5 days as stable
          if (difference < 0.5) {
            trend = 'stable';
          } else if (averageFrequencyLast3 < averageFrequencyLast10) {
            // Smaller average = doing it more frequently = improving
            trend = 'improving';
          } else {
            // Larger average = doing it less frequently = declining
            trend = 'declining';
          }
        } else if (averageFrequencyLast3 !== null || averageFrequencyLast10 !== null) {
          // If we have at least one average, consider it stable
          trend = 'stable';
        }

        // Calculate current streak using same logic as analytics
        // The end must be the most recent activity (not today)
        // The start can be any earlier activity where the average interval <= desired frequency
        // It's possible there won't be a valid streak to show
        let currentStreak = 0;
        let currentStreakStart: Date | null = null;
        if (typeActivities.length >= 2) {
          // Activities are already in descending order (most recent first)
          // We need them in ascending order for calculations, so reverse
          const activitiesAsc = [...typeActivities].reverse();

          const activityMidnights = activitiesAsc.map((a) => {
            const inUserTz = toZonedTime(a.date, userTimezone);
            return startOfDay(inUserTz);
          });

          // The end must be the most recent activity (last in ascending array)
          const endIdx = activitiesAsc.length - 1;
          const windowEnd = activityMidnights[endIdx];

          // Try each possible starting activity (must be before the end)
          for (let startIdx = 0; startIdx < endIdx; startIdx++) {
            const windowStart = activityMidnights[startIdx];
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
              if (avgFreq <= type.desiredFrequency && daysInWindow > currentStreak) {
                currentStreak = daysInWindow;
                currentStreakStart = activitiesAsc[startIdx].date;
              }
            }
          }
        }

        return {
          activityType: {
            id: type.id,
            name: type.name,
            description: type.description,
            desiredFrequency: type.desiredFrequency,
            icon: type.icon,
            tag: type.tagId ? tagMap.get(type.tagId) || null : null,
          },
          lastPerformedDate,
          daysSinceLastActivity,
          averageFrequencyLast3,
          averageFrequencyLast10,
          trend,
          difference,
          status,
          priorityScore,
          currentStreak,
          currentStreakStart: currentStreakStart ? currentStreakStart.toISOString() : null,
          firstActivityDate,
        };
      });

      // Sort by priority score (highest first, which are most overdue)
      recommendations.sort((a, b) => b.priorityScore - a.priorityScore);

      return reply.send({ recommendations });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
