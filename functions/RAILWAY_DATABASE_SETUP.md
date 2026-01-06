# Railway Database Setup - Fix Missing Tables

## Problem
Tables weren't created because DATABASE_URL is missing from web service variables.

## Solution: Link PostgreSQL to Web Service

### Step 1: Get DATABASE_URL from PostgreSQL Service
1. In Railway, click on your **PostgreSQL service** (the elephant icon)
2. Go to **Variables** tab
3. Find `DATABASE_URL` 
4. Copy the value (it looks like: `postgresql://postgres:password@host:port/railway`)

### Step 2: Add DATABASE_URL to Web Service
1. Go back to your **county-cad-tracker** web service (the one with GitHub icon)
2. Go to **Variables** tab
3. Click **"+ New Variable"**
4. Name: `DATABASE_URL`
5. Value: Paste the DATABASE_URL you copied from PostgreSQL
6. Click **"Add"**

### Step 3: Redeploy Web Service
1. Go to **Deployments** tab
2. Click the three dots (⋯) on latest deployment
3. Click **"Redeploy"**
4. Wait for deployment to complete

### Step 4: Verify Tables Created
1. Go to PostgreSQL service → **Database** → **Data** tab
2. You should now see all your tables!

## Alternative: Railway Auto-Link (Easier)

Railway can automatically link services:

1. In your **web service**, go to **Settings** tab
2. Look for **"Service Dependencies"** or **"Linked Services"**
3. Click **"Add Dependency"** or **"Link Service"**
4. Select your **PostgreSQL** service
5. Railway will automatically add DATABASE_URL
6. Redeploy your web service

This is the recommended way!



