# PWA and Daily Notifications Setup

This document describes the PWA (Progressive Web App) and push notification features that have been added to the Frequency Tracker app.

## Features

### PWA Capabilities
- **Full-Screen Mode**: When installed on iPhone (or any device), the app displays in standalone mode without the browser URL bar
- **Offline Support**: Core app functionality works offline with intelligent caching
- **App Icons**: Custom icons for different device sizes (192x192, 512x512, maskable)
- **Installable**: Users can "Add to Home Screen" and launch the app like a native app

### Push Notifications
- **Permission Prompt**: Users are prompted to enable notifications after logging in
- **Daily Morning Reminders**: Automated notifications sent every morning (8 AM by default) with activity recommendations
- **Smart Recommendations**: Notifications include the most urgent activities (due today, overdue, critically overdue)
- **Test Endpoint**: API endpoint to test notifications immediately

## How It Works

### Frontend (PWA)

1. **Manifest**: [apps/web/public/manifest.json](apps/web/public/manifest.json)
   - Defines app name, colors, icons, and display mode
   - `display: "standalone"` removes the browser URL bar

2. **Service Worker**: [apps/web/src/sw.ts](apps/web/src/sw.ts)
   - Handles offline caching with Workbox
   - Receives and displays push notifications
   - Opens app when notification is clicked

3. **Notification Hook**: [apps/web/src/hooks/useNotifications.ts](apps/web/src/hooks/useNotifications.ts)
   - Manages notification permissions
   - Subscribes/unsubscribes to push notifications
   - Sends subscription details to backend

