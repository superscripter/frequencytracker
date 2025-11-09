import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  exchangeCodeForToken,
  saveStravaTokens,
  disconnectStravaAccount,
  syncStravaActivities,
} from '../services/strava.js';

const stravaRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/strava/authorize - Initiate OAuth flow
  fastify.get('/authorize', async (request, reply) => {
    const querySchema = z.object({
      token: z.string(),
    });

    try {
      const query = querySchema.parse(request.query);

      // Verify the token from query parameter
      const decoded = fastify.jwt.verify(query.token) as { userId: string };

      // DEBUG: Log environment variables
      fastify.log.info({
        fastifyConfigKeys: Object.keys(fastify.config),
        stravaClientId: {
          fromFastifyConfig: fastify.config.STRAVA_CLIENT_ID,
          fromProcessEnv: process.env.STRAVA_CLIENT_ID,
        },
        stravaRedirectUri: {
          fromFastifyConfig: fastify.config.STRAVA_REDIRECT_URI,
          fromProcessEnv: process.env.STRAVA_REDIRECT_URI,
        }
      }, 'DEBUG: Strava environment variables');

      const clientId = fastify.config.STRAVA_CLIENT_ID || process.env.STRAVA_CLIENT_ID;
      const redirectUri = fastify.config.STRAVA_REDIRECT_URI || process.env.STRAVA_REDIRECT_URI;

      if (!clientId || !redirectUri) {
        return reply.code(500).send({
          error: 'Strava OAuth is not configured',
        });
      }

      // Store user ID in state parameter for OAuth callback
      const state = decoded.userId;

      const authUrl = new URL('https://www.strava.com/oauth/authorize');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('approval_prompt', 'auto');
      authUrl.searchParams.set('scope', 'activity:read_all,activity:write');
      authUrl.searchParams.set('state', state);

      return reply.redirect(authUrl.toString());
    } catch (error) {
      fastify.log.error(error);
      return reply.code(401).send({
        error: 'Invalid token',
      });
    }
  });

  // GET /api/strava/callback - Handle OAuth callback
  fastify.get('/callback', async (request, reply) => {
    const querySchema = z.object({
      code: z.string(),
      state: z.string(), // This is the user ID we passed
      scope: z.string().optional(),
      error: z.string().optional(),
    });

    try {
      const query = querySchema.parse(request.query);

      // Check for OAuth errors
      if (query.error) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return reply.redirect(
          `${frontendUrl}/profile?strava_error=${encodeURIComponent(query.error)}`
        );
      }

      const userId = query.state;

      // Exchange code for tokens
      const tokenData = await exchangeCodeForToken(query.code);

      // Save tokens to database
      await saveStravaTokens(userId, tokenData);

      // Redirect to profile page with success message
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return reply.redirect(`${frontendUrl}/profile?strava_connected=true`);
    } catch (error) {
      fastify.log.error(error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return reply.redirect(
        `${frontendUrl}/profile?strava_error=${encodeURIComponent('Failed to connect Strava account')}`
      );
    }
  });

  // POST /api/strava/disconnect - Disconnect Strava account
  fastify.post('/disconnect', async (request, reply) => {
    await request.jwtVerify();

    try {
      await disconnectStravaAccount(request.user.userId);

      return reply.send({
        message: 'Strava account disconnected successfully',
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to disconnect Strava account',
      });
    }
  });

  // GET /api/strava/status - Check connection status
  fastify.get('/status', async (request, reply) => {
    await request.jwtVerify();

    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: {
        stravaId: true,
      },
    });

    return reply.send({
      connected: !!user?.stravaId,
      stravaId: user?.stravaId,
    });
  });

  // POST /api/strava/sync - Sync activities from Strava
  fastify.post('/sync', async (request, reply) => {
    await request.jwtVerify();

    const bodySchema = z.object({
      afterDate: z.string(), // ISO date string
    });

    try {
      const body = bodySchema.parse(request.body);
      const afterDate = new Date(body.afterDate);

      if (isNaN(afterDate.getTime())) {
        return reply.code(400).send({
          error: 'Invalid date format',
        });
      }

      const result = await syncStravaActivities(request.user.userId, afterDate);

      return reply.send({
        message: 'Sync completed',
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
      });
    } catch (error) {
      fastify.log.error(error);

      if (error instanceof Error) {
        if (error.message.includes('has not linked their Strava account')) {
          return reply.code(400).send({
            error: 'Strava account not connected',
          });
        }
      }

      return reply.code(500).send({
        error: 'Failed to sync Strava activities',
      });
    }
  });
};

export default stravaRoutes;
