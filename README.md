# Multi-Domain Marketplace on Cloudflare Workers

A **high-performance, serverless multi-domain marketplace** built entirely on Cloudflare Workers. This architecture enables creators to sell products on custom domains with centralized authentication, payment processing, and third-party integrations - all running at the edge in 300+ locations worldwide.

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────────────────┐    ┌─────────────────┐
│   site-1.com    │    │    Cloudflare Worker         │    │   Workers KV    │
│   site-2.com    │───▶│ Static Files + API + OAuth   │───▶│   Database      │
│ custom-domains  │    │     (300+ locations)         │    │                 │
└─────────────────┘    └──────────────────────────────┘    └─────────────────┘
```

### Core Components:

1. **Pure Cloudflare Workers**: Single service handling static files, API endpoints, OAuth flows, and payment processing
2. **Workers KV**: Distributed key-value storage for sessions, products, orders, and OAuth states
3. **Multi-Domain Support**: Each custom domain maintains isolated sessions while sharing backend infrastructure
4. **Edge Computing**: Sub-millisecond response times globally with automatic scaling

## 🎯 Perfect For

- **Creator Marketplaces**: Like Gumroad, enabling creators to sell on custom domains
- **White-Label Platforms**: Branded experiences for different customers
- **SaaS Multi-Tenancy**: Isolated data per domain with shared infrastructure
- **Global Marketplaces**: Low-latency worldwide with automatic scaling
- **High-Traffic Sites**: Zero server management with infinite scalability

## ⚡ Performance Benefits

- **<1ms Cold Starts**: Instant response times globally
- **300+ Edge Locations**: Your code runs everywhere
- **No Server Management**: Zero infrastructure overhead
- **Auto-Scaling**: Handles traffic spikes automatically
- **Built-in CDN**: Free content delivery and DDoS protection

## 💰 Cost Benefits

- **Pay-Per-Request**: No idle server costs
- **10x Cheaper**: Compared to traditional server hosting
- **No Backend Servers**: Eliminate hosting costs entirely
- **Included Features**: SSL, CDN, and DDoS protection at no extra cost

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Verify login
wrangler whoami
```

### 2. Automated Setup

```bash
# Clone and setup
git clone <your-repo>
cd multi-domain-marketplace

# Run automated setup (recommended)
npm run setup
```

The setup script will automatically:

- ✅ Install dependencies and Wrangler CLI
- ✅ Create all required KV namespaces
- ✅ Configure environment variables interactively
- ✅ Build and deploy your Worker
- ✅ Set up OAuth redirect URLs
- ✅ Provide exact next steps

### 3. Manual Setup (Optional)

If you prefer manual setup, see [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md) for detailed instructions.

## 🔧 Configuration

### Environment Variables

| Variable                 | Required | Purpose                       |
| ------------------------ | -------- | ----------------------------- |
| `GOOGLE_CLIENT_ID`       | ✅       | Google OAuth authentication   |
| `GOOGLE_CLIENT_SECRET`   | ✅       | Google OAuth authentication   |
| `JWT_SECRET`             | ✅       | JWT signing (256-bit minimum) |
| `STRIPE_SECRET_KEY`      | ✅       | Stripe payment processing     |
| `STRIPE_PUBLISHABLE_KEY` | ✅       | Stripe frontend integration   |
| `OAUTH_REDIRECT_URL`     | ✅       | Single OAuth redirect URL     |
| `AIRTABLE_CLIENT_ID`     | ❌       | Airtable OAuth (optional)     |
| `AIRTABLE_CLIENT_SECRET` | ❌       | Airtable OAuth (optional)     |

### KV Namespaces

| Namespace       | Purpose                      | TTL        |
| --------------- | ---------------------------- | ---------- |
| `USER_SESSIONS` | JWT tokens and user sessions | 24 hours   |
| `PRODUCTS`      | Stripe product metadata      | Permanent  |
| `ORDERS`        | Order history and analytics  | Permanent  |
| `OAUTH_STATES`  | OAuth flow state management  | 10 minutes |

## 🔐 Authentication Architecture

### Domain Isolation

Each domain maintains completely isolated sessions:

- ✅ Login on `site-1.com` ≠ logged in on `site-2.com`
- ✅ JWTs contain domain-specific binding
- ✅ Session data stored per domain
- ✅ No cross-domain session sharing

### Single OAuth Redirect

All domains use the same Worker URL for OAuth callbacks:

- **Google OAuth**: `https://your-worker.workers.dev/auth/google/callback`
- **Airtable OAuth**: `https://your-worker.workers.dev/auth/airtable/callback`

This simplifies OAuth app configuration - you only need **one redirect URI** per provider.

## 🛠️ API Endpoints

### Authentication

- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google/callback` - Handle OAuth callback
- `GET /auth/airtable` - Initiate Airtable OAuth
- `GET /auth/airtable/callback` - Handle Airtable callback
- `POST /api/verify-token` - Validate JWT tokens
- `POST /api/logout` - Clear sessions

### Third-Party Integrations

- `POST /api/sheets/create` - Create Google Sheets
- `POST /api/airtable/bases` - List Airtable bases
- `POST /api/airtable/tables` - List tables in base
- `POST /api/airtable/create-record` - Create records

### Payments (Stripe)

- `GET /api/stripe/config` - Get publishable key
- `POST /api/stripe/create-product` - Create products
- `POST /api/stripe/products` - List domain products
- `POST /api/stripe/create-payment-intent` - Process payments
- `POST /api/stripe/create-subscription` - Handle subscriptions
- `GET /api/stripe/subscriptions` - List subscriptions
- `POST /api/stripe/cancel-subscription` - Cancel subscriptions
- `GET /api/stripe/analytics` - Get analytics data

## 📁 Project Structure

```
├── src/
│   ├── worker.js                 # Main Cloudflare Worker
│   ├── api-handlers.js          # API endpoint implementations
│   ├── pages/
│   │   ├── _app.tsx             # Next.js app wrapper
│   │   └── index.tsx            # Main marketplace page
│   ├── components/
│   │   ├── AuthComponent.tsx    # Authentication UI
│   │   ├── AirtableForm.tsx     # Airtable integration
│   │   ├── StripeComponent.tsx  # Payment processing
│   │   └── GlobalDataComponent.tsx # Global data management
│   └── utils/
│       └── indexedDB.ts         # Client-side storage
├── scripts/
│   └── setup-kv-namespaces.js  # Automated KV setup
├── wrangler.toml                # Cloudflare configuration
├── setup-cloudflare.js          # Automated setup script
├── CLOUDFLARE_SETUP.md          # Manual setup guide
├── SETUP_GUIDE.md               # Quick setup instructions
└── README.md                    # This file
```

## 🚀 Development Workflow

### Local Development

```bash
# Start Next.js development server (frontend only)
npm run dev

# Start full Worker with static files + API
wrangler dev

# View real-time Worker logs
wrangler tail
```

### Deployment

```bash
# Deploy everything (recommended)
npm run deploy

# Deploy to production environment
npm run deploy:prod

# Deploy with Wrangler directly
wrangler deploy
```

### Testing Multi-Domain Locally

```bash
# Test different domains using curl
curl -H "Host: testdomain.com" http://localhost:8787/

# Or modify your /etc/hosts file:
# 127.0.0.1 testdomain1.local
# 127.0.0.1 testdomain2.local
```

## 🌐 Custom Domain Setup

### Via Cloudflare Dashboard

1. Go to **Cloudflare Dashboard** → **Workers & Pages**
2. Click on your **multi-domain-marketplace** worker
3. Go to **Settings** → **Triggers**
4. Click **Add Custom Domain**
5. Add each seller domain (e.g., `site1.com`, `site2.com`)

### Via CLI

```bash
# Add custom domains to your worker
wrangler route add "yourdomain.com/*" multi-domain-marketplace
wrangler route add "anotherdomain.com/*" multi-domain-marketplace
```

### DNS Configuration

For each custom domain:

```
Type: CNAME
Name: @ (or subdomain)
Value: your-worker.workers.dev
```

## 📊 Built-in Analytics

Cloudflare provides comprehensive analytics:

- Request volume and performance metrics
- Error rates and status codes
- Geographic distribution
- Cache hit ratios

### Custom Business Metrics

```javascript
// Track business events in your Worker
await env.ANALYTICS.put(
  `metric:${domain}:${event}`,
  JSON.stringify({
    timestamp: Date.now(),
    value: amount,
    userId: userId,
  })
);
```

## 🔧 Advanced Features

### Rate Limiting

```javascript
const key = `ratelimit:${domain}:${ip}`;
const requests = (await env.RATE_LIMIT.get(key)) || 0;
if (requests > 100) {
  return new Response("Rate limited", { status: 429 });
}
```

### A/B Testing

```javascript
const variant = Math.random() < 0.5 ? "A" : "B";
const response = await handleRequest(request, variant);
```

### Real-time Event Tracking

```javascript
await env.ANALYTICS.put(
  `event:${domain}:purchase`,
  JSON.stringify({
    amount: 100,
    timestamp: Date.now(),
    userId: user.id,
  })
);
```

## 💰 Cost Analysis

### Estimated Monthly Costs

| Traffic Level                 | Worker Requests | KV Operations | Total Cost | vs Traditional Hosting   |
| ----------------------------- | --------------- | ------------- | ---------- | ------------------------ |
| **Startup** (10k requests)    | $5              | $0.50         | **$5.50**  | $45-120 (87% savings)    |
| **Growing** (100k requests)   | $5              | $2            | **$7**     | $80-200 (91% savings)    |
| **Scale** (1M requests)       | $6.50           | $10           | **$16.50** | $200-500 (92% savings)   |
| **Enterprise** (10M requests) | $20             | $60           | **$80**    | $1000-2000 (92% savings) |

## 🐛 Troubleshooting

### Common Issues

1. **"Namespace not found"**: Run `npm run setup` to create KV namespaces
2. **"Secret not found"**: Set secrets using `wrangler secret put VARIABLE_NAME`
3. **OAuth errors**: Update redirect URIs in Google/Airtable consoles
4. **Domain not working**: Check DNS CNAME records point to Worker

### Debug Commands

```bash
# View worker logs in real-time
wrangler tail

# List KV namespaces
wrangler kv namespace list

# Check secret values
wrangler secret list

# Test Worker locally
wrangler dev
```

## 📚 Additional Resources

- **Quick Setup**: [SETUP_GUIDE.md](./SETUP_GUIDE.md)
- **Manual Setup**: [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md)
- **Google Sheets Integration**: [GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md)
- **Airtable Integration**: [AIRTABLE_OAUTH_SETUP.md](./AIRTABLE_OAUTH_SETUP.md)
- **Cloudflare Workers Docs**: https://developers.cloudflare.com/workers/
- **Workers KV Docs**: https://developers.cloudflare.com/workers/runtime-apis/kv/

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Test your changes with `wrangler dev`
4. Submit a pull request

## 📄 License

MIT License - Build amazing marketplaces on Cloudflare's global network! 🚀

---

**Ready to build your multi-domain marketplace?** Run `npm run setup` to get started in minutes!
