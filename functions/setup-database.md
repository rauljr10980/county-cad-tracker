# Database Setup Instructions

## Option 1: Railway will create tables automatically (Recommended)

When Railway deploys your service, it automatically runs:
- `prisma migrate deploy` (creates tables)
- Your app starts

**Just redeploy your service on Railway** and the tables will be created automatically.

## Option 2: Create tables manually (if needed)

1. Get DATABASE_URL from Railway:
   - Go to PostgreSQL service → Variables tab
   - Copy the DATABASE_URL value

2. Set it locally:
   - Create a `.env` file in the `functions` folder
   - Add: `DATABASE_URL="your-connection-string-here"`

3. Run:
   ```bash
   cd functions
   npx prisma db push
   ```

This will create all tables in your PostgreSQL database.

