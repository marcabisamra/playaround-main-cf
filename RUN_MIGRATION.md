# 🚀 Run Cloudflare Workers Migration

To migrate your multi-domain marketplace to Cloudflare Workers, simply run:

```bash
npm run migrate
```

## What This Script Does

1. **✅ Checks Prerequisites** - Verifies Node.js version and installs Wrangler CLI
2. **🔐 Handles Authentication** - Logs you into Cloudflare (if needed)
3. **📦 Creates KV Namespaces** - Sets up all required data storage
4. **🔐 Configures Initial Secrets** - Sets up Google OAuth, JWT, and Stripe credentials
5. **🚀 Builds & Deploys** - Compiles your app and deploys to Cloudflare edge
6. **🔗 Configures OAuth Redirect URL** - Sets up single redirect URI using your worker URL
7. **🔄 Redeploys** - Updates worker with OAuth configuration
8. **🧪 Tests Deployment** - Verifies everything is working
9. **📋 Shows Next Steps** - Provides exact OAuth redirect URIs to configure

## What You'll Need

- **Google OAuth credentials** (from Google Cloud Console)
- **Stripe API keys** (from Stripe Dashboard)
- **Airtable OAuth credentials** (optional, from Airtable Developer Hub)

## Time Required

- **Automated steps**: ~5-10 minutes
- **Manual OAuth setup**: ~10-15 minutes
- **DNS/domain configuration**: ~15-30 minutes (depending on domains)

## After Migration

Your marketplace will be:

- **10x faster** (sub-millisecond response times)
- **10x cheaper** (pay only for requests)
- **Infinitely scalable** (handles any traffic spike)
- **Globally distributed** (runs in 300+ locations)

## Need Help?

- **Detailed Guide**: [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md)
- **Migration Details**: [MIGRATION_COMPLETE.md](./MIGRATION_COMPLETE.md)
- **Cloudflare Docs**: https://developers.cloudflare.com/workers/

---

**Ready?** Run `npm run migrate` to get started! 🎉
