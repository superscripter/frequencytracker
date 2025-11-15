import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import env from '@fastify/env';
import prismaPlugin from './plugins/prisma.js';
import { authRoutes } from './routes/auth.js';
import { activityRoutes } from './routes/activities.js';
import { activityTypeRoutes } from './routes/activityTypes.js';
import { recommendationsRoutes } from './routes/recommendations.js';
import { analyticsRoutes } from './routes/analytics.js';
import stravaRoutes from './routes/strava.js';
import notificationRoutes from './routes/notifications.js';
import { initializeNotificationScheduler } from './services/notification-scheduler.js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../.env'), override: true });

const schema = {
  type: 'object',
  required: ['DATABASE_URL', 'JWT_SECRET'],
  properties: {
    PORT: {
      type: 'string',
      default: '3001',
    },
    DATABASE_URL: {
      type: 'string',
    },
    JWT_SECRET: {
      type: 'string',
    },
    STRAVA_CLIENT_ID: {
      type: 'string',
    },
    STRAVA_CLIENT_SECRET: {
      type: 'string',
    },
    STRAVA_REDIRECT_URI: {
      type: 'string',
      default: 'http://localhost:3001/api/strava/callback',
    },
    FRONTEND_URL: {
      type: 'string',
      default: 'http://localhost:5173',
    },
  },
};

export async function buildServer() {
  const fastify = Fastify({
    logger: process.env.NODE_ENV === 'production'
      ? true // Simple JSON logging in production
      : {
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        },
  });

  // Register env plugin (dotenv already loaded at top of file)
  await fastify.register(env, {
    schema,
    dotenv: false,
  });

  // Register CORS
  await fastify.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  // Register JWT
  await fastify.register(jwt, {
    secret: fastify.config.JWT_SECRET,
  });

  // Register Prisma
  await fastify.register(prismaPlugin);

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(activityRoutes, { prefix: '/api/activities' });
  await fastify.register(activityTypeRoutes, { prefix: '/api/activity-types' });
  await fastify.register(recommendationsRoutes, { prefix: '/api/recommendations' });
  await fastify.register(analyticsRoutes, { prefix: '/api/analytics' });
  await fastify.register(stravaRoutes, { prefix: '/api/strava' });
  await fastify.register(notificationRoutes, { prefix: '/api/notifications' });

  return fastify;
}

async function start() {
  try {
    const fastify = await buildServer();
    const port = parseInt(fastify.config.PORT || '3001', 10);

    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`Server listening on port ${port}`);

    // Initialize notification scheduler
    initializeNotificationScheduler();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

// Vercel serverless function handler
let serverInstance: any = null;

export default async function handler(req: any, res: any) {
  if (!serverInstance) {
    serverInstance = await buildServer();
    await serverInstance.ready();
  }

  // Use Fastify's serverless adapter
  serverInstance.server.emit('request', req, res);
}

// Only start server if not in test mode and not in Vercel
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  start();
}
