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
          const absDifference = Math.abs(difference);

          // Determine status based on absolute difference
          // Use absolute value so activities ahead of or behind schedule are treated the same
          if (absDifference < 1) {
            status = 'due_today';
            priorityScore = 100 + difference; // Medium priority
          } else if (absDifference >= 1 && absDifference < 2) {
            status = 'due_soon';
            priorityScore = difference;
          } else if (absDifference >= 2) {
            if (difference > 0) {
              // Overdue
              if (absDifference <= 3) {
                status = 'overdue';
                priorityScore = 200 + difference;
              } else {
                status = 'critically_overdue';
                priorityScore = 300 + difference;
              }
            } else {
              // Ahead of schedule
              status = 'ahead';
              priorityScore = difference; // Most negative = lowest priority
            }
          }
        } else {
          // No activities ever performed
          status = 'no_data';
          priorityScore = -1000; // Send to bottom
        }

        // Helper function to calculate average frequency from N activities
        const calculateAverageFrequency = (activities: typeof typeActivities, maxCount: number): number | null => {
          if (activities.length < 2) {
            return null;
          }

          // Take up to maxCount most recent activities
          const activitiesToUse = activities.slice(0, Math.min(maxCount, activities.length));

          if (activitiesToUse.length < 2) {
            return null;
          }

          // Calculate intervals between consecutive activities
          const intervals: number[] = [];
          for (let i = 0; i < activitiesToUse.length - 1; i++) {
            const current = toZonedTime(activitiesToUse[i].date, userTimezone);
            const currentMidnight = startOfDay(current);
            const next = toZonedTime(activitiesToUse[i + 1].date, userTimezone);
            const nextMidnight = startOfDay(next);
            const interval = differenceInDays(currentMidnight, nextMidnight);
            intervals.push(interval);
          }

          if (intervals.length === 0) {
            return null;
          }

          const average = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
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
