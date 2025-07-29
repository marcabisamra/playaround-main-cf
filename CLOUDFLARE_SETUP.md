# Cloudflare Workers Setup Guide

This guide will help you manually set up your multi-domain marketplace on pure Cloudflare Workers.

## 🎯 Why Cloudflare Workers?

- **10x Better Performance**: <1ms cold starts vs 100-500ms on Vercel
- **5-10x Lower Costs**: Pay per request instead of server time
- **Global Edge Computing**: 300+ locations worldwide
- **No Backend Server**: Eliminate Express server costs entirely
- **Automatic SSL**: For any custom domain via Cloudflare for SaaS
- **Better Scalability**: Handle millions of domains seamlessly

## 📋 Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Wrangler CLI**: Install with `npm install -g wrangler`
3. **Node.js 18+**: For local development
4. **Git**: For version control

## 🚀 Setup Steps

### Step 1: Install Wrangler and Login

```bash
# Install Wrangler CLI globally
npm install -g wrangler

# Login to your Cloudflare account
wrangler login

# Verify login
wrangler whoami
```

### Step 2: Create KV Namespaces

```bash
# Create KV namespaces for data storage
wrangler kv:namespace create "USER_SESSIONS"
wrangler kv:namespace create "PRODUCTS"
wrangler kv:namespace create "ORDERS"
wrangler kv:namespace create "OAUTH_STATES"

# Create preview namespaces for development
wrangler kv:namespace create "USER_SESSIONS" --preview
wrangler kv:namespace create "PRODUCTS" --preview
wrangler kv:namespace create "ORDERS" --preview
wrangler kv:namespace create "OAUTH_STATES" --preview
```

**Important**: Copy the namespace IDs from the output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "USER_SESSIONS"
id = "abc123def456"  # Replace with your actual ID
preview_id = "def456ghi789"  # Replace with your actual preview ID
```

### Step 3: Set Environment Variables

Set your secrets using Wrangler (never put these in `wrangler.toml`):

```bash
# Google OAuth credentials
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET

# JWT secret (generate a secure random string)
wrangler secret put JWT_SECRET

# Stripe credentials
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_PUBLISHABLE_KEY

# Airtable OAuth credentials (optional)
wrangler secret put AIRTABLE_CLIENT_ID
wrangler secret put AIRTABLE_CLIENT_SECRET
```

**Generate JWT Secret**:

```bash
# Generate a secure 256-bit secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4: Deploy to Cloudflare Workers

**Note**: We deploy first to get your worker URL, then configure OAuth redirect URIs.

```bash
# Build the Next.js application for static serving
npm run build

# Deploy to Cloudflare Workers to get your worker URL
wrangler deploy
```

**Important**: After deployment, note your worker URL. It will be something like:
`https://multi-domain-marketplace.your-account-id.workers.dev`

### Step 5: Update OAuth Redirect URIs

Now that you have your worker URL, update your OAuth application settings:

**Google Cloud Console**:

- Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
- Edit your OAuth 2.0 Client ID
- Add this **single** redirect URI:
  ```
  https://multi-domain-marketplace.your-account-id.workers.dev/auth/google/callback
  ```

**Airtable Developer Hub**:

