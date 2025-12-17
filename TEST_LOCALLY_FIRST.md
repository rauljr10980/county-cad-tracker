# Test Locally First (No Billing Needed!)

You can test everything locally without enabling billing.

## Setup

### 1. Create Local Config

**Create `.env` in project root:**
```env
VITE_API_URL=http://localhost:8080
```

### 2. Start Backend

**Terminal 1:**
```bash
cd functions
npm start
```

Server runs on: http://localhost:8080

### 3. Start Frontend

**Terminal 2:**
```bash
npm run dev
```

Frontend runs on: http://localhost:8080 (or 8080)

### 4. Test Upload

1. Go to: http://localhost:8080
2. Upload a file
3. It will upload to Google Cloud Storage
4. Check your bucket to see the file!

## What Works Locally

- ✅ File uploads to Google Cloud Storage
- ✅ File processing
- ✅ Property extraction
- ✅ Comparisons
- ✅ All features!

## After Testing

Once you're confident everything works:
1. Set up billing alerts (see BILLING_SAFETY.md)
2. Enable billing
3. Deploy to Cloud Run

## Benefits

- ✅ Test everything first
- ✅ No billing needed
- ✅ Make sure it works
- ✅ Then deploy with confidence

