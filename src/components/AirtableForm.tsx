import React, { useState, useEffect } from "react";

interface Base {
  id: string;
  name: string;
  permissionLevel: string;
}

interface Table {
  id: string;
  name: string;
  primaryFieldId: string;
  fields: Array<{
    id: string;
    name: string;
    type: string;
  }>;
}

interface AirtableFormProps {
  onSubmit: (
    apiKey: string | null,
    baseId: string,
    tableName?: string
  ) => Promise<void>;
  onCancel: () => void;
  domain: string;
  hasOAuthTokens?: boolean;
}

const AirtableForm: React.FC<AirtableFormProps> = ({
  onSubmit,
  onCancel,
  domain,
  hasOAuthTokens = false,
}) => {
  const [apiKey, setApiKey] = useState("");
  const [baseId, setBaseId] = useState("");
  const [tableName, setTableName] = useState("Main Table");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Method selection: 'api-key' or 'oauth'
  const [selectedMethod, setSelectedMethod] = useState<"api-key" | "oauth">(
    hasOAuthTokens ? "oauth" : "api-key"
  );

  // OAuth-specific state
  const [bases, setBases] = useState<Base[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedBase, setSelectedBase] = useState<Base | null>(null);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [loadingBases, setLoadingBases] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch bases when OAuth method is selected (if OAuth is available)
  useEffect(() => {
    if (hasOAuthTokens && selectedMethod === "oauth") {
      fetchBases();
    }
  }, [hasOAuthTokens, selectedMethod]);

  const fetchBases = async () => {
    setLoadingBases(true);
    setError(null);
    try {
      const token = localStorage.getItem("authToken");
      if (!token) {
        throw new Error("No auth token found");
      }

      const response = await fetch("/api/airtable/bases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch bases: ${response.statusText}`);
      }

      const data = await response.json();
      setBases(data.bases);
      console.log(`✅ Loaded ${data.bases.length} Airtable bases`);
    } catch (error) {
      console.error("❌ Error fetching bases:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      setError(`Failed to load your Airtable bases: ${errorMessage}`);
    } finally {
      setLoadingBases(false);
    }
  };

  const fetchTables = async (baseId: string) => {
    setLoadingTables(true);
    setError(null);
    try {
      const token = localStorage.getItem("authToken");
      if (!token) {
        throw new Error("No auth token found");
      }

      const response = await fetch("/api/airtable/tables", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ baseId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch tables: ${response.statusText}`);
      }

      const data = await response.json();
      setTables(data.tables);
      console.log(`✅ Loaded ${data.tables.length} tables for base ${baseId}`);
    } catch (error) {
      console.error("❌ Error fetching tables:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      setError(`Failed to load tables: ${errorMessage}`);
    } finally {
      setLoadingTables(false);
    }
  };

  const handleBaseSelect = (base: Base) => {
    setSelectedBase(base);
    setBaseId(base.id);
    setTables([]);
    setSelectedTable(null);
    fetchTables(base.id);
  };

  const handleTableSelect = (table: Table) => {
    setSelectedTable(table);
    setTableName(table.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedMethod === "oauth") {
      // OAuth mode validation
      if (!selectedBase) {
        alert("Please select an Airtable base");
        return;
      }
      if (!selectedTable) {
        alert("Please select a table");
        return;
      }
    } else {
      // API key mode validation
      if (!apiKey.trim()) {
        alert("Please provide an Airtable API Key");
        return;
      }
      if (!baseId.trim()) {
        alert("Please provide a Base ID");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSubmit(
        selectedMethod === "oauth" ? null : apiKey.trim(),
        selectedMethod === "oauth" ? selectedBase!.id : baseId.trim(),
        selectedMethod === "oauth"
          ? selectedTable!.name
          : tableName.trim() || undefined
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Method Selection */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label
          style={{
            display: "block",
            fontWeight: "500",
            marginBottom: "0.5rem",
            color: "#374151",
          }}
        >
          Choose Connection Method
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => setSelectedMethod("api-key")}
            style={{
              padding: "0.75rem 1rem",
              border:
                selectedMethod === "api-key"
                  ? "2px solid #3b82f6"
                  : "2px solid #e5e7eb",
              borderRadius: "6px",
              backgroundColor:
                selectedMethod === "api-key" ? "#eff6ff" : "white",
              color: selectedMethod === "api-key" ? "#1d4ed8" : "#6b7280",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: selectedMethod === "api-key" ? "600" : "400",
            }}
          >
            🔑 API Key
          </button>
          {hasOAuthTokens && (
            <button
              type="button"
              onClick={() => setSelectedMethod("oauth")}
              style={{
                padding: "0.75rem 1rem",
                border:
                  selectedMethod === "oauth"
                    ? "2px solid #10b981"
                    : "2px solid #e5e7eb",
                borderRadius: "6px",
                backgroundColor:
                  selectedMethod === "oauth" ? "#ecfdf5" : "white",
                color: selectedMethod === "oauth" ? "#047857" : "#6b7280",
                cursor: "pointer",
                fontSize: "0.9rem",
                fontWeight: selectedMethod === "oauth" ? "600" : "400",
              }}
            >
              🔗 OAuth (Recommended)
            </button>
          )}
        </div>
        <small
          style={{
            color: "#6b7280",
            fontSize: "0.8rem",
            marginTop: "0.5rem",
            display: "block",
          }}
        >
          {selectedMethod === "oauth"
            ? "Use your connected OAuth account to browse bases (recommended)"
            : "Use your personal Airtable API key for direct access"}
        </small>
      </div>

      {error && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "1rem",
            backgroundColor: "#fef2f2",
            borderRadius: "6px",
            border: "1px solid #fecaca",
            color: "#dc2626",
          }}
        >
          <strong>❌ Error:</strong> {error}
        </div>
      )}

      {selectedMethod === "api-key" ? (
        // API Key Mode
        <>
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                fontWeight: "500",
                marginBottom: "0.5rem",
                color: "#374151",
              }}
            >
              Airtable API Key *
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="patXXXXXXXXXXXXXX.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "2px solid #e5e7eb",
                borderRadius: "6px",
                fontSize: "0.9rem",
                fontFamily: "monospace",
              }}
              required
            />
            <small style={{ color: "#6b7280", fontSize: "0.8rem" }}>
              Get from:{" "}
              <a
                href="https://airtable.com/create/tokens"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#3b82f6" }}
              >
                https://airtable.com/create/tokens
              </a>
            </small>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                fontWeight: "500",
                marginBottom: "0.5rem",
                color: "#374151",
              }}
            >
              Base ID *
            </label>
            <input
              type="text"
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
              placeholder="appXXXXXXXXXXXXXX"
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "2px solid #e5e7eb",
                borderRadius: "6px",
                fontSize: "0.9rem",
                fontFamily: "monospace",
              }}
              required
            />
            <small style={{ color: "#6b7280", fontSize: "0.8rem" }}>
              Find in your Airtable base URL: airtable.com/appXXXXXXX/...
            </small>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label
              style={{
                display: "block",
                fontWeight: "500",
                marginBottom: "0.5rem",
                color: "#374151",
              }}
            >
              Table Name (optional)
            </label>
            <input
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="Main Table"
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "2px solid #e5e7eb",
                borderRadius: "6px",
                fontSize: "0.9rem",
              }}
            />
            <small style={{ color: "#6b7280", fontSize: "0.8rem" }}>
              Leave as "Main Table" if unsure
            </small>
          </div>
        </>
      ) : (
        // OAuth mode: Show dropdowns for bases and tables
        <>
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                fontWeight: "500",
                marginBottom: "0.5rem",
                color: "#374151",
              }}
            >
              Select Airtable Base *
            </label>
            {loadingBases ? (
              <div style={{ padding: "0.75rem", color: "#6b7280" }}>
                🔄 Loading your Airtable bases...
              </div>
            ) : (
              <select
                value={selectedBase?.id || ""}
                onChange={(e) => {
                  const base = bases.find((b) => b.id === e.target.value);
                  if (base) handleBaseSelect(base);
                }}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "2px solid #e5e7eb",
                  borderRadius: "6px",
                  fontSize: "0.9rem",
                  backgroundColor: "white",
                }}
                required
              >
                <option value="">Choose a base...</option>
                {bases.map((base) => (
                  <option key={base.id} value={base.id}>
                    {base.name} ({base.permissionLevel})
                  </option>
                ))}
              </select>
            )}
            {selectedBase && (
              <small style={{ color: "#6b7280", fontSize: "0.8rem" }}>
                Selected: {selectedBase.name} (ID: {selectedBase.id})
              </small>
            )}
          </div>

          {selectedBase && (
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  display: "block",
                  fontWeight: "500",
                  marginBottom: "0.5rem",
                  color: "#374151",
                }}
              >
                Select Table *
              </label>
              {loadingTables ? (
                <div style={{ padding: "0.75rem", color: "#6b7280" }}>
                  🔄 Loading tables for {selectedBase.name}...
                </div>
              ) : (
                <select
                  value={selectedTable?.id || ""}
                  onChange={(e) => {
                    const table = tables.find((t) => t.id === e.target.value);
                    if (table) handleTableSelect(table);
                  }}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "2px solid #e5e7eb",
                    borderRadius: "6px",
                    fontSize: "0.9rem",
                    backgroundColor: "white",
                  }}
                  required
                >
                  <option value="">Choose a table...</option>
                  {tables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name} ({table.fields.length} fields)
                    </option>
                  ))}
                </select>
              )}
              {selectedTable && (
                <div style={{ marginTop: "0.5rem" }}>
                  <small style={{ color: "#6b7280", fontSize: "0.8rem" }}>
                    Selected: {selectedTable.name}
                  </small>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#6b7280",
                      marginTop: "0.25rem",
                    }}
                  >
                    Available fields:{" "}
                    {selectedTable.fields.map((f) => f.name).join(", ")}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {selectedMethod === "api-key" && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "#fffbeb",
            borderRadius: "6px",
            border: "1px solid #fde68a",
            marginBottom: "1rem",
            fontSize: "0.9rem",
          }}
        >
          <strong>⚠️ Table Setup Required:</strong>
          <div style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>
            Your Airtable table should have at least a <strong>"Name"</strong>{" "}
            field (which most tables have by default).
            <br />
            <strong>Optional fields to add for richer data:</strong>
            <ul style={{ margin: "0.5rem 0", paddingLeft: "1.5rem" }}>
              <li>
                <code>Domain</code> (Single line text)
              </li>
              <li>
                <code>Email</code> (Email field)
              </li>
              <li>
                <code>Created</code> (Date & time)
              </li>
              <li>
                <code>Status</code> (Single line text)
              </li>
              <li>
                <code>Notes</code> (Long text)
              </li>
            </ul>
            If these fields don't exist, we'll only populate the fields that do
            exist.
          </div>
        </div>
      )}

      {selectedMethod === "oauth" && selectedTable ? (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "#f3f4f6",
            borderRadius: "6px",
            marginBottom: "1.5rem",
            fontSize: "0.9rem",
          }}
        >
          <strong>🎯 Data we'll create in "{selectedTable.name}":</strong>
          <div
            style={{
              marginTop: "0.5rem",
              fontFamily: "monospace",
              fontSize: "0.8rem",
            }}
          >
            {selectedTable.fields.map((field) => {
              let sampleValue = "—";
              if (field.name.toLowerCase().includes("name")) {
                sampleValue = `[Your name] - ${domain}`;
              } else if (field.name.toLowerCase().includes("domain")) {
                sampleValue = domain;
              } else if (field.name.toLowerCase().includes("email")) {
                sampleValue = "[Your email]";
              } else if (
                field.name.toLowerCase().includes("created") ||
                field.name.toLowerCase().includes("date")
              ) {
                sampleValue = "[Current timestamp]";
              } else if (field.name.toLowerCase().includes("status")) {
                sampleValue = "Active";
              } else if (field.name.toLowerCase().includes("note")) {
                sampleValue = `Record created from ${domain}...`;
              } else {
                sampleValue = `[${field.type} field]`;
              }

              return (
                <div key={field.id}>
                  {field.name}: {sampleValue}
                </div>
              );
            })}
          </div>
        </div>
      ) : selectedMethod === "api-key" ? (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "#f3f4f6",
            borderRadius: "6px",
            marginBottom: "1.5rem",
            fontSize: "0.9rem",
          }}
        >
          <strong>🎯 Sample data we'll try to create:</strong>
          <div
            style={{
              marginTop: "0.5rem",
              fontFamily: "monospace",
              fontSize: "0.8rem",
            }}
          >
            Name: [Your name] - {domain}
            <br />
            Domain: {domain} (if field exists)
            <br />
            Email: [Your email] (if field exists)
            <br />
            Created: [Current timestamp] (if field exists)
            <br />
            Status: Active (if field exists)
            <br />
            Notes: Record created from {domain}... (if field exists)
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: "#6b7280",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "1rem",
          }}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: isSubmitting ? "#9ca3af" : "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: isSubmitting ? "not-allowed" : "pointer",
            fontSize: "1rem",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <span>⏳</span>
              Creating...
            </>
          ) : (
            <>
              <span>🗂️</span>
              Create Record
            </>
          )}
        </button>
      </div>
    </form>
  );
};

export default AirtableForm;
