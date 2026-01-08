# Upload Troubleshooting Guide

If you're seeing "Failed to fetch" or "Upload Error" when trying to upload files, follow these steps:

## Quick Fix Checklist

### 1. Is the Backend Server Running?

The backend server **must be running** for uploads to work.

**Start the backend server:**
```bash
cd functions
npm install  # If you haven't already
npm run dev   # For development (with auto-reload)
# OR
npm start    # For production mode
```

You should see:
```
✅ Database connected successfully
╔═══════════════════════════════════════════════════════════╗
║   County CAD Tracker API v3.0                             ║
║   Server: http://0.0.0.0:8080                              ║
╚═══════════════════════════════════════════════════════════╝
```

**Keep this terminal open** - the server needs to keep running.

### 2. Check API URL Configuration

The frontend needs to know where the backend is running.

**For local development:**
1. Check your `.env` file in the project root
2. It should contain:
   ```env
   VITE_API_URL=http://localhost:8080
   ```
3. If it's not set or wrong, add/update it
4. **Restart the frontend** after changing `.env`

**For production (Railway/deployed):**
- The API URL should be your Railway backend URL
- Check `src/lib/api.ts` - it should auto-detect production

### 3. Test the Connection

**Option A: Use the test script**
```bash
cd functions
node test-upload-endpoint.js
```

**Option B: Test in browser console**
Open browser DevTools (F12) → Console, then run:
```javascript
fetch('http://localhost:8080/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

If you see `{ status: 'healthy' }`, the server is running correctly.

### 4. Check CORS Configuration

If you see CORS errors in the browser console:
- The backend CORS is configured to allow `http://localhost:5173` (Vite default)
- If your frontend runs on a different port, update `functions/src/index.js`:
  ```javascript
  const allowedOrigins = [
    'http://localhost:5173',  // Add your port here
    'http://localhost:8081',
    // ... other origins
  ];
  ```

### 5. Check Database Connection

The backend needs a PostgreSQL database connection.

**Verify DATABASE_URL is set:**
```bash
cd functions
# Check if .env file exists and has DATABASE_URL
cat .env | grep DATABASE_URL
```

If missing, add it:
```env
DATABASE_URL=postgresql://user:password@host:port/database
```

### 6. Common Error Messages

**"Failed to fetch"**
- ✅ Server not running → Start with `cd functions && npm run dev`
- ✅ Wrong API URL → Check `.env` file
- ✅ CORS issue → Check browser console for CORS errors

**"Cannot connect to server"**
- ✅ Server not running
- ✅ Wrong port (should be 8080)
- ✅ Firewall blocking connection

**"Database error"**
- ✅ DATABASE_URL not set
- ✅ Database not accessible
- ✅ Run migrations: `cd functions && npx prisma migrate deploy`

**"File too large"**
- ✅ Maximum file size is 100MB
- ✅ Split large files into smaller batches

## Step-by-Step Setup

### First Time Setup

1. **Install backend dependencies:**
   ```bash
   cd functions
   npm install
   ```

2. **Set up database:**
   ```bash
   # Make sure DATABASE_URL is in functions/.env
   npx prisma generate
   npx prisma migrate deploy
   ```

3. **Start backend server:**
   ```bash
   npm run dev
   ```
   Keep this terminal open!

4. **In a NEW terminal, start frontend:**
   ```bash
   # In project root (not functions folder)
   npm install  # If not done
   npm run dev
   ```

5. **Test upload:**
   - Open http://localhost:5173 (or the port shown)
   - Go to Upload tab
   - Try uploading a small Excel file

## Still Not Working?

1. **Check browser console** (F12) for detailed error messages
2. **Check backend logs** in the terminal where you ran `npm run dev`
3. **Verify both servers are running:**
   - Backend: http://localhost:8080/health should return `{ status: 'healthy' }`
   - Frontend: Should be accessible in browser

4. **Test the upload endpoint directly:**
   ```bash
   cd functions
   node test-upload-endpoint.js
   ```

## Production Deployment

If you're deploying to Railway/Render/etc:

1. **Set environment variables** in your hosting platform:
   - `DATABASE_URL` - Your PostgreSQL connection string
   - `PORT` - Usually auto-set by platform
   - `NODE_ENV=production`

2. **The frontend** should point to your deployed backend URL:
   ```env
   VITE_API_URL=https://your-backend-url.railway.app
   ```

3. **Rebuild frontend** after changing API URL:
   ```bash
   npm run build
   ```

## Need More Help?

- Check backend logs for detailed error messages
- Check browser DevTools → Network tab to see the actual HTTP request/response
- Verify all environment variables are set correctly
- Make sure both frontend and backend are using compatible versions


