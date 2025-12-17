# Billing Safety Guide

## ✅ Free Tier Protection

**Google Cloud gives you:**
- **$300 free credit** for 90 days
- **Cloud Run free tier:** 2 million requests/month, 360,000 GB-seconds
- **Cloud Storage free tier:** 5 GB storage, 1 GB download/month

## Your Usage Estimate

**For your county CAD tracker:**
- **100 file uploads/month** = ~100 requests
- **File processing** = ~200 requests
- **API calls** = ~1,000 requests/month
- **Storage:** ~500 MB (100 files × 5MB each)

**Total cost: $0/month** ✅ (well within free tier)

## Set Up Billing Alerts (IMPORTANT!)

**Before enabling billing, set up alerts:**

1. **Go to:** https://console.cloud.google.com/billing
2. **Click on your billing account**
3. **Go to "Budgets & alerts"**
4. **Click "Create Budget"**
5. **Set budget:** $5/month (or whatever you're comfortable with)
6. **Set alerts at:** 50%, 90%, 100%
7. **Add your email** for notifications

**This way:**
- ✅ You'll get notified if you approach your limit
- ✅ You can stop services if needed
- ✅ No surprise charges

## Set Spending Limits

**You can also set a hard limit:**

1. **Go to:** https://console.cloud.google.com/billing
2. **Click "Budgets & alerts"**
3. **Create budget with:** "Alert only" (or "Stop services" if available)

## Monitor Usage

**Check usage anytime:**
- **Go to:** https://console.cloud.google.com/billing
- **Click "Reports"** to see current usage
- **Set up daily email reports**

## Cost Breakdown

**Cloud Run:**
- Free: 2M requests/month
- Your usage: ~1,000 requests/month
- **Cost: $0** ✅

**Cloud Storage:**
- Free: 5 GB storage
- Your usage: ~500 MB
- **Cost: $0** ✅

**Total: $0/month** for your usage level

## Alternative: Test Locally First

**You can test everything locally without billing:**

```bash
# Terminal 1: Start backend
cd functions
npm start

# Terminal 2: Start frontend  
npm run dev
```

**Create `.env` in project root:**
```env
VITE_API_URL=http://localhost:8080
```

This lets you test everything before enabling billing!

## Recommendation

1. **Set up billing alerts first** (before enabling)
2. **Set a $5/month budget** with alerts
3. **Enable billing** (you'll use free tier)
4. **Monitor usage** in billing dashboard
5. **Deploy and test**

## Bottom Line

- **Free tier covers your usage** ✅
- **Set alerts to be safe** ✅
- **Monitor regularly** ✅
- **You can always stop services** ✅

Your usage is very light - you'll stay in the free tier!

