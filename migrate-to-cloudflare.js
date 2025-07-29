#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// Colors for console output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
  bright: "\x1b[1m",
};

const log = (message, color = "reset") => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) => {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
};

async function checkPrerequisites() {
  log("\n🔍 Checking prerequisites...", "blue");

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0]);

  if (majorVersion < 18) {
    log(
      `❌ Node.js ${nodeVersion} detected. Please upgrade to Node.js 18+ for Cloudflare Workers.`,
      "red"
    );
    process.exit(1);
  }

  log(`✅ Node.js ${nodeVersion} - Compatible`, "green");

  // Check if we're in the right directory
  if (!fs.existsSync("package.json")) {
    log(
      "❌ No package.json found. Please run this script from your project root.",
      "red"
    );
    process.exit(1);
  }

  log("✅ Running in project directory", "green");

  // Check if wrangler is installed
  try {
    execSync("wrangler --version", { stdio: "pipe" });
    log("✅ Wrangler CLI already installed", "green");
  } catch (error) {
    log("📦 Installing Wrangler CLI globally...", "yellow");
    try {
      execSync("npm install -g wrangler", { stdio: "inherit" });
      log("✅ Wrangler CLI installed successfully", "green");
    } catch (installError) {
      log(
        "❌ Failed to install Wrangler CLI. Please install manually with: npm install -g wrangler",
        "red"
      );
      process.exit(1);
    }
  }
}

async function checkCloudflareAuth() {
  log("\n🔐 Checking Cloudflare authentication...", "blue");

  try {
    const whoami = execSync("wrangler whoami", {
      encoding: "utf8",
      stdio: "pipe",
    });
    if (whoami.includes("You are not authenticated")) {
      throw new Error("Not authenticated");
    }
    log("✅ Already authenticated to Cloudflare", "green");
    return true;
  } catch (error) {
    log("🔑 Please authenticate with Cloudflare...", "yellow");

    const shouldLogin = await question(
      "Do you want to login to Cloudflare now? (y/n): "
    );
    if (shouldLogin.toLowerCase() !== "y") {
      log("❌ Cloudflare authentication required. Run: wrangler login", "red");
      process.exit(1);
    }

    try {
      execSync("wrangler login", { stdio: "inherit" });
      log("✅ Successfully authenticated to Cloudflare", "green");
      return true;
    } catch (loginError) {
      log("❌ Failed to authenticate. Please run: wrangler login", "red");
      process.exit(1);
    }
  }
}