4. **Notification Prompt**: [apps/web/src/components/NotificationPrompt.tsx](apps/web/src/components/NotificationPrompt.tsx)
   - Shows a friendly prompt to enable notifications
   - Dismissible (won't show again for 7 days if dismissed)

### Backend (Push Notifications)

1. **Database Schema**: PushSubscription model
   - Stores user push subscriptions (endpoint, encryption keys)
   - Linked to User model

2. **Notification Routes**: [apps/api/src/routes/notifications.ts](apps/api/src/routes/notifications.ts)
   - `GET /api/notifications/vapid-public-key` - Get public key for subscription
   - `POST /api/notifications/subscribe` - Save user's push subscription
   - `POST /api/notifications/unsubscribe` - Remove user's push subscription
   - `POST /api/notifications/send-test` - Send test notification (authenticated)

3. **Notification Scheduler**: [apps/api/src/services/notification-scheduler.ts](apps/api/src/services/notification-scheduler.ts)
   - Cron job that runs daily at 8 AM
   - Fetches all users with push subscriptions
   - Calculates urgent recommendations for each user
   - Sends personalized notifications with top 3 activities

## Environment Variables

Add these to your `.env` file:

```bash
# Web Push Notifications (VAPID)
VAPID_PUBLIC_KEY=<your-public-key>
VAPID_PRIVATE_KEY=<your-private-key>
VAPID_SUBJECT=mailto:your-email@example.com
```

**Note**: VAPID keys have already been generated and added to your .env file.

To regenerate VAPID keys (if needed):
```bash
cd apps/api
node scripts/generate-vapid-keys.js
```

## Testing

### Test PWA Installation

1. **On Desktop (Chrome/Edge)**:
   - Open the app in Chrome
   - Click the install icon in the address bar
   - Or: Menu → Install Frequency Tracker

2. **On iPhone (Safari)**:
   - Open the app in Safari
   - Tap the Share button (square with arrow)
   - Tap "Add to Home Screen"
   - Tap "Add"
   - Launch the app from your home screen - it should open in full-screen mode!

### Test Notifications

1. **Enable Notifications**:
   - Log into the app
   - Click "Enable Notifications" when prompted
   - Grant permission when asked by the browser

2. **Send Test Notification**:
   ```bash
   # With authentication token
   curl -X POST http://localhost:3001/api/notifications/send-test \
     -H "Authorization: Bearer YOUR_TOKEN_HERE"
   ```

   Or use the API directly from the browser console:
   ```javascript
   fetch('http://localhost:3001/api/notifications/send-test', {
     method: 'POST',
     headers: {
       'Authorization': 'Bearer ' + localStorage.getItem('token')
     }
   }).then(r => r.json()).then(console.log)
   ```

3. **Test Daily Notification Immediately** (Development):
   - Add to `.env`: `SEND_TEST_NOTIFICATION=true`
   - Restart the API server
   - Notification will be sent 5 seconds after server starts

## Customization

### Change Notification Time

Edit [apps/api/src/services/notification-scheduler.ts](apps/api/src/services/notification-scheduler.ts):

```typescript
// Default: '0 8 * * *' means 8 AM daily
const cronSchedule = process.env.NOTIFICATION_CRON_SCHEDULE || '0 8 * * *';
```

Or set in `.env`:
```bash
NOTIFICATION_CRON_SCHEDULE="0 8 * * *"  # 8 AM daily
```

Cron format: `minute hour day month weekday`
- `0 8 * * *` - 8:00 AM every day
- `0 9 * * 1-5` - 9:00 AM weekdays only
- `0 7,19 * * *` - 7:00 AM and 7:00 PM daily

### Change Notification Message

Edit [apps/api/src/services/notification-scheduler.ts](apps/api/src/services/notification-scheduler.ts):

```typescript
const payload = JSON.stringify({
  title: `Good morning${user.name ? ', ' + user.name : ''}! 🌅`,
  body: /* your custom message */,
  icon: '/icon-192.png',
});
```

### Customize Prompt Timing

Edit [apps/web/src/components/NotificationPrompt.tsx](apps/web/src/components/NotificationPrompt.tsx):

```typescript
// Show again after 7 days
if (daysSinceDismissed < 7) {
  setDismissed(true);
}
```

## Production Deployment

### Important Notes

1. **HTTPS Required**: Push notifications only work over HTTPS (or localhost for development)

2. **Service Worker Scope**: The service worker must be served from the root to control all pages

3. **VAPID Keys**: Keep your `VAPID_PRIVATE_KEY` secret! Never commit it to version control

4. **Database Migration**: Ensure the PushSubscription table is created in production:
   ```bash
   cd packages/database
   npx prisma db push
   # or
   npx prisma migrate deploy
   ```

5. **Cron in Serverless**: If deploying to Vercel/serverless:
   - The cron job won't work in serverless functions
   - Consider using Vercel Cron Jobs or a separate service
   - Or use a service like Render/Railway that supports long-running processes

## Files Created/Modified

### New Files
- `apps/web/public/manifest.json` - PWA manifest
- `apps/web/public/icon-*.png` - App icons (4 files)
- `apps/web/src/sw.ts` - Service worker
- `apps/web/src/hooks/useNotifications.ts` - Notification management hook
- `apps/web/src/components/NotificationPrompt.tsx` - Notification prompt UI
- `apps/web/scripts/generate-icons.js` - Icon generation script
- `apps/api/src/routes/notifications.ts` - Notification API routes
- `apps/api/src/services/notification-scheduler.ts` - Daily notification scheduler
- `apps/api/scripts/generate-vapid-keys.js` - VAPID key generator

### Modified Files
- `apps/web/index.html` - Added PWA meta tags
- `apps/web/vite.config.ts` - Added vite-plugin-pwa
- `apps/web/src/App.tsx` - Added NotificationPrompt component
- `apps/api/src/index.ts` - Registered notification routes and scheduler
- `packages/database/prisma/schema.prisma` - Added PushSubscription model
- `.env` - Added VAPID keys

## Troubleshooting

### Notifications Not Working

1. **Check HTTPS**: Push notifications require HTTPS (except localhost)
2. **Check Permission**: Ensure notification permission is granted in browser settings
3. **Check Subscription**: Verify subscription was saved in database:
   ```sql
   SELECT * FROM push_subscriptions;
   ```
4. **Check Logs**: Look for errors in browser console and server logs
5. **Check Service Worker**: Open DevTools → Application → Service Workers

### PWA Not Installing

1. **Check Manifest**: Open DevTools → Application → Manifest
2. **Check HTTPS**: PWA requires HTTPS (except localhost)
3. **Check Icons**: Ensure all icon files exist and are accessible

### Service Worker Not Updating

1. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. DevTools → Application → Service Workers → Unregister
3. Clear browser cache

## Future Enhancements

- [ ] Notification preferences per user (enable/disable, time preference)
- [ ] Multiple notification times per day
- [ ] Notification history/log
- [ ] Rich notification content with action buttons
- [ ] Background sync for offline activity logging
- [ ] Badge count on app icon
- [ ] Vibration patterns for notifications
