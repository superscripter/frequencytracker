# Project Structure - Simplified

## 📁 Root Level (what you actually care about)

```
frequency-tracker/
├── .env                    # 🔑 ONE config file for EVERYTHING
├── package.json            # Run: npm run dev, npm run db:push
├── apps/api/src/           # Your API code here
└── packages/database/prisma/schema.prisma  # Database schema
```

## 🎯 Key Commands (run from root)

```bash
npm run dev          # Start API server
npm run db:push      # Update database schema
npm run db:studio    # Open database GUI
```

## 📝 The ONE .env File

Location: `/.env` (root of project)

Contains everything:
- `DATABASE_URL` - Your Neon database
- `JWT_SECRET` - Auth secret
- `PORT` - API port (3001)

## 🗂️ Where Code Lives

**API Code**: `apps/api/src/`
- `index.ts` - Server setup
- `routes/auth.ts` - Login/register
- `routes/activities.ts` - Activity CRUD

**Database**: `packages/database/`
- `prisma/schema.prisma` - Your database models
- Don't touch the rest

## 🙈 Ignore These (npm/build artifacts)

- `node_modules/` - Dependencies (auto-generated)
- `package-lock.json` - Dependency lock file (auto-managed)
- Workspace `package.json` files - Auto-managed

## ✨ The Clean Mental Model

Think of it as:
1. **One .env file** - all config
2. **apps/api/src/** - write your backend code here
3. **packages/database/prisma/schema.prisma** - define your database
4. **Root commands** - `npm run dev`, `npm run db:push`

Everything else is plumbing that just works.
