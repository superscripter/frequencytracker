# Frequency Tracker

A full-stack web application for tracking activity frequency with Strava integration, providing intelligent recommendations based on your activity patterns.

## Overview

Frequency Tracker helps users monitor their activities (workouts, habits, etc.) and provides data-driven recommendations on activity frequency. The application integrates with Strava to automatically import fitness activities.

## Tech Stack

### Backend Technologies

#### **Node.js + TypeScript**
Using TypeScript across the entire stack (frontend and backend) provides:
- **Type safety** - Catch errors at compile time rather than runtime
- **Shared types** - Share interfaces and types between frontend and backend
- **Better DX** - Excellent IDE support with autocomplete and inline documentation
- **No context switching** - Use the same language throughout the application

#### **Fastify**
A fast and low overhead web framework for Node.js:
- **Performance** - One of the fastest Node.js frameworks
- **Schema-based validation** - Built-in JSON schema validation
- **TypeScript support** - Excellent TypeScript integration out of the box
- **Plugin architecture** - Clean, modular design for adding functionality
- **Modern async/await** - First-class support for async/await patterns

#### **Prisma ORM**
Modern database toolkit for TypeScript:
- **Type-safe queries** - Auto-generated TypeScript types from your schema
- **Intuitive API** - Clean, readable database queries

#### **PostgreSQL**
Production-ready relational database:

#### **Docker**
Containerization for consistent development environments:
- **Consistency** - Same environment across dev, staging, and production
- **Isolation** - Database runs in its own container, no local setup needed
- **Easy setup** - One command to start all services
- **Portability** - Works the same on Mac, Windows, and Linux

#### **Turborepo**
High-performance build system for monorepos:
- **Fast builds** - Intelligent caching and parallel execution
- **Monorepo management** - Efficiently handles multiple packages and apps
- **Simple configuration** - Minimal setup required
- **Task orchestration** - Coordinate builds, tests, and deployments across packages

### Frontend Technologies

#### **Next.js**
React framework with powerful features:
- **Server-side rendering** - Better SEO and initial load performance
- **API routes** - Can handle backend logic if needed
- **File-based routing** - Intuitive page structure
- **Built-in optimization** - Automatic code splitting and image optimization
- **TypeScript support** - First-class TypeScript integration

#### **React Query (TanStack Query)**
Powerful data fetching and caching library:
- **Automatic caching** - Smart caching with background refetching
- **Loading states** - Built-in loading, error, and success states
- **Optimistic updates** - Update UI before server confirms
- **Request deduplication** - Prevents duplicate API calls
- **Type-safe** - Excellent TypeScript support

#### **Tailwind CSS** (planned)
Utility-first CSS framework:
- **Rapid development** - Build UIs quickly with utility classes
- **Consistent design** - Pre-defined spacing, colors, and typography
- **Small bundle size** - Purges unused styles in production
- **Responsive design** - Easy responsive breakpoints
- **Customizable** - Fully configurable design system

### Authentication

#### **JWT (JSON Web Tokens)**
Stateless authentication mechanism:
- **Stateless** - No server-side session storage needed
- **Scalable** - Works well with distributed systems
- **Secure** - Cryptographically signed tokens
- **Standard** - Widely adopted industry standard
- **Mobile-friendly** - Easy to use with mobile apps

### Why This Stack?

1. **Type Safety** - TypeScript throughout eliminates entire classes of bugs
2. **Developer Experience** - Modern tooling with excellent IDE support
3. **Performance** - Fast frameworks (Fastify, Next.js) and efficient database queries
4. **Scalability** - All technologies scale well as the app grows
5. **Single Language** - JavaScript/TypeScript everywhere reduces context switching
6. **Modern Best Practices** - Up-to-date technologies with active communities
7. **Cost Effective** - All open-source tools, can deploy to free/low-cost platforms

## Project Status

**Overall Completion: ~85%**

### ✅ Completed Features

#### Backend (Feature Complete)
- ✅ **Database Schema**: Full Prisma schema with User, Activity, ActivityType models
- ✅ **Authentication**: JWT-based auth with register, login, profile updates
- ✅ **Activity Management**: Full CRUD operations with ownership verification and pagination
- ✅ **Activity Types**: Full management with cascade delete protection
- ✅ **Recommendations System**: Intelligent algorithm with priority scoring, timezone-aware calculations
- ✅ **Strava Integration**: Complete OAuth flow, token management, activity import/sync
- ✅ **Comprehensive E2E Tests**: All major API endpoints tested (auth, activities, activity types, recommendations)

#### Frontend (Feature Complete)
- ✅ **Authentication UI**: Login/register modal with AuthContext
- ✅ **Activities Tab**: Add/edit/delete activities, filter by type, pagination, timezone-aware date handling
- ✅ **Recommendations Tab**: Color-coded status display with three sections (Today, Tomorrow, All)
- ✅ **History Tab**: Complete activity history with Strava sync functionality
- ✅ **Profile Tab**: User info, timezone selector, Strava connect/disconnect, activity types management
- ✅ **Component Architecture**: React 19 + TypeScript with Vite build system
- ✅ **Strava OAuth**: Full integration with connect/disconnect UI

### 🔴 Outstanding Work

#### Important Features
- ⚠️ **Data Visualization**: No charts or graphs for frequency trends
- ⚠️ **Frontend Tests**: Zero tests for React components
- ⚠️ **Activity Details**: Notes, duration, distance not fully displayed throughout UI
- ⚠️ **Mobile Responsiveness**: Needs improvement
- ⚠️ **Error Handling**: No React error boundaries

