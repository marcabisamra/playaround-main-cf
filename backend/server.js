const express = require("express");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const axios = require("axios");
const Airtable = require("airtable");
const crypto = require("crypto");
const Stripe = require("stripe");
require("dotenv").config();

// Helper function for base64url encoding (Node.js compatibility)
function base64urlEncode(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// In-memory store for OAuth state (in production, use Redis or database)
const oauthStateStore = new Map();

// Clean up expired state entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of oauthStateStore.entries()) {
    if (now - value.timestamp > 10 * 60 * 1000) {
      // 10 minutes
      oauthStateStore.delete(key);
    }
  }
}, 5 * 60 * 1000); // 5 minutes

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cookieParser());
app.use(
  cors({
    origin: true, // Allow all origins for testing
    credentials: true,
  })
);
app.use(express.json());

// Environment variables (you'll need to set these)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const AIRTABLE_CLIENT_ID = process.env.AIRTABLE_CLIENT_ID;
const AIRTABLE_CLIENT_SECRET = process.env.AIRTABLE_CLIENT_SECRET;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
const JWT_SECRET =
  process.env.JWT_SECRET ||
  "your-super-secret-jwt-key-change-this-in-production";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

// Initialize Stripe
const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;

// Validate required environment variables
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error("Missing required Google OAuth credentials!");
  console.error(
    "Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables"
  );
  process.exit(1);
}

// Warn about missing Airtable credentials (not required for basic functionality)
if (!AIRTABLE_CLIENT_ID || !AIRTABLE_CLIENT_SECRET) {
  console.warn("⚠️ Missing Airtable OAuth credentials!");
  console.warn(
    "Airtable OAuth integration will not work. Set AIRTABLE_CLIENT_ID and AIRTABLE_CLIENT_SECRET to enable it."
  );
  console.warn(
    "Users can still use the API key method for Airtable integration."
  );
}

// Warn about missing Stripe credentials
if (!STRIPE_SECRET_KEY || !STRIPE_PUBLISHABLE_KEY) {
  console.warn("⚠️ Missing Stripe credentials!");
  console.warn(
    "Stripe payment integration will not work. Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY to enable it."
  );
}

// --- ROUTE 1: Health check ---
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Multi-domain auth backend is running",
    timestamp: new Date().toISOString(),
  });
});

