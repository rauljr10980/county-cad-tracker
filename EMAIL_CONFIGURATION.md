# Email Configuration Guide

This guide explains how to configure email sending for user registration and email verification.

## Quick Setup Options

### Option 1: Gmail (Easiest for Testing)

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

### Option 2: SendGrid (Recommended for Production)

SendGrid offers a free tier (100 emails/day) and is more reliable for production.

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

### Option 3: Other SMTP Providers

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

## Production Recommendations

For production, consider:
- **SendGrid** or **Mailgun** (more reliable than Gmail)
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

