/**
 * Season Review Email Script
 *
 * Usage:
 *   # Test — send to a specific user by email:
 *   npx tsx src/scripts/sendSeasonReview.ts --user=user@example.com [--season=winter] [--year=2025]
 *
 *   # Send to all eligible users (who had activity in the season):
 *   npx tsx src/scripts/sendSeasonReview.ts --all [--season=winter] [--year=2025]
 *
 * If --season and --year are omitted, defaults to the just-completed season.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), 'apps/api/.env') });
config({ path: resolve(process.cwd(), '../../.env') });

import { prisma } from '@frequency-tracker/database';
import { toZonedTime } from 'date-fns-tz';
import { differenceInDays, startOfDay, format } from 'date-fns';
import { sendEmail } from '../services/email.js';
import { calculateOffTimeDays, getUserOffTimes } from '../utils/offTimeCalculations.js';
import type { Season } from '../utils/seasonHelpers.js';

// ─── Activity icon → emoji mapping ───────────────────────────────────────────
// Email clients (Gmail, Outlook) strip inline SVG, so we map Tabler icon names
// to Unicode emoji which render universally.

const ICON_EMOJI: Record<string, string> = {
  // Common activity icons (Tabler PascalCase name → emoji)
  Run: '🏃', Bike: '🚴', Swim: '🏊', Walk: '🚶', Hike: '🥾',
  Yoga: '🧘', Gymnastics: '🤸', Stretching: '🙆', Stretching2: '🙆',
  Barbell: '🏋️', Dumbbell: '💪', Trophy: '🏆', Medal: '🏅',
  Ball: '⚽', Basketball: '🏀', Tennis: '🎾', Golf: '⛳',
  Swim2: '🏊', Kayak: '🛶', Ski: '⛷️', Snowboard: '🏂',
  Book: '📚', Pencil: '✏️', Palette: '🎨', Music: '🎵',
  Guitar: '🎸', Piano: '🎹', Headphones: '🎧',
  Heart: '❤️', Heartbeat: '💓', Activity: '📊',
  Users: '👥', User: '👤', Friends: '👫',
  Hammer: '🔨', Wrench: '🔧', Tools: '🛠️', Drill: '🔩',
  Camera: '📷', Video: '🎥', Microphone: '🎤',
  Plane: '✈️', Car: '🚗', Mountain: '⛰️',
  Dog: '🐕', Cat: '🐈', Fish: '🐟',
  Leaf: '🌿', Sun: '☀️', Moon: '🌙', Star: '⭐',
  Coffee: '☕', Apple: '🍎', Salad: '🥗',
  Brain: '🧠', Eye: '👁️', Ear: '👂',
  Clock: '🕐', Calendar: '📅', Target: '🎯',
  ChartBar: '📊', ChartLine: '📈', Flame: '🔥',
};

/**
 * Returns an emoji for the given Tabler icon name, or null if no mapping exists.
 */
function renderIconSvg(iconName: string | null, _size = 20, _color = '#374151'): string | null {
  if (!iconName) return null;
  const emoji = ICON_EMOJI[iconName];
  if (!emoji) return null;
  return `<span style="font-size:15px;line-height:1;">${emoji}</span>`;
}

// ─── Season date helpers ──────────────────────────────────────────────────────

interface SeasonInfo {
  season: Season;
  label: string;
  start: Date;     // UTC midnight, inclusive
  end: Date;       // UTC midnight, inclusive
  totalDays: number;
}

function utcMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function getSeasonInfo(season: Season, year: number): SeasonInfo {
  let start: Date;
  let end: Date;
  let label: string;

  switch (season) {
    case 'winter': {
      start = utcMidnight(year, 12, 1);
      const nextYear = year + 1;
      const isLeap = (nextYear % 4 === 0 && nextYear % 100 !== 0) || nextYear % 400 === 0;
      end = utcMidnight(nextYear, 2, isLeap ? 29 : 28);
      label = `Winter ${year}–${nextYear}`;
      break;
    }
    case 'spring':
      start = utcMidnight(year, 3, 1);
      end   = utcMidnight(year, 5, 31);
      label = `Spring ${year}`;
      break;
    case 'summer':
      start = utcMidnight(year, 6, 1);
      end   = utcMidnight(year, 8, 31);
      label = `Summer ${year}`;
      break;
    case 'fall':
      start = utcMidnight(year, 9, 1);
      end   = utcMidnight(year, 11, 30);
      label = `Fall ${year}`;
      break;
  }

  const totalDays = differenceInDays(end, start) + 1;
  return { season, label, start, end, totalDays };
}

function getPreviousSeasonInfo(now: Date): SeasonInfo {
  const month = now.getUTCMonth() + 1;
  const year  = now.getUTCFullYear();

  if (month === 3)  return getSeasonInfo('winter', year - 1);
  if (month === 6)  return getSeasonInfo('spring', year);
  if (month === 9)  return getSeasonInfo('summer', year);
  if (month === 12) return getSeasonInfo('fall',   year);

  if (month <= 2)   return getSeasonInfo('fall',   year - 1);
  if (month <= 5)   return getSeasonInfo('winter', year - 1);
  if (month <= 8)   return getSeasonInfo('spring', year);
  return getSeasonInfo('summer', year);
}

// ─── Review data builder ──────────────────────────────────────────────────────

interface ActivityTypeReview {
  name: string;
  icon: string | null;
  firstDate: string | null;
  lastDate: string | null;
  totalActivities: number;
  offTimeDays: number;
  trackedDays: number;
  seasonDays: number;
  coverageDays: number;
  coveragePct: number;
  desiredFrequency: number;       // seasonal desired freq for this type
  avgFrequency: number | null;    // avg days between activities (off-time adjusted)
  bestStreak: number;             // longest streak in days within the season
  fullNetSpan: number;            // net span from first to last activity (same units as bestStreak)
}

type Recommendation = {
  name: string;
  icon: string | null;
  type: 'increase' | 'focus';
  desiredFrequency: number;
  avgFrequency: number;
  message: string;
};

interface SeasonReview {
  seasonLabel: string;
  seasonStart: string;
  seasonEnd: string;
  totalSeasonDays: number;
  userName: string | null;
  userEmail: string;
  activityTypes: ActivityTypeReview[];   // sorted: best streak desc
  totalActivities: number;
  uniqueActivityDays: number;
  mostActiveType: string | null;
  recommendations: Recommendation[];
}

function getSeasonalFreqForSeason(
  type: { freqWinter: number; freqSpring: number; freqSummer: number; freqFall: number },
  season: Season
): number {
  switch (season) {
    case 'winter': return type.freqWinter;
    case 'spring': return type.freqSpring;
    case 'summer': return type.freqSummer;
    case 'fall':   return type.freqFall;
  }
}

