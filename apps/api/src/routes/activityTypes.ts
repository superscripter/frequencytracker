import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@frequency-tracker/database';
import { toZonedTime } from 'date-fns-tz';
import { differenceInDays, startOfDay } from 'date-fns';
import { getUserOffTimes, filterActivitiesByOffTime, calculateOffTimeDays } from '../utils/offTimeCalculations.js';
import { canCreateActivityType } from '../utils/subscriptionHelpers.js';

const createActivityTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  desiredFrequency: z.number().min(0),
  tagId: z.string().optional().nullable(),
  icon: z.string().optional().default('Run').refine(
    (icon) => icon !== 'Flame',
    { message: 'The Flame icon is reserved for streaks and cannot be used for activity types' }
  ),
});

const updateActivityTypeSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  desiredFrequency: z.number().min(0).optional(),
  tagId: z.string().optional().nullable(),
  icon: z.string().optional().refine(
    (icon) => !icon || icon !== 'Flame',
    { message: 'The Flame icon is reserved for streaks and cannot be used for activity types' }
  ),
});

export const activityTypeRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all activity types for the authenticated user
  fastify.get('/', async (request, reply) => {
    await request.jwtVerify();

    try {
      const activityTypes = await prisma.activityType.findMany({
        where: { userId: request.user.userId },
        orderBy: { name: 'asc' },
        include: {
          tag: true,
        },
      });
      return reply.send(activityTypes);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get activity type by ID
  fastify.get('/:id', async (request, reply) => {
    await request.jwtVerify();

    try {
      const { id } = request.params as { id: string };

      const activityType = await prisma.activityType.findFirst({
        where: {
          id,
          userId: request.user.userId,
        },
        include: {
          _count: {
            select: { activities: true },
          },
        },
      });

      if (!activityType) {
        return reply.status(404).send({ error: 'Activity type not found' });
      }

      return reply.send(activityType);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Create activity type
  fastify.post('/', async (request, reply) => {
    await request.jwtVerify();

    try {
      const body = createActivityTypeSchema.parse(request.body);

      // Check subscription limits
      const canCreate = await canCreateActivityType(request.user.userId);
      if (!canCreate.allowed) {
        return reply.status(403).send({
          error: canCreate.reason,
          code: 'SUBSCRIPTION_LIMIT_REACHED',
        });
      }

      // Check if activity type with this name already exists for this user
      const existing = await prisma.activityType.findFirst({
        where: {
          userId: request.user.userId,
          name: body.name,
        },
      });

      if (existing) {
        return reply.status(400).send({ error: 'Activity type with this name already exists' });
      }

      const activityType = await prisma.activityType.create({
        data: {
          userId: request.user.userId,
          name: body.name,
          description: body.description,
          desiredFrequency: body.desiredFrequency,
          tagId: body.tagId,
          icon: body.icon || 'Run',
        },
        include: {
          tag: true,
        },
      });

      return reply.status(201).send(activityType);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Update activity type
  fastify.put('/:id', async (request, reply) => {
    await request.jwtVerify();

    try {
      const { id } = request.params as { id: string };
      const body = updateActivityTypeSchema.parse(request.body);

      // Check if activity type exists and belongs to user
      const existing = await prisma.activityType.findFirst({
        where: {
          id,
          userId: request.user.userId,
        },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Activity type not found' });
      }

      // If updating name, check for duplicates
      if (body.name && body.name !== existing.name) {
        const duplicate = await prisma.activityType.findFirst({
          where: {
            userId: request.user.userId,
            name: body.name,
          },
        });

        if (duplicate) {
          return reply.status(400).send({ error: 'Activity type with this name already exists' });
        }
      }

      const activityType = await prisma.activityType.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description,
          desiredFrequency: body.desiredFrequency,
          tagId: body.tagId,
          icon: body.icon,
        },
        include: {
          tag: true,
        },
      });

      return reply.send(activityType);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Delete activity type
  fastify.delete('/:id', async (request, reply) => {
    await request.jwtVerify();

    try {
      const { id } = request.params as { id: string };

      // Check if activity type exists and belongs to user
      const existing = await prisma.activityType.findFirst({
        where: {
          id,
          userId: request.user.userId,
        },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Activity type not found' });
      }

      // Delete all associated activities first, then delete the activity type
      await prisma.activity.deleteMany({
        where: {
          typeId: id,
          userId: request.user.userId,
        },
      });

      await prisma.activityType.delete({
        where: { id },
      });

      return reply.status(204).send();
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get breakdown data for an activity type
  fastify.get('/:id/breakdown', async (request, reply) => {
    await request.jwtVerify();

    try {
      const { id } = request.params as { id: string };
      const { userId } = request.user as { userId: string };

      // Get user to access timezone
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const userTimezone = user.timezone || 'America/New_York';

      // Get activity type
      const activityType = await prisma.activityType.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!activityType) {
        return reply.status(404).send({ error: 'Activity type not found' });
      }

      // Calculate midnight today in user's timezone
      const nowUtc = new Date();
      const nowInUserTz = toZonedTime(nowUtc, userTimezone);
      const midnightToday = startOfDay(nowInUserTz);

      // Get off-times for this user
      const offTimes = await getUserOffTimes(userId);

      // Get all activities for this type
      const allActivities = await prisma.activity.findMany({
        where: {
          userId,
          typeId: id,
        },
        orderBy: {
          date: 'desc',
        },
      });

      // Filter out activities that occurred during off-time periods
      const typeActivities = filterActivitiesByOffTime(allActivities, offTimes, userTimezone);

      // Get the last activity date if it exists (for filtering off-times)
      const lastActivityDate = typeActivities.length > 0 ? typeActivities[0].date : null;

      // Get off-time periods that apply to this activity type and are after the last activity
      const relevantOffTimes = offTimes.filter(offTime => {
        // Check if this off-time applies to the activity type (via tag)
        const appliesToType = offTime.tag.activityTypes.some(type => type.id === id);
        if (!appliesToType) return false;

        // If there's a last activity, only include off-times that end on or after the last activity date
        if (lastActivityDate) {
          // Extract calendar date from last activity
          const lastActivityInUserTz = toZonedTime(lastActivityDate, userTimezone);
          const lastActivityMidnight = startOfDay(lastActivityInUserTz);
          const lastActivityYear = lastActivityMidnight.getUTCFullYear();
          const lastActivityMonth = lastActivityMidnight.getUTCMonth();
          const lastActivityDay = lastActivityMidnight.getUTCDate();
          const lastActivityCalendarDate = new Date(Date.UTC(lastActivityYear, lastActivityMonth, lastActivityDay));

          // Extract calendar date from off-time end date
          const offEndYear = offTime.endDate.getUTCFullYear();
          const offEndMonth = offTime.endDate.getUTCMonth();
          const offEndDay = offTime.endDate.getUTCDate();
          const offEndCalendarDate = new Date(Date.UTC(offEndYear, offEndMonth, offEndDay));

          // Only include if off-time ends on or after the last activity
          return offEndCalendarDate >= lastActivityCalendarDate;
        }

        return true;
      });

      let lastPerformedDate: string | null = null;
      let daysSinceLastActivity: number | null = null;
      let daysUntilNext: number | null = null;

      if (typeActivities.length > 0) {
        const lastActivity = typeActivities[0];
        const lastActivityInUserTz = toZonedTime(lastActivity.date, userTimezone);
        const lastActivityMidnight = startOfDay(lastActivityInUserTz);
        lastPerformedDate = lastActivity.date.toISOString();

        // Calculate days since last activity using UTC-based calendar dates
        const todayYear = midnightToday.getUTCFullYear();
        const todayMonth = midnightToday.getUTCMonth();
        const todayDay = midnightToday.getUTCDate();

        const lastYear = lastActivityMidnight.getUTCFullYear();
        const lastMonth = lastActivityMidnight.getUTCMonth();
        const lastDay = lastActivityMidnight.getUTCDate();

        const todayUTC = new Date(Date.UTC(todayYear, todayMonth, todayDay));
        const lastActivityUTC = new Date(Date.UTC(lastYear, lastMonth, lastDay));

        const rawDaysSince = differenceInDays(todayUTC, lastActivityUTC);

        // Subtract off-time days
        const offTimeDays = calculateOffTimeDays(
          id,
          lastActivityMidnight,
          midnightToday,
          offTimes,
          userTimezone
        );

        daysSinceLastActivity = rawDaysSince - offTimeDays;

        // Calculate days until next (can be negative if overdue)
        daysUntilNext = activityType.desiredFrequency - daysSinceLastActivity;
      }

      // Calculate averages with detailed breakdown
      const calculateAverageFrequencyDetailed = (activities: typeof typeActivities, maxIntervalCount: number) => {
        if (activities.length < 2) {
          return { average: null, intervals: [] };
        }

        const activitiesToUse = Math.min(maxIntervalCount + 1, activities.length);
        const recentActivities = activities.slice(0, activitiesToUse);

        const intervals: Array<{
          startDate: string;
          endDate: string;
          rawDays: number;
          offTimeDays: number;
          totalDays: number;
          offTimePeriods: Array<{ tagName: string; startDate: string; endDate: string; daysInInterval: number }>;
        }> = [];

        for (let i = 0; i < recentActivities.length - 1; i++) {
          const currentActivityInUserTz = toZonedTime(recentActivities[i].date, userTimezone);
          const currentActivityMidnight = startOfDay(currentActivityInUserTz);

          const nextActivityInUserTz = toZonedTime(recentActivities[i + 1].date, userTimezone);
          const nextActivityMidnight = startOfDay(nextActivityInUserTz);

          const rawInterval = differenceInDays(currentActivityMidnight, nextActivityMidnight);

          // Calculate off-time days for this interval
          const offTimeDaysInInterval = calculateOffTimeDays(
            id,
            nextActivityMidnight,
            currentActivityMidnight,
            offTimes,
            userTimezone
          );

          // Get off-time periods that overlap with this interval
          const currentYear = currentActivityMidnight.getUTCFullYear();
          const currentMonth = currentActivityMidnight.getUTCMonth();
          const currentDay = currentActivityMidnight.getUTCDate();
          const currentDate = new Date(Date.UTC(currentYear, currentMonth, currentDay));

          const nextYear = nextActivityMidnight.getUTCFullYear();
          const nextMonth = nextActivityMidnight.getUTCMonth();
          const nextDay = nextActivityMidnight.getUTCDate();
          const nextDate = new Date(Date.UTC(nextYear, nextMonth, nextDay));

          const overlappingOffTimes: Array<{ tagName: string; startDate: string; endDate: string; daysInInterval: number }> = [];

          for (const offTime of offTimes) {
            const appliesToType = offTime.tag.activityTypes.some(type => type.id === id);
            if (!appliesToType) continue;

            const offStartYear = offTime.startDate.getUTCFullYear();
            const offStartMonth = offTime.startDate.getUTCMonth();
            const offStartDay = offTime.startDate.getUTCDate();
            const offStart = new Date(Date.UTC(offStartYear, offStartMonth, offStartDay));

            const offEndYear = offTime.endDate.getUTCFullYear();
            const offEndMonth = offTime.endDate.getUTCMonth();
            const offEndDay = offTime.endDate.getUTCDate();
            const offEnd = new Date(Date.UTC(offEndYear, offEndMonth, offEndDay));

            // Check for overlap
            const overlapStart = nextDate > offStart ? nextDate : offStart;
            const overlapEnd = currentDate < offEnd ? currentDate : offEnd;

            if (overlapStart <= overlapEnd) {
              const daysInOverlap = differenceInDays(overlapEnd, overlapStart) + 1;
              overlappingOffTimes.push({
                tagName: offTime.tag.name,
                startDate: offTime.startDate.toISOString(),
                endDate: offTime.endDate.toISOString(),
                daysInInterval: daysInOverlap
              });
            }
          }

          intervals.push({
            startDate: recentActivities[i].date.toISOString(),
            endDate: recentActivities[i + 1].date.toISOString(),
            rawDays: rawInterval,
            offTimeDays: offTimeDaysInInterval,
            totalDays: rawInterval - offTimeDaysInInterval,
            offTimePeriods: overlappingOffTimes
          });
        }

        const sum = intervals.reduce((acc, val) => acc + val.totalDays, 0);
        const average = sum / intervals.length;

        return {
          average: Math.round(average * 10) / 10,
          intervals
        };
      };

      const last3Details = calculateAverageFrequencyDetailed(typeActivities, 3);
      const last10Details = calculateAverageFrequencyDetailed(typeActivities, 10);

      // Calculate current streak
      let currentStreak = 0;
      if (typeActivities.length >= 2) {
        const activitiesAsc = [...typeActivities].reverse();

        const activityMidnights = activitiesAsc.map((a) => {
          const inUserTz = toZonedTime(a.date, userTimezone);
          return startOfDay(inUserTz);
        });

        const endIdx = activitiesAsc.length - 1;
        const windowEnd = activityMidnights[endIdx];

        for (let startIdx = 0; startIdx < endIdx; startIdx++) {
          const windowStart = activityMidnights[startIdx];
          const rawDaysInWindow = differenceInDays(windowEnd, windowStart);

          // Calculate off-time days for the entire window
          const offTimeDaysInWindow = calculateOffTimeDays(
            id,
            windowStart,
            windowEnd,
            offTimes,
            userTimezone
          );

          const daysInWindow = rawDaysInWindow - offTimeDaysInWindow;

          const intervals: number[] = [];
          for (let i = startIdx; i < endIdx; i++) {
            const rawInterval = differenceInDays(activityMidnights[i + 1], activityMidnights[i]);

            // Calculate off-time days for this interval
            const offTimeDaysInInterval = calculateOffTimeDays(
              id,
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
            // Round to 1 decimal place for comparison (consistent with analytics display)
            const roundedAvgFreq = Math.round(avgFreq * 10) / 10;

            if (roundedAvgFreq <= activityType.desiredFrequency && daysInWindow > currentStreak) {
              currentStreak = daysInWindow;
            }
          }
        }
      }

      const breakdown = {
        activityType: {
          id: activityType.id,
          name: activityType.name,
          desiredFrequency: activityType.desiredFrequency,
        },
        lastPerformedDate,
        daysSinceLastActivity,
        desiredFrequency: activityType.desiredFrequency,
        offTimePeriods: relevantOffTimes,
        daysUntilNext,
        averageFrequencyLast3: last3Details.average,
        last3Intervals: last3Details.intervals,
        averageFrequencyLast10: last10Details.average,
        last10Intervals: last10Details.intervals,
        currentStreak,
      };

      return reply.send({ breakdown });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