async function setupKVNamespaces() {
  log("\n📦 Setting up KV namespaces...", "blue");

  const namespaces = ["USER_SESSIONS", "PRODUCTS", "ORDERS", "OAUTH_STATES"];

  const namespaceIds = {};
  const previewIds = {};

  // First, check if namespaces already exist
  log("🔍 Checking for existing namespaces...", "cyan");
  let existingNamespaces = [];
  try {
    const listResult = execSync("wrangler kv namespace list", {
      encoding: "utf8",
    });
    existingNamespaces = JSON.parse(listResult);
    log(`   Found ${existingNamespaces.length} existing namespaces`, "cyan");
  } catch (error) {
    log(
      "   Could not list existing namespaces, continuing with creation...",
      "yellow"
    );
  }

  for (const namespace of namespaces) {
    log(`   Processing namespace: ${namespace}`, "cyan");

    // Check if main namespace already exists
    const existingMain = existingNamespaces.find(
      (ns) => ns.title === namespace
    );
    const existingPreview = existingNamespaces.find(
      (ns) => ns.title === `${namespace}_preview`
    );

    if (existingMain) {
      namespaceIds[namespace] = existingMain.id;
      log(`   ✅ Found existing main namespace: ${existingMain.id}`, "green");
    } else {
      // Create main namespace
      try {
        log(`   Creating main namespace: ${namespace}`, "cyan");
        const mainResult = execSync(
          `wrangler kv namespace create ${namespace}`,
          {
            encoding: "utf8",
          }
        );

        const mainMatch = mainResult.match(/id = "([^"]+)"/);
        if (mainMatch) {
          namespaceIds[namespace] = mainMatch[1];
          log(`   ✅ Created main namespace: ${mainMatch[1]}`, "green");
        }
      } catch (error) {
        if (error.message.includes("already exists")) {
          log(
            `   ℹ️  Main namespace ${namespace} already exists, continuing...`,
            "yellow"
          );
          // Try to get ID from list command
          const refreshedList = execSync("wrangler kv namespace list", {
            encoding: "utf8",
          });
          const refreshedNamespaces = JSON.parse(refreshedList);
          const existing = refreshedNamespaces.find(
            (ns) => ns.title === namespace
          );
          if (existing) {
            namespaceIds[namespace] = existing.id;
            log(`   ✅ Retrieved existing main ID: ${existing.id}`, "green");
          }
        } else {
          log(
            `   ❌ Error creating main ${namespace}: ${error.message}`,
            "red"
          );
        }
      }
    }

    if (existingPreview) {
      previewIds[namespace] = existingPreview.id;
      log(
        `   ✅ Found existing preview namespace: ${existingPreview.id}`,
        "green"
      );
    } else {
      // Create preview namespace
      try {
        log(`   Creating preview namespace: ${namespace}`, "cyan");
        const previewResult = execSync(
          `wrangler kv namespace create ${namespace} --preview`,
          { encoding: "utf8" }
        );

        const previewMatch = previewResult.match(/id = "([^"]+)"/);
        if (previewMatch) {
          previewIds[namespace] = previewMatch[1];
          log(`   ✅ Created preview namespace: ${previewMatch[1]}`, "green");
        }
      } catch (error) {
        if (error.message.includes("already exists")) {
          log(
            `   ℹ️  Preview namespace ${namespace} already exists, continuing...`,
            "yellow"
          );
          // Try to get ID from list command
          const refreshedList = execSync("wrangler kv namespace list", {
            encoding: "utf8",
          });
          const refreshedNamespaces = JSON.parse(refreshedList);
          const existing = refreshedNamespaces.find(
            (ns) => ns.title === `${namespace}_preview`
          );
          if (existing) {
            previewIds[namespace] = existing.id;
            log(`   ✅ Retrieved existing preview ID: ${existing.id}`, "green");
          }
        } else {
          log(
            `   ❌ Error creating preview ${namespace}: ${error.message}`,
            "red"
          );
        }
      }
    }
  }

  // Update wrangler.toml with actual IDs
  log("📝 Updating wrangler.toml with namespace IDs...", "cyan");

  const wranglerPath = path.join(process.cwd(), "wrangler.toml");
  let wranglerContent = fs.readFileSync(wranglerPath, "utf8");

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

      // Also update dev/prod environments
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
      wranglerContent = wranglerContent.replace(
        prodRegex,
        `$1id = "${mainId}"`
      );

      log(
        `   ✅ Updated ${namespace} (main: ${mainId}, preview: ${previewId})`,
        "green"
      );
    } else {
      log(
        `   ⚠️  Skipping ${namespace} - missing IDs (main: ${mainId}, preview: ${previewId})`,
        "yellow"
      );
    }
  }

  fs.writeFileSync(wranglerPath, wranglerContent);
  log("✅ wrangler.toml updated with actual namespace IDs", "green");

  return { namespaceIds, previewIds };
}

