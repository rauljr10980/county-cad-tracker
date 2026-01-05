# Railway Deployment Guide

## Prerequisites
- GitHub account
- Railway account (sign up at https://railway.app)
- PostgreSQL database (Railway provides this)

## Step 1: Prepare Your Code

The code is already configured for Railway deployment. Here's what's included:

### Database Schema (Prisma)
- ✅ PostgreSQL schema with proper indexes
- ✅ User management with roles
- ✅ Property management
- ✅ Task delegation with full audit trail
- ✅ Notes with author tracking
- ✅ Optimized for 50k+ properties

### API Endpoints
- ✅ Authentication (JWT-based)
- ✅ Properties CRUD with filtering
- ✅ Tasks with assignment and tracking
- ✅ Notes management
- ✅ Dashboard statistics
- ✅ Pagination support

## Step 2: Push to GitHub

```bash
git add .
git commit -m "Add PostgreSQL backend with Prisma and Railway config"
git push origin main
```

## Step 3: Deploy to Railway

### Option A: Deploy via Railway Dashboard (Recommended)

1. **Go to Railway**: https://railway.app
2. **Click "New Project"**
3. **Select "Deploy from GitHub repo"**
4. **Select your repository**: `county-cad-tracker`
5. **Railway will automatically detect the Node.js project**

### Option B: Deploy via Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init

# Link to your GitHub repo
railway link

# Deploy
railway up
```

## Step 4: Add PostgreSQL Database

1. **In your Railway project, click "New"**
2. **Select "Database"**
3. **Choose "PostgreSQL"**
4. **Railway will automatically create a database and set `DATABASE_URL`**

## Step 5: Set Environment Variables

In Railway dashboard, go to your service → **Variables** → Add these:

```bash
DATABASE_URL=postgresql://... (automatically set by Railway)
JWT_SECRET=your-super-secret-key-here-change-this
NODE_ENV=production
PORT=8080
ALLOWED_ORIGINS=https://rauljr10980.github.io,http://localhost:5173
```

**Important**: Generate a strong JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Step 6: Run Migrations

Railway will automatically run migrations on deployment, but you can also trigger them manually:

```bash
# Via Railway CLI
railway run npm run prisma:migrate

# Or in Railway dashboard
# Settings → Deploy → Redeploy
```

## Step 7: Verify Deployment

1. **Check deployment logs** in Railway dashboard
2. **Get your service URL**: `https://your-service.railway.app`
3. **Test the API**:

```bash
curl https://your-service.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-05T..."
}
```

## Step 8: Create Admin User

Use Railway's database console or your API to create the first admin user:

```bash
# Via API (after deployment)
curl -X POST https://your-service.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@example.com",
    "password": "your-secure-password"
  }'
```

Then manually update the user's role to ADMIN in the database:

```sql
UPDATE users SET role = 'ADMIN' WHERE username = 'admin';
```

## Step 9: Update Frontend

Update your frontend API URL in `src/lib/api.ts`:

```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://your-service.railway.app';
```

Add to your `.env` or `.env.production`:

```
VITE_API_URL=https://your-service.railway.app
```

## API Endpoints Reference

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/session` - Check session
- `POST /api/auth/logout` - Logout

### Properties
- `GET /api/properties` - List properties (paginated, filtered)
- `GET /api/properties/:id` - Get single property
- `POST /api/properties` - Create property
- `PUT /api/properties/:id` - Update property
- `DELETE /api/properties/:id` - Delete property
- `GET /api/properties/stats/dashboard` - Dashboard statistics

### Tasks
- `GET /api/tasks` - List tasks (paginated, filtered)
- `GET /api/tasks/:id` - Get single task
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `POST /api/tasks/:id/outcome` - Record task outcome
- `DELETE /api/tasks/:id` - Delete task

### Notes
- `GET /api/notes?propertyId=xxx` - Get notes for property
- `GET /api/notes/:id` - Get single note
- `POST /api/notes` - Create note
- `PUT /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note

### Users
- `GET /api/users` - List users (admin/operator)
- `GET /api/users/:id` - Get user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (admin only)

## Database Schema

### Key Tables
- **users**: User accounts with roles (ADMIN, OPERATOR, VIEWER)
- **properties**: Property records with status and deal tracking
- **tasks**: Task delegation with assignment and status
- **task_activities**: Full audit trail (append-only)
- **notes**: Property notes with author tracking
- **payment_history**: Payment tracking

### Indexes (Optimized for 50k+ properties)
- Account number, status, deal stage
- Task status, due time, assignee
- Property + task combinations
- Timestamp-based queries

## Monitoring

- **Logs**: Railway Dashboard → Deployments → Logs
- **Metrics**: Railway Dashboard → Metrics
- **Database**: Railway Dashboard → PostgreSQL → Data

## Troubleshooting

### Migration Failures
```bash
# Check migration status
railway run npx prisma migrate status

# Reset database (DANGER: destroys all data)
railway run npx prisma migrate reset
```

### Connection Issues
- Verify `DATABASE_URL` is set correctly
- Check Railway service logs for errors
- Ensure PostgreSQL service is running

### API Errors
- Check environment variables are set
- Verify JWT_SECRET is configured
- Check CORS settings in ALLOWED_ORIGINS

## Scaling Considerations

- Railway's free tier has limitations
- For production: upgrade to Pro plan
- Consider adding Redis for caching
- Monitor database query performance with Prisma Studio

## Security Checklist

- ✅ Use strong JWT_SECRET (64+ random bytes)
- ✅ Enable HTTPS only (Railway does this automatically)
- ✅ Set proper CORS origins
- ✅ Use environment variables for secrets
- ✅ Implement rate limiting (already configured)
- ✅ Hash passwords with bcrypt (already configured)
- ✅ Validate all inputs (express-validator configured)

## Next Steps

1. Deploy to Railway
2. Configure environment variables
3. Run migrations
4. Create admin user
5. Update frontend API URL
6. Test all endpoints
7. Import your property data

## Support

- Railway Docs: https://docs.railway.app
- Prisma Docs: https://www.prisma.io/docs
- Issues: Open an issue on GitHub
