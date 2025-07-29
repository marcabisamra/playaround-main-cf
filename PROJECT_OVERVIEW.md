# Multi-Domain Marketplace - Project Overview

## 📋 What This Is

A **complete multi-domain marketplace solution** built entirely on **Cloudflare Workers**. This project enables creators to sell products on custom domains with centralized backend infrastructure, delivering <1ms response times globally while maintaining complete domain isolation.

## 🏗️ Architecture

### Pure Cloudflare Workers Design

```
Custom Domains → Cloudflare Worker → Workers KV
    ↓                    ↓               ↓
Static Files         API + OAuth     Data Storage
```

**Key Components:**

- **Single Worker**: Handles static files, API endpoints, OAuth flows, and payments
- **Workers KV**: Distributed storage for sessions, products, orders, and OAuth states
- **Edge Computing**: Code runs in 300+ locations worldwide
- **Domain Isolation**: Each custom domain maintains separate user sessions

## 🎯 Use Cases

### Perfect For:

- **Creator Marketplaces** (like Gumroad)
- **White-Label SaaS Platforms**
- **Multi-Tenant Applications**
- **Global E-commerce Sites**
- **High-Traffic Platforms**

### Key Features:

- **Multi-Domain Support**: Unlimited custom domains
- **Isolated Sessions**: Each domain has separate user sessions
- **Single OAuth**: One redirect URI for all domains
- **Payment Processing**: Full Stripe integration
- **Third-Party Integrations**: Google Sheets, Airtable
- **Real-Time Analytics**: Built-in performance metrics

## ⚡ Performance & Benefits

### Performance

- **<1ms Cold Starts**: Instant response times globally
- **300+ Edge Locations**: Your code runs everywhere
- **No Server Management**: Zero infrastructure overhead
- **Auto-Scaling**: Handles unlimited traffic automatically

### Cost Efficiency

- **Pay-Per-Request**: No idle server costs
- **10x Cheaper**: Compared to traditional hosting
- **Included Features**: SSL, CDN, DDoS protection free

### Developer Experience

- **Single Deployment**: Everything in one command
- **Local Development**: Full stack runs with `wrangler dev`
- **Real-Time Logs**: `wrangler tail` for debugging
- **Easy Scaling**: Add domains instantly

## 🚀 Quick Start

### Automated Setup (Recommended)

```bash
git clone <your-repo>
cd multi-domain-marketplace
npm run setup
```

The setup script automatically:

- ✅ Installs Wrangler CLI
- ✅ Creates KV namespaces
- ✅ Configures environment variables
- ✅ Builds and deploys your Worker
- ✅ Sets up OAuth redirect URLs

### Manual Setup

See [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md) for step-by-step instructions.

## 📁 Project Structure

```
├── src/
│   ├── worker.js                 # Main Cloudflare Worker
│   ├── api-handlers.js          # API endpoint implementations
│   ├── pages/                   # Next.js pages
│   ├── components/              # React components
│   └── utils/                   # Utility functions
├── scripts/
│   └── setup-kv-namespaces.js  # KV automation
├── wrangler.toml                # Cloudflare configuration
├── setup-cloudflare.js          # Automated setup script
└── README.md                    # Main documentation
```

## 🔐 Authentication Architecture

### Domain Isolation

Each custom domain maintains completely isolated sessions:

- User logged into `site1.com` ≠ logged into `site2.com`
- JWTs contain domain-specific binding
- Session data stored per domain in Workers KV
- No cross-domain session sharing

### Single OAuth Redirect

All domains use the same Worker URL for OAuth callbacks:

- **Google**: `https://your-worker.workers.dev/auth/google/callback`
- **Airtable**: `https://your-worker.workers.dev/auth/airtable/callback`

This means you only need **ONE redirect URI** per OAuth provider, regardless of how many custom domains you have.

## 💳 Payment Processing

### Stripe Integration

- **Product Management**: Create products per domain
- **Payment Processing**: One-time payments and subscriptions
- **Subscription Management**: Handle recurring billing
- **Analytics**: Track revenue and performance
- **Domain Isolation**: Each domain has separate products/orders

### Supported Features

- One-time payments
- Recurring subscriptions
- Subscription management (cancel, update)
- Payment analytics
- Revenue tracking per domain

## 🌐 Third-Party Integrations

### Google Sheets

- OAuth-based authentication
- Create spreadsheets programmatically
- Automatic data export from marketplace

### Airtable

- OAuth and API key authentication
- Database management
- Record creation and updates
- Base and table listing

## 📊 Data Storage (Workers KV)

### KV Namespaces

| Namespace       | Purpose                     | TTL        |
| --------------- | --------------------------- | ---------- |
| `USER_SESSIONS` | JWT tokens and sessions     | 24 hours   |
| `PRODUCTS`      | Stripe product metadata     | Permanent  |
| `ORDERS`        | Order history and analytics | Permanent  |
| `OAUTH_STATES`  | OAuth flow state management | 10 minutes |

### Data Distribution

- **Global Replication**: Data cached worldwide
- **Eventually Consistent**: Updates propagate globally
- **High Performance**: Sub-millisecond reads
- **Automatic Scaling**: No capacity planning needed

## 🛠️ Development Workflow

### Local Development

```bash
npm run dev          # Next.js dev server (frontend only)
wrangler dev         # Full Worker with static files + API
```

### Deployment

```bash
npm run setup        # Initial setup
npm run deploy       # Deploy updates
npm run deploy:prod  # Deploy to production
```

### Debugging

```bash
wrangler tail        # Real-time logs
wrangler kv namespace list  # List KV namespaces
wrangler secret list # List environment variables
```

## 🌍 Custom Domain Setup

### Adding Domains

1. **Via Dashboard**: Workers & Pages → Your Worker → Settings → Triggers
2. **Via CLI**: `wrangler route add "yourdomain.com/*" multi-domain-marketplace`

### DNS Configuration

For each custom domain:

```
Type: CNAME
Name: @ (root domain)
Value: your-worker.workers.dev
```

## 💰 Cost Analysis

### Pricing Breakdown

| Traffic Level | Monthly Cost | Traditional Hosting | Savings |
| ------------- | ------------ | ------------------- | ------- |
| 10K requests  | $5.50        | $45-120             | 87-90%  |
| 100K requests | $7           | $80-200             | 91-96%  |
| 1M requests   | $16.50       | $200-500            | 92-97%  |
| 10M requests  | $80          | $1000-2000          | 92-96%  |

### What's Included

- Unlimited custom domains
- SSL certificates (automatic)
- CDN and edge caching
- DDoS protection
- Global distribution
- Auto-scaling

## 🔧 Configuration

### Required Environment Variables

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY`
- `JWT_SECRET`
- `OAUTH_REDIRECT_URL`

### Optional Variables

- `AIRTABLE_CLIENT_ID` / `AIRTABLE_CLIENT_SECRET`

## 📚 Documentation

- **[README.md](./README.md)** - Main project documentation
- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** - Quick setup instructions
- **[CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md)** - Manual setup guide
- **[GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md)** - Google Sheets integration
- **[AIRTABLE_OAUTH_SETUP.md](./AIRTABLE_OAUTH_SETUP.md)** - Airtable integration

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Test locally with `wrangler dev`
4. Submit a pull request

## 📄 License

MIT License - Build amazing marketplaces on Cloudflare's global network!

---

**Ready to build your multi-domain marketplace?** This project gives you everything you need to create a high-performance, cost-effective marketplace that scales globally. 🚀
