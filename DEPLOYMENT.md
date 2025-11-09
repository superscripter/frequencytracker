# Deployment Guide - Vercel

This guide covers deploying both the frontend and backend to Vercel.

## Prerequisites

- Vercel account (free tier works fine)
- GitHub repository (for automatic deployments)
- Neon database with connection string

## Backend Deployment (API)

### 1. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New Project"
3. Import your repository
4. **Framework Preset**: Other
5. **Root Directory**: `apps/api`
6. Click "Deploy"

### 2. Configure Environment Variables

In your Vercel project settings, add these environment variables:

| Variable | Value | Example |
|----------|-------|---------|
| `DATABASE_URL` | Your Neon connection string | `postgresql://user:pass@host.neon.tech/dbname?sslmode=require` |
| `JWT_SECRET` | Strong random string (32+ chars) | Use a password generator |
| `FRONTEND_URL` | Your frontend domain | `https://frequencytracker.com` |
| `STRAVA_CLIENT_ID` | (Optional) Strava OAuth client ID | From Strava developer portal |
| `STRAVA_CLIENT_SECRET` | (Optional) Strava OAuth secret | From Strava developer portal |
| `STRAVA_REDIRECT_URI` | (Optional) OAuth callback URL | `https://api-frequencytracker.vercel.app/api/strava/callback` |

**Important Notes:**
- Keep your `JWT_SECRET` secure and different from development
- `FRONTEND_URL` should match your production frontend domain exactly
- Update Strava OAuth settings in Strava developer portal with production URLs

### 3. Get Your API URL

After deployment, Vercel will give you a URL like:
- `https://frequency-tracker-api-xyz.vercel.app`

You can also add a custom domain like `api.frequencytracker.com` in project settings.

### 4. Update Strava OAuth Settings

If using Strava integration, update your Strava application settings at [strava.com/settings/api](https://www.strava.com/settings/api):

- **Authorization Callback Domain**: Add your Vercel domain (e.g., `frequency-tracker-api-xyz.vercel.app`)
- Update `STRAVA_REDIRECT_URI` environment variable to match

## Frontend Deployment (Web)

### 1. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and click "Add New Project"
2. Import your repository (can be the same repo, different project)
3. **Framework Preset**: Vite
4. **Root Directory**: `apps/web`
5. Click "Deploy"

### 2. Configure Environment Variables

Add this environment variable:

| Variable | Value | Example |
|----------|-------|---------|
| `VITE_API_URL` | Your backend API URL from step above | `https://frequency-tracker-api-xyz.vercel.app` |

### 3. Configure Custom Domain

1. Go to project settings → Domains
2. Add `frequencytracker.com` and `www.frequencytracker.com`
3. Follow Vercel's DNS instructions to point your domain

## Post-Deployment Checklist

- [ ] Backend deployed and accessible at API URL
- [ ] All environment variables configured correctly
- [ ] Frontend deployed to frequencytracker.com
- [ ] `VITE_API_URL` points to correct backend URL
- [ ] Test authentication (register/login)
- [ ] Test creating activities
- [ ] Test recommendations
- [ ] If using Strava: Test OAuth connection flow
- [ ] Check CORS - frontend can communicate with backend
- [ ] Verify Prisma client generated (check build logs)

## Troubleshooting

### "Cannot find module '@frequency-tracker/database'"
- Make sure root `package.json` and `package-lock.json` are committed
- Vercel needs to see the monorepo structure to install workspace dependencies

### CORS Errors
- Verify `FRONTEND_URL` environment variable matches your frontend domain exactly
- Check it's set in Vercel environment variables, not just `.env` file

### Database Connection Errors
- Verify `DATABASE_URL` is set correctly in Vercel
- Ensure Neon database is accessible (check IP allowlist if configured)
- Connection string should include `?sslmode=require`

### Strava OAuth Not Working
- Verify all Strava environment variables are set
- Check `STRAVA_REDIRECT_URI` matches what's configured in Strava app settings
- Ensure callback domain is added to Strava authorized domains

### Build Failures
- Check Vercel build logs for specific errors
- Ensure all dependencies are in `package.json` (not just dev dependencies)
- Verify TypeScript compiles locally with `npm run build`

## Monitoring

### Check Backend Health
Visit: `https://your-api-domain.vercel.app/health`

Should return:
```json
{
  "status": "ok",
  "timestamp": "2025-11-08T..."
}
```

### View Logs
- Vercel Dashboard → Your Project → Deployments → Click deployment → Function Logs
- Real-time logs show all API requests and errors

## Continuous Deployment

Once set up, Vercel automatically:
- Deploys on every push to `main` branch (production)
- Creates preview deployments for pull requests
- Runs build checks before deploying

To disable auto-deploy:
- Project Settings → Git → Disable "Automatic Deployments"

## Cost Considerations

**Vercel Free Tier Limits:**
- 100 GB bandwidth/month
- 100 GB-hours serverless function execution
- 10-second function timeout
- Unlimited deployments

**What happens if you exceed free tier:**
- Vercel will notify you
- You can upgrade to Pro ($20/month) for higher limits
- 60-second function timeout on Pro tier

**Typical Usage:**
- Normal API calls use ~100-500ms each
- Strava sync might timeout on free tier if importing many activities
- Frontend static hosting has no execution limits

## Security Best Practices

1. **Environment Variables**
   - Never commit `.env` files
   - Use strong, unique `JWT_SECRET` for production
   - Rotate secrets periodically

2. **CORS Configuration**
   - Only allow your frontend domain
   - Don't use `*` wildcard in production

3. **Database**
   - Use Neon's connection pooling
   - Keep `DATABASE_URL` secret
   - Enable SSL mode (`?sslmode=require`)

4. **Rate Limiting** (Future Enhancement)
   - Consider adding rate limiting for production
   - Protect against abuse and excessive API calls
