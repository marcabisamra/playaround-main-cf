# 🚀 Cloudflare Workers Marketplace Setup

To set up your multi-domain marketplace on Cloudflare Workers, simply run:

```bash
npm run setup
```

## What This Script Does

1. **✅ Checks Prerequisites** - Verifies Node.js version and installs Wrangler CLI
2. **🔐 Handles Authentication** - Logs you into Cloudflare (if needed)
3. **📦 Creates KV Namespaces** - Sets up all required data storage
4. **🔐 Configures Secrets** - Sets up Google OAuth, JWT, and Stripe credentials
5. **🚀 Builds & Deploys Worker** - Compiles Next.js and deploys everything to Cloudflare's edge
6. **🔗 Configures OAuth Redirect URL** - Sets up single redirect URI using your worker URL
7. **🔄 Redeploys** - Updates worker with OAuth configuration
8. **🧪 Tests Deployment** - Verifies everything is working
9. **📋 Shows Next Steps** - Provides exact OAuth redirect URIs and custom domain setup

## What You'll Need

- **Google OAuth credentials** (from Google Cloud Console)
- **Stripe API keys** (from Stripe Dashboard)
- **Airtable OAuth credentials** (optional, from Airtable Developer Hub)

## Time Required

- **Automated setup**: ~5-10 minutes
- **Manual OAuth setup**: ~10-15 minutes
- **DNS/domain configuration**: ~15-30 minutes (depending on domains)

## After Setup

Your marketplace will be:

- **Pure Cloudflare Workers** (single deployment for static files + API)
- **<1ms response times** (sub-millisecond globally)
- **10x cheaper** (pay only for requests)
- **Infinitely scalable** (handles any traffic spike)
- **Globally distributed** (runs in 300+ locations)

## Alternative Setup Methods

- **Automated Setup**: `npm run setup` (recommended)
- **Manual Setup**: [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md)

## Need Help?

- **Manual Setup Guide**: [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md)
- **Google Sheets Setup**: [GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md)
- **Airtable Setup**: [AIRTABLE_OAUTH_SETUP.md](./AIRTABLE_OAUTH_SETUP.md)
- **Cloudflare Docs**: https://developers.cloudflare.com/workers/

## What You Get

### **Unified Architecture**

- **Static Files**: Served directly from Workers at the edge
- **API Endpoints**: Authentication, payments, integrations
- **OAuth Flows**: Single redirect URI for all domains
- **KV Storage**: Distributed data storage across the globe

### **Performance**

- **Sub-millisecond response times** globally
- **300+ edge locations** serving your marketplace
- **No cold starts** for your users
- **Automatic caching** and optimization

### **Cost Efficiency**

- **Pay-per-request** pricing model
- **No server idle costs**
- **Included SSL, CDN, and DDoS protection**
- **10x cheaper** than traditional hosting

### **Developer Experience**

- **Single deployment** command
- **Local development** with `wrangler dev`
- **Real-time logs** with `wrangler tail`
- **Automatic scaling** - zero configuration

## Quick Commands

```bash
# Setup your marketplace
npm run setup

# Deploy updates
npm run deploy

# Local development
wrangler dev

# View logs
wrangler tail

# Add custom domain
wrangler route add "yourdomain.com/*" multi-domain-marketplace
```

---

**Ready to build your multi-domain marketplace?** Run `npm run setup` to get started! 🎉
