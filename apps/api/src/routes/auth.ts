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
        return reply.status(400).send({ message: 'An account with this email already exists' });
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
          autoSync: true,
          enableDailyNotifications: true,
          notificationTime: true,
          stravaId: true,
          subscriptionTier: true,
          subscriptionStatus: true,
          subscriptionEndDate: true,
          createdAt: true,
        },
      });

      // Generate JWT
      const token = fastify.jwt.sign({ userId: user.id });

      return reply.send({ user, token });
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Format Zod errors into user-friendly messages
        const messages = error.errors.map((err) => {
          if (err.path[0] === 'email') {
            return 'Please enter a valid email address';
          }
          if (err.path[0] === 'password') {
            if (err.code === 'too_small') {
              return 'Password must be at least 8 characters';
            }
            return 'Please enter a valid password';
          }
          return err.message;
        });
        return reply.status(400).send({ message: messages[0], errors: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ message: 'An unexpected error occurred. Please try again.' });
    }
  });

  // Login
  fastify.post('/login', async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body);

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: body.email },
        select: {
          id: true,
          email: true,
          name: true,
          password: true,
          timezone: true,
          autoSync: true,
          enableDailyNotifications: true,
          notificationTime: true,
          stravaId: true,
          subscriptionTier: true,
          subscriptionStatus: true,
          subscriptionEndDate: true,
          createdAt: true,
        },
      });

      if (!user) {
        return reply.status(401).send({ message: 'Invalid email or password' });
      }

      // Verify password
      const validPassword = await bcrypt.compare(body.password, user.password);

      if (!validPassword) {
        return reply.status(401).send({ message: 'Invalid email or password' });
      }

      // Generate JWT
      const token = fastify.jwt.sign({ userId: user.id });

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          timezone: user.timezone,
          autoSync: user.autoSync,
          enableDailyNotifications: user.enableDailyNotifications,
          notificationTime: user.notificationTime,
          stravaId: user.stravaId,
          subscriptionTier: user.subscriptionTier,
          subscriptionStatus: user.subscriptionStatus,
          subscriptionEndDate: user.subscriptionEndDate,
          createdAt: user.createdAt,
        },
        token,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map((err) => {
          if (err.path[0] === 'email') {
            return 'Please enter a valid email address';
          }
          if (err.path[0] === 'password') {
            return 'Please enter your password';
          }
          return err.message;
        });
        return reply.status(400).send({ message: messages[0], errors: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ message: 'An unexpected error occurred. Please try again.' });
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
          autoSync: true,
          enableDailyNotifications: true,
          notificationTime: true,
          subscriptionTier: true,
          subscriptionStatus: true,
          subscriptionEndDate: true,
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

      const body = request.body as {
        timezone?: string;
        name?: string;
        autoSync?: boolean;
        enableDailyNotifications?: boolean;
        notificationTime?: string;
      };

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(body.timezone && { timezone: body.timezone }),
          ...(body.name && { name: body.name }),
          ...(body.autoSync !== undefined && { autoSync: body.autoSync }),
          ...(body.enableDailyNotifications !== undefined && { enableDailyNotifications: body.enableDailyNotifications }),
          ...(body.notificationTime && { notificationTime: body.notificationTime }),
        },
        select: {
          id: true,
          email: true,
          name: true,
          timezone: true,
          autoSync: true,
          enableDailyNotifications: true,
          notificationTime: true,
          subscriptionTier: true,
          subscriptionStatus: true,
          subscriptionEndDate: true,
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
