# 🚀 Deployment Guide

This guide will walk you through deploying your multi-domain authentication system step by step.

## Phase 1: Setup Google OAuth

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name your project (e.g., "Multi-Domain Auth Test")
4. Click "Create"

### 2. Enable Google OAuth

1. Navigate to "APIs & Services" → "Library"
2. Search for "Google+ API" and enable it
3. Go to "APIs & Services" → "Credentials"
4. Click "Create Credentials" → "OAuth 2.0 Client IDs"
5. Configure consent screen:
   - User Type: External
   - App name: Your app name
   - User support email: Your email
   - Developer contact: Your email

### 3. Create OAuth Client

1. Application type: Web application
2. Name: "Multi-Domain Auth"
3. Authorized redirect URIs: `https://your-backend-url.com/auth/google/callback`
   - **Important**: You'll update this after deploying your backend
4. Save and copy Client ID & Client Secret

## Phase 2: Deploy Backend API

### Option A: Deploy to Railway (Recommended)

1. Install Railway CLI:

   ```bash
   npm install -g @railway/cli
   ```

2. Login and deploy:

   ```bash
   cd backend
   railway login
   railway init
   railway up
   ```

3. Set environment variables in Railway dashboard:
   ```
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   JWT_SECRET=generate_a_random_32_char_string
   BACKEND_URL=https://your-railway-app.railway.app
   NODE_ENV=production
   ```

### Option B: Deploy to Render

1. Connect your GitHub repo to [Render](https://render.com)
2. Create new Web Service
3. Root directory: `backend`
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variables (same as above)

### Option C: Deploy to Heroku

```bash
cd backend
heroku create your-auth-api
heroku config:set GOOGLE_CLIENT_ID=your_client_id
heroku config:set GOOGLE_CLIENT_SECRET=your_client_secret
heroku config:set JWT_SECRET=your_jwt_secret
heroku config:set NODE_ENV=production
git add .
git commit -m "Deploy backend"
git push heroku main
```

## Phase 3: Update Google OAuth Settings

1. Go back to Google Cloud Console → Credentials
2. Edit your OAuth 2.0 Client ID
3. Update redirect URI with your deployed backend URL:
   ```
   https://your-actual-backend-url.com/auth/google/callback
   ```

## Phase 4: Deploy Frontend to Vercel

### 1. Update Configuration

First, update `vercel.json` with your backend URL:

```json
{
  "rewrites": [
    {
      "source": "/auth/:path*",
      "destination": "https://your-actual-backend-url.com/auth/:path*"
    },
    {
      "source": "/api/:path*",
      "destination": "https://your-actual-backend-url.com/api/:path*"
    }
  ]
}
```

### 2. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login and deploy
vercel login
vercel --prod
```

### 3. Add Custom Domains

1. Go to Vercel Dashboard → Your Project → Domains
2. Add your custom domains:
   - `site-1.com`
   - `site-2.com`
   - `subdomain.yourplatform.com`
3. Configure DNS as instructed by Vercel

## Phase 5: Testing

### Local Testing First

1. Start backend locally:

   ```bash
   cd backend
   npm run dev
   ```

2. Start frontend locally:

   ```bash
   npm run dev
   ```

3. Test on `localhost:3000`

### Production Testing

1. Visit your deployed domains
2. Click "Login with Google"
3. Complete OAuth flow
4. Verify you're logged in
5. Open new tab to different domain
6. Verify you're NOT logged in (session isolation)

## Phase 6: Domain Configuration Examples

### For Testing with Localhost

Add to your `/etc/hosts` (macOS/Linux) or `C:\Windows\System32\drivers\etc\hosts` (Windows):

```
127.0.0.1 site1.localhost
127.0.0.1 site2.localhost
```

Then access:

- `http://site1.localhost:3000`
- `http://site2.localhost:3000`

### For Production Domains

Configure DNS records:

**For root domains (site-1.com):**

```
Type: A
Name: @
Value: 76.76.19.61 (Vercel's IP)
```

**For subdomains (www.site-1.com):**

```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

## 🔍 Verification Checklist

- [ ] Backend deployed and accessible
- [ ] Google OAuth credentials configured
- [ ] Frontend deployed to Vercel
- [ ] Custom domains added and verified
- [ ] DNS records configured
- [ ] Login works on each domain
- [ ] Sessions are isolated between domains
- [ ] JWTs contain correct domain information
- [ ] Logout works properly

## 🚨 Troubleshooting

### Backend Issues

```bash
# Check backend health
curl https://your-backend-url.com/health

# Check logs
railway logs  # or heroku logs --tail
```

### Frontend Issues

```bash
# Check Vercel deployment logs
vercel logs

# Test rewrites locally
vercel dev
```

### Common Problems

1. **OAuth Error**: Check redirect URI matches exactly
2. **CORS Issues**: Ensure backend allows your domains
3. **Vercel Rewrites**: Verify vercel.json syntax
4. **Domain Issues**: Check DNS propagation (can take 24-48 hours)

## 🎉 Success!

Once everything is working, you'll have:

- ✅ Multiple domains served by single Next.js app
- ✅ Centralized authentication via your backend
- ✅ Isolated sessions per domain
- ✅ Seamless user experience
- ✅ Production-ready architecture

This proves the theory that Vercel can indeed host multiple user sites with centralized auth but isolated sessions!
