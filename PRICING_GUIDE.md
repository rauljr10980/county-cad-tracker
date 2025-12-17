# Firebase Pricing Guide for County CAD Tracker

## Free Tier Limits (Spark Plan)

### Cloud Functions
- ✅ **2 million invocations/month** (FREE)
- 💰 After: $0.40 per million invocations

**Your usage**: ~10-50 invocations per file upload
- 100 uploads/month = ~5,000 invocations (well within free tier)

### Firestore Database
- ✅ **50,000 reads/day** (FREE)
- ✅ **20,000 writes/day** (FREE)  
- ✅ **1 GB storage** (FREE)
- 💰 After: $0.18 per GB storage, $0.06 per 100K reads, $0.18 per 100K writes

**Your usage** (per file with 50K properties):
- Reads: ~1,000 (checking previous file)
- Writes: ~50,000 (storing properties)
- Storage: ~0.1 MB per property = ~5 MB per file

**Monthly estimate**:
- 10 files/month = 500K writes (exceeds free tier)
- 10 files/month = 50 MB storage (well within free tier)

### Cloud Storage
- ✅ **5 GB storage** (FREE)
- ✅ **1 GB download/month** (FREE)
- 💰 After: $0.026 per GB storage, $0.12 per GB download

**Your usage**:
- Excel files: ~1-5 MB each
- 100 files = ~500 MB (well within free tier)

## Realistic Cost Scenarios

### Scenario 1: Light Usage (FREE)
- **5-10 file uploads/month**
- **~25K properties per file**
- **1-2 users**
- **Cost: $0/month** ✅

### Scenario 2: Moderate Usage (~$5-15/month)
- **20-50 file uploads/month**
- **~50K properties per file**
- **5-10 users**
- **Cost**: Mostly Firestore writes (~$5-15/month)

### Scenario 3: Heavy Usage (~$30-100/month)
- **100+ file uploads/month**
- **~100K properties per file**
- **Many users, frequent queries**
- **Cost**: Firestore + Functions (~$30-100/month)

## How to Stay Free

1. **Batch uploads**: Upload fewer, larger files instead of many small ones
2. **Optimize writes**: Only store changed properties (not all properties every time)
3. **Use indexes wisely**: Don't create unnecessary indexes
4. **Monitor usage**: Set up billing alerts in Google Cloud Console

## Setting Up Billing Alerts

1. Go to [Google Cloud Console](https://console.cloud.google.com/billing)
2. Click "Budgets & alerts"
3. Create a budget (e.g., $10/month)
4. Set email alerts at 50%, 90%, 100%

## Cost Optimization Tips

### 1. Reduce Firestore Writes
Instead of storing all properties every time, only store:
- New properties
- Changed properties
- Reference previous file for unchanged properties

### 2. Use Cloud Storage for Large Data
- Store full Excel files in Cloud Storage (cheaper)
- Only store property metadata in Firestore

### 3. Implement Caching
- Cache comparison results
- Don't re-process unchanged files

### 4. Clean Up Old Data
- Archive old files to Cloud Storage
- Delete old Firestore documents after archiving

## Monitoring Your Costs

```bash
# Check current usage
firebase functions:log

# View billing in console
# https://console.cloud.google.com/billing
```

## Free Tier Summary

**You'll likely stay FREE if**:
- ✅ Uploading < 10 files/month
- ✅ < 25K properties per file
- ✅ < 5 active users
- ✅ Basic querying

**You'll pay if**:
- ❌ Uploading 50+ files/month
- ❌ > 50K properties per file
- ❌ Many users querying frequently
- ❌ Storing > 1GB in Firestore

## Bottom Line

**For development and small-scale use: FREE** ✅

**For production with moderate usage: ~$5-20/month**

**For heavy production use: ~$30-100/month**

The free tier is very generous for getting started and testing. You can always upgrade to Blaze Plan (pay-as-you-go) only when you exceed free limits.

## Need Help?

- [Firebase Pricing Calculator](https://firebase.google.com/pricing)
- [Set up billing alerts](https://console.cloud.google.com/billing)
- Monitor usage in Firebase Console

