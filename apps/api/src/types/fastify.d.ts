import 'fastify';
import { PrismaClient } from '@frequency-tracker/database';

declare module 'fastify' {
  interface FastifyInstance {
    config: {
      DATABASE_URL: string;
      JWT_SECRET: string;
      PORT: string;
      FRONTEND_URL: string;
      STRAVA_CLIENT_ID?: string;
      STRAVA_CLIENT_SECRET?: string;
      STRAVA_REDIRECT_URI?: string;
    };
    prisma: PrismaClient;
  }

  interface FastifyRequest {
    user?: {
      userId: string;
    };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string };
    user: { userId: string };
  }
}
