import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { differenceInDays, subDays, startOfDay } from 'date-fns';
import { prisma } from '@frequency-tracker/database';

interface RecommendationItem {
  activityType: {
    id: string;
    name: string;
    description: string | null;
    desiredFrequency: number;
  };
  lastPerformedDate: string | null;
  daysSinceLastActivity: number | null;
  averageFrequencyLast3: number | null;
  averageFrequencyLast10: number | null;
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  difference: number | null;
  status: 'ahead' | 'due_soon' | 'due_today' | 'overdue' | 'critically_overdue' | 'no_data';
  priorityScore: number;
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

      // Get all activity types for this user
      const activityTypes = await prisma.activityType.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      });

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

      // Group activities by type
      const activitiesByType = new Map<string, typeof allActivitiesByType>();
      for (const activity of allActivitiesByType) {
        if (!activitiesByType.has(activity.typeId)) {
          activitiesByType.set(activity.typeId, []);
        }
        activitiesByType.get(activity.typeId)!.push(activity);
      }

      // Calculate recommendations for each activity type
      const recommendations: RecommendationItem[] = activityTypes.map((type) => {
        const typeActivities = activitiesByType.get(type.id) || [];

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

          // Calculate days since last activity using calendar days (midnight-to-midnight)
          // This ensures "1 day ago" means "yesterday" regardless of the time of day
          daysSinceLastActivity = differenceInDays(midnightToday, lastActivityMidnight);

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
        // Includes the partial interval from the last activity to today
        const calculateAverageFrequency = (activities: typeof typeActivities, maxCount: number): number | null => {
          if (activities.length < 1) {
            return null;
          }

          // Determine how many activities to use (up to maxCount, but at least what we have)
          const countToUse = Math.min(maxCount, activities.length);

          // Get the most recent N activities
          const recentActivities = activities.slice(0, countToUse);

          // Calculate intervals between consecutive activities
          const intervals: number[] = [];

          for (let i = 0; i < recentActivities.length - 1; i++) {
            const currentActivityInUserTz = toZonedTime(recentActivities[i].date, userTimezone);
            const currentActivityMidnight = startOfDay(currentActivityInUserTz);

            const nextActivityInUserTz = toZonedTime(recentActivities[i + 1].date, userTimezone);
            const nextActivityMidnight = startOfDay(nextActivityInUserTz);

            const interval = differenceInDays(currentActivityMidnight, nextActivityMidnight);
            intervals.push(interval);
          }

          // Add the partial interval from the most recent activity to today
          const lastActivityInUserTz = toZonedTime(recentActivities[0].date, userTimezone);
          const lastActivityMidnight = startOfDay(lastActivityInUserTz);
          const partialInterval = differenceInDays(midnightToday, lastActivityMidnight);
          intervals.push(partialInterval);

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

        return {
          activityType: {
            id: type.id,
            name: type.name,
            description: type.description,
            desiredFrequency: type.desiredFrequency,
          },
          lastPerformedDate,
          daysSinceLastActivity,
          averageFrequencyLast3,
          averageFrequencyLast10,
          trend,
          difference,
          status,
          priorityScore,
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