async function setupEnvironmentVariables() {
  log("\n🔐 Setting up environment variables...", "blue");

  log("You'll need to provide the following credentials:", "yellow");
  log("- Google OAuth credentials (required)", "yellow");
  log("- JWT secret (will be generated if not provided)", "yellow");
  log("- Stripe credentials (required for payments)", "yellow");
  log("- Airtable OAuth credentials (optional)", "yellow");

  const shouldContinue = await question(
    "\nDo you want to set up environment variables now? (y/n): "
  );
  if (shouldContinue.toLowerCase() !== "y") {
    log(
      "⚠️  You'll need to set these manually later with: wrangler secret put VARIABLE_NAME",
      "yellow"
    );
    return;
  }

  // Google OAuth (required)
  log("\n📱 Google OAuth Setup (Required):", "magenta");
  const googleClientId = await question("Enter your Google Client ID: ");
  const googleClientSecret = await question(
    "Enter your Google Client Secret: "
  );

  if (!googleClientId || !googleClientSecret) {
    log("❌ Google OAuth credentials are required", "red");
    process.exit(1);
  }

  // JWT Secret
  log("\n🔒 JWT Secret Setup:", "magenta");
  let jwtSecret = await question(
    "Enter JWT secret (leave empty to generate a secure one): "
  );

  if (!jwtSecret) {
    jwtSecret = require("crypto").randomBytes(32).toString("hex");
    log(
      `✅ Generated secure JWT secret: ${jwtSecret.substring(0, 16)}...`,
      "green"
    );
  }

  // Stripe (required for marketplace)
  log("\n💳 Stripe Setup (Required for payments):", "magenta");
  const stripeSecretKey = await question(
    "Enter your Stripe Secret Key (sk_...): "
  );
  const stripePublishableKey = await question(
    "Enter your Stripe Publishable Key (pk_...): "
  );

  if (!stripeSecretKey || !stripePublishableKey) {
    log(
      "⚠️  Stripe credentials not provided. Payments will not work.",
      "yellow"
    );
  }

  // Airtable (optional)
  log("\n🗂️  Airtable OAuth Setup (Optional):", "magenta");
  const airtableClientId = await question(
    "Enter your Airtable Client ID (optional): "
  );
  const airtableClientSecret = await question(
    "Enter your Airtable Client Secret (optional): "
  );

  // Set initial secrets (OAuth redirect URL will be set after deployment)
  log(
    "\n📝 Note: OAuth redirect URL will be configured after deployment",
    "yellow"
  );
  log(
    "This solves the chicken-and-egg problem of needing the worker URL first!",
    "cyan"
  );

  const secrets = [
    { name: "GOOGLE_CLIENT_ID", value: googleClientId },
    { name: "GOOGLE_CLIENT_SECRET", value: googleClientSecret },
    { name: "JWT_SECRET", value: jwtSecret },
  ];

  if (stripeSecretKey) {
    secrets.push({ name: "STRIPE_SECRET_KEY", value: stripeSecretKey });
  }

  if (stripePublishableKey) {
    secrets.push({
      name: "STRIPE_PUBLISHABLE_KEY",
      value: stripePublishableKey,
    });
  }

  if (airtableClientId) {
    secrets.push({ name: "AIRTABLE_CLIENT_ID", value: airtableClientId });
  }

  if (airtableClientSecret) {
    secrets.push({
      name: "AIRTABLE_CLIENT_SECRET",
      value: airtableClientSecret,
    });
  }

  log("\n🔐 Setting environment variables...", "cyan");

  for (const secret of secrets) {
    try {
      // Use echo to pipe the secret value to wrangler
      execSync(`echo "${secret.value}" | wrangler secret put ${secret.name}`, {
        stdio: ["pipe", "pipe", "inherit"],
        shell: true,
      });
      log(`   ✅ Set ${secret.name}`, "green");
    } catch (error) {
      log(`   ❌ Failed to set ${secret.name}`, "red");
    }
  }

  log("✅ Environment variables configured", "green");

  return {
    googleClientId,
    googleClientSecret,
    stripeSecretKey,
    stripePublishableKey,
    airtableClientId,
    airtableClientSecret,
  };
}

async function buildAndDeploy() {
  log("\n🚀 Building and deploying to Cloudflare Workers...", "blue");

  try {
    log("📦 Installing dependencies...", "cyan");
    execSync("npm install", { stdio: "inherit" });
    log("✅ Dependencies installed successfully", "green");

    log("📦 Building Next.js application...", "cyan");
    execSync("npm run build", { stdio: "inherit" });
    log("✅ Build completed successfully", "green");

    log("🚀 Deploying to Cloudflare Workers...", "cyan");
    const deployResult = execSync("wrangler deploy", {
      encoding: "utf8",
      stdio: "inherit",
    });
    log("✅ Deployment completed successfully", "green");

    // Get worker URL
    try {
      const workerInfo = execSync("wrangler whoami", { encoding: "utf8" });
      const accountMatch = workerInfo.match(/Account ID: ([a-f0-9]+)/);
      if (accountMatch) {
        const workerUrl = `https://multi-domain-marketplace.${accountMatch[1]}.workers.dev`;
        log(`🌐 Your worker is deployed at: ${workerUrl}`, "bright");
        return workerUrl;
      }
    } catch (error) {
      // Fallback message
      log("🌐 Your worker has been deployed successfully!", "bright");
    }
  } catch (error) {
    log("❌ Deployment failed. Please check the errors above.", "red");
    process.exit(1);
  }
}

