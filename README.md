# JZ Comment Studio — Deploy to Vercel + Neon

## What this does
- Fetches all unresponded YouTube comments from your channel
- Generates replies in Jason Zac's voice using Claude AI (server-side)
- Posts replies via YouTube API — no tokens needed after setup
- Stores refresh token in Neon DB — permanent access, auto-refreshes

## One-time Setup (15 minutes total)

### 1. Neon Database
Create a new project called "jz-comment-studio" at console.neon.tech
Copy the connection string (DATABASE_URL)

### 2. Google OAuth App
Go to console.cloud.google.com → New Project → "JZ Comment Studio"
Enable YouTube Data API v3
Go to APIs & Services → Credentials → Create OAuth 2.0 Client ID
  - Application type: Web application
  - Authorized redirect URI: https://YOUR-APP.vercel.app/api/auth/callback
Copy GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET

### 3. Deploy to Vercel
Push this repo to GitHub, then:
  vercel deploy
  
Add these environment variables in Vercel dashboard:
  DATABASE_URL=          (from Neon)
  GOOGLE_CLIENT_ID=      (from Google Cloud)
  GOOGLE_CLIENT_SECRET=  (from Google Cloud)
  NEXTAUTH_URL=          https://your-app.vercel.app
  NEXTAUTH_SECRET=       (run: openssl rand -base64 32)
  ANTHROPIC_API_KEY=     sk-ant-api03-...

### 4. Initialize DB
Visit: https://your-app.vercel.app/api/init
You should see: {"ok":true}

### 5. Connect YouTube (one time only)
Visit your app → click "Connect YouTube Account"
Sign in as jason@nathanielschool.com
Done — refresh token stored permanently in Neon

## Usage
Fetch → Generate All → Approve All → Post All
Done. 50 comments replied to in ~2 minutes.
