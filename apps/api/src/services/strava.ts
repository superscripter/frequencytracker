import { prisma } from '@frequency-tracker/database';

interface StravaTokenResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete: {
    id: number;
    username: string | null;
    firstname: string;
    lastname: string;
  };
}

interface StravaRefreshResponse {
  token_type: string;
  access_token: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
}

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  timezone: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
}

/**
 * Exchange OAuth authorization code for access and refresh tokens
 */
export async function exchangeCodeForToken(code: string): Promise<StravaTokenResponse> {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for token: ${error}`);
  }

  return response.json() as Promise<StravaTokenResponse>;
}

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<StravaRefreshResponse> {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh access token: ${error}`);
  }

  return response.json() as Promise<StravaRefreshResponse>;
}

/**
 * Get a valid access token for a user, refreshing if necessary
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      stravaAccessToken: true,
      stravaRefreshToken: true,
      stravaTokenExpiry: true,
    },
  });

  if (!user?.stravaAccessToken || !user?.stravaRefreshToken) {
    throw new Error('User has not linked their Strava account');
  }

  // Check if token is expired (with 5 minute buffer)
  const now = new Date();
  const expiryWithBuffer = user.stravaTokenExpiry
    ? new Date(user.stravaTokenExpiry.getTime() - 5 * 60 * 1000)
    : now;

  if (expiryWithBuffer <= now) {
    // Token is expired or about to expire, refresh it
    const tokenData = await refreshAccessToken(user.stravaRefreshToken);

    // Update user with new tokens
    await prisma.user.update({
      where: { id: userId },
      data: {
        stravaAccessToken: tokenData.access_token,
        stravaRefreshToken: tokenData.refresh_token,
        stravaTokenExpiry: new Date(tokenData.expires_at * 1000),
      },
    });

    return tokenData.access_token;
  }

  return user.stravaAccessToken;
}

/**
 * Disconnect a user's Strava account
 */
export async function disconnectStravaAccount(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      stravaId: null,
      stravaAccessToken: null,
      stravaRefreshToken: null,
      stravaTokenExpiry: null,
    },
  });
}

/**
 * Save Strava tokens to the database after OAuth
 */
export async function saveStravaTokens(
  userId: string,
  tokenData: StravaTokenResponse
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      stravaId: tokenData.athlete.id.toString(),
      stravaAccessToken: tokenData.access_token,
      stravaRefreshToken: tokenData.refresh_token,
      stravaTokenExpiry: new Date(tokenData.expires_at * 1000),
    },
  });
}

/**
 * Fetch activities from Strava API
 */
