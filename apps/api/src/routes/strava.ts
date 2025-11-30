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

      const clientId = fastify.config.STRAVA_CLIENT_ID || process.env.STRAVA_CLIENT_ID;
      const redirectUri = fastify.config.STRAVA_REDIRECT_URI || process.env.STRAVA_REDIRECT_URI;

      // DEBUG: Log environment variables
      fastify.log.info({
        clientId: clientId ? `${clientId.substring(0, 6)}...` : 'NOT_SET',
        redirectUri: redirectUri || 'NOT_SET',
        requestHost: request.headers.host,
        requestProtocol: request.protocol,
      }, 'Strava OAuth authorize request');

      if (!clientId || !redirectUri) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return reply.redirect(
          `${frontendUrl}/profile?strava_error=${encodeURIComponent('Strava OAuth is not configured on the server')}`
        );
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

      fastify.log.info({
        authUrl: authUrl.toString(),
        redirectUri: redirectUri,
      }, 'Redirecting to Strava OAuth');

      return reply.redirect(authUrl.toString());
    } catch (error) {
      fastify.log.error(error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return reply.redirect(
        `${frontendUrl}/profile?strava_error=${encodeURIComponent('Authentication failed - please try again')}`
      );
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

  // GET /api/strava/config - Check Strava configuration (for debugging)
  fastify.get('/config', async (request, reply) => {
    const clientId = fastify.config.STRAVA_CLIENT_ID || process.env.STRAVA_CLIENT_ID;
    const redirectUri = fastify.config.STRAVA_REDIRECT_URI || process.env.STRAVA_REDIRECT_URI;

    return reply.send({
      configured: !!(clientId && redirectUri),
      clientId: clientId ? `${clientId.substring(0, 6)}...` : null,
      redirectUri: redirectUri || null,
      message: !clientId || !redirectUri
        ? 'Strava OAuth is not fully configured. Missing: ' +
          (!clientId ? 'STRAVA_CLIENT_ID ' : '') +
          (!redirectUri ? 'STRAVA_REDIRECT_URI' : '')
        : 'Strava OAuth is configured',
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
