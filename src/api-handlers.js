// API Handlers for Cloudflare Worker
// This file contains all the API endpoint implementations

// ==================== TOKEN VERIFICATION ====================

export async function handleVerifyToken(request, domain, env, corsHeaders) {
  try {
    const body = await request.json();
    const { token, domain: requestDomain } = body;

    if (!token || !requestDomain) {
      return new Response(
        JSON.stringify({ error: "Token and domain are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const decoded = await verifyJWT(token, env.JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== requestDomain) {
      return new Response(JSON.stringify({ error: "Token domain mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        valid: true,
        user: {
          userId: decoded.userId,
          email: decoded.email,
          name: decoded.name,
          picture: decoded.picture,
          domain: decoded.domain,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ valid: false, error: "Invalid token" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

// ==================== GOOGLE SHEETS INTEGRATION ====================

export async function handleGoogleSheetsCreate(
  request,
  domain,
  env,
  corsHeaders
) {
  try {
    const body = await request.json();
    const { token, domain: requestDomain, sheetName } = body;

    if (!token || !requestDomain) {
      return new Response(
        JSON.stringify({ error: "Token and domain are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const decoded = await verifyJWT(token, env.JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== requestDomain) {
      return new Response(JSON.stringify({ error: "Token domain mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!decoded.googleAccessToken) {
      return new Response(
        JSON.stringify({ error: "No Google access token found" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create a new Google Sheet
    const sheetsResponse = await fetch(
      "https://sheets.googleapis.com/v4/spreadsheets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${decoded.googleAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            title:
              sheetName ||
              `${requestDomain} - Data Sheet - ${new Date().toLocaleDateString()}`,
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
        }),
      }
    );

    const spreadsheet = await sheetsResponse.json();

    if (!sheetsResponse.ok) {
      throw new Error(
        spreadsheet.error?.message || "Failed to create spreadsheet"
      );
    }

    // Add some sample data
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet.spreadsheetId}/values/Data!A1:C3?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${decoded.googleAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [
            ["Domain", "User", "Created"],
            [requestDomain, decoded.email, new Date().toISOString()],
            ["Sample", "Data", "Row"],
          ],
        }),
      }
    );

    return new Response(
      JSON.stringify({
        success: true,
        spreadsheet: {
          id: spreadsheet.spreadsheetId,
          title: spreadsheet.properties.title,
          url: spreadsheet.spreadsheetUrl,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Error creating Google Sheet:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to create Google Sheet",
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

// ==================== AIRTABLE INTEGRATION ====================

export async function handleAirtableCreateRecord(
  request,
  domain,
  env,
  corsHeaders
) {
  try {
    const body = await request.json();
    const {
      token,
      domain: requestDomain,
      airtableApiKey,
      baseId,
      tableName,
      recordData,
    } = body;

    if (!token || !requestDomain) {
      return new Response(
        JSON.stringify({ error: "Token and domain are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!baseId) {
      return new Response(JSON.stringify({ error: "Base ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const decoded = await verifyJWT(token, env.JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== requestDomain) {
      return new Response(JSON.stringify({ error: "Token domain mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine which authentication method to use
    let airtableToken;
    if (decoded.airtableAccessToken) {
      // Use OAuth token (preferred method)
      console.log("🔐 Using Airtable OAuth token");
      airtableToken = decoded.airtableAccessToken;
    } else if (airtableApiKey) {
      // Fallback to user-provided API key
      console.log("🔑 Using user-provided API key");
      airtableToken = airtableApiKey;
    } else {
      return new Response(
        JSON.stringify({
          error: "No Airtable authentication available",
          details: "Either connect Airtable via OAuth or provide an API key",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`📋 Creating Airtable record for domain: ${requestDomain}`);

    // Start with just the Name field (safest approach)
    let recordToCreate = {
      Name: `${
        decoded.name
      } - ${requestDomain} (${new Date().toLocaleDateString()})`,
    };

    // Try to detect what fields exist by reading the table schema
    let existingFields = [];
    try {
      const recordsResponse = await fetch(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(
          tableName || "Main Table"
        )}?maxRecords=1`,
        {
          headers: {
            Authorization: `Bearer ${airtableToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (recordsResponse.ok) {
        const recordsData = await recordsResponse.json();
        if (recordsData.records && recordsData.records.length > 0) {
          existingFields = Object.keys(recordsData.records[0].fields);
          console.log(`📝 Detected existing fields:`, existingFields);
        } else {
          console.log("📝 Table is empty, using Name field only");
        }
      }
    } catch (schemaError) {
      console.log("⚠️ Could not read table schema, using Name field only");
    }

    // If we successfully detected fields, add more data
    if (existingFields.length > 0) {
      const potentialFields = {
        Domain: requestDomain,
        "User Email": decoded.email,
        "User Name": decoded.name,
        Email: decoded.email,
        Created: new Date().toISOString(),
        "Created At": new Date().toISOString(),
        Date: new Date().toLocaleDateString(),
        Status: "Active",
        Notes: `Record created from ${requestDomain} via multi-domain auth system`,
        Description: `User ${decoded.email} logged in from ${requestDomain}`,
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

    // Create the record using Airtable REST API
    const createResponse = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(
        tableName || "Main Table"
      )}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${airtableToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: recordToCreate,
        }),
      }
    );

    const createResult = await createResponse.json();

    if (!createResponse.ok) {
      // Handle specific Airtable errors
      if (createResponse.status === 401) {
        return new Response(
          JSON.stringify({
            error: "Invalid Airtable API key",
            details: "Please check your API key and try again",
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (createResponse.status === 404) {
        return new Response(
          JSON.stringify({
            error: "Base or table not found",
            details: "Please check your Base ID and table name",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (createResponse.status === 422) {
        return new Response(
          JSON.stringify({
            error: "Invalid field data",
            details: `${
              createResult.error?.message || "Field validation failed"
            }. This usually means the data doesn't match the field type in Airtable.`,
            suggestion:
              "Check that your table field types match the data we're sending (text fields for names, date field for Created At, etc.)",
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      throw new Error(createResult.error?.message || "Unknown Airtable error");
    }

    return new Response(
      JSON.stringify({
        success: true,
        record: {
          id: createResult.id,
          fields: createResult.fields,
          baseId: baseId,
          tableName: tableName || "Main Table",
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Error creating Airtable record:", error);

    // Handle field-related errors
    if (error.message && error.message.includes("Unknown field")) {
      return new Response(
        JSON.stringify({
          error: "Unknown field in table",
          details: `${error.message}. Your table needs at least a 'Name' field. Consider adding fields like: Domain, Email, Created, Status, Notes.`,
          suggestion:
            "Go to your Airtable base and add these field names, or just use the existing 'Name' field which we'll populate automatically.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Failed to create Airtable record",
        details: error.message,
        suggestion:
          "Check your Airtable base permissions and field configuration",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

export async function handleAirtableBases(request, domain, env, corsHeaders) {
  try {
    console.log("📋 Fetching user's Airtable bases...");

    const authHeader =
      request.headers.get("authorization") ||
      request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.split(" ")[1];
    const decoded = await verifyJWT(token, env.JWT_SECRET);

    // Check if user has Airtable OAuth tokens
    if (!decoded.airtableAccessToken) {
      return new Response(
        JSON.stringify({
          error: "No Airtable connection",
          message: "Please connect your Airtable account first",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch bases using Airtable OAuth token
    const basesResponse = await fetch(
      "https://api.airtable.com/v0/meta/bases",
      {
        headers: {
          Authorization: `Bearer ${decoded.airtableAccessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const basesData = await basesResponse.json();

    if (!basesResponse.ok) {
      throw new Error(basesData.error?.message || "Failed to fetch bases");
    }

    console.log(`✅ Found ${basesData.bases.length} Airtable bases`);

    return new Response(
      JSON.stringify({
        success: true,
        bases: basesData.bases.map((base) => ({
          id: base.id,
          name: base.name,
          permissionLevel: base.permissionLevel,
        })),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Error fetching Airtable bases:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch bases",
        message: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

export async function handleAirtableTables(request, domain, env, corsHeaders) {
  try {
    const body = await request.json();
    const { baseId } = body;

    console.log(`📋 Fetching tables for base: ${baseId}`);

    const authHeader =
      request.headers.get("authorization") ||
      request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.split(" ")[1];
    const decoded = await verifyJWT(token, env.JWT_SECRET);

    if (!decoded.airtableAccessToken) {
      return new Response(
        JSON.stringify({
          error: "No Airtable connection",
          message: "Please connect your Airtable account first",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!baseId) {
      return new Response(JSON.stringify({ error: "Base ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tables for the specific base
    const tablesResponse = await fetch(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      {
        headers: {
          Authorization: `Bearer ${decoded.airtableAccessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const tablesData = await tablesResponse.json();

    if (!tablesResponse.ok) {
      throw new Error(tablesData.error?.message || "Failed to fetch tables");
    }

    console.log(
      `✅ Found ${tablesData.tables.length} tables in base ${baseId}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        tables: tablesData.tables.map((table) => ({
          id: table.id,
          name: table.name,
          primaryFieldId: table.primaryFieldId,
          fields: table.fields.map((field) => ({
            id: field.id,
            name: field.name,
            type: field.type,
          })),
        })),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Error fetching Airtable tables:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch tables",
        message: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

export async function handleAirtableSetupInfo(
  request,
  domain,
  env,
  corsHeaders
) {
  try {
    const body = await request.json();
    const { token, domain: requestDomain } = body;

    if (!token || !requestDomain) {
      return new Response(
        JSON.stringify({ error: "Token and domain are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const decoded = await verifyJWT(token, env.JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== requestDomain) {
      return new Response(JSON.stringify({ error: "Token domain mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return setup instructions
    return new Response(
      JSON.stringify({
        success: true,
        setupInfo: {
          domain: requestDomain,
          user: decoded.email,
          instructions: [
            "1. Go to https://airtable.com/create/tokens",
            "2. Create a personal access token with 'data.records:write' scope",
            "3. Copy your Base ID from your Airtable base URL",
            "4. Ensure your base has a table (we'll use 'Main Table' by default)",
          ],
          sampleRecord: {
            Domain: requestDomain,
            "User Email": decoded.email,
            "User Name": decoded.name,
            "Created At": new Date().toISOString(),
            Status: "Active",
          },
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ valid: false, error: "Invalid token" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

// ==================== STRIPE INTEGRATION ====================

export async function handleStripeConfig(request, domain, env, corsHeaders) {
  if (!env.STRIPE_PUBLISHABLE_KEY) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      publishableKey: env.STRIPE_PUBLISHABLE_KEY,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

export async function handleStripeCreateProduct(
  request,
  domain,
  env,
  corsHeaders
) {
  try {
    const body = await request.json();
    const { token, domain: requestDomain, name, description, price } = body;

    if (!token || !requestDomain) {
      return new Response(
        JSON.stringify({ error: "Token and domain are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!env.STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const decoded = await verifyJWT(token, env.JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== requestDomain) {
      return new Response(JSON.stringify({ error: "Token domain mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`💳 Creating Stripe product for domain: ${requestDomain}`);

    // Create product
    const productResponse = await fetch("https://api.stripe.com/v1/products", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        name: name,
        description: description,
        "metadata[domain]": requestDomain,
        "metadata[created_by]": decoded.email,
      }),
    });

    const product = await productResponse.json();

    if (!productResponse.ok) {
      throw new Error(product.error?.message || "Failed to create product");
    }

    // Create price
    const priceResponse = await fetch("https://api.stripe.com/v1/prices", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        unit_amount: Math.round(price * 100).toString(),
        currency: "usd",
        product: product.id,
      }),
    });

    const priceObj = await priceResponse.json();

    if (!priceResponse.ok) {
      throw new Error(priceObj.error?.message || "Failed to create price");
    }

    // Update product to set this price as default
    await fetch(`https://api.stripe.com/v1/products/${product.id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        default_price: priceObj.id,
      }),
    });

    console.log(
      `✅ Created Stripe product: ${product.id} with price: ${priceObj.id} ($${price})`
    );

    const productData = {
      id: product.id,
      name: product.name,
      description: product.description,
      price: price,
      priceId: priceObj.id,
      domain: requestDomain,
      created: Date.now(),
      type: "one-time",
    };

    // Store product metadata in KV
    await env.PRODUCTS.put(
      `product:${requestDomain}:${product.id}`,
      JSON.stringify(productData)
    );

    return new Response(
      JSON.stringify({
        success: true,
        product: productData,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Error creating Stripe product:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to create product",
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

export async function handleStripeGetProducts(
  request,
  domain,
  env,
  corsHeaders
) {
  try {
    const body = await request.json();
    const { token, domain: requestDomain } = body;

    if (!token || !requestDomain) {
      return new Response(
        JSON.stringify({ error: "Token and domain are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!env.STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const decoded = await verifyJWT(token, env.JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== requestDomain) {
      return new Response(JSON.stringify({ error: "Token domain mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`📦 Fetching Stripe products for domain: ${requestDomain}`);

    // Get all products from Stripe with expanded default_price
    const productsResponse = await fetch(
      "https://api.stripe.com/v1/products?limit=100&expand[]=data.default_price",
      {
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        },
      }
    );

    const productsData = await productsResponse.json();

    if (!productsResponse.ok) {
      throw new Error(
        productsData.error?.message || "Failed to fetch products"
      );
    }

    // Filter products by domain
    const domainProducts = productsData.data.filter(
      (product) => product.metadata.domain === requestDomain
    );

    console.log(
      `✅ Found ${domainProducts.length} products for domain: ${requestDomain}`
    );

    const productsWithPrices = domainProducts.map((product) => {
      const price = product.default_price
        ? product.default_price.unit_amount / 100
        : 0;
      const priceId = product.default_price ? product.default_price.id : null;

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: price,
        priceId: priceId,
        domain: product.metadata.domain,
        created: product.created * 1000, // Convert to milliseconds
        type: product.metadata.product_type || "one-time",
        interval: product.default_price?.recurring?.interval || null,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        products: productsWithPrices,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Error fetching Stripe products:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch products",
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

export async function handleStripeCreatePaymentIntent(
  request,
  domain,
  env,
  corsHeaders
) {
  try {
    const body = await request.json();
    const { token, domain: requestDomain, priceId, productId } = body;

    if (!token || !requestDomain) {
      return new Response(
        JSON.stringify({ error: "Token and domain are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!env.STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const decoded = await verifyJWT(token, env.JWT_SECRET);

    // Verify the token is for the requesting domain
    if (decoded.domain !== requestDomain) {
      return new Response(JSON.stringify({ error: "Token domain mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`💳 Creating payment intent for domain: ${requestDomain}`);
    console.log(`🔍 Product ID: ${productId}, Price ID: ${priceId}`);

    if (!priceId) {
      throw new Error("Price ID is required but was not provided");
    }

    // Get the price to determine amount
    const priceResponse = await fetch(
      `https://api.stripe.com/v1/prices/${priceId}`,
      {
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        },
      }
    );

    const price = await priceResponse.json();

    if (!priceResponse.ok) {
      throw new Error(price.error?.message || "Failed to retrieve price");
    }

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
    const paymentIntentResponse = await fetch(
      "https://api.stripe.com/v1/payment_intents",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          amount: price.unit_amount.toString(),
          currency: price.currency,
          "metadata[domain]": requestDomain,
          "metadata[customer_email]": decoded.email,
          "metadata[product_id]": productId,
          "metadata[price_id]": priceId,
          receipt_email: decoded.email,
        }),
      }
    );

    const paymentIntent = await paymentIntentResponse.json();

    if (!paymentIntentResponse.ok) {
      throw new Error(
        paymentIntent.error?.message || "Failed to create payment intent"
      );
    }

    console.log(
      `✅ Created payment intent: ${paymentIntent.id} for $${
        price.unit_amount / 100
      }`
    );

    return new Response(
      JSON.stringify({
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Error creating payment intent:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to create payment intent",
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

// Additional Stripe handlers would continue here...
// (handleStripeCreateSubscription, handleStripeGetSubscriptions, etc.)

// ==================== LOGOUT ====================

export async function handleLogout(request, domain, env, corsHeaders) {
  // In a real app, you might maintain a blacklist of revoked tokens
  // For this demo, we'll just return success - the frontend will remove the token
  return new Response(JSON.stringify({ message: "Logged out successfully" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ==================== JWT UTILITY (needed by handlers) ====================

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