#### Production Readiness
- 🚧 **Deployment**: No Cloudflare Tunnel or production configuration
- 🚧 **Performance**: Missing optimistic updates and loading skeletons
- 🚧 **Security**: Needs rate limiting, better CORS configuration, stronger JWT secrets
- 🚧 **Type Safety**: No shared types package between frontend/backend
- 🚧 **UX Polish**: Missing confirmation dialogs for destructive actions, undo functionality

## Getting Started

### Prerequisites
- Node.js 18+
- npm (comes with Node.js)
- PostgreSQL database (see [DATABASE_SETUP.md](DATABASE_SETUP.md))

### Database Setup

**Option 1: Neon (Recommended - Free & Easy)**
1. Go to https://neon.tech and sign up
2. Create a new project
3. Copy the connection string
4. Paste it into `packages/database/.env` as `DATABASE_URL`

**Option 2: Local PostgreSQL**
1. Install PostgreSQL from https://www.postgresql.org/download/
2. Create a database called `frequency_tracker`
3. Update `packages/database/.env` with your connection string

See [DATABASE_SETUP.md](DATABASE_SETUP.md) for detailed instructions.

### Backend Setup

1. Install dependencies:
```bash
npm install
```

2. Push the database schema to PostgreSQL:
```bash
npm run db:push
```

3. (Optional) Open Prisma Studio to view/edit data:
```bash
npm run db:studio
```

4. Start the API server:
```bash
npm run dev
```

The API will be available at http://localhost:3001

### Frontend Setup

(To be added as we build the frontend)

## Running Tests

The project uses Vitest for testing. Tests are located in `apps/api/tests/`.

### Run All Tests

```bash
cd apps/api
npm test
```

This runs all tests in watch mode. Tests will re-run when files change.

### Run Tests Once (CI Mode)

```bash
cd apps/api
npm test -- --run
```

### Run Specific Test File

```bash
cd apps/api
npm test -- tests/e2e/auth.test.ts
```

Or for watch mode on a specific file:

```bash
cd apps/api
npm test -- tests/e2e/auth.test.ts --run
```

### Run a Single Test

Add `.only` to the test you want to run:

```typescript
it.only('should successfully register a new user', async () => {
  // test code
});
```

Then run:

```bash
cd apps/api
npm test
```

### Test Coverage

Current test coverage:
- **Authentication**: Registration, login, token verification, complete auth flow
- **Activities**: Create, read, update, delete operations with proper authentication

### Writing New Tests

Tests use Vitest and Fastify's `inject()` method for in-memory HTTP testing. See existing tests in `apps/api/tests/e2e/` for examples.

## Environment Variables

### Backend Configuration

Copy `.env.example` to `.env` in the root directory and update the values:

```bash
cp .env.example .env
```

Backend environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT tokens (change in production!)
- `PORT` - API server port (default: 3001)
- `FRONTEND_URL` - Frontend URL for CORS and OAuth redirects (default: http://localhost:5173)
- `STRAVA_CLIENT_ID` - Strava API client ID (optional, for Strava integration)
- `STRAVA_CLIENT_SECRET` - Strava API client secret (optional, for Strava integration)
- `STRAVA_REDIRECT_URI` - OAuth callback URL (default: http://localhost:3001/api/strava/callback)

### Frontend Configuration

Create `apps/web/.env` (you can copy from `apps/web/.env.example`):

```bash
cp apps/web/.env.example apps/web/.env
```

Frontend environment variables:
- `VITE_API_URL` - Backend API URL (default: http://localhost:3001)

**Note:** Vite requires environment variables to be prefixed with `VITE_` to be exposed to the frontend code.

## Project Structure

```
frequency-tracker/
├── apps/
│   ├── api/                # Fastify API server
│   │   ├── src/
│   │   │   ├── index.ts   # Server entry point
│   │   │   └── routes/    # API routes
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                # Next.js frontend (to be created)
├── packages/
│   └── database/           # Prisma database package
│       ├── prisma/
│       │   └── schema.prisma
│       ├── src/
│       │   └── index.ts   # Prisma client export
│       └── package.json
├── docker-compose.yml     # PostgreSQL container
├── package.json           # Root package.json (with npm workspaces)
└── README.md             # This file
```

## Reference Repository

This project is inspired by: https://github.com/superscripter/frequency_tracker

## Development Status

**Current Progress:** ~85% Complete - All core features built including Strava integration, production polish and testing remaining
**Last Updated:** 2025-11-08

### API Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (requires auth)

#### Activity Types
- `GET /api/activity-types` - Get all activity types
- `GET /api/activity-types/:id` - Get single activity type with activity count
- `POST /api/activity-types` - Create activity type
  - Body: `{ name: string, description?: string, desiredFrequency: number }`
- `PUT /api/activity-types/:id` - Update activity type
  - Body: `{ name?: string, description?: string, desiredFrequency?: number }`
- `DELETE /api/activity-types/:id` - Delete activity type (only if no activities use it)

#### Activities
- `GET /api/activities` - Get all activities with pagination (requires auth)
  - Query params: `typeId` (optional), `page` (optional, default: 1), `limit` (optional, default: 20)
- `GET /api/activities/:id` - Get single activity (requires auth)
- `POST /api/activities` - Create activity (requires auth)
- `PUT /api/activities/:id` - Update activity (requires auth)
- `DELETE /api/activities/:id` - Delete activity (requires auth)

#### Recommendations
- `GET /api/recommendations` - Get personalized activity recommendations (requires auth)

#### Strava Integration
- `GET /api/strava/authorize` - Initiate Strava OAuth flow (requires auth via query param)
- `GET /api/strava/callback` - OAuth callback handler
- `POST /api/strava/sync` - Sync activities from Strava (requires auth)
  - Body: `{ afterDate: string }` (ISO date string)
- `DELETE /api/strava/disconnect` - Disconnect Strava account (requires auth)

## Contributing

Track file authorship in `.personal` file.

## License

(To be determined)
