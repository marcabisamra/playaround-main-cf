#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log(
  "🚀 Setting up Cloudflare KV Namespaces for Multi-Domain Marketplace...\n"
);

const namespaces = ["USER_SESSIONS", "PRODUCTS", "ORDERS", "OAUTH_STATES"];

const namespaceIds = {};
const previewIds = {};

// Create KV namespaces
for (const namespace of namespaces) {
  console.log(`📦 Creating namespace: ${namespace}`);

  try {
    // Create main namespace
    const mainResult = execSync(`wrangler kv namespace create ${namespace}`, {
      encoding: "utf8",
    });
    const mainMatch = mainResult.match(/id = "([^"]+)"/);
    if (mainMatch) {
      namespaceIds[namespace] = mainMatch[1];
      console.log(`   ✅ Main ID: ${mainMatch[1]}`);
    }

    // Create preview namespace
    const previewResult = execSync(
      `wrangler kv namespace create ${namespace} --preview`,
      { encoding: "utf8" }
    );
    const previewMatch = previewResult.match(/preview_id = "([^"]+)"/);
    if (previewMatch) {
      previewIds[namespace] = previewMatch[1];
      console.log(`   ✅ Preview ID: ${previewMatch[1]}`);
    }
  } catch (error) {
    console.error(`   ❌ Error creating ${namespace}:`, error.message);
    process.exit(1);
  }
}

console.log("\n📝 Updating wrangler.toml with namespace IDs...");

// Read current wrangler.toml
const wranglerPath = path.join(process.cwd(), "wrangler.toml");
let wranglerContent = fs.readFileSync(wranglerPath, "utf8");

// Update namespace IDs in wrangler.toml
for (const namespace of namespaces) {
  const mainId = namespaceIds[namespace];
  const previewId = previewIds[namespace];

  if (mainId && previewId) {
    // Replace placeholder IDs with actual IDs
    const bindingRegex = new RegExp(
      `(\\[\\[kv_namespaces\\]\\]\\s*\\n\\s*binding = "${namespace}"\\s*\\n\\s*)id = "[^"]*"(\\s*\\n\\s*)preview_id = "[^"]*"`,
      "g"
    );

    wranglerContent = wranglerContent.replace(
      bindingRegex,
      `$1id = "${mainId}"$2preview_id = "${previewId}"`
    );

    // Also update dev/prod environments if they exist
    const devRegex = new RegExp(
      `(\\[\\[env\\.dev\\.kv_namespaces\\]\\]\\s*\\n\\s*binding = "${namespace}"\\s*\\n\\s*)id = "[^"]*"`,
      "g"
    );
    wranglerContent = wranglerContent.replace(
      devRegex,
      `$1id = "${previewId}"`
    );

    const prodRegex = new RegExp(
      `(\\[\\[env\\.production\\.kv_namespaces\\]\\]\\s*\\n\\s*binding = "${namespace}"\\s*\\n\\s*)id = "[^"]*"`,
      "g"
    );
    wranglerContent = wranglerContent.replace(prodRegex, `$1id = "${mainId}"`);
  }
}

// Write updated wrangler.toml
fs.writeFileSync(wranglerPath, wranglerContent);

console.log("✅ wrangler.toml updated with actual namespace IDs\n");

console.log("🔐 Next steps:");
console.log("1. Set your environment variables:");
console.log("   wrangler secret put GOOGLE_CLIENT_ID");
console.log("   wrangler secret put GOOGLE_CLIENT_SECRET");
console.log("   wrangler secret put JWT_SECRET");
console.log("   wrangler secret put STRIPE_SECRET_KEY");
console.log("   wrangler secret put STRIPE_PUBLISHABLE_KEY");
console.log("   wrangler secret put AIRTABLE_CLIENT_ID");
console.log("   wrangler secret put AIRTABLE_CLIENT_SECRET");
console.log("");
console.log("2. Deploy your worker:");
console.log("   npm run worker:deploy");
console.log("");
console.log("3. Set up custom domains in Cloudflare dashboard");
console.log("");
console.log(
  "🎉 KV namespaces are ready! Your marketplace is ready to scale globally."
);

// Create a summary file
const summary = {
  timestamp: new Date().toISOString(),
  namespaces: Object.keys(namespaceIds).map((name) => ({
    name,
    id: namespaceIds[name],
    preview_id: previewIds[name],
  })),
  next_steps: [
    "Set environment variables using wrangler secret put",
    "Deploy worker using npm run worker:deploy",
    "Configure custom domains in Cloudflare dashboard",
    "Update OAuth redirect URIs for new domains",
  ],
};

fs.writeFileSync("kv-setup-summary.json", JSON.stringify(summary, null, 2));
console.log("📄 Setup summary saved to kv-setup-summary.json");
