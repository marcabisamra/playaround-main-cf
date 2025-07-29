import React, { useEffect, useState } from "react";
import AuthComponent from "../components/AuthComponent";
import AirtableForm from "../components/AirtableForm";
import StripeComponent from "../components/StripeComponent";
import GlobalDataComponent from "../components/GlobalDataComponent";

interface User {
  id: string;
  email: string;
  name: string;
  domain: string;
  googleAccessToken?: string;
  googleRefreshToken?: string;
  airtableAccessToken?: string;
  airtableRefreshToken?: string;
}

const HomePage = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentDomain, setCurrentDomain] = useState<string>("");
  const [showAirtableModal, setShowAirtableModal] = useState<boolean>(false);

  useEffect(() => {
    // Get current domain
    setCurrentDomain(window.location.hostname);

    // Check for token in URL or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get("token");
    const tokenFromStorage = localStorage.getItem("authToken");
    const airtableConnected = urlParams.get("airtable_connected");

    const token = tokenFromUrl || tokenFromStorage;

    if (token) {
      try {
        // Decode JWT (Note: In production, verify this on the server)
        const payload = JSON.parse(atob(token.split(".")[1]));

        // Security check: ensure token is for this domain
        if (payload.domain !== window.location.hostname) {
          console.error("Token domain mismatch!");
          localStorage.removeItem("authToken");
          return;
        }

        // Check if token is expired
        if (payload.exp && payload.exp < Date.now() / 1000) {
          console.error("Token expired");
          localStorage.removeItem("authToken");
          return;
        }

        // Save token and set user
        localStorage.setItem("authToken", token);
        setUser({
          id: payload.userId,
          email: payload.email,
          name: payload.name,
          domain: payload.domain,
          googleAccessToken: payload.googleAccessToken,
          googleRefreshToken: payload.googleRefreshToken,
          airtableAccessToken: payload.airtableAccessToken,
          airtableRefreshToken: payload.airtableRefreshToken,
        });

        // Clean URL if token came from URL
        if (tokenFromUrl) {
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );
        }

        // Show success message if Airtable was just connected
        if (airtableConnected === "true") {
          setTimeout(() => {
            alert(
              "🎉 Airtable connected successfully! You can now create records without entering API keys."
            );
          }, 500);
        }
      } catch (error) {
        console.error("Invalid token:", error);
        localStorage.removeItem("authToken");
      }
    }
  }, []);

  const handleLogin = () => {
    // Redirect to our auth endpoint (will be proxied by Vercel to backend)
    window.location.href = `/auth/google?return_domain=${currentDomain}`;
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    setUser(null);
    // Optionally, call a logout endpoint
    // fetch('/api/logout', { method: 'POST' });
  };

  const handleCreateGoogleSheet = async (sheetName?: string) => {
    if (!user || !user.googleAccessToken) {
      alert("No Google access token available. Please log in again.");
      return;
    }

    try {
      const token = localStorage.getItem("authToken");

      const response = await fetch("/api/sheets/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          domain: currentDomain,
          sheetName: sheetName || `${currentDomain} Data Sheet`,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(
          `Google Sheet created successfully!\n\nTitle: ${result.spreadsheet.title}\n\nClick OK to open it.`
        );
        window.open(result.spreadsheet.url, "_blank");
      } else {
        alert(`Failed to create Google Sheet: ${result.error}`);
      }
    } catch (error) {
      console.error("Error creating Google Sheet:", error);
      alert("Failed to create Google Sheet. Please try again.");
    }
  };

  const handleCreateAirtableRecord = async (
    airtableApiKey: string | null,
    baseId: string,
    tableName?: string
  ) => {
    if (!user) {
      alert("Please log in first.");
      return;
    }

    // If user has OAuth tokens but no baseId, show error
    if (user.airtableAccessToken && !baseId) {
      alert(
        "Please provide a Base ID to create records in your Airtable base."
      );
      return;
    }

    // If no OAuth and no API key, show error
    if (!user.airtableAccessToken && !airtableApiKey) {
      alert("Please provide an Airtable API key or connect via OAuth first.");
      return;
    }

    try {
      const token = localStorage.getItem("authToken");

      const requestBody: any = {
        token,
        domain: currentDomain,
        baseId,
        tableName: tableName || "Main Table",
        recordData: {
          "Custom Field": `Record from ${currentDomain}`,
          Notes: `Created via multi-domain auth system on ${new Date().toLocaleDateString()}`,
        },
      };

      // Only include API key if not using OAuth
      if (!user.airtableAccessToken && airtableApiKey) {
        requestBody.airtableApiKey = airtableApiKey;
      }

      const response = await fetch("/api/airtable/create-record", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (result.success) {
        alert(
          `Airtable record created successfully!\n\nRecord ID: ${result.record.id}\nTable: ${result.record.tableName}`
        );
        setShowAirtableModal(false);
      } else {
        let errorMessage = `Failed to create Airtable record: ${result.error}`;
        if (result.details) {
          errorMessage += `\n\nDetails: ${result.details}`;
        }
        if (result.suggestion) {
          errorMessage += `\n\n💡 Suggestion: ${result.suggestion}`;
        }
        alert(errorMessage);
      }
    } catch (error) {
      console.error("Error creating Airtable record:", error);
      alert("Failed to create Airtable record. Please try again.");
    }
  };

  const handleShowAirtableModal = () => {
    setShowAirtableModal(true);
  };

  const handleCloseAirtableModal = () => {
    setShowAirtableModal(false);
  };

  const handleConnectAirtable = () => {
    if (!user) {
      alert("Please log in first.");
      return;
    }

    const token = localStorage.getItem("authToken");
    if (!token) {
      alert("No authentication token found. Please log in again.");
      return;
    }

    // Redirect to Airtable OAuth flow
    window.location.href = `/auth/airtable?token=${encodeURIComponent(
      token
    )}&domain=${encodeURIComponent(currentDomain)}`;
  };

  return (
    <div
      style={{
        padding: "2rem",
        fontFamily: "Arial, sans-serif",
        maxWidth: "600px",
        margin: "0 auto",
      }}
    >
      <h1>Multi-Domain Auth Test</h1>
      <div
        style={{
          padding: "1rem",
          backgroundColor: "#f0f0f0",
          borderRadius: "8px",
          marginBottom: "2rem",
        }}
      >
        <strong>Current Domain:</strong> {currentDomain}
      </div>

      <AuthComponent
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onCreateGoogleSheet={handleCreateGoogleSheet}
        onShowAirtableModal={handleShowAirtableModal}
        onConnectAirtable={handleConnectAirtable}
      />

      {/* Stripe Component */}
      <div style={{ marginTop: "2rem" }}>
        <StripeComponent user={user} currentDomain={currentDomain} />
      </div>

      {/* Global Data Component */}
      <div style={{ marginTop: "2rem" }}>
        <GlobalDataComponent user={user} currentDomain={currentDomain} />
      </div>

      {/* Airtable Modal */}
      {showAirtableModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "12px",
              maxWidth: "500px",
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
            }}
          >
            <h3 style={{ marginBottom: "1rem", color: "#1f2937" }}>
              🗂️ Create Airtable Record
            </h3>
            <AirtableForm
              onSubmit={handleCreateAirtableRecord}
              onCancel={handleCloseAirtableModal}
              domain={currentDomain}
              hasOAuthTokens={!!user?.airtableAccessToken}
            />
          </div>
        </div>
      )}

      <div style={{ marginTop: "2rem", fontSize: "0.9em", color: "#666" }}>
        <h3>Test Instructions:</h3>
        <ol>
          <li>Deploy this project to Vercel</li>
          <li>Add multiple custom domains (e.g., site-1.com, site-2.com)</li>
          <li>Set up your backend API and update vercel.json</li>
          <li>
            Login on one domain, then check another - sessions should be
            isolated!
          </li>
        </ol>
      </div>
    </div>
  );
};

export default HomePage;