export async function fetchStravaActivities(
  accessToken: string,
  after: number,
  perPage: number = 200
): Promise<StravaActivity[]> {
  const url = new URL('https://www.strava.com/api/v3/athlete/activities');
  url.searchParams.set('after', after.toString());
  url.searchParams.set('per_page', perPage.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Strava activities: ${error}`);
  }

  return response.json() as Promise<StravaActivity[]>;
}

/**
 * Map Strava activity type to potential activity type names
 * Returns an array of possible matches to check against user's activity types
 */
function getPossibleActivityTypeNames(stravaType: string, sportType: string): string[] {
  // Map common Strava types to our activity type names
  const typeMap: Record<string, string[]> = {
    'Run': ['Run', 'Running'],
    'Ride': ['Bike', 'Ride', 'Cycling', 'Biking'],
    'VirtualRide': ['Bike', 'Ride', 'Cycling', 'Biking', 'Virtual Ride'],
    'Swim': ['Swim', 'Swimming'],
    'Walk': ['Walk', 'Walking'],
    'Hike': ['Hike', 'Hiking'],
    'WeightTraining': ['Strength Training', 'Weight Training', 'Weights', 'Lifting'],
    'Workout': ['Workout', 'Training'],
    'Yoga': ['Yoga'],
    'Pilates': ['Pilates'],
    'Crossfit': ['CrossFit', 'Crossfit'],
    'RockClimbing': ['Climbing', 'Rock Climbing'],
    'IceSkate': ['Ice Skating', 'Skating'],
    'InlineSkate': ['Inline Skating', 'Skating', 'Rollerblading'],
    'AlpineSki': ['Skiing', 'Alpine Skiing', 'Ski'],
    'BackcountrySki': ['Skiing', 'Backcountry Skiing', 'Ski'],
    'NordicSki': ['Cross Country Skiing', 'Nordic Skiing', 'XC Skiing'],
    'Snowboard': ['Snowboarding', 'Snowboard'],
    'Rowing': ['Rowing', 'Row'],
    'Elliptical': ['Elliptical'],
    'StairStepper': ['Stair Stepper', 'Stairs'],
  };

  // Try sport_type first, then fall back to type
  const possibilities = typeMap[sportType] || typeMap[stravaType] || [stravaType, sportType];

  // Remove duplicates and return
  return [...new Set(possibilities)];
}

/**
 * Check if activity name matches any user-defined sync rules
 * Returns the activity type if a rule matches (case-insensitive)
 */
async function checkSyncRules(
  userId: string,
  activityName: string
): Promise<{ id: string; name: string } | null> {
  // Fetch user's sync rules
  const rules = await prisma.stravaSyncRule.findMany({
    where: { userId },
    include: {
      activityType: {
        select: { id: true, name: true },
      },
    },
  });

  // Check each rule (case-insensitive)
  for (const rule of rules) {
    if (activityName.toLowerCase().includes(rule.containsText.toLowerCase())) {
      return rule.activityType;
    }
  }

  return null;
}

/**
 * Find matching activity type for a Strava activity
 * Returns the user's activity type if a match is found (case-insensitive)
 */
async function findMatchingActivityType(
  userId: string,
  stravaType: string,
  sportType: string
): Promise<{ id: string; name: string } | null> {
  const possibleNames = getPossibleActivityTypeNames(stravaType, sportType);

  // Get all user's activity types
  const userActivityTypes = await prisma.activityType.findMany({
    where: { userId },
    select: { id: true, name: true },
  });

  // Try to find a match (case-insensitive)
  for (const possibleName of possibleNames) {
    const match = userActivityTypes.find(
      (type) => type.name.toLowerCase() === possibleName.toLowerCase()
    );
    if (match) {
      return match;
    }
  }

  return null;
}

/**
 * Sync Strava activities to database
 */
export async function syncStravaActivities(
  userId: string,
  afterDate: Date
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const accessToken = await getValidAccessToken(userId);

  // Convert date to Unix timestamp (seconds)
  const after = Math.floor(afterDate.getTime() / 1000);

  // Fetch activities from Strava
  const stravaActivities = await fetchStravaActivities(accessToken, after);

  const result = {
    imported: 0,
    skipped: 0,
    errors: [] as string[],
  };

  for (const stravaActivity of stravaActivities) {
    try {
      // Check if activity already exists
      const existing = await prisma.activity.findFirst({
        where: {
          userId,
          stravaId: stravaActivity.id.toString(),
        },
      });

      if (existing) {
        result.skipped++;
        continue;
      }

      // First, check if activity name matches any user-defined sync rules
      let matchingActivityType = await checkSyncRules(userId, stravaActivity.name);

      // If no rule matched, try the default type matching
      if (!matchingActivityType) {
        matchingActivityType = await findMatchingActivityType(
          userId,
          stravaActivity.type,
          stravaActivity.sport_type
        );
      }

      if (!matchingActivityType) {
        // No matching activity type found - skip this activity
        result.skipped++;
        continue;
      }

      // Create the activity with the matched type
      await prisma.activity.create({
        data: {
          userId,
          typeId: matchingActivityType.id,
          name: stravaActivity.name,
          date: new Date(stravaActivity.start_date),
          stravaId: stravaActivity.id.toString(),
          isFromStrava: true,
        },
      });

      result.imported++;
    } catch (error) {
      result.errors.push(
        `Failed to import activity ${stravaActivity.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  return result;
}
