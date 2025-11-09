import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@frequency-tracker/database';

const createActivityTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  desiredFrequency: z.number().min(0),
});

const updateActivityTypeSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  desiredFrequency: z.number().min(0).optional(),
});

export const activityTypeRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all activity types for the authenticated user
  fastify.get('/', async (request, reply) => {
    await request.jwtVerify();

    try {
      const activityTypes = await prisma.activityType.findMany({
        where: { userId: request.user.userId },
        orderBy: { name: 'asc' },
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
        include: {
          _count: {
            select: { activities: true },
          },
        },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Activity type not found' });
      }

      // Check if there are activities using this type
      if (existing._count.activities > 0) {
        return reply.status(400).send({
          error: `Cannot delete activity type with ${existing._count.activities} associated activities`
        });
      }

      await prisma.activityType.delete({
        where: { id },
      });

      return reply.status(204).send();
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
