# Email Setup - Quick Start

## For Railway (Production) - 5 Minutes

### Step 1: Get Gmail App Password (2 min)
1. Go to: https://myaccount.google.com/apppasswords
2. Select **Mail** → **Other (Custom name)** → Enter "County CAD Tracker"
3. Click **Generate** and **copy the 16-character password**

### Step 2: Add Variables to Railway (2 min)
1. Go to: https://railway.app
2. Select your project → Backend service → **Variables** tab
3. Click **New Variable** and add these one by one:

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

### Step 3: Wait for Redeploy (1 min)
Railway will automatically redeploy when you add variables. Check the **Deployments** tab to see when it's done.

### Step 4: Test It!
1. Go to your app
2. Click **Login** → **Sign up**
3. Create an account
4. Check your email for verification link
5. Click the link to verify

---

## For Local Development

Create `functions/.env` file with:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
EMAIL_FROM=your-email@gmail.com
FRONTEND_URL=http://localhost:8080
```

Then restart your backend server.

---

## Alternative: SendGrid (Better for Production)

If you want to use SendGrid instead of Gmail:

1. Sign up: https://signup.sendgrid.com
2. Create API Key: https://app.sendgrid.com/settings/api_keys
3. Use these variables in Railway:

```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
EMAIL_FROM=noreply@yourdomain.com
FRONTEND_URL=https://rauljr10980.github.io/county-cad-tracker
```

---

## Need More Help?

See `EMAIL_CONFIGURATION.md` for detailed instructions and troubleshooting.