// --- ROUTE 2: Start the Google OAuth flow ---
app.get("/auth/google", (req, res) => {
  console.log("🔐 Starting Google OAuth flow...");

  const { return_domain } = req.query;

  if (!return_domain) {
    return res.status(400).json({
      error: "Missing return_domain parameter",
    });
  }

  console.log(`📍 Return domain: ${return_domain}`);

  // Use OAuth state parameter to store return domain (more reliable than cookies)
  const stateData = {
    return_domain: return_domain,
    timestamp: Date.now(),
  };
  const state = Buffer.from(JSON.stringify(stateData)).toString("base64");

  // Build Google OAuth URL
  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.append("client_id", GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.append(
    "redirect_uri",
    `${BACKEND_URL}/auth/google/callback`
  );
  googleAuthUrl.searchParams.append("response_type", "code");
  googleAuthUrl.searchParams.append(
    "scope",
    "openid email profile https://www.googleapis.com/auth/spreadsheets"
  );
  googleAuthUrl.searchParams.append("access_type", "offline");
  googleAuthUrl.searchParams.append("state", state);

  console.log(`🔗 Redirecting to Google: ${googleAuthUrl.toString()}`);
  res.redirect(googleAuthUrl.toString());
});

// --- ROUTE 3: Handle Google OAuth callback ---
app.get("/auth/google/callback", async (req, res) => {
  console.log("🔄 Handling Google OAuth callback...");

  const { code, error, state } = req.query;

  if (error) {
    console.error("❌ OAuth error:", error);
    return res.status(400).send(`Authentication failed: ${error}`);
  }

  if (!code) {
    console.error("❌ No authorization code received");
    return res.status(400).send("No authorization code received");
  }

  if (!state) {
    console.error("❌ No state parameter received");
    return res.status(400).send("No state parameter received");
  }

  // Decode state parameter to get return domain
  let return_domain;
  try {
    const stateData = JSON.parse(Buffer.from(state, "base64").toString());
    return_domain = stateData.return_domain;

    // Optional: Check timestamp to prevent replay attacks
    const stateAge = Date.now() - stateData.timestamp;
    if (stateAge > 10 * 60 * 1000) {
      // 10 minutes
      console.error("❌ State parameter too old");
      return res.status(400).send("Authentication session expired");
    }

    console.log(`📍 Return domain from state: ${return_domain}`);
  } catch (e) {
    console.error("❌ Invalid state parameter:", e);
    return res.status(400).send("Invalid state parameter");
  }

  try {
    console.log("🎫 Exchanging code for access token...");

    // Exchange authorization code for access token
    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      {
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: `${BACKEND_URL}/auth/google/callback`,
      }
    );

    const { access_token, refresh_token } = tokenResponse.data;

    if (!access_token) {
      throw new Error("No access token received from Google");
    }

    console.log("👤 Fetching user profile from Google...");

    // Get user profile from Google
    const profileResponse = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const googleUser = profileResponse.data;
    console.log(`✅ Successfully authenticated user: ${googleUser.email}`);

    // Create JWT token specific to the requesting domain
    const tokenPayload = {
      userId: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
      domain: return_domain, // This ties the token to the specific domain
      googleAccessToken: access_token,
      googleRefreshToken: refresh_token,
      // Airtable tokens will be added separately via additional OAuth flow
      airtableAccessToken: null,
      airtableRefreshToken: null,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
    };

    const jwtToken = jwt.sign(tokenPayload, JWT_SECRET);

    // Redirect back to the original domain with the token
    const returnUrl = `https://${return_domain}/?token=${jwtToken}`;
    console.log(`🏠 Redirecting back to: ${returnUrl}`);

    res.redirect(returnUrl);
  } catch (error) {
    console.error("❌ Error during OAuth callback:", error.message);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

// --- ROUTE 4: Airtable OAuth Integration ---
app.get("/auth/airtable", (req, res) => {
  console.log("🗂️ Starting Airtable OAuth flow...");

  // Check if Airtable OAuth is configured
  if (!AIRTABLE_CLIENT_ID || !AIRTABLE_CLIENT_SECRET) {
    console.error("❌ Airtable OAuth not configured");
    return res
      .status(500)
      .send(
        "Airtable OAuth integration is not configured on this server. Please contact the administrator."
      );
  }

  const { token, domain } = req.query;

  if (!token || !domain) {
    return res.status(400).json({
      error: "Missing token or domain parameter",
    });
  }

  // Verify the existing JWT token
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.domain !== domain) {
      return res.status(403).json({ error: "Token domain mismatch" });
    }
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }

  console.log(`📍 Airtable OAuth for domain: ${domain}`);

  // Generate a short random state ID and store the data server-side
  const stateId = crypto.randomBytes(16).toString("hex");

  // Generate PKCE parameters (required by Airtable)
  const codeVerifier = base64urlEncode(crypto.randomBytes(32));
  const codeChallenge = base64urlEncode(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );

  const stateData = {
    token: token,
    domain: domain,
    codeVerifier: codeVerifier, // Store for use in callback
    timestamp: Date.now(),
  };

  // Store in memory (expires in 10 minutes)
  oauthStateStore.set(stateId, stateData);
  setTimeout(() => {
    oauthStateStore.delete(stateId);
  }, 10 * 60 * 1000); // 10 minutes

  console.log(`🔑 Generated state ID: ${stateId} (length: ${stateId.length})`);
  console.log(
    `🔐 Generated PKCE challenge: ${codeChallenge.substring(
      0,
      20
    )}... (length: ${codeChallenge.length})`
  );
  console.log(`📦 OAuth state store size: ${oauthStateStore.size}`);

  // Build Airtable OAuth URL
  const airtableAuthUrl = new URL("https://airtable.com/oauth2/v1/authorize");
  airtableAuthUrl.searchParams.append("client_id", AIRTABLE_CLIENT_ID);
  airtableAuthUrl.searchParams.append(
    "redirect_uri",
    `${BACKEND_URL}/auth/airtable/callback`
  );
  airtableAuthUrl.searchParams.append("response_type", "code");
  airtableAuthUrl.searchParams.append(
    "scope",
    "data.records:read data.records:write schema.bases:read"
  );
  airtableAuthUrl.searchParams.append("state", stateId);

  // Add PKCE parameters (required by Airtable)
  airtableAuthUrl.searchParams.append("code_challenge", codeChallenge);
  airtableAuthUrl.searchParams.append("code_challenge_method", "S256");

  console.log(`🔗 Redirecting to Airtable: ${airtableAuthUrl.toString()}`);
  res.redirect(airtableAuthUrl.toString());
});

// --- ROUTE 5: Handle Airtable OAuth callback ---
app.get("/auth/airtable/callback", async (req, res) => {
  console.log("🔄 Handling Airtable OAuth callback...");

  const { code, error, state } = req.query;

  if (error) {
    console.error("❌ Airtable OAuth error:", error);
    return res.status(400).send(`Airtable authentication failed: ${error}`);
  }

  if (!code || !state) {
    console.error("❌ Missing code or state parameter");
    return res.status(400).send("Missing authorization code or state");
  }

  console.log(`🔍 Looking up state ID: ${state}`);
  console.log(`📦 Current store size: ${oauthStateStore.size}`);

  // Get state data from server-side store
  const stateData = oauthStateStore.get(state);
  if (!stateData) {
    console.error("❌ Invalid or expired state parameter");
    console.log(
      `🗝️ Available state IDs: ${Array.from(oauthStateStore.keys()).join(", ")}`
    );
    return res.status(400).send("Invalid or expired authentication session");
  }

  const { token: originalToken, domain, codeVerifier, timestamp } = stateData;
  console.log(`✅ Found state data for domain: ${domain}`);

  // Remove state immediately to prevent duplicate usage
  oauthStateStore.delete(state);
  console.log(
    `🗑️ Removed state from store, remaining: ${oauthStateStore.size}`
  );

  // Check timestamp
  const stateAge = Date.now() - timestamp;
  if (stateAge > 10 * 60 * 1000) {
    console.error("❌ State parameter too old");
    oauthStateStore.delete(state); // Clean up
    return res.status(400).send("Authentication session expired");
  }

  // Clean up the state data
  oauthStateStore.delete(state);

  try {
    console.log("🎫 Exchanging Airtable code for access token...");
    console.log(
      `🔐 Using PKCE verifier: ${codeVerifier.substring(0, 20)}... (length: ${
        codeVerifier.length
      })`
    );

    // Exchange authorization code for access token
    // Try HTTP Basic Authentication (RFC 6749 standard)
    const tokenPayload = {
      code: code,
      grant_type: "authorization_code",
      redirect_uri: `${BACKEND_URL}/auth/airtable/callback`,
      code_verifier: codeVerifier, // PKCE parameter
    };

    // Create HTTP Basic Auth header
    const basicAuth = Buffer.from(
      `${AIRTABLE_CLIENT_ID}:${AIRTABLE_CLIENT_SECRET}`
    ).toString("base64");

    console.log(`🔍 Token exchange payload (Basic Auth):`, {
      ...tokenPayload,
      code: `${code.substring(0, 10)}...`,
      code_verifier: `${codeVerifier.substring(0, 10)}...`,
    });
    console.log(
      `🔑 Using HTTP Basic Auth with client_id: ${AIRTABLE_CLIENT_ID}`
    );
    console.log(`🔗 Redirect URI: ${BACKEND_URL}/auth/airtable/callback`);

    let tokenResponse;
    try {
      // Try HTTP Basic Authentication first
      tokenResponse = await axios.post(
        "https://airtable.com/oauth2/v1/token",
        new URLSearchParams(tokenPayload).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            Authorization: `Basic ${basicAuth}`,
          },
        }
      );
      console.log("✅ HTTP Basic Auth method worked!");
    } catch (basicAuthError) {
      console.log("⚠️ HTTP Basic Auth failed, trying request body method...");
      console.log("Basic Auth Error:", basicAuthError.response?.data);

      // Fallback to request body method
      const fallbackPayload = {
        ...tokenPayload,
        client_id: AIRTABLE_CLIENT_ID,
        client_secret: AIRTABLE_CLIENT_SECRET,
      };

      tokenResponse = await axios.post(
        "https://airtable.com/oauth2/v1/token",
        new URLSearchParams(fallbackPayload).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
        }
      );
      console.log("✅ Request body method worked!");
    }

    const { access_token, refresh_token } = tokenResponse.data;

    if (!access_token) {
      throw new Error("No access token received from Airtable");
    }

    console.log("✅ Successfully received Airtable tokens");

    // Decode the original JWT to update it with Airtable tokens
    const originalDecoded = jwt.verify(originalToken, JWT_SECRET);

    // Create new JWT with Airtable tokens added
    const updatedTokenPayload = {
      ...originalDecoded,
      airtableAccessToken: access_token,
      airtableRefreshToken: refresh_token,
      iat: Math.floor(Date.now() / 1000),
      // Keep the same expiration time
    };

    const updatedJwtToken = jwt.sign(updatedTokenPayload, JWT_SECRET);

    // Redirect back to the domain with updated token
    const returnUrl = `https://${domain}/?token=${updatedJwtToken}&airtable_connected=true`;
    console.log(`🏠 Redirecting back with Airtable tokens: ${domain}`);

    res.redirect(returnUrl);
  } catch (error) {
    console.error("❌ Error during Airtable OAuth callback:", error.message);

    // Log detailed error information
    if (error.response) {
      console.error("🔍 Airtable API Error Details:");
      console.error("  Status:", error.response.status);
      console.error("  Headers:", error.response.headers);
      console.error("  Data:", error.response.data);
    } else if (error.request) {
      console.error("🔍 No response received:", error.request);
    } else {
      console.error("🔍 Request setup error:", error.message);
    }

    res.status(500).send(`Airtable authentication failed: ${error.message}`);
  }
});