- Go to [Airtable Developer Hub](https://airtable.com/developers/web/api/oauth-reference)
- Edit your OAuth app
- Add this **single** redirect URI:
  ```
  https://multi-domain-marketplace.your-account-id.workers.dev/auth/airtable/callback
  ```

✅ **Just ONE redirect URI each - same as your original Express backend!**

### Step 6: Update OAuth Redirect URL Environment Variable

Set your worker URL as the OAuth redirect URL:

```bash
# Set the OAuth redirect URL to your worker URL
wrangler secret put OAUTH_REDIRECT_URL
# Enter: https://multi-domain-marketplace.your-account-id.workers.dev
```

### Step 7: Redeploy with OAuth Configuration

```bash
# Redeploy with the updated OAuth redirect URL
wrangler deploy

# Deploy to production environment (optional)
wrangler deploy --env production
```

### Step 8: Configure Custom Domains

#### Option A: Worker Custom Domains (Recommended)

1. **Add custom domains via Cloudflare Dashboard**:

   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Navigate to **Workers & Pages**
   - Click on your **multi-domain-marketplace** worker
   - Go to **Settings** → **Triggers**
   - Click **Add Custom Domain**
   - Add each seller domain (e.g., `site1.com`, `site2.com`)

2. **Or add domains via CLI**:
   ```bash
   # Add custom domains to your worker
   wrangler route add "yourdomain.com/*" multi-domain-marketplace
   wrangler route add "anotherdomain.com/*" multi-domain-marketplace
   ```

#### Option B: Cloudflare for SaaS (Enterprise solution)

For unlimited custom domains with automatic SSL:

1. **Enable Cloudflare for SaaS**:

   - Contact Cloudflare sales for enterprise pricing
   - Set up Cloudflare for SaaS in your account

2. **Configure worker routes**:
   ```toml
   # In wrangler.toml
   [routes]
   pattern = "*.yourdomain.com/*"
   custom_domain = true
   ```

### Step 9: Update DNS Records

For each custom domain, update DNS to point to Cloudflare:

```
Type: CNAME
Name: @  (or subdomain)
Value: your-worker.workers.dev
```

## 📊 Performance Comparison

| Metric           | Vercel + Express | Cloudflare Workers |
| ---------------- | ---------------- | ------------------ |
| Cold Start       | 100-500ms        | <1ms               |
| Global Locations | ~15              | 300+               |
| Monthly Cost     | $45-120          | $5-15              |
| Custom Domains   | Manual SSL       | Automatic SSL      |
| Scalability      | Limited          | Unlimited          |

## 🔧 Local Development

```bash
# Start local development server
wrangler dev

# Access your worker at http://localhost:8787
# Test different domains by modifying HOST header
curl -H "Host: testdomain.com" http://localhost:8787/
```

## 🐛 Debugging

### View Worker Logs

```bash
# Real-time logs
wrangler tail

# Filter logs by specific domain
wrangler tail --format pretty | grep "yourdomain.com"
```

### Common Issues

1. **"Namespace not found"**: Update KV namespace IDs in `wrangler.toml`
2. **"Secret not found"**: Set secrets using `wrangler secret put`
3. **OAuth redirect mismatch**: Update redirect URIs in OAuth apps
4. **CORS errors**: Check CORS headers in worker responses

## 📈 Monitoring and Analytics

1. **Cloudflare Analytics**:

   - View request metrics in Cloudflare dashboard
   - Monitor performance and errors
   - Track bandwidth usage

2. **Custom Metrics**:
   ```javascript
   // Add custom metrics to your worker
   env.ANALYTICS.writeDataPoint({
     blobs: ["domain", "user_action"],
     doubles: [Date.now(), response_time],
     indexes: ["request_id"],
   });
   ```

## 🚀 Advanced Features

### A/B Testing

```javascript
// Implement A/B testing at the edge
const variant = Math.random() < 0.5 ? "A" : "B";
return handleRequest(request, variant);
```

### Rate Limiting

```javascript
// Implement rate limiting per domain
const key = `ratelimit:${domain}:${clientIP}`;
const count = (await env.RATE_LIMIT.get(key)) || 0;
if (count > 100) {
  return new Response("Rate limited", { status: 429 });
}
```

### Real-time Analytics

```javascript
// Track user actions in real-time
await env.ANALYTICS.put(
  `action:${domain}:${userId}`,
  JSON.stringify({
    action: "purchase",
    timestamp: Date.now(),
    amount: 100,
  })
);
```

## 📋 Migration Checklist

- [ ] Install Wrangler CLI and login
- [ ] Create KV namespaces and update `wrangler.toml`
- [ ] Set all environment variables using `wrangler secret put`
- [ ] Update OAuth redirect URIs in Google and Airtable
- [ ] Deploy worker with `wrangler deploy`
- [ ] Configure custom domains via Pages or for SaaS
- [ ] Update DNS records for all domains
- [ ] Test authentication flows on all domains
- [ ] Test payment processing
- [ ] Test third-party integrations (Sheets, Airtable)
- [ ] Monitor logs and performance
- [ ] Update documentation and team knowledge
- [ ] Shut down old Express backend
- [ ] Remove Vercel project (optional)

## 💰 Cost Optimization

### Estimated Monthly Costs

**Low Traffic** (10k requests/month):

- Workers: $5 (includes 10M requests)
- KV: $0.50 (includes 10M reads)
- **Total: $5.50/month**

**Medium Traffic** (1M requests/month):

- Workers: $5 + $1.50 (additional requests)
- KV: $0.50 + $5 (additional reads)
- **Total: $12/month**

**High Traffic** (10M requests/month):

- Workers: $5 + $15 (additional requests)
- KV: $0.50 + $50 (additional reads)
- **Total: $70.50/month**

Compare this to your current Vercel + Express costs!

## 🎉 Go Live

Once everything is tested and working:

1. **Update your domains**: Point DNS to Cloudflare
2. **Monitor closely**: Watch logs for any issues
3. **Gradual migration**: Move domains one by one if preferred
4. **Performance testing**: Verify improved load times
5. **Shutdown old backend**: Cancel Vercel/Express hosting

## 📞 Support

If you run into issues:

1. **Cloudflare Discord**: Join the Workers community
2. **Documentation**: [developers.cloudflare.com](https://developers.cloudflare.com)
3. **Stack Overflow**: Tag questions with `cloudflare-workers`
4. **GitHub Issues**: Report bugs in the Workers runtime

Your marketplace will be faster, cheaper, and more scalable on Cloudflare Workers! 🚀
