import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@frequency-tracker/database';

const createTagSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional().nullable(),
});

const updateTagSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional().nullable(),
});

export const tagRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all tags for the authenticated user
  fastify.get('/', async (request, reply) => {
    await request.jwtVerify();

    try {
      const tags = await prisma.tag.findMany({
        where: { userId: request.user.userId },
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { activityTypes: true },
          },
        },
      });
      return reply.send(tags);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get tag by ID
  fastify.get('/:id', async (request, reply) => {
    await request.jwtVerify();

    try {
      const { id } = request.params as { id: string };

      const tag = await prisma.tag.findFirst({
        where: {
          id,
          userId: request.user.userId,
        },
        include: {
          _count: {
            select: { activityTypes: true },
          },
        },
      });

      if (!tag) {
        return reply.status(404).send({ error: 'Tag not found' });
      }

      return reply.send(tag);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Create tag
  fastify.post('/', async (request, reply) => {
    await request.jwtVerify();

    try {
      const body = createTagSchema.parse(request.body);

      // Check if tag with this name already exists for this user
      const existing = await prisma.tag.findFirst({
        where: {
          userId: request.user.userId,
          name: body.name,
        },
      });

      if (existing) {
        return reply.status(400).send({ error: 'Tag with this name already exists' });
      }

      const tag = await prisma.tag.create({
        data: {
          userId: request.user.userId,
          name: body.name,
          color: body.color,
        },
      });

      return reply.status(201).send(tag);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Update tag
  fastify.put('/:id', async (request, reply) => {
    await request.jwtVerify();

    try {
      const { id } = request.params as { id: string };
      const body = updateTagSchema.parse(request.body);

      // Check if tag exists and belongs to user
      const existing = await prisma.tag.findFirst({
        where: {
          id,
          userId: request.user.userId,
        },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Tag not found' });
      }

      // If updating name, check for duplicates
      if (body.name && body.name !== existing.name) {
        const duplicate = await prisma.tag.findFirst({
          where: {
            userId: request.user.userId,
            name: body.name,
          },
        });

        if (duplicate) {
          return reply.status(400).send({ error: 'Tag with this name already exists' });
        }
      }

      const tag = await prisma.tag.update({
        where: { id },
        data: {
          name: body.name,
          color: body.color,
        },
      });

      return reply.send(tag);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Delete tag
  fastify.delete('/:id', async (request, reply) => {
    await request.jwtVerify();

    try {
      const { id } = request.params as { id: string };

      // Check if tag exists and belongs to user
      const existing = await prisma.tag.findFirst({
        where: {
          id,
          userId: request.user.userId,
        },
        include: {
          _count: {
            select: { activityTypes: true },
          },
        },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Tag not found' });
      }

      // Allow deletion even if activity types are using this tag
      // The tag field will be set to null due to onDelete: SetNull
      await prisma.tag.delete({
        where: { id },
      });

      return reply.status(204).send();
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
