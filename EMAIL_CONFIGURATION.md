# Email Configuration Guide

This guide explains how to configure email sending for user registration and email verification.

## 🆓 Free Email Service Options

### Option 1: Gmail (Easiest - 500 emails/day FREE)
**Best for**: Quick setup, personal projects
**Free Limit**: 500 emails per day

Gmail is the easiest option to get started. You'll need to create an "App Password" since regular passwords won't work.

#### Step 1: Enable 2-Factor Authentication
1. Go to your Google Account: https://myaccount.google.com
2. Navigate to **Security** → **2-Step Verification**
3. Enable 2-Step Verification if not already enabled

#### Step 2: Create App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Select **Mail** and **Other (Custom name)**
3. Enter name: "County CAD Tracker"
4. Click **Generate**
5. **Copy the 16-character password** (you'll use this as SMTP_PASS)

#### Step 3: Set Environment Variables

**For Railway (Production):**
1. Go to your Railway project dashboard
2. Click on your backend service
3. Go to **Variables** tab
4. Add these variables:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
EMAIL_FROM=your-email@gmail.com
FRONTEND_URL=https://your-username.github.io/county-cad-tracker
```

**For Local Development:**
Create `functions/.env` file:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
EMAIL_FROM=your-email@gmail.com
FRONTEND_URL=http://localhost:8080
```

---

### Option 2: Brevo (formerly Sendinblue) - ⭐ RECOMMENDED

**Best free option!** Brevo offers 300 emails/day forever, better deliverability than Gmail, and easy setup.

**Free Limit**: 300 emails per day (forever)

#### Step 1: Create Brevo Account
1. Sign up at: https://www.brevo.com/signup
2. Verify your email address
3. Complete account setup

#### Step 2: Get SMTP Credentials
1. Go to: https://app.brevo.com/settings/smtp
2. Click **Generate** next to "SMTP Key" (if you don't have one)
3. **Copy your SMTP key**
4. Note your **SMTP server** and **port**:
   - Server: `smtp-relay.brevo.com`
   - Port: `587`
   - Login: Your Brevo account email

#### Step 3: Set Environment Variables

**For Railway:**
```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-brevo-email@example.com
SMTP_PASS=your-brevo-smtp-key-here
EMAIL_FROM=your-brevo-email@example.com
FRONTEND_URL=https://your-username.github.io/county-cad-tracker
```

**For Local Development (`functions/.env`):**
```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-brevo-email@example.com
SMTP_PASS=your-brevo-smtp-key-here
EMAIL_FROM=your-brevo-email@example.com
FRONTEND_URL=http://localhost:8080
```

---

### Option 3: SendGrid (100 emails/day FREE)

SendGrid offers a free tier (100 emails/day) and is reliable for production.

#### Step 1: Create SendGrid Account
1. Sign up at: https://signup.sendgrid.com
2. Verify your email address
3. Complete account setup

#### Step 2: Create API Key
1. Go to: https://app.sendgrid.com/settings/api_keys
2. Click **Create API Key**
3. Name it: "County CAD Tracker"
4. Select **Full Access** or **Restricted Access** (with Mail Send permission)
5. Click **Create & View**
6. **Copy the API key** (you'll only see it once!)

#### Step 3: Set Environment Variables

**For Railway:**
```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key-here
EMAIL_FROM=noreply@yourdomain.com
FRONTEND_URL=https://your-username.github.io/county-cad-tracker
```

**For Local Development (`functions/.env`):**
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key-here
EMAIL_FROM=noreply@yourdomain.com
FRONTEND_URL=http://localhost:8080
```

---

### Option 4: Resend (3,000 emails/month FREE)

**Note**: Resend uses a REST API, not SMTP. Would require code changes to use.

**Free Limit**: 3,000 emails per month

---

### Option 5: Mailgun (5,000 emails/month FREE for 3 months)

**Free Limit**: 5,000 emails/month for first 3 months, then paid

1. Sign up at: https://signup.mailgun.com
2. Verify your domain (or use sandbox domain for testing)
3. Get SMTP credentials from dashboard

**For Railway:**
```
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@yourdomain.mailgun.org
SMTP_PASS=your-mailgun-smtp-password
EMAIL_FROM=noreply@yourdomain.com
```

---

### Option 6: Other SMTP Providers

You can use any SMTP provider. Here are common ones:

#### Outlook/Hotmail
```
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
EMAIL_FROM=your-email@outlook.com
```

#### Yahoo Mail
```
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_USER=your-email@yahoo.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@yahoo.com
```

#### Custom SMTP Server
```
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_USER=your-username
SMTP_PASS=your-password
EMAIL_FROM=noreply@yourdomain.com
```

---

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `SMTP_HOST` | SMTP server hostname | Yes | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | Yes | `587` |
| `SMTP_USER` or `EMAIL_USER` | SMTP username/email | Yes | - |
| `SMTP_PASS` or `EMAIL_PASSWORD` | SMTP password/app password | Yes | - |
| `EMAIL_FROM` | Sender email address | Yes | - |
| `FRONTEND_URL` | Your frontend URL for verification links | Yes | - |

---

## Setting Variables in Railway

1. **Go to Railway Dashboard**: https://railway.app
2. **Select your project** → **Select your backend service**
3. **Click on "Variables" tab**
4. **Click "New Variable"** for each variable
5. **Enter the variable name and value**
6. **Click "Add"**
7. **Redeploy** your service (Railway will auto-redeploy when you add variables)

---

## Setting Variables for Local Development

1. **Create `functions/.env` file** (if it doesn't exist)
2. **Add all variables** in the format: `VARIABLE_NAME=value`
3. **Save the file**
4. **Restart your local server** if it's running

Example `functions/.env`:
```env
# Google Cloud Storage
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
GCP_PROJECT_ID=your-project-id
GCS_BUCKET=county-cad-tracker-files

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
FRONTEND_URL=http://localhost:8080
```

---

## Testing Email Configuration

### Test Without Email (Development Mode)

If you don't configure email settings, the system will:
- Still create user accounts
- Log verification links to the console
- Include verification URL in API response

This is useful for development and testing.

### Test With Email

1. **Set up email variables** (see above)
2. **Restart your backend** (Railway will auto-restart)
3. **Try registering a new user**
4. **Check your email inbox** for verification email
5. **Click the verification link**

---

## Troubleshooting

### "Email not configured" in logs
- **Solution**: Set the required environment variables (see above)

### "Authentication failed" error
- **Gmail**: Make sure you're using an App Password, not your regular password
- **SendGrid**: Verify your API key is correct
- **Other**: Check username/password are correct

### "Connection timeout" error
- **Solution**: Check SMTP_HOST and SMTP_PORT are correct for your provider
- Some networks block port 587, try port 465 with `secure: true`

### Emails not received
- **Check spam folder**
- **Verify EMAIL_FROM address** is valid
- **Check SendGrid/SMTP provider logs** for delivery status
- **Verify FRONTEND_URL** is correct (for verification links)

### Verification link doesn't work
- **Check FRONTEND_URL** matches your actual frontend URL
- **Verify the link** wasn't expired (24 hour expiry)
- **Check browser console** for errors

---

## Security Best Practices

1. **Never commit `.env` files** to git (already in `.gitignore`)
2. **Use App Passwords** instead of regular passwords
3. **Rotate credentials** periodically
4. **Use environment variables** in Railway, not hardcoded values
5. **Limit email sending** to prevent abuse (add rate limiting in production)

---

## 🆓 Free Tier Comparison

| Service | Free Limit | Setup | Reliability | Best For |
|---------|-----------|-------|-------------|----------|
| **Gmail** | 500/day | ⭐ Easy | ⭐⭐ Good | Quick start |
| **Brevo** | 300/day | ⭐⭐ Medium | ⭐⭐⭐ Excellent | **Recommended** |
| **SendGrid** | 100/day | ⭐⭐ Medium | ⭐⭐⭐ Excellent | Professional |
| **Resend** | 3,000/month | ⭐⭐⭐ Hard | ⭐⭐⭐ Excellent | High volume |
| **Mailgun** | 5,000/month (3mo) | ⭐⭐ Medium | ⭐⭐⭐ Excellent | Temporary boost |

**Our Recommendation**: 
- **Start with Gmail** (easiest setup)
- **Switch to Brevo** when you need better reliability (300/day is plenty for user registration)

## Production Recommendations

For production, consider:
- **Brevo** or **SendGrid** (best free options with good deliverability)
- **Custom domain** for EMAIL_FROM (e.g., noreply@yourdomain.com)
- **SPF/DKIM records** configured for your domain
- **Rate limiting** on registration endpoint
- **Email templates** (currently using simple HTML)

---

## Need Help?

If you're having issues:
1. Check Railway logs: Railway Dashboard → Your Service → Deployments → View Logs
2. Check backend console logs for email errors
3. Verify all environment variables are set correctly
4. Test with a simple SMTP client first (like `telnet` or `curl`)

