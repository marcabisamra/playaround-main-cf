import React from "react";

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

interface AuthComponentProps {
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  onCreateGoogleSheet: (sheetName?: string) => Promise<void>;
  onShowAirtableModal: () => void;
  onConnectAirtable: () => void;
}

const AuthComponent: React.FC<AuthComponentProps> = ({
  user,
  onLogin,
  onLogout,
  onCreateGoogleSheet,
  onShowAirtableModal,
  onConnectAirtable,
}) => {
  if (user) {
    return (
      <div
        style={{
          padding: "1.5rem",
          border: "2px solid #10b981",
          borderRadius: "8px",
          backgroundColor: "#f0fdf4",
        }}
      >
        <h2 style={{ color: "#059669", margin: "0 0 1rem 0" }}>
          Welcome, {user.name}! 🎉
        </h2>
        <div style={{ marginBottom: "1rem" }}>
          <p>
            <strong>Email:</strong> {user.email}
          </p>
          <p>
            <strong>User ID:</strong> {user.id}
          </p>
          <p>
            <strong>Authorized Domain:</strong> {user.domain}
          </p>
        </div>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {user.googleAccessToken && (
            <button
              onClick={() => onCreateGoogleSheet()}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#10b981",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "1rem",
                fontWeight: "500",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor = "#059669")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "#10b981")
              }
            >
              <span>📊</span>
              Create Google Sheet
            </button>
          )}
          {user.airtableAccessToken ? (
            <button
              onClick={onShowAirtableModal}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#f59e0b",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "1rem",
                fontWeight: "500",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor = "#d97706")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "#f59e0b")
              }
            >
              <span>🗂️</span>
              Create Airtable Record
            </button>
          ) : (
            <button
              onClick={onConnectAirtable}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#8b5cf6",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "1rem",
                fontWeight: "500",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor = "#7c3aed")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "#8b5cf6")
              }
            >
              <span>🔗</span>
              Connect Airtable
            </button>
          )}
          <button
            onClick={onLogout}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "1rem",
              fontWeight: "500",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = "#dc2626")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = "#ef4444")
            }
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "1.5rem",
        border: "2px solid #3b82f6",
        borderRadius: "8px",
        backgroundColor: "#eff6ff",
        textAlign: "center",
      }}
    >
      <h2 style={{ color: "#1e40af", margin: "0 0 1rem 0" }}>
        Authentication Required
      </h2>
      <p style={{ margin: "0 0 1.5rem 0", color: "#374151" }}>
        You need to log in to access this site. Each domain maintains its own
        separate session.
      </p>
      <button
        onClick={onLogin}
        style={{
          padding: "0.75rem 2rem",
          backgroundColor: "#3b82f6",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          fontSize: "1rem",
          fontWeight: "500",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#3b82f6")}
      >
        <span>🔐</span>
        Login with Google
      </button>

      <div
        style={{
          marginTop: "1.5rem",
          padding: "1rem",
          backgroundColor: "#fef3c7",
          borderRadius: "6px",
          fontSize: "0.9rem",
        }}
      >
        <strong>🔒 Privacy & Features:</strong> Your session is isolated to this
        domain only. Logging in here won't automatically log you into other
        domains. After login, you'll have access to Google Sheets and Airtable
        integrations.
      </div>
    </div>
  );
};

export default AuthComponent;
