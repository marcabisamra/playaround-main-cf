// Cloudflare Worker - Multi-Domain Marketplace
// Pure edge computing implementation with static files + API

import {
  handleVerifyToken,
  handleGoogleSheetsCreate,
  handleAirtableCreateRecord,
  handleAirtableBases,
  handleAirtableTables,
  handleAirtableSetupInfo,
  handleStripeConfig,
  handleStripeCreateProduct,
  handleStripeGetProducts,
  handleStripeCreatePaymentIntent,
  handleLogout,
} from "./api-handlers.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const domain = url.hostname;

    // CORS handling for all requests
    if (request.method === "OPTIONS") {
      return handleCORS();
    }

    try {
      // Authentication routes
      if (url.pathname === "/auth/google") {
        return handleGoogleAuth(request, domain, env);
      }

      if (url.pathname === "/auth/google/callback") {
        return handleGoogleCallback(request, domain, env);
      }

      if (url.pathname === "/auth/airtable") {
        return handleAirtableAuth(request, domain, env);
      }

      if (url.pathname === "/auth/airtable/callback") {
        return handleAirtableCallback(request, domain, env);
      }

      // API routes
      if (url.pathname.startsWith("/api/")) {
        return handleAPIRequest(request, domain, env, ctx);
      }

      // Health check
      if (url.pathname === "/health") {
        return new Response(
          JSON.stringify({
            status: "OK",
            message: "Multi-domain auth worker is running",
            timestamp: new Date().toISOString(),
            domain: domain,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // Serve static Next.js app for all other requests
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(
        JSON.stringify({
          error: error.message,
          stack: error.stack,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};

// ==================== OAUTH IMPLEMENTATIONS ====================

async function handleGoogleAuth(request, domain, env) {
  const url = new URL(request.url);
  const returnDomain = url.searchParams.get("return_domain");

  if (!returnDomain) {
    return new Response("Missing return_domain parameter", { status: 400 });
  }

  console.log(`🔐 Starting Google OAuth flow for domain: ${returnDomain}`);

  // Create state with domain info and timestamp
  const stateData = {
    return_domain: returnDomain,
    timestamp: Date.now(),
  };
  const state = btoa(JSON.stringify(stateData));

  // Build Google OAuth URL
  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  // Use a single redirect URI for all domains
  // This maintains the same single-URI approach as the original Express backend
  const oauthRedirectUrl = env.OAUTH_REDIRECT_URL || url.origin;
  googleAuthUrl.searchParams.set(
    "redirect_uri",
    `${oauthRedirectUrl}/auth/google/callback`
  );
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set(
    "scope",
    "openid email profile https://www.googleapis.com/auth/spreadsheets"
  );
  googleAuthUrl.searchParams.set("access_type", "offline");
  googleAuthUrl.searchParams.set("state", state);

  console.log(`🔗 Redirecting to Google OAuth: ${googleAuthUrl.toString()}`);
  return Response.redirect(googleAuthUrl.toString(), 302);
}

async function handleGoogleCallback(request, domain, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  console.log("🔄 Handling Google OAuth callback...");

  if (error) {
    console.error("❌ OAuth error:", error);
    return new Response(`Authentication failed: ${error}`, { status: 400 });
  }

  if (!code || !state) {
    console.error("❌ Missing code or state parameter");
    return new Response("Missing code or state parameter", { status: 400 });
  }

  // Decode and validate state
  let stateData;
  try {
    stateData = JSON.parse(atob(state));

    // Check state age (10 minutes max)
    const stateAge = Date.now() - stateData.timestamp;
    if (stateAge > 10 * 60 * 1000) {
      console.error("❌ State parameter too old");
      return new Response("Authentication session expired", { status: 400 });
    }

    console.log(`📍 Return domain from state: ${stateData.return_domain}`);
  } catch (e) {
    console.error("❌ Invalid state parameter:", e);
    return new Response("Invalid state parameter", { status: 400 });
  }

  try {
    console.log("🎫 Exchanging code for access token...");

    // Exchange authorization code for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: `${
          env.OAUTH_REDIRECT_URL || url.origin
        }/auth/google/callback`,
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokens.access_token) {
      throw new Error("No access token received from Google");
    }

    console.log("👤 Fetching user profile from Google...");

    // Get user profile from Google
    const profileResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    const googleUser = await profileResponse.json();
    console.log(`✅ Successfully authenticated user: ${googleUser.email}`);

    // Create domain-specific JWT payload
    const tokenPayload = {
      userId: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
      domain: stateData.return_domain,
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token,
      airtableAccessToken: null,
      airtableRefreshToken: null,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
    };

    // Sign JWT using Web Crypto API
    const jwtToken = await signJWT(tokenPayload, env.JWT_SECRET);

    // Store user session in KV for server-side validation
    await env.USER_SESSIONS.put(
      `session:${googleUser.id}:${stateData.return_domain}`,
      JSON.stringify(tokenPayload),
      { expirationTtl: 24 * 60 * 60 } // 24 hours
    );

    // Redirect back to the original domain with token
    const returnUrl = `https://${stateData.return_domain}/?token=${jwtToken}`;
    console.log(`🏠 Redirecting back to: ${returnUrl}`);

    return Response.redirect(returnUrl, 302);
  } catch (error) {
    console.error("❌ Error during OAuth callback:", error);
    return new Response(`Authentication failed: ${error.message}`, {
      status: 500,
    });
  }
}

async function handleAirtableAuth(request, domain, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const requestDomain = url.searchParams.get("domain");

  console.log("🗂️ Starting Airtable OAuth flow...");

  // Check if Airtable OAuth is configured
  if (!env.AIRTABLE_CLIENT_ID || !env.AIRTABLE_CLIENT_SECRET) {
    console.error("❌ Airtable OAuth not configured");
    return new Response("Airtable OAuth integration is not configured", {
      status: 500,
    });
  }

  if (!token || !requestDomain) {
    return new Response("Missing token or domain parameter", { status: 400 });
  }

  // Verify the existing JWT token
  try {
    const decoded = await verifyJWT(token, env.JWT_SECRET);
    if (decoded.domain !== requestDomain) {
      return new Response("Token domain mismatch", { status: 403 });
    }
  } catch (error) {
    return new Response("Invalid token", { status: 401 });
  }

  console.log(`📍 Airtable OAuth for domain: ${requestDomain}`);

  // Generate a short random state ID and store the data in KV
  const stateId = crypto.randomUUID();

  // Generate PKCE parameters (required by Airtable)
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const stateData = {
    token: token,
    domain: requestDomain,
    codeVerifier: codeVerifier,
    timestamp: Date.now(),
  };

  // Store in KV with 10 minute expiration
  await env.OAUTH_STATES.put(stateId, JSON.stringify(stateData), {
    expirationTtl: 10 * 60, // 10 minutes
  });

  console.log(`🔑 Generated state ID: ${stateId}`);
  console.log(
    `🔐 Generated PKCE challenge: ${codeChallenge.substring(0, 20)}...`
  );

  // Build Airtable OAuth URL
  const airtableAuthUrl = new URL("https://airtable.com/oauth2/v1/authorize");
  airtableAuthUrl.searchParams.set("client_id", env.AIRTABLE_CLIENT_ID);
  airtableAuthUrl.searchParams.set(
    "redirect_uri",
    `${env.OAUTH_REDIRECT_URL || url.origin}/auth/airtable/callback`
  );
  airtableAuthUrl.searchParams.set("response_type", "code");
  airtableAuthUrl.searchParams.set(
    "scope",
    "data.records:read data.records:write schema.bases:read"
  );
  airtableAuthUrl.searchParams.set("state", stateId);
  airtableAuthUrl.searchParams.set("code_challenge", codeChallenge);
  airtableAuthUrl.searchParams.set("code_challenge_method", "S256");

  console.log(`🔗 Redirecting to Airtable: ${airtableAuthUrl.toString()}`);
  return Response.redirect(airtableAuthUrl.toString(), 302);
}

async function handleAirtableCallback(request, domain, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  console.log("🔄 Handling Airtable OAuth callback...");

  if (error) {
    console.error("❌ Airtable OAuth error:", error);
    return new Response(`Airtable authentication failed: ${error}`, {
      status: 400,
    });
  }

  if (!code || !state) {
    console.error("❌ Missing code or state parameter");
    return new Response("Missing authorization code or state", { status: 400 });
  }

  console.log(`🔍 Looking up state ID: ${state}`);

  // Get state data from KV
  const stateDataJson = await env.OAUTH_STATES.get(state);
  if (!stateDataJson) {
    console.error("❌ Invalid or expired state parameter");
    return new Response("Invalid or expired authentication session", {
      status: 400,
    });
  }

  const stateData = JSON.parse(stateDataJson);
  const {
    token: originalToken,
    domain: originalDomain,
    codeVerifier,
    timestamp,
  } = stateData;

  console.log(`✅ Found state data for domain: ${originalDomain}`);

  // Clean up state immediately
  await env.OAUTH_STATES.delete(state);

  // Check timestamp
  const stateAge = Date.now() - timestamp;
  if (stateAge > 10 * 60 * 1000) {
    console.error("❌ State parameter too old");
    return new Response("Authentication session expired", { status: 400 });
  }

  try {
    console.log("🎫 Exchanging Airtable code for access token...");

    // Exchange authorization code for access token using PKCE
    const tokenPayload = new URLSearchParams({
      code: code,
      grant_type: "authorization_code",
      redirect_uri: `${
        env.OAUTH_REDIRECT_URL || url.origin
      }/auth/airtable/callback`,
      code_verifier: codeVerifier,
    });

    // Create HTTP Basic Auth header
    const basicAuth = btoa(
      `${env.AIRTABLE_CLIENT_ID}:${env.AIRTABLE_CLIENT_SECRET}`
    );

    console.log(
      `🔑 Using HTTP Basic Auth with client_id: ${env.AIRTABLE_CLIENT_ID}`
    );

    let tokenResponse;
    try {
      // Try HTTP Basic Authentication first
      tokenResponse = await fetch("https://airtable.com/oauth2/v1/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: `Basic ${basicAuth}`,
        },
        body: tokenPayload.toString(),
      });

      if (!tokenResponse.ok) {
        throw new Error(`HTTP ${tokenResponse.status}`);
      }

      console.log("✅ HTTP Basic Auth method worked!");
    } catch (basicAuthError) {
      console.log("⚠️ HTTP Basic Auth failed, trying request body method...");

      // Fallback to request body method
      const fallbackPayload = new URLSearchParams({
        code: code,
        grant_type: "authorization_code",
        redirect_uri: `${
          env.OAUTH_REDIRECT_URL || url.origin
        }/auth/airtable/callback`,
        code_verifier: codeVerifier,
        client_id: env.AIRTABLE_CLIENT_ID,
        client_secret: env.AIRTABLE_CLIENT_SECRET,
      });

      tokenResponse = await fetch("https://airtable.com/oauth2/v1/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: fallbackPayload.toString(),
      });

      console.log("✅ Request body method worked!");
    }

    const tokens = await tokenResponse.json();

    if (!tokens.access_token) {
      throw new Error("No access token received from Airtable");
    }

    console.log("✅ Successfully received Airtable tokens");

    // Decode the original JWT to update it with Airtable tokens
    const originalDecoded = await verifyJWT(originalToken, env.JWT_SECRET);

    // Create new JWT with Airtable tokens added
    const updatedTokenPayload = {
      ...originalDecoded,
      airtableAccessToken: tokens.access_token,
      airtableRefreshToken: tokens.refresh_token,
      iat: Math.floor(Date.now() / 1000),
      // Keep the same expiration time
    };

    const updatedJwtToken = await signJWT(updatedTokenPayload, env.JWT_SECRET);

    // Update session in KV
    await env.USER_SESSIONS.put(
      `session:${originalDecoded.userId}:${originalDomain}`,
      JSON.stringify(updatedTokenPayload),
      { expirationTtl: 24 * 60 * 60 } // 24 hours
    );

    // Redirect back to the domain with updated token
    const returnUrl = `https://${originalDomain}/?token=${updatedJwtToken}&airtable_connected=true`;
    console.log(`🏠 Redirecting back with Airtable tokens: ${originalDomain}`);

    return Response.redirect(returnUrl, 302);
  } catch (error) {
    console.error("❌ Error during Airtable OAuth callback:", error);
    return new Response(`Airtable authentication failed: ${error.message}`, {
      status: 500,
    });
  }
}

// ==================== API REQUEST HANDLER ====================

async function handleAPIRequest(request, domain, env, ctx) {
  const url = new URL(request.url);

  // Add CORS headers to all API responses
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  try {
    // Route to specific API handlers
    if (url.pathname === "/api/verify-token") {
      return await handleVerifyToken(request, domain, env, corsHeaders);
    }

    if (url.pathname === "/api/sheets/create") {
      return await handleGoogleSheetsCreate(request, domain, env, corsHeaders);
    }

    if (url.pathname === "/api/airtable/create-record") {
      return await handleAirtableCreateRecord(
        request,
        domain,
        env,
        corsHeaders
      );
    }

    if (url.pathname === "/api/airtable/bases") {
      return await handleAirtableBases(request, domain, env, corsHeaders);
    }

    if (url.pathname === "/api/airtable/tables") {
      return await handleAirtableTables(request, domain, env, corsHeaders);
    }

    if (url.pathname === "/api/airtable/setup-info") {
      return await handleAirtableSetupInfo(request, domain, env, corsHeaders);
    }

    // Stripe endpoints
    if (url.pathname === "/api/stripe/config") {
      return await handleStripeConfig(request, domain, env, corsHeaders);
    }

    if (url.pathname === "/api/stripe/create-product") {
      return await handleStripeCreateProduct(request, domain, env, corsHeaders);
    }

    if (url.pathname === "/api/stripe/products") {
      return await handleStripeGetProducts(request, domain, env, corsHeaders);
    }

    if (url.pathname === "/api/stripe/create-payment-intent") {
      return await handleStripeCreatePaymentIntent(
        request,
        domain,
        env,
        corsHeaders
      );
    }

    if (url.pathname === "/api/stripe/create-subscription") {
      return await handleStripeCreateSubscription(
        request,
        domain,
        env,
        corsHeaders
      );
    }

    if (url.pathname === "/api/stripe/create-subscription-intent") {
      return await handleStripeCreateSubscriptionIntent(
        request,
        domain,
        env,
        corsHeaders
      );
    }

    if (url.pathname === "/api/stripe/subscriptions") {
      return await handleStripeGetSubscriptions(
        request,
        domain,
        env,
        corsHeaders
      );
    }

    if (url.pathname === "/api/stripe/cancel-subscription") {
      return await handleStripeCancelSubscription(
        request,
        domain,
        env,
        corsHeaders
      );
    }

    if (url.pathname === "/api/stripe/global-analytics") {
      return await handleStripeGlobalAnalytics(
        request,
        domain,
        env,
        corsHeaders
      );
    }

    if (url.pathname === "/api/stripe/global-products") {
      return await handleStripeGlobalProducts(
        request,
        domain,
        env,
        corsHeaders
      );
    }

    if (url.pathname === "/api/logout") {
      return await handleLogout(request, domain, env, corsHeaders);
    }

    return new Response("API endpoint not found", {
      status: 404,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("API Error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

// ==================== JWT UTILITIES ====================

async function signJWT(payload, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));

  const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);
  const signature = await crypto.subtle.sign("HMAC", key, data);
  const encodedSignature = base64urlEncode(new Uint8Array(signature));

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

async function verifyJWT(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);
  const signature = base64urlDecode(encodedSignature);

  const isValid = await crypto.subtle.verify("HMAC", key, signature, data);
  if (!isValid) {
    throw new Error("Invalid JWT signature");
  }

  const payload = JSON.parse(base64urlDecodeToString(encodedPayload));

  // Check expiration
  if (payload.exp && payload.exp < Date.now() / 1000) {
    throw new Error("JWT token expired");
  }

  return payload;
}

// ==================== UTILITY FUNCTIONS ====================

function base64urlEncode(data) {
  if (typeof data === "string") {
    data = new TextEncoder().encode(data);
  }
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) {
    str += "=";
  }
  const bytes = atob(str);
  return new Uint8Array(bytes.split("").map((c) => c.charCodeAt(0)));
}

function base64urlDecodeToString(str) {
  const bytes = base64urlDecode(str);
  return new TextDecoder().decode(bytes);
}

function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64urlEncode(array);
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64urlEncode(new Uint8Array(hash));
}

function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// ==================== API IMPLEMENTATIONS ====================
// Note: Individual API handlers will be implemented in the next step
// This includes all the Stripe, Google Sheets, Airtable endpoints