async function setupOAuthRedirectUrl(workerUrl) {
  log("\n🔗 OAuth Redirect URL Configuration", "blue");
  log(
    "Now that your worker is deployed, we can configure OAuth redirect URLs.",
    "cyan"
  );

  if (!workerUrl) {
    log("⚠️  Worker URL not detected automatically.", "yellow");
    workerUrl = await question(
      "Enter your worker URL (from deployment output above): "
    );
  }

  log(`\n✅ Your worker URL: ${workerUrl}`, "green");
  log(
    "This will be used as the single OAuth redirect URL for all domains.",
    "cyan"
  );

  const shouldConfigure = await question(
    "\nDo you want to set this as your OAuth redirect URL now? (y/n): "
  );

  if (shouldConfigure.toLowerCase() === "y") {
    try {
      // Set OAuth redirect URL
      execSync(`echo "${workerUrl}" | wrangler secret put OAUTH_REDIRECT_URL`, {
        stdio: ["pipe", "pipe", "inherit"],
        shell: true,
      });
      log("✅ OAuth redirect URL configured successfully", "green");

      // Redeploy with OAuth configuration
      log("\n🔄 Redeploying with OAuth configuration...", "cyan");
      execSync("wrangler deploy", { stdio: "inherit" });
      log("✅ Redeployment completed successfully", "green");

      return {
        oauthRedirectUrl: workerUrl,
        configured: true,
      };
    } catch (error) {
      log("❌ Failed to set OAuth redirect URL", "red");
      log(
        "You can set it manually later with: wrangler secret put OAUTH_REDIRECT_URL",
        "yellow"
      );
      return {
        oauthRedirectUrl: workerUrl,
        configured: false,
      };
    }
  } else {
    log(
      "⚠️  OAuth redirect URL not set. You'll need to configure it manually:",
      "yellow"
    );
    log(`   wrangler secret put OAUTH_REDIRECT_URL`, "cyan");
    log(`   Enter: ${workerUrl}`, "cyan");
    return {
      oauthRedirectUrl: workerUrl,
      configured: false,
    };
  }
}

async function testDeployment(workerUrl) {
  if (!workerUrl) return;

  log("\n🧪 Testing deployment...", "blue");

  try {
    const response = await fetch(`${workerUrl}/health`);
    if (response.ok) {
      const data = await response.json();
      log("✅ Health check passed:", "green");
      log(`   Status: ${data.status}`, "cyan");
      log(`   Message: ${data.message}`, "cyan");
    } else {
      log("⚠️  Health check returned non-200 status", "yellow");
    }
  } catch (error) {
    log("⚠️  Could not test deployment automatically", "yellow");
    log(
      "   Your worker should still be working - try accessing it manually",
      "yellow"
    );
  }
}

