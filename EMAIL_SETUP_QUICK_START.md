# Email Setup - Quick Start (FREE Options)

## 🆓 Best Free Options

### Option 1: Gmail (Easiest - 500 emails/day)
**Best for**: Getting started quickly, personal projects
**Limit**: 500 emails per day

### Option 2: Brevo (formerly Sendinblue) (300 emails/day)
**Best for**: More reliable than Gmail, good free tier
**Limit**: 300 emails per day forever

### Option 3: SendGrid (100 emails/day)
**Best for**: Professional setup, reliable delivery
**Limit**: 100 emails per day forever

### Option 4: Resend (3,000 emails/month)
**Best for**: Modern API, generous free tier
**Limit**: 3,000 emails per month

---

## 🚀 Quick Setup: Gmail (5 Minutes)

### Step 1: Get Gmail App Password (2 min)
1. Go to: https://myaccount.google.com/apppasswords
2. Select **Mail** → **Other (Custom name)** → Enter "County CAD Tracker"
3. Click **Generate** and **copy the 16-character password**

### Step 2: Add Variables to Railway (2 min)
1. Go to: https://railway.app
2. Select your project → Backend service → **Variables** tab
3. Click **New Variable** and add these:

```
SMTP_HOST = smtp.gmail.com
SMTP_PORT = 587
SMTP_USER = your-email@gmail.com
SMTP_PASS = your-16-char-app-password
EMAIL_FROM = your-email@gmail.com
FRONTEND_URL = https://rauljr10980.github.io/county-cad-tracker
```

**Important**: Replace:
- `your-email@gmail.com` with your actual Gmail address
- `your-16-char-app-password` with the app password from Step 1
- `rauljr10980.github.io/county-cad-tracker` with your actual GitHub Pages URL

### Step 3: Test It!
Railway auto-redeploys. Then register a new user and check your email!

---

## 🎯 Recommended: Brevo (300 emails/day - FREE Forever)

**Why Brevo?** More reliable than Gmail, better deliverability, 300/day is plenty for user registration.

### Setup Steps:

1. **Sign up**: https://www.brevo.com/signup (free account)
2. **Verify your email** and complete setup
3. **Go to**: Settings → SMTP & API → SMTP
4. **Copy your SMTP credentials**:
   - Server: `smtp-relay.brevo.com`
   - Port: `587`
   - Login: Your Brevo email
   - Password: Your SMTP key (click "Generate" if needed)

5. **Add to Railway**:
```
SMTP_HOST = smtp-relay.brevo.com
SMTP_PORT = 587
SMTP_USER = your-brevo-email@example.com
SMTP_PASS = your-brevo-smtp-key
EMAIL_FROM = your-brevo-email@example.com
FRONTEND_URL = https://rauljr10980.github.io/county-cad-tracker
```

---

## 📧 Other Free Options

### SendGrid (100/day - FREE)
```
SMTP_HOST = smtp.sendgrid.net
SMTP_PORT = 587
SMTP_USER = apikey
SMTP_PASS = your-sendgrid-api-key
EMAIL_FROM = verified-sender@yourdomain.com
```

### Resend (3,000/month - FREE)
**Note**: Resend uses API, not SMTP. Would need code changes.

### Mailgun (5,000/month - FREE for 3 months)
```
SMTP_HOST = smtp.mailgun.org
SMTP_PORT = 587
SMTP_USER = postmaster@yourdomain.mailgun.org
SMTP_PASS = your-mailgun-password
EMAIL_FROM = noreply@yourdomain.com
```

---

## 💻 For Local Development

Create `functions/.env` file:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
FRONTEND_URL=http://localhost:8080
```

---

## 🆓 Free Tier Comparison

| Service | Free Limit | Setup Difficulty | Best For |
|---------|-----------|-------------------|----------|
| **Gmail** | 500/day | ⭐ Easy | Quick start |
| **Brevo** | 300/day | ⭐⭐ Medium | Best balance |
| **SendGrid** | 100/day | ⭐⭐ Medium | Professional |
| **Resend** | 3,000/month | ⭐⭐⭐ Hard | High volume |
| **Mailgun** | 5,000/month (3mo) | ⭐⭐ Medium | Temporary |

**Recommendation**: Start with **Gmail** (easiest), then switch to **Brevo** for better reliability.

---

## Need More Help?

See `EMAIL_CONFIGURATION.md` for detailed instructions and troubleshooting.

