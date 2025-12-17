import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@frequency-tracker/database';
import { isDateInOffTime, getUserOffTimes } from '../utils/offTimeCalculations.js';

const createActivitySchema = z.object({
  typeId: z.string(),
  name: z.string(),
  date: z.string().datetime(),
  duration: z.number().optional(),
  distance: z.number().optional(),
  notes: z.string().optional(),
});

export const activityRoutes: FastifyPluginAsync = async (fastify) => {
  // Authenticate all routes
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  // Get all activities for user
  fastify.get('/', async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { typeId, page, limit } = request.query as {
      typeId?: string;
      page?: string;
      limit?: string;
    };

    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const skip = (pageNum - 1) * limitNum;

    const where = {
      userId,
      ...(typeId && typeId !== 'all' ? { typeId } : {}),
    };

    // Get total count for pagination
    const totalCount = await prisma.activity.count({ where });

    const activities = await prisma.activity.findMany({
      where,
      include: {
        type: true,
      },
      orderBy: {
        date: 'desc',
      },
      skip,
      take: limitNum,
    });

    return reply.send({
      activities,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  });

  // Get single activity
  fastify.get('/:id', async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const activity = await prisma.activity.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        type: true,
      },
    });

    if (!activity) {
      return reply.status(404).send({ error: 'Activity not found' });
    }

    return reply.send({ activity });
  });

  // Create activity
  fastify.post('/', async (request, reply) => {
    try {
      const { userId } = request.user as { userId: string };
      const body = createActivitySchema.parse(request.body);

      // Get user to check timezone
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const userTimezone = user.timezone || 'America/New_York';
      const activityDate = new Date(body.date);

      // Check if this activity falls within an off-time period
      const offTimes = await getUserOffTimes(userId);
      const isInOffTime = isDateInOffTime(body.typeId, activityDate, offTimes, userTimezone);

      if (isInOffTime) {
        return reply.status(400).send({
          error: 'Activity cannot be created during an off-time period for this activity type',
          isOffTime: true
        });
      }

      const activity = await prisma.activity.create({
        data: {
          userId,
          typeId: body.typeId,
          name: body.name,
          date: activityDate,
          duration: body.duration,
          distance: body.distance,
          notes: body.notes,
        },
        include: {
          type: true,
        },
      });

      return reply.status(201).send({ activity });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Update activity
  fastify.put('/:id', async (request, reply) => {
    try {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };
      const body = createActivitySchema.partial().parse(request.body);

      // Check ownership
      const existingActivity = await prisma.activity.findFirst({
        where: { id, userId },
      });

      if (!existingActivity) {
        return reply.status(404).send({ error: 'Activity not found' });
      }

      // Get user to check timezone
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const userTimezone = user.timezone || 'America/New_York';

      // Determine the final typeId and date after the update
      const finalTypeId = body.typeId || existingActivity.typeId;
      const finalDate = body.date ? new Date(body.date) : existingActivity.date;

      // Check if the updated activity falls within an off-time period
      const offTimes = await getUserOffTimes(userId);
      const isInOffTime = isDateInOffTime(finalTypeId, finalDate, offTimes, userTimezone);

      if (isInOffTime) {
        return reply.status(400).send({
          error: 'Activity cannot be updated to fall during an off-time period for this activity type',
          isOffTime: true
        });
      }

      const activity = await prisma.activity.update({
        where: { id },
        data: {
          ...(body.typeId && { typeId: body.typeId }),
          ...(body.name && { name: body.name }),
          ...(body.date && { date: new Date(body.date) }),
          ...(body.duration !== undefined && { duration: body.duration }),
          ...(body.distance !== undefined && { distance: body.distance }),
          ...(body.notes !== undefined && { notes: body.notes }),
        },
        include: {
          type: true,
        },
      });

      return reply.send({ activity });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Delete activity
  fastify.delete('/:id', async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    // Check ownership
    const existingActivity = await prisma.activity.findFirst({
      where: { id, userId },
    });

    if (!existingActivity) {
      return reply.status(404).send({ error: 'Activity not found' });
    }

    await prisma.activity.delete({
      where: { id },
    });

    return reply.status(204).send();
  });
};