async function buildReview(userId: string, seasonInfo: SeasonInfo): Promise<SeasonReview | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const userTimezone = user.timezone || 'America/New_York';

  // Convert season boundaries to timezone-aware UTC instants.
  // seasonInfo.start/end are UTC midnight for the calendar date (e.g. Dec 1, Feb 28).
  // We want activities whose local calendar date falls within the season, so:
  //   - query start = midnight of season start in user's timezone → UTC
  //   - query end   = end of season end day in user's timezone → UTC (i.e. midnight of next day)
  const { fromZonedTime } = await import('date-fns-tz');
  const seasonStartUtc = fromZonedTime(
    new Date(seasonInfo.start.getUTCFullYear(), seasonInfo.start.getUTCMonth(), seasonInfo.start.getUTCDate(), 0, 0, 0),
    userTimezone
  );
  // End of the last day in user timezone = start of next calendar day in user timezone
  const seasonEndUtc = fromZonedTime(
    new Date(seasonInfo.end.getUTCFullYear(), seasonInfo.end.getUTCMonth(), seasonInfo.end.getUTCDate() + 1, 0, 0, 0),
    userTimezone
  );

  const activityTypes = await prisma.activityType.findMany({
    where: { userId },
    include: {
      activities: {
        where: {
          date: { gte: seasonStartUtc, lt: seasonEndUtc },
        },
        orderBy: { date: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  const activeTypes = activityTypes.filter((t) => t.activities.length > 0);
  if (activeTypes.length === 0) return null;

  const offTimes = await getUserOffTimes(userId);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const formatSeasonDate = (d: Date) =>
    `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;

  const formatDate = (d: Date) => {
    const inTz = toZonedTime(d, userTimezone);
    return format(inTz, 'M/d/yy');
  };

  let totalActivities = 0;
  const allActivityDays = new Set<string>();

  const activityTypeReviews: ActivityTypeReview[] = activeTypes.map((type) => {
    const activities = type.activities;
    totalActivities += activities.length;

    activities.forEach((a) => {
      const inTz = toZonedTime(a.date, userTimezone);
      allActivityDays.add(format(startOfDay(inTz), 'yyyy-MM-dd'));
    });

    const firstActivity = activities[0];
    const lastActivity  = activities[activities.length - 1];

    // Convert activity dates to the user's timezone calendar date before all comparisons.
    // An activity stored as 2026-02-28T12:00:00Z is "Feb 28" in ET, not "Feb 28 UTC" — same
    // here, but an activity at 2026-02-28T03:00:00Z would be "Feb 27" in ET (UTC-5).
    const firstDateLocal = startOfDay(toZonedTime(firstActivity.date, userTimezone));
    const lastDateLocal  = startOfDay(toZonedTime(lastActivity.date,  userTimezone));

    // Season boundaries are stored as UTC midnight for the calendar date (e.g. Feb 28 00:00 UTC).
    // Do NOT convert through toZonedTime — that would shift them to the previous day in UTC-offset
    // timezones (e.g. Feb 28 00:00 UTC → Feb 27 17:00 MT → startOfDay = Feb 27).
    // Instead, read the UTC calendar date components directly and build a local midnight.
    const seasonStartLocal = new Date(
      seasonInfo.start.getUTCFullYear(), seasonInfo.start.getUTCMonth(), seasonInfo.start.getUTCDate()
    );
    const seasonEndLocal = new Date(
      seasonInfo.end.getUTCFullYear(), seasonInfo.end.getUTCMonth(), seasonInfo.end.getUTCDate()
    );

    const clampedFirst = firstDateLocal < seasonStartLocal ? seasonStartLocal : firstDateLocal;
    const clampedLast  = lastDateLocal  > seasonEndLocal   ? seasonEndLocal   : lastDateLocal;

    // Build UTC midnight dates from the clamped local calendar dates for offTime calculations
    // (offTime logic uses UTC midnight internally).
    const firstDateUtc = utcMidnight(
      clampedFirst.getFullYear(), clampedFirst.getMonth() + 1, clampedFirst.getDate()
    );
    const lastDateUtc = utcMidnight(
      clampedLast.getFullYear(), clampedLast.getMonth() + 1, clampedLast.getDate()
    );

    const offTimeDays = calculateOffTimeDays(type.id, firstDateUtc, lastDateUtc, offTimes, userTimezone);

    const rawSpan    = differenceInDays(lastDateUtc, firstDateUtc) + 1;
    const trackedDays = Math.max(0, rawSpan - offTimeDays);
    const coverageDays = Math.min(trackedDays, seasonInfo.totalDays);
    const coveragePct  = Math.round((coverageDays / seasonInfo.totalDays) * 100);

    const desiredFrequency = getSeasonalFreqForSeason(type, seasonInfo.season);

    // Average frequency (off-time adjusted).
    // Convert each activity to its local calendar date midnight, then build a UTC midnight
    // for the offTime calculation (which works in UTC midnight internally).
    let avgFrequency: number | null = null;
    if (activities.length >= 2) {
      const intervals: number[] = [];
      for (let i = 0; i < activities.length - 1; i++) {
        const localA = startOfDay(toZonedTime(activities[i].date,     userTimezone));
        const localB = startOfDay(toZonedTime(activities[i + 1].date, userTimezone));
        const a = utcMidnight(localA.getFullYear(), localA.getMonth() + 1, localA.getDate());
        const b = utcMidnight(localB.getFullYear(), localB.getMonth() + 1, localB.getDate());
        const raw   = differenceInDays(b, a);
        const otDay = calculateOffTimeDays(type.id, a, b, offTimes, userTimezone);
        intervals.push(raw - otDay);
      }
      const sum = intervals.reduce((acc, v) => acc + v, 0);
      avgFrequency = Math.round((sum / intervals.length) * 10) / 10;
    }

    // Best streak: longest window between two activities in the season
    // where avg interval <= desiredFrequency (mirrors analytics logic).
    // Uses startOfDay(toZonedTime(...)) for date midpoints — same as analytics.
    let bestStreak = 0;
    let fullNetSpan = 0;
    if (activities.length >= 2) {
      const mids = activities.map((a) => {
        const inTz = toZonedTime(a.date, userTimezone);
        return startOfDay(inTz);
      });

      // Full net span from first to last activity in the same coordinate system as bestStreak.
      // This is what we compare against to determine a "perfect" streak.
      const fullRaw = differenceInDays(mids[mids.length - 1], mids[0]);
      const fullOt  = calculateOffTimeDays(type.id, mids[0], mids[mids.length - 1], offTimes, userTimezone);
      fullNetSpan = fullRaw - fullOt;

      for (let s = 0; s < activities.length; s++) {
        for (let e = s + 1; e < activities.length; e++) {
          const rawWindow = differenceInDays(mids[e], mids[s]);
          const otWindow  = calculateOffTimeDays(type.id, mids[s], mids[e], offTimes, userTimezone);
          const window    = rawWindow - otWindow;

          const intervals: number[] = [];
          for (let i = s; i < e; i++) {
            const raw   = differenceInDays(mids[i + 1], mids[i]);
            const otDay = calculateOffTimeDays(type.id, mids[i], mids[i + 1], offTimes, userTimezone);
            intervals.push(raw - otDay);
          }

          if (intervals.length > 0) {
            const avg = intervals.reduce((a, v) => a + v, 0) / intervals.length;
            if (Math.round(avg * 10) / 10 <= desiredFrequency && window > bestStreak) {
              bestStreak = window;
            }
          }
        }
      }
    }

    return {
      name: type.name,
      icon: type.icon,
      firstDate: format(clampedFirst, 'M/d/yy'),
      lastDate:  format(clampedLast,  'M/d/yy'),
      totalActivities: activities.length,
      offTimeDays,
      trackedDays,
      seasonDays: seasonInfo.totalDays,
      coverageDays,
      coveragePct,
      desiredFrequency,
      avgFrequency,
      bestStreak,
      fullNetSpan,
    };
  });

  // Sort: best streak descending, then coverage descending as tiebreak
  activityTypeReviews.sort((a, b) =>
    b.bestStreak !== a.bestStreak
      ? b.bestStreak - a.bestStreak
      : b.coverageDays - a.coverageDays
  );

  const mostActiveType = activityTypeReviews.length > 0
    ? [...activityTypeReviews].sort((a, b) => b.totalActivities - a.totalActivities)[0].name
    : null;

  // Build recommendations
  // Note: a HIGHER avg interval number = LESS frequent activity.
  // avg > desired → performing less often than target → struggling → recommend focusing more / lowering the interval target
  // avg < desired → performing more often than target → crushing it → recommend raising the interval target to better challenge yourself
  const recommendations: Recommendation[] = [];
  for (const at of activityTypeReviews) {
    if (at.avgFrequency === null) continue;
    const diff = at.avgFrequency - at.desiredFrequency;
    if (diff > 1) {
      // avg interval is MORE than desired → performing LESS often than target → needs focus
      recommendations.push({
        name: at.name,
        icon: at.icon,
        type: 'focus',
        desiredFrequency: at.desiredFrequency,
        avgFrequency: at.avgFrequency,
        message: `You averaged every ${at.avgFrequency} days vs. a target of every ${at.desiredFrequency} days — you're not quite hitting your goal. Consider focusing on this activity more diligently next season, or raising the desired frequency to build momentum.`,
      });
    } else if (diff < -1) {
      // avg interval is LESS than desired → performing MORE often than target → crushing it
      recommendations.push({
        name: at.name,
        icon: at.icon,
        type: 'increase',
        desiredFrequency: at.desiredFrequency,
        avgFrequency: at.avgFrequency,
        message: `You averaged every ${at.avgFrequency} days vs. a target of every ${at.desiredFrequency} days — you're performing this activity more often than required. Consider decreasing the desired frequency to better challenge yourself next season.`,
      });
    }
  }

  return {
    seasonLabel:        seasonInfo.label,
    seasonStart:        formatSeasonDate(seasonInfo.start),
    seasonEnd:          formatSeasonDate(seasonInfo.end),
    totalSeasonDays:    seasonInfo.totalDays,
    userName:           user.name ?? null,
    userEmail:          user.email,
    activityTypes:      activityTypeReviews,
    totalActivities,
    uniqueActivityDays: allActivityDays.size,
    mostActiveType,
    recommendations,
  };
}