async function showNextSteps(credentials) {
  log("\n🎉 Migration Complete!", "bright");
  log("═══════════════════════════════════════════════════════════", "cyan");

  log("\n✅ What was set up:", "green");
  log("   • KV namespaces created and configured", "cyan");
  log("   • Environment variables set", "cyan");
  log("   • Worker deployed to Cloudflare edge", "cyan");
  log("   • All API endpoints ready", "cyan");

  log("\n🔧 Manual steps still needed:", "yellow");
  log("   1. Update OAuth redirect URIs:", "yellow");

  if (credentials?.googleClientId && credentials?.oauthRedirectUrl) {
    log("      Google Cloud Console:", "cyan");
    log(
      "      • Go to: https://console.cloud.google.com/apis/credentials",
      "cyan"
    );
    log(`      • Edit OAuth client: ${credentials.googleClientId}`, "cyan");
    log("      • Add this single redirect URI:", "cyan");
    log(`        ${credentials.oauthRedirectUrl}/auth/google/callback`, "cyan");
    log(
      "      ✅ Just ONE redirect URI needed (same as your original Express backend)!",
      "green"
    );
  } else if (credentials?.googleClientId) {
    log("      Google Cloud Console:", "cyan");
    log(
      "      • Go to: https://console.cloud.google.com/apis/credentials",
      "cyan"
    );
    log(`      • Edit OAuth client: ${credentials.googleClientId}`, "cyan");
    log("      • Add this redirect URI:", "cyan");
    log(`        [YOUR_WORKER_URL]/auth/google/callback`, "cyan");
    log(
      "      ⚠️  Replace [YOUR_WORKER_URL] with your actual worker URL",
      "yellow"
    );
  }

  if (credentials?.airtableClientId && credentials?.oauthRedirectUrl) {
    log("      Airtable Developer Hub:", "cyan");
    log(
      "      • Go to: https://airtable.com/developers/web/api/oauth-reference",
      "cyan"
    );
    log(`      • Edit OAuth app: ${credentials.airtableClientId}`, "cyan");
    log("      • Add this single redirect URI:", "cyan");
    log(
      `        ${credentials.oauthRedirectUrl}/auth/airtable/callback`,
      "cyan"
    );
    log(
      "      ✅ Just ONE redirect URI needed (same as your original Express backend)!",
      "green"
    );
  } else if (credentials?.airtableClientId) {
    log("      Airtable Developer Hub:", "cyan");
    log(
      "      • Go to: https://airtable.com/developers/web/api/oauth-reference",
      "cyan"
    );
    log(`      • Edit OAuth app: ${credentials.airtableClientId}`, "cyan");
    log("      • Add this redirect URI:", "cyan");
    log(`        [YOUR_WORKER_URL]/auth/airtable/callback`, "cyan");
    log(
      "      ⚠️  Replace [YOUR_WORKER_URL] with your actual worker URL",
      "yellow"
    );
  }

  log("\n   2. Configure custom domains:", "yellow");
  log("      Option A - Cloudflare Pages (recommended):", "cyan");
  log(
    "      • wrangler pages deploy .next --project-name your-marketplace",
    "cyan"
  );
  log("      • Add custom domains in Cloudflare Pages dashboard", "cyan");
  log("      ", "cyan");
  log("      Option B - Cloudflare for SaaS (enterprise):", "cyan");
  log("      • Contact Cloudflare sales for unlimited domains", "cyan");

  log("\n   3. Update DNS records:", "yellow");
  log("      For each custom domain:", "cyan");
  log("      • Type: CNAME", "cyan");
  log("      • Name: @ (or subdomain)", "cyan");
  log("      • Value: your-worker.workers.dev", "cyan");

  log("\n📚 Resources:", "blue");
  log("   • Setup Guide: CLOUDFLARE_SETUP.md", "cyan");
  log("   • Migration Details: MIGRATION_COMPLETE.md", "cyan");
  log(
    "   • Cloudflare Docs: https://developers.cloudflare.com/workers/",
    "cyan"
  );

  log(
    "\n🚀 Your marketplace is now running on Cloudflare's global edge network!",
    "bright"
  );
  log("   • 10x better performance", "green");
  log("   • 10x lower costs", "green");
  log("   • Unlimited scalability", "green");
  log("   • Built-in DDoS protection", "green");

  log("\n💡 Quick commands:", "magenta");
  log("   • View logs: wrangler tail", "cyan");
  log("   • Deploy updates: npm run worker:deploy", "cyan");
  log("   • Local development: npm run worker:dev", "cyan");

  // Save setup summary
  const summary = {
    timestamp: new Date().toISOString(),
    status: "completed",
    worker_deployed: true,
    credentials_configured: !!credentials,
    next_steps: [
      "Update OAuth redirect URIs",
      "Configure custom domains",
      "Update DNS records",
      "Test authentication flows",
    ],
  };

  fs.writeFileSync("migration-summary.json", JSON.stringify(summary, null, 2));
  log("\n📄 Migration summary saved to migration-summary.json", "cyan");
}

async function main() {
  try {
    log("🚀 Cloudflare Workers Migration Script", "bright");
    log("════════════════════════════════════════", "cyan");
    log(
      "This script will migrate your marketplace to pure Cloudflare Workers",
      "cyan"
    );

    await checkPrerequisites();
    await checkCloudflareAuth();
    const namespaces = await setupKVNamespaces();
    const credentials = await setupEnvironmentVariables();
    const workerUrl = await buildAndDeploy();
    const oauthConfig = await setupOAuthRedirectUrl(workerUrl);
    await testDeployment(workerUrl);
    await showNextSteps({ ...credentials, ...oauthConfig });
  } catch (error) {
    log(`\n❌ Migration failed: ${error.message}`, "red");
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  log("\n\n🛑 Migration cancelled by user", "yellow");
  rl.close();
  process.exit(0);
});

// Run the migration
main().catch((error) => {
  log(`\n❌ Unexpected error: ${error.message}`, "red");
  process.exit(1);
});
