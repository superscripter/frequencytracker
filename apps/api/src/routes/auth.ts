import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '@frequency-tracker/database';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register
  fastify.post('/register', async (request, reply) => {
    try {
      const body = registerSchema.parse(request.body);

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (existingUser) {
        return reply.status(400).send({ error: 'User already exists' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(body.password, 10);

      // Create user
      const user = await prisma.user.create({
        data: {
          email: body.email,
          password: hashedPassword,
          name: body.name,
        },
        select: {
          id: true,
          email: true,
          name: true,
          timezone: true,
          createdAt: true,
        },
      });

      // Generate JWT
      const token = fastify.jwt.sign({ userId: user.id });

      return reply.send({ user, token });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Login
  fastify.post('/login', async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body);

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (!user) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      // Verify password
      const validPassword = await bcrypt.compare(body.password, user.password);

      if (!validPassword) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      // Generate JWT
      const token = fastify.jwt.sign({ userId: user.id });

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          timezone: user.timezone,
          createdAt: user.createdAt,
        },
        token,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get current user
  fastify.get('/me', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { userId } = request.user as { userId: string };

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          timezone: true,
          createdAt: true,
          stravaId: true,
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({ user });
    } catch (error) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  // Update user profile
  fastify.patch('/profile', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { userId } = request.user as { userId: string };

      const body = request.body as { timezone?: string; name?: string };

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(body.timezone && { timezone: body.timezone }),
          ...(body.name && { name: body.name }),
        },
        select: {
          id: true,
          email: true,
          name: true,
          timezone: true,
          createdAt: true,
          stravaId: true,
        },
      });

      return reply.send({ user });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to update profile' });
    }
  });
};