// ─── Email HTML builder ───────────────────────────────────────────────────────

// Banner is served from the public web folder; use the live URL so email clients can load it
const BANNER_URL = 'https://frequencytracker.com/frequencytrackerbanner.png';

function buildEmailHtml(review: SeasonReview): string {
  const greeting = review.userName ? `Hi ${review.userName},` : 'Hi there,';

  const activityRows = review.activityTypes.map((at) => {
    const iconSvg  = renderIconSvg(at.icon, 16, '#6b7280');
    const otText   = at.offTimeDays > 0 ? `${at.offTimeDays}d` : '—';

    // Avg freq vs desired: green if at or better (lower or equal), red if worse
    let freqCell = '—';
    if (at.avgFrequency !== null) {
      const onTarget = at.avgFrequency <= at.desiredFrequency;
      const freqColor = onTarget ? '#16a34a' : '#dc2626';
      freqCell = `<span style="color:${freqColor};font-weight:600;">${at.avgFrequency}d</span>`
        + `<span style="color:#9ca3af;font-size:11px;"> / ${at.desiredFrequency}d</span>`;
    }

    // Best streak — gold if it spans the full activity window.
    // Both bestStreak and fullNetSpan are computed using differenceInDays on
    // startOfDay(toZonedTime(...)) midpoints, so they are directly comparable.
    const isPerfect = at.bestStreak > 0 && at.bestStreak >= at.fullNetSpan;
    const streakColor = isPerfect ? '#b45309' : '#374151';
    const streakBg    = isPerfect ? 'background:#fef3c7;border-radius:4px;padding:2px 6px;' : '';
    const streakText  = at.bestStreak > 0
      ? `<span style="color:${streakColor};font-weight:${isPerfect ? '700' : '400'};${streakBg}">${at.bestStreak}d${isPerfect ? ' ★' : ''}</span>`
      : '—';

    return `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:14px 8px;white-space:nowrap;">
          ${iconSvg ? `<span style="margin-right:6px;">${iconSvg}</span>` : ''}
          <span style="font-weight:600;color:#111827;font-size:14px;">${at.name}</span>
        </td>
        <td style="padding:14px 8px;color:#6b7280;font-size:12px;white-space:nowrap;">${at.firstDate ?? '—'}</td>
        <td style="padding:14px 8px;color:#6b7280;font-size:12px;white-space:nowrap;">${at.lastDate ?? '—'}</td>
        <td style="padding:14px 8px;text-align:center;color:#374151;font-size:13px;">${at.totalActivities}</td>
        <td style="padding:14px 8px;text-align:center;color:#374151;font-size:12px;">${otText}</td>
        <td style="padding:14px 8px;text-align:center;font-size:13px;">
          <span style="color:#374151;font-weight:600;">${at.coverageDays}d</span>
          <span style="color:#9ca3af;font-size:11px;"> (${at.coveragePct}%)</span>
        </td>
        <td style="padding:14px 8px;text-align:center;font-size:13px;">${freqCell}</td>
        <td style="padding:14px 8px;text-align:center;font-size:13px;">${streakText}</td>
      </tr>
    `;
  }).join('');

  // Recommendations section
  let recommendationsSection = '';
  if (review.recommendations.length > 0) {
    const recItems = review.recommendations.map((rec) => {
      // 'focus' = performing less often than target (needs work) → amber
      // 'increase' = performing more often than target (crushing it) → green
      const iconSvg  = renderIconSvg(rec.icon, 16, rec.type === 'increase' ? '#16a34a' : '#d97706') ?? '';
      const badgeColor = rec.type === 'increase' ? '#dcfce7' : '#fef3c7';
      const badgeText  = rec.type === 'increase' ? '#15803d' : '#92400e';
      const badgeLabel = rec.type === 'increase' ? 'Increase target' : 'Focus area';

      return `
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top;padding-right:12px;width:24px;">
                  ${iconSvg}
                </td>
                <td>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <span style="font-weight:600;color:#111827;font-size:14px;">${rec.name}</span>
                        &nbsp;
                        <span style="background:${badgeColor};color:${badgeText};font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;">${badgeLabel}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top:4px;">
                        <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">${rec.message}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    }).join('');

    recommendationsSection = `
      <!-- Recommendations -->
      <tr>
        <td style="padding:32px 40px 0;">
          <h2 style="margin:0 0 4px;font-size:18px;font-weight:600;color:#111827;">Recommendations for Next Season</h2>
          <p style="margin:0 0 16px;font-size:13px;color:#9ca3af;">Based on your activity frequency vs. your targets this season.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            ${recItems}
          </table>
        </td>
      </tr>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${review.seasonLabel} Review</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="660" cellpadding="0" cellspacing="0" style="max-width:660px;width:100%;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden;">

          <!-- Banner image -->
          <tr>
            <td style="padding:0;line-height:0;">
              <img src="${BANNER_URL}" alt="Frequency Tracker" width="660" style="display:block;width:100%;max-width:660px;height:auto;" />
            </td>
          </tr>

          <!-- Season header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:28px 40px;text-align:center;">
              <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;">${review.seasonLabel}</h1>
              <p style="margin:6px 0 0;font-size:15px;color:rgba(255,255,255,0.85);">Your Season in Review</p>
              <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.6);">${review.seasonStart} – ${review.seasonEnd}</p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 0;">
              <p style="margin:0 0 8px;font-size:16px;color:#374151;">${greeting}</p>
              <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.6;">
                Here's a look back at your activity across <strong>${review.seasonLabel}</strong>.
                You logged <strong>${review.totalActivities} ${review.totalActivities === 1 ? 'activity' : 'activities'}</strong>
                across <strong>${review.uniqueActivityDays} unique ${review.uniqueActivityDays === 1 ? 'day' : 'days'}</strong> this season.
                ${review.mostActiveType ? `Your most active category was <strong>${review.mostActiveType}</strong>.` : ''}
              </p>
            </td>
          </tr>

          <!-- Summary stats -->
          <tr>
            <td style="padding:24px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;">
                    <p style="margin:0;font-size:26px;font-weight:700;color:#1e3a5f;">${review.totalActivities}</p>
                    <p style="margin:4px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Total Activities</p>
                  </td>
                  <td style="width:8px;"></td>
                  <td style="background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;">
                    <p style="margin:0;font-size:26px;font-weight:700;color:#1e3a5f;">${review.uniqueActivityDays}</p>
                    <p style="margin:4px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Active Days</p>
                  </td>
                  <td style="width:8px;"></td>
                  <td style="background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;">
                    <p style="margin:0;font-size:26px;font-weight:700;color:#1e3a5f;">${review.activityTypes.length}</p>
                    <p style="margin:4px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Activity Types</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Activity breakdown -->
          <tr>
            <td style="padding:32px 40px 0;">
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#111827;">Activity Breakdown</h2>
              <div style="overflow-x:auto;">
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;min-width:580px;">
                  <thead>
                    <tr style="background:#f3f4f6;">
                      <th style="padding:10px 8px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Activity</th>
                      <th style="padding:10px 8px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">First</th>
                      <th style="padding:10px 8px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Last</th>
                      <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Count</th>
                      <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Time Off</th>
                      <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Coverage</th>
                      <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Avg / Target</th>
                      <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Best Streak</th>
                    </tr>
                  </thead>
                  <tbody>${activityRows}</tbody>
                </table>
              </div>
              <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;line-height:1.6;">
                <strong>Coverage</strong> = span from first to last activity minus off-time, as % of the full season (${review.totalSeasonDays} days).
                <strong>Avg / Target</strong> = avg days between activities vs. your desired frequency — <span style="color:#16a34a;">green</span> = on or ahead of target, <span style="color:#dc2626;">red</span> = behind.
                <strong>Best Streak</strong> = longest period meeting your target frequency. <span style="color:#b45309;">★ Gold</span> = streak spans your full coverage window.
              </p>
            </td>
          </tr>

          ${recommendationsSection}

          <!-- CTA -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
                Keep up the great work heading into the next season!
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#2563eb;border-radius:8px;">
                    <a href="https://frequencytracker.com" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">View Your Dashboard →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f3f4f6;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                You're receiving this because you have an account at
                <a href="https://frequencytracker.com" style="color:#2563eb;text-decoration:none;">frequencytracker.com</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
  `.trim();
}

function buildEmailText(review: SeasonReview): string {
  const greeting = review.userName ? `Hi ${review.userName},` : 'Hi there,';

  const lines: string[] = [
    `${review.seasonLabel} Review — Frequency Tracker`,
    `${review.seasonStart} – ${review.seasonEnd}`,
    '',
    greeting,
    '',
    `You logged ${review.totalActivities} activities across ${review.uniqueActivityDays} unique days this season.`,
    review.mostActiveType ? `Your most active category was: ${review.mostActiveType}.` : '',
    '',
    '─'.repeat(60),
    'ACTIVITY BREAKDOWN (sorted by best streak)',
    '─'.repeat(60),
  ];

  for (const at of review.activityTypes) {
    lines.push('');
    lines.push(at.name);
    lines.push(`  First activity   : ${at.firstDate ?? '—'}`);
    lines.push(`  Last activity    : ${at.lastDate ?? '—'}`);
    lines.push(`  Total count      : ${at.totalActivities}`);
    lines.push(`  Off-time days    : ${at.offTimeDays}`);
    lines.push(`  Coverage         : ${at.coverageDays} / ${at.seasonDays} days (${at.coveragePct}%)`);
    lines.push(`  Target frequency : every ${at.desiredFrequency} days`);
    if (at.avgFrequency !== null) {
      const flag = at.avgFrequency <= at.desiredFrequency ? '✓' : '✗';
      lines.push(`  Avg frequency    : every ${at.avgFrequency} days ${flag}`);
    }
    if (at.bestStreak > 0) {
      const perfect = at.bestStreak >= at.fullNetSpan ? ' ★ Perfect season streak!' : '';
      lines.push(`  Best streak      : ${at.bestStreak} days${perfect}`);
    }
  }

  if (review.recommendations.length > 0) {
    lines.push('');
    lines.push('─'.repeat(60));
    lines.push('RECOMMENDATIONS FOR NEXT SEASON');
    lines.push('─'.repeat(60));
    for (const rec of review.recommendations) {
      lines.push('');
      lines.push(`${rec.name} [${rec.type === 'increase' ? 'Increase target' : 'Focus area'}]`);
      lines.push(`  ${rec.message}`);
    }
  }

  lines.push('');
  lines.push('─'.repeat(60));
  lines.push('Keep up the great work heading into the next season!');
  lines.push('');
  lines.push('Visit your dashboard: https://frequencytracker.com');

  return lines.filter((l) => l !== null).join('\n');
}

// ─── Scheduler entrypoint (called by cron) ───────────────────────────────────

/**
 * Send season review emails to all users who had activity in the just-completed season.
 * Called automatically by the cron endpoint on the first day of each new season.
 */
export async function sendSeasonReviewToAllUsers(seasonInfoOverride?: SeasonInfo): Promise<void> {
  const seasonInfo = seasonInfoOverride ?? getPreviousSeasonInfo(new Date());

  console.log(`[Season Review] Sending ${seasonInfo.label} review to all eligible users...`);

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true },
  });

  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    try {
      const review = await buildReview(user.id, seasonInfo);

      if (!review) {
        skipped++;
        continue;
      }

      const subject = `Your ${seasonInfo.label} Review`;
      const html = buildEmailHtml(review);
      const text = buildEmailText(review);

      const result = await sendEmail({ to: user.email, subject, html, text });

      if (result.success) {
        console.log(`[Season Review] Sent to ${user.email} (${review.totalActivities} activities)`);
        sent++;
      } else {
        console.error(`[Season Review] Failed to send to ${user.email}: ${result.error}`);
      }
    } catch (err) {
      console.error(`[Season Review] Error processing user ${user.id}:`, err);
    }
  }

  console.log(`[Season Review] Done. Sent: ${sent}, Skipped: ${skipped}`);
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  const userArg   = args.find((a) => a.startsWith('--user='))?.split('=')[1];
  const allFlag   = args.includes('--all');
  const seasonArg = args.find((a) => a.startsWith('--season='))?.split('=')[1] as Season | undefined;
  const yearArg   = args.find((a) => a.startsWith('--year='))?.split('=')[1];

  if (!userArg && !allFlag) {
    console.error('Usage:');
    console.error('  npx tsx src/scripts/sendSeasonReview.ts --user=email@example.com [--season=winter] [--year=2025]');
    console.error('  npx tsx src/scripts/sendSeasonReview.ts --all [--season=winter] [--year=2025]');
    process.exit(1);
  }

  let seasonInfo: SeasonInfo;
  if (seasonArg && yearArg) {
    seasonInfo = getSeasonInfo(seasonArg, parseInt(yearArg, 10));
  } else {
    seasonInfo = getPreviousSeasonInfo(new Date());
  }

  const MONTHS_CLI = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtCli = (d: Date) => `${MONTHS_CLI[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;

  console.log(`\nSeason: ${seasonInfo.label}`);
  console.log(`Period: ${fmtCli(seasonInfo.start)} – ${fmtCli(seasonInfo.end)}`);
  console.log(`Total days: ${seasonInfo.totalDays}`);
  console.log('');

  const users = allFlag
    ? await prisma.user.findMany({ select: { id: true, email: true, name: true } })
    : await prisma.user.findMany({
        where: { email: userArg },
        select: { id: true, email: true, name: true },
      });

  if (users.length === 0) {
    console.error(`No user found${userArg ? ` with email: ${userArg}` : ''}`);
    process.exit(1);
  }

  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    process.stdout.write(`Processing ${user.email}... `);

    const review = await buildReview(user.id, seasonInfo);

    if (!review) {
      console.log('skipped (no activities in season)');
      skipped++;
      continue;
    }

    const subject = `Your ${seasonInfo.label} Review`;
    const html = buildEmailHtml(review);
    const text = buildEmailText(review);

    const result = await sendEmail({ to: user.email, subject, html, text });

    if (result.success) {
      console.log(`sent ✓  (${review.totalActivities} activities, ${review.activityTypes.length} types, ${review.recommendations.length} recommendations)`);
      sent++;
    } else {
      console.log(`FAILED: ${result.error}`);
    }
  }

  console.log(`\nDone. Sent: ${sent}, Skipped: ${skipped}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
