# Google Cloud API Key Setup

## Get Your API Keys / Service Account

### Option 1: Service Account (Recommended for Backend)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **IAM & Admin** > **Service Accounts**
3. Click **Create Service Account**
4. Name it: `county-cad-tracker-service`
5. Grant roles:
   - **Cloud Storage Admin** (for file uploads)
   - **Cloud Datastore User** (if using Firestore)
   - **Cloud Functions Invoker** (if using functions)
6. Click **Create Key** > **JSON**
7. Download the JSON file (keep it secret!)

### Option 2: API Key (For Client-Side)

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **API Key**
3. Restrict the key:
   - **Application restrictions**: HTTP referrers (your domain)
   - **API restrictions**: Enable only needed APIs
4. Copy the API key

## Where to Put Your Credentials

### For Backend (Service Account JSON):
1. Save the JSON file as `functions/service-account-key.json`
2. Add to `.gitignore` (already done)
3. Set environment variable: `GOOGLE_APPLICATION_CREDENTIALS`

### For Frontend (API Key):
1. Add to `.env` file:
   ```
   VITE_GOOGLE_CLOUD_API_KEY=your-api-key-here
   ```

## Enable Required APIs

Enable these APIs in Google Cloud Console:
- Cloud Storage API
- Cloud Firestore API (if using Firestore)
- Cloud Functions API (if using functions)

