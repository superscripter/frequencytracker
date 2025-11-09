import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { differenceInDays, subDays } from 'date-fns';
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
  averageFrequency30Days: number | null;
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

      // Calculate date range for 30 days ago in user's timezone
      const nowUtc = new Date();
      const nowInUserTz = toZonedTime(nowUtc, userTimezone);
      const thirtyDaysAgo = subDays(nowInUserTz, 30);
      const thirtyDaysAgoUtc = fromZonedTime(thirtyDaysAgo, userTimezone);

      // Get all activity types for this user
      const activityTypes = await prisma.activityType.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      });

      // Get all activities for the user in the last 30 days
      const recentActivities = await prisma.activity.findMany({
        where: {
          userId,
          date: {
            gte: thirtyDaysAgoUtc,
          },
        },
        include: {
          type: true,
        },
        orderBy: {
          date: 'desc',
        },
      });

      // Get the most recent activity for each type (might be older than 30 days)
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

      const recentActivitiesByType = new Map<string, typeof recentActivities>();
      for (const activity of recentActivities) {
        if (!recentActivitiesByType.has(activity.typeId)) {
          recentActivitiesByType.set(activity.typeId, []);
        }
        recentActivitiesByType.get(activity.typeId)!.push(activity);
      }

      // Calculate recommendations for each activity type
      const recommendations: RecommendationItem[] = activityTypes.map((type) => {
        const typeActivities = activitiesByType.get(type.id) || [];
        const recentTypeActivities = recentActivitiesByType.get(type.id) || [];

        let daysSinceLastActivity: number | null = null;
        let lastPerformedDate: string | null = null;
        let difference: number | null = null;
        let status: RecommendationItem['status'] = 'no_data';
        let priorityScore = 0;

        // Get the most recent activity for this type
        if (typeActivities.length > 0) {
          const lastActivity = typeActivities[0];
          const lastActivityInUserTz = toZonedTime(lastActivity.date, userTimezone);
          lastPerformedDate = lastActivity.date.toISOString();

          // Calculate days since last activity
          daysSinceLastActivity = differenceInDays(nowInUserTz, lastActivityInUserTz);

          // Calculate difference (positive means overdue, negative means ahead)
          difference = daysSinceLastActivity - type.desiredFrequency;

          // Determine status based on difference
          if (difference < -2) {
            status = 'ahead';
            priorityScore = difference; // Most negative = lowest priority
          } else if (difference >= -2 && difference < -1) {
            status = 'due_soon';
            priorityScore = difference;
          } else if (difference >= -1 && difference <= 1) {
            status = 'due_today';
            priorityScore = 100 + difference; // Medium priority
          } else if (difference > 1 && difference <= 2) {
            status = 'overdue';
            priorityScore = 200 + difference; // High priority
          } else {
            status = 'critically_overdue';
            priorityScore = 300 + difference; // Highest priority
          }
        } else {
          // No activities ever performed
          status = 'no_data';
          priorityScore = -1000; // Send to bottom
        }

        // Calculate 30-day average frequency
        let averageFrequency30Days: number | null = null;
        if (recentTypeActivities.length >= 2) {
          // Calculate average days between activities
          const intervals: number[] = [];
          for (let i = 0; i < recentTypeActivities.length - 1; i++) {
            const current = toZonedTime(recentTypeActivities[i].date, userTimezone);
            const next = toZonedTime(recentTypeActivities[i + 1].date, userTimezone);
            const interval = differenceInDays(current, next);
            intervals.push(interval);
          }

          if (intervals.length > 0) {
            averageFrequency30Days = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
            // Round to 1 decimal place
            averageFrequency30Days = Math.round(averageFrequency30Days * 10) / 10;
          }
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
          averageFrequency30Days,
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
