import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@frequency-tracker/database';

const createOffTimeSchema = z.object({
  tagId: z.string().min(1),
  startDate: z.string().datetime(), // ISO 8601 date string
  endDate: z.string().datetime(),   // ISO 8601 date string
});

const updateOffTimeSchema = z.object({
  tagId: z.string().min(1).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const offTimeRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all off times for the authenticated user
  fastify.get('/', async (request, reply) => {
    await request.jwtVerify();

    try {
      const offTimes = await prisma.offTime.findMany({
        where: { userId: request.user.userId },
        orderBy: { startDate: 'desc' },
        include: {
          tag: true,
        },
      });
      return reply.send(offTimes);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get off time by ID
  fastify.get('/:id', async (request, reply) => {
    await request.jwtVerify();

    try {
      const { id } = request.params as { id: string };

      const offTime = await prisma.offTime.findFirst({
        where: {
          id,
          userId: request.user.userId,
        },
        include: {
          tag: true,
        },
      });

      if (!offTime) {
        return reply.status(404).send({ error: 'Off time not found' });
      }

      return reply.send(offTime);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Create off time
  fastify.post('/', async (request, reply) => {
    await request.jwtVerify();

    try {
      const body = createOffTimeSchema.parse(request.body);

      // Validate dates
      const startDate = new Date(body.startDate);
      const endDate = new Date(body.endDate);

      if (endDate < startDate) {
        return reply.status(400).send({ error: 'End date must be on or after start date' });
      }

      // Verify tag exists and belongs to user
      const tag = await prisma.tag.findFirst({
        where: {
          id: body.tagId,
          userId: request.user.userId,
        },
      });

      if (!tag) {
        return reply.status(400).send({ error: 'Tag not found' });
      }

      const offTime = await prisma.offTime.create({
        data: {
          userId: request.user.userId,
          tagId: body.tagId,
          startDate,
          endDate,
        },
        include: {
          tag: true,
        },
      });

      return reply.status(201).send(offTime);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Update off time
  fastify.put('/:id', async (request, reply) => {
    await request.jwtVerify();

    try {
      const { id } = request.params as { id: string };
      const body = updateOffTimeSchema.parse(request.body);

      // Check if off time exists and belongs to user
      const existing = await prisma.offTime.findFirst({
        where: {
          id,
          userId: request.user.userId,
        },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Off time not found' });
      }

      // Build update data
      const updateData: any = {};

      if (body.tagId) {
        // Verify tag exists and belongs to user
        const tag = await prisma.tag.findFirst({
          where: {
            id: body.tagId,
            userId: request.user.userId,
          },
        });

        if (!tag) {
          return reply.status(400).send({ error: 'Tag not found' });
        }

        updateData.tagId = body.tagId;
      }

      if (body.startDate) {
        updateData.startDate = new Date(body.startDate);
      }

      if (body.endDate) {
        updateData.endDate = new Date(body.endDate);
      }

      // Validate dates if both are being updated or one is being updated
      const finalStartDate = updateData.startDate || existing.startDate;
      const finalEndDate = updateData.endDate || existing.endDate;

      if (finalEndDate < finalStartDate) {
        return reply.status(400).send({ error: 'End date must be on or after start date' });
      }

      const offTime = await prisma.offTime.update({
        where: { id },
        data: updateData,
        include: {
          tag: true,
        },
      });

      return reply.send(offTime);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Delete off time
  fastify.delete('/:id', async (request, reply) => {
    await request.jwtVerify();

    try {
      const { id } = request.params as { id: string };

      // Check if off time exists and belongs to user
      const existing = await prisma.offTime.findFirst({
        where: {
          id,
          userId: request.user.userId,
        },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Off time not found' });
      }

      await prisma.offTime.delete({
        where: { id },
      });

      return reply.status(204).send();
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