// --- ROUTE 6: Verify token (optional, for frontend to validate tokens) ---
app.post("/api/verify-token", (req, res) => {
  const { token, domain } = req.body;

  if (!token || !domain) {
    return res.status(400).json({ error: "Token and domain are required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== domain) {
      return res.status(403).json({ error: "Token domain mismatch" });
    }

    res.json({
      valid: true,
      user: {
        userId: decoded.userId,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
        domain: decoded.domain,
      },
    });
  } catch (error) {
    res.status(401).json({ valid: false, error: "Invalid token" });
  }
});

// --- ROUTE 5: Google Sheets Integration ---
app.post("/api/sheets/create", async (req, res) => {
  const { token, domain, sheetName } = req.body;

  if (!token || !domain) {
    return res.status(400).json({ error: "Token and domain are required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== domain) {
      return res.status(403).json({ error: "Token domain mismatch" });
    }

    if (!decoded.googleAccessToken) {
      return res.status(400).json({ error: "No Google access token found" });
    }

    // Create a new Google Sheet
    const sheetsResponse = await axios.post(
      "https://sheets.googleapis.com/v4/spreadsheets",
      {
        properties: {
          title:
            sheetName ||
            `${domain} - Data Sheet - ${new Date().toLocaleDateString()}`,
        },
        sheets: [
          {
            properties: {
              title: "Data",
              gridProperties: {
                rowCount: 100,
                columnCount: 10,
              },
            },
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${decoded.googleAccessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const spreadsheet = sheetsResponse.data;

    // Add some sample data
    await axios.put(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet.spreadsheetId}/values/Data!A1:C3?valueInputOption=RAW`,
      {
        values: [
          ["Domain", "User", "Created"],
          [domain, decoded.email, new Date().toISOString()],
          ["Sample", "Data", "Row"],
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${decoded.googleAccessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      success: true,
      spreadsheet: {
        id: spreadsheet.spreadsheetId,
        title: spreadsheet.properties.title,
        url: spreadsheet.spreadsheetUrl,
      },
    });
  } catch (error) {
    console.error(
      "❌ Error creating Google Sheet:",
      error.response?.data || error.message
    );
    res.status(500).json({
      error: "Failed to create Google Sheet",
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// --- ROUTE 8: Airtable Integration ---
app.post("/api/airtable/create-record", async (req, res) => {
  const { token, domain, airtableApiKey, baseId, tableName, recordData } =
    req.body;

  if (!token || !domain) {
    return res.status(400).json({ error: "Token and domain are required" });
  }

  if (!baseId) {
    return res.status(400).json({
      error: "Base ID is required",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== domain) {
      return res.status(403).json({ error: "Token domain mismatch" });
    }

    // Determine which authentication method to use
    let airtableAuth;
    if (decoded.airtableAccessToken) {
      // Use OAuth token (preferred method)
      console.log("🔐 Using Airtable OAuth token");
      airtableAuth = { apiKey: decoded.airtableAccessToken };
    } else if (airtableApiKey) {
      // Fallback to user-provided API key
      console.log("🔑 Using user-provided API key");
      airtableAuth = { apiKey: airtableApiKey };
    } else {
      return res.status(400).json({
        error: "No Airtable authentication available",
        details: "Either connect Airtable via OAuth or provide an API key",
      });
    }

    // Configure Airtable
    const airtable = new Airtable(airtableAuth);
    const base = airtable.base(baseId);
    const table = base(tableName || "Main Table");

    console.log(`📋 Creating Airtable record for domain: ${domain}`);

    // Start with just the Name field (safest approach)
    let recordToCreate = {
      Name: `${decoded.name} - ${domain} (${new Date().toLocaleDateString()})`,
    };

    // Try to detect what fields exist by reading the table schema
    let existingFields = [];
    try {
      const records = await table.select({ maxRecords: 1 }).firstPage();
      if (records.length > 0) {
        existingFields = Object.keys(records[0].fields);
        console.log(`📝 Detected existing fields:`, existingFields);
      } else {
        // Table is empty, try to get schema from table metadata
        console.log("📝 Table is empty, using Name field only");
      }
    } catch (schemaError) {
      console.log("⚠️ Could not read table schema, using Name field only");
    }

    // If we successfully detected fields, add more data
    if (existingFields.length > 0) {
      const potentialFields = {
        Domain: domain,
        "User Email": decoded.email,
        "User Name": decoded.name,
        Email: decoded.email,
        Created: new Date().toISOString(),
        "Created At": new Date().toISOString(),
        Date: new Date().toLocaleDateString(),
        Status: "Active",
        Notes: `Record created from ${domain} via multi-domain auth system`,
        Description: `User ${decoded.email} logged in from ${domain}`,
        ...recordData, // Allow custom fields
      };

      // Only add fields that actually exist in the table
      existingFields.forEach((fieldName) => {
        if (potentialFields[fieldName] !== undefined) {
          recordToCreate[fieldName] = potentialFields[fieldName];
        }
      });
    }

    console.log(`📝 Creating record with fields:`, Object.keys(recordToCreate));

    // Create the record
    const createdRecords = await table.create([
      {
        fields: recordToCreate,
      },
    ]);

    const record = createdRecords[0];

    res.json({
      success: true,
      record: {
        id: record.id,
        fields: record.fields,
        baseId: baseId,
        tableName: tableName || "Main Table",
      },
    });
  } catch (error) {
    console.error("❌ Error creating Airtable record:", error.message);

    // Handle specific Airtable errors
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: "Invalid Airtable API key",
        details: "Please check your API key and try again",
      });
    }

    if (error.statusCode === 404) {
      return res.status(404).json({
        error: "Base or table not found",
        details: "Please check your Base ID and table name",
      });
    }

    // Handle field-related errors
    if (error.message && error.message.includes("Unknown field")) {
      return res.status(400).json({
        error: "Unknown field in table",
        details: `${error.message}. Your table needs at least a 'Name' field. Consider adding fields like: Domain, Email, Created, Status, Notes.`,
        suggestion:
          "Go to your Airtable base and add these field names, or just use the existing 'Name' field which we'll populate automatically.",
      });
    }

    if (error.statusCode === 422) {
      return res.status(422).json({
        error: "Invalid field data",
        details: `${error.message}. This usually means the data doesn't match the field type in Airtable.`,
        suggestion:
          "Check that your table field types match the data we're sending (text fields for names, date field for Created At, etc.)",
      });
    }

    res.status(500).json({
      error: "Failed to create Airtable record",
      details: error.message,
      suggestion:
        "Check your Airtable base permissions and field configuration",
    });
  }
});

// --- ROUTE 9: Get user's Airtable bases (OAuth) ---
app.post("/api/airtable/bases", async (req, res) => {
  try {
    console.log("📋 Fetching user's Airtable bases...");

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid token" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check if user has Airtable OAuth tokens
    if (!decoded.airtableAccessToken) {
      return res.status(400).json({
        error: "No Airtable connection",
        message: "Please connect your Airtable account first",
      });
    }

    // Fetch bases using Airtable OAuth token
    const basesResponse = await axios.get(
      "https://api.airtable.com/v0/meta/bases",
      {
        headers: {
          Authorization: `Bearer ${decoded.airtableAccessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Found ${basesResponse.data.bases.length} Airtable bases`);

    res.json({
      success: true,
      bases: basesResponse.data.bases.map((base) => ({
        id: base.id,
        name: base.name,
        permissionLevel: base.permissionLevel,
      })),
    });
  } catch (error) {
    console.error("❌ Error fetching Airtable bases:", error.message);
    if (error.response) {
      console.error("Airtable API Error:", error.response.data);
    }
    res.status(500).json({
      error: "Failed to fetch bases",
      message: error.message,
    });
  }
});

// --- ROUTE 10: Get tables for a specific base (OAuth) ---
app.post("/api/airtable/tables", async (req, res) => {
  try {
    const { baseId } = req.body;
    console.log(`📋 Fetching tables for base: ${baseId}`);

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid token" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded.airtableAccessToken) {
      return res.status(400).json({
        error: "No Airtable connection",
        message: "Please connect your Airtable account first",
      });
    }

    if (!baseId) {
      return res.status(400).json({ error: "Base ID is required" });
    }

    // Fetch tables for the specific base
    const tablesResponse = await axios.get(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      {
        headers: {
          Authorization: `Bearer ${decoded.airtableAccessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      `✅ Found ${tablesResponse.data.tables.length} tables in base ${baseId}`
    );

    res.json({
      success: true,
      tables: tablesResponse.data.tables.map((table) => ({
        id: table.id,
        name: table.name,
        primaryFieldId: table.primaryFieldId,
        fields: table.fields.map((field) => ({
          id: field.id,
          name: field.name,
          type: field.type,
        })),
      })),
    });
  } catch (error) {
    console.error("❌ Error fetching Airtable tables:", error.message);
    if (error.response) {
      console.error("Airtable API Error:", error.response.data);
    }
    res.status(500).json({
      error: "Failed to fetch tables",
      message: error.message,
    });
  }
});

// --- ROUTE 11: Get Airtable Setup Info ---
app.post("/api/airtable/setup-info", async (req, res) => {
  const { token, domain } = req.body;

  if (!token || !domain) {
    return res.status(400).json({ error: "Token and domain are required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== domain) {
      return res.status(403).json({ error: "Token domain mismatch" });
    }

    // Return setup instructions
    res.json({
      success: true,
      setupInfo: {
        domain: domain,
        user: decoded.email,
        instructions: [
          "1. Go to https://airtable.com/create/tokens",
          "2. Create a personal access token with 'data.records:write' scope",
          "3. Copy your Base ID from your Airtable base URL",
          "4. Ensure your base has a table (we'll use 'Main Table' by default)",
        ],
        sampleRecord: {
          Domain: domain,
          "User Email": decoded.email,
          "User Name": decoded.name,
          "Created At": new Date().toISOString(),
          Status: "Active",
        },
      },
    });
  } catch (error) {
    res.status(401).json({ valid: false, error: "Invalid token" });
  }
});

// --- ROUTE 12: Get Stripe Publishable Key ---
app.get("/api/stripe/config", (req, res) => {
  if (!STRIPE_PUBLISHABLE_KEY) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  res.json({
    publishableKey: STRIPE_PUBLISHABLE_KEY,
  });
});

// --- ROUTE 13: Create Stripe Product ---
app.post("/api/stripe/create-product", async (req, res) => {
  const { token, domain, name, description, price } = req.body;

  if (!token || !domain) {
    return res.status(400).json({ error: "Token and domain are required" });
  }

  if (!stripe) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== domain) {
      return res.status(403).json({ error: "Token domain mismatch" });
    }

    console.log(`💳 Creating Stripe product for domain: ${domain}`);

    // Create product
    const product = await stripe.products.create({
      name: name,
      description: description,
      metadata: {
        domain: domain,
        created_by: decoded.email,
      },
    });

    // Create price
    const priceObj = await stripe.prices.create({
      unit_amount: Math.round(price * 100), // Convert to cents
      currency: "usd",
      product: product.id,
    });

    // Update product to set this price as default
    await stripe.products.update(product.id, {
      default_price: priceObj.id,
    });

    console.log(
      `✅ Created Stripe product: ${product.id} with price: ${priceObj.id} ($${price})`
    );

    res.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        price: price,
        priceId: priceObj.id,
        domain: domain,
      },
    });
  } catch (error) {
    console.error("❌ Error creating Stripe product:", error.message);
    res.status(500).json({
      error: "Failed to create product",
      details: error.message,
    });
  }
});

// --- ROUTE 14: Create Payment Intent ---
app.post("/api/stripe/create-payment-intent", async (req, res) => {
  const { token, domain, priceId, productId } = req.body;

  if (!token || !domain) {
    return res.status(400).json({ error: "Token and domain are required" });
  }

  if (!stripe) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== domain) {
      return res.status(403).json({ error: "Token domain mismatch" });
    }

    console.log(`💳 Creating payment intent for domain: ${domain}`);
    console.log(`🔍 Product ID: ${productId}, Price ID: ${priceId}`);

    if (!priceId) {
      throw new Error("Price ID is required but was not provided");
    }

    // Get the price to determine amount
    const price = await stripe.prices.retrieve(priceId);
    console.log(
      `💰 Retrieved price: $${
        price.unit_amount / 100
      } ${price.currency.toUpperCase()}`
    );

    if (!price.unit_amount || price.unit_amount <= 0) {
      throw new Error(
        `Invalid price amount: ${price.unit_amount}. Price must be greater than 0.`
      );
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: price.unit_amount,
      currency: price.currency,
      metadata: {
        domain: domain,
        customer_email: decoded.email,
        product_id: productId,
        price_id: priceId,
      },
      receipt_email: decoded.email,
    });

    console.log(
      `✅ Created payment intent: ${paymentIntent.id} for $${
        price.unit_amount / 100
      }`
    );

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("❌ Error creating payment intent:", error.message);
    res.status(500).json({
      error: "Failed to create payment intent",
      details: error.message,
    });
  }
});

// --- ROUTE 15: Get Stripe Products for Domain ---
app.post("/api/stripe/products", async (req, res) => {
  const { token, domain } = req.body;

  if (!token || !domain) {
    return res.status(400).json({ error: "Token and domain are required" });
  }

  if (!stripe) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== domain) {
      return res.status(403).json({ error: "Token domain mismatch" });
    }

    console.log(`📦 Fetching Stripe products for domain: ${domain}`);

    // Get all products (we'll filter by domain in metadata)
    const products = await stripe.products.list({
      limit: 100,
      expand: ["data.default_price"],
    });

    // Filter products by domain
    const domainProducts = products.data.filter(
      (product) => product.metadata.domain === domain
    );

    console.log(
      `✅ Found ${domainProducts.length} products for domain: ${domain}`
    );

    const productsWithPrices = domainProducts.map((product) => {
      const price = product.default_price
        ? product.default_price.unit_amount / 100
        : 0;
      const priceId = product.default_price ? product.default_price.id : null;

      console.log(
        `📦 Product: ${product.name}, Price: $${price}, PriceId: ${priceId}`
      );

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: price,
        priceId: priceId,
        domain: product.metadata.domain,
        created: product.created,
        type: product.metadata.product_type || "one-time",
        interval: product.default_price?.recurring?.interval || null,
      };
    });

    res.json({
      success: true,
      products: productsWithPrices,
    });
  } catch (error) {
    console.error("❌ Error fetching Stripe products:", error.message);
    res.status(500).json({
      error: "Failed to fetch products",
      details: error.message,
    });
  }
});

// --- ROUTE 16: Create Subscription Product ---
app.post("/api/stripe/create-subscription", async (req, res) => {
  const { token, domain, name, description, price, interval } = req.body;

  if (!token || !domain) {
    return res.status(400).json({ error: "Token and domain are required" });
  }

  if (!stripe) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== domain) {
      return res.status(403).json({ error: "Token domain mismatch" });
    }

    console.log(
      `🔄 Creating Stripe subscription product for domain: ${domain}`
    );

    // Create product
    const product = await stripe.products.create({
      name: name,
      description: description,
      metadata: {
        domain: domain,
        created_by: decoded.email,
        product_type: "subscription",
      },
    });

    // Create recurring price
    const priceObj = await stripe.prices.create({
      unit_amount: Math.round(price * 100), // Convert to cents
      currency: "usd",
      product: product.id,
      recurring: {
        interval: interval, // 'month' or 'year'
      },
    });

    // Update product to set this price as default
    await stripe.products.update(product.id, {
      default_price: priceObj.id,
    });

    console.log(
      `✅ Created Stripe subscription product: ${product.id} with price: ${priceObj.id} ($${price}/${interval})`
    );

    res.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        price: price,
        priceId: priceObj.id,
        domain: domain,
        interval: interval,
        type: "subscription",
      },
    });
  } catch (error) {
    console.error(
      "❌ Error creating Stripe subscription product:",
      error.message
    );
    res.status(500).json({
      error: "Failed to create subscription product",
      details: error.message,
    });
  }
});

// --- ROUTE 17: Create Subscription ---
app.post("/api/stripe/create-subscription-intent", async (req, res) => {
  const { token, domain, priceId, productId } = req.body;

  if (!token || !domain) {
    return res.status(400).json({ error: "Token and domain are required" });
  }

  if (!stripe) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== domain) {
      return res.status(403).json({ error: "Token domain mismatch" });
    }

    console.log(`🔄 Creating subscription for domain: ${domain}`);
    console.log(`🔍 Product ID: ${productId}, Price ID: ${priceId}`);

    if (!priceId) {
      throw new Error("Price ID is required but was not provided");
    }

    // Create or retrieve customer
    let customer;
    try {
      // Try to find existing customer by email
      const existingCustomers = await stripe.customers.list({
        email: decoded.email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
        console.log(`👤 Found existing customer: ${customer.id}`);
      } else {
        // Create new customer
        customer = await stripe.customers.create({
          email: decoded.email,
          name: decoded.name,
          metadata: {
            domain: domain,
            user_id: decoded.userId,
          },
        });
        console.log(`👤 Created new customer: ${customer.id}`);
      }
    } catch (customerError) {
      console.error("❌ Error with customer:", customerError.message);
      throw new Error("Failed to create or retrieve customer");
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        {
          price: priceId,
        },
      ],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        domain: domain,
        product_id: productId,
        customer_email: decoded.email,
      },
    });

    console.log(`✅ Created subscription: ${subscription.id}`);

    res.json({
      success: true,
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
      customerId: customer.id,
    });
  } catch (error) {
    console.error("❌ Error creating subscription:", error.message);
    res.status(500).json({
      error: "Failed to create subscription",
      details: error.message,
    });
  }
});

// --- ROUTE 18: Get User Subscriptions ---
app.post("/api/stripe/subscriptions", async (req, res) => {
  const { token, domain } = req.body;

  if (!token || !domain) {
    return res.status(400).json({ error: "Token and domain are required" });
  }

  if (!stripe) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== domain) {
      return res.status(403).json({ error: "Token domain mismatch" });
    }

    console.log(
      `🔄 Fetching subscriptions for domain: ${domain}, email: ${decoded.email}`
    );

    // Find customer by email
    const customers = await stripe.customers.list({
      email: decoded.email,
      limit: 1,
    });

    if (customers.data.length === 0) {
      return res.json({
        success: true,
        subscriptions: [],
      });
    }

    const customer = customers.data[0];

    // Get all subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      expand: ["data.items.data.price.product"],
    });

    // Filter by domain and format response
    const domainSubscriptions = subscriptions.data
      .filter((sub) => sub.metadata.domain === domain)
      .map((subscription) => {
        const item = subscription.items.data[0];
        const product = item.price.product;

        return {
          id: subscription.id,
          status: subscription.status,
          productName: product.name,
          productId: product.id,
          price: item.price.unit_amount / 100,
          interval: item.price.recurring.interval,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          created: subscription.created,
          domain: subscription.metadata.domain,
        };
      });

    console.log(
      `✅ Found ${domainSubscriptions.length} subscriptions for domain: ${domain}`
    );

    res.json({
      success: true,
      subscriptions: domainSubscriptions,
    });
  } catch (error) {
    console.error("❌ Error fetching subscriptions:", error.message);
    res.status(500).json({
      error: "Failed to fetch subscriptions",
      details: error.message,
    });
  }
});

// --- ROUTE 19: Cancel Subscription ---
app.post("/api/stripe/cancel-subscription", async (req, res) => {
  const { token, domain, subscriptionId } = req.body;

  if (!token || !domain || !subscriptionId) {
    return res
      .status(400)
      .json({ error: "Token, domain, and subscriptionId are required" });
  }

  if (!stripe) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== domain) {
      return res.status(403).json({ error: "Token domain mismatch" });
    }

    console.log(
      `❌ Cancelling subscription: ${subscriptionId} for domain: ${domain}`
    );

    // Verify subscription belongs to this domain
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    if (subscription.metadata.domain !== domain) {
      return res
        .status(403)
        .json({ error: "Subscription does not belong to this domain" });
    }

    // Cancel the subscription at period end
    const canceledSubscription = await stripe.subscriptions.update(
      subscriptionId,
      {
        cancel_at_period_end: true,
      }
    );

    console.log(
      `✅ Subscription ${subscriptionId} will be canceled at period end`
    );

    res.json({
      success: true,
      subscription: {
        id: canceledSubscription.id,
        status: canceledSubscription.status,
        cancelAtPeriodEnd: canceledSubscription.cancel_at_period_end,
        currentPeriodEnd: canceledSubscription.current_period_end,
      },
    });
  } catch (error) {
    console.error("❌ Error canceling subscription:", error.message);
    res.status(500).json({
      error: "Failed to cancel subscription",
      details: error.message,
    });
  }
});

// --- ROUTE 20: Get Global Analytics (All Domains) ---
app.post("/api/stripe/global-analytics", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  if (!stripe) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log(`📊 Fetching global analytics for user: ${decoded.email}`);

    // Get all products (across all domains)
    const products = await stripe.products.list({
      limit: 100,
      expand: ["data.default_price"],
    });

    // Get recent payments (last 30 days)
    const thirtyDaysAgo = Math.floor(
      (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000
    );
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 100,
      created: { gte: thirtyDaysAgo },
    });

    // Group data by domain
    const domainStats = {};
    const domainRevenue = {};

    // Process products
    products.data.forEach((product) => {
      const domain = product.metadata.domain || "unknown";
      if (!domainStats[domain]) {
        domainStats[domain] = { products: 0, revenue: 0 };
      }
      domainStats[domain].products++;
    });

    // Process payments
    paymentIntents.data.forEach((payment) => {
      if (payment.status === "succeeded") {
        const domain = payment.metadata.domain || "unknown";
        const amount = payment.amount / 100; // Convert from cents

        if (!domainStats[domain]) {
          domainStats[domain] = { products: 0, revenue: 0 };
        }
        domainStats[domain].revenue += amount;

        if (!domainRevenue[domain]) {
          domainRevenue[domain] = [];
        }
        domainRevenue[domain].push({
          amount: amount,
          currency: payment.currency,
          created: payment.created,
          customer_email: payment.metadata.customer_email,
          product_id: payment.metadata.product_id,
        });
      }
    });

    // Calculate totals
    const totalProducts = products.data.length;
    const totalRevenue = Object.values(domainStats).reduce(
      (sum, stats) => sum + stats.revenue,
      0
    );
    const totalSuccessfulPayments = paymentIntents.data.filter(
      (p) => p.status === "succeeded"
    ).length;

    console.log(
      `✅ Global analytics: ${totalProducts} products, $${totalRevenue} revenue across ${
        Object.keys(domainStats).length
      } domains`
    );

    res.json({
      success: true,
      analytics: {
        totalProducts,
        totalRevenue,
        totalSuccessfulPayments,
        domainCount: Object.keys(domainStats).length,
        domainStats,
        domainRevenue,
        recentPayments: paymentIntents.data.slice(0, 10).map((payment) => ({
          id: payment.id,
          amount: payment.amount / 100,
          currency: payment.currency,
          status: payment.status,
          domain: payment.metadata.domain,
          customer_email: payment.metadata.customer_email,
          created: payment.created,
        })),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching global analytics:", error.message);
    res.status(500).json({
      error: "Failed to fetch global analytics",
      details: error.message,
    });
  }
});

// --- ROUTE 21: Get All Products (Global View) ---
app.post("/api/stripe/global-products", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  if (!stripe) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log(`🌍 Fetching all products globally for user: ${decoded.email}`);

    // Get all products (no domain filter)
    const products = await stripe.products.list({
      limit: 100,
      expand: ["data.default_price"],
    });

    console.log(`✅ Found ${products.data.length} products across all domains`);

    const productsWithDomain = products.data.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.default_price
        ? product.default_price.unit_amount / 100
        : 0,
      priceId: product.default_price ? product.default_price.id : null,
      domain: product.metadata.domain || "unknown",
      created: product.created,
      created_by: product.metadata.created_by || "unknown",
    }));

    res.json({
      success: true,
      products: productsWithDomain,
    });
  } catch (error) {
    console.error("❌ Error fetching global products:", error.message);
    res.status(500).json({
      error: "Failed to fetch global products",
      details: error.message,
    });
  }
});

// --- ROUTE 22: Logout (optional) ---
app.post("/api/logout", (req, res) => {
  // In a real app, you might maintain a blacklist of revoked tokens
  // For this demo, we'll just return success - the frontend will remove the token
  res.json({ message: "Logged out successfully" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("💥 Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Multi-domain auth backend running on port ${PORT}`);
  console.log(`📋 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔗 Callback URL: ${BACKEND_URL}/auth/google/callback`);
  console.log("");
  console.log("🔧 Required environment variables:");
  console.log(
    "  - GOOGLE_CLIENT_ID:",
    GOOGLE_CLIENT_ID ? "✅ Set" : "❌ Missing"
  );
  console.log(
    "  - GOOGLE_CLIENT_SECRET:",
    GOOGLE_CLIENT_SECRET ? "✅ Set" : "❌ Missing"
  );
  console.log(
    "  - JWT_SECRET:",
    JWT_SECRET !== "your-super-secret-jwt-key-change-this-in-production"
      ? "✅ Set"
      : "⚠️  Using default"
  );
  console.log(
    "  - AIRTABLE_CLIENT_ID:",
    AIRTABLE_CLIENT_ID ? "✅ Set" : "⚠️ Missing (OAuth disabled)"
  );
  console.log(
    "  - AIRTABLE_CLIENT_SECRET:",
    AIRTABLE_CLIENT_SECRET ? "✅ Set" : "⚠️ Missing (OAuth disabled)"
  );
  console.log(
    "  - STRIPE_SECRET_KEY:",
    STRIPE_SECRET_KEY ? "✅ Set" : "⚠️ Missing (payments disabled)"
  );
  console.log(
    "  - STRIPE_PUBLISHABLE_KEY:",
    STRIPE_PUBLISHABLE_KEY ? "✅ Set" : "⚠️ Missing (payments disabled)"
  );
  console.log("");
  console.log("🗂️ Airtable Integration Status:");
  console.log(
    "  - OAuth Method:",
    AIRTABLE_CLIENT_ID && AIRTABLE_CLIENT_SECRET
      ? "✅ Available"
      : "❌ Not configured"
  );
  console.log("  - API Key Method: ✅ Always available (user-provided)");
  console.log("");
  console.log("💳 Stripe Payment Status:");
  console.log(
    "  - Payment Processing:",
    STRIPE_SECRET_KEY && STRIPE_PUBLISHABLE_KEY
      ? "✅ Available"
      : "❌ Not configured"
  );
  console.log("");
});
