import React, { useState, useEffect } from "react";
import { db, Product, Order } from "../utils/indexedDB";

interface User {
  id: string;
  email: string;
  name: string;
  domain: string;
}

interface GlobalDataProps {
  user: User | null;
  currentDomain: string;
}

interface GlobalAnalytics {
  totalProducts: number;
  totalRevenue: number;
  totalSuccessfulPayments: number;
  domainCount: number;
  domainStats: Record<string, { products: number; revenue: number }>;
  recentPayments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    domain: string;
    customer_email: string;
    created: number;
  }>;
}

interface LocalAnalytics {
  totalProducts: number;
  totalOrders: number;
  totalRevenue: number;
  domainBreakdown: Record<
    string,
    { products: number; orders: number; revenue: number }
  >;
}

const GlobalDataComponent: React.FC<GlobalDataProps> = ({
  user,
  currentDomain,
}) => {
  const [globalAnalytics, setGlobalAnalytics] =
    useState<GlobalAnalytics | null>(null);
  const [localAnalytics, setLocalAnalytics] = useState<LocalAnalytics | null>(
    null
  );
  const [globalProducts, setGlobalProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "products" | "payments"
  >("overview");

  useEffect(() => {
    if (user) {
      loadGlobalData();
      loadLocalData();
    }
  }, [user]);

  const loadGlobalData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");

      // Fetch global analytics from server (Stripe data)
      const analyticsResponse = await fetch("/api/stripe/global-analytics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const analyticsResult = await analyticsResponse.json();
      if (analyticsResult.success) {
        setGlobalAnalytics(analyticsResult.analytics);
      }

      // Fetch all products from server
      const productsResponse = await fetch("/api/stripe/global-products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const productsResult = await productsResponse.json();
      if (productsResult.success) {
        setGlobalProducts(productsResult.products);
      }
    } catch (error) {
      console.error("Failed to load global data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadLocalData = async () => {
    try {
      const analytics = await db.getGlobalAnalytics();
      setLocalAnalytics(analytics);
    } catch (error) {
      console.error("Failed to load local analytics:", error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  if (!user) {
    return (
      <div
        style={{
          padding: "1.5rem",
          border: "2px solid #d1d5db",
          borderRadius: "8px",
          backgroundColor: "#f9fafb",
          textAlign: "center",
        }}
      >
        <h2 style={{ color: "#6b7280", margin: "0 0 1rem 0" }}>
          🌍 Global Business Dashboard
        </h2>
        <p style={{ color: "#6b7280", margin: 0 }}>
          Please log in to view global analytics across all domains
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "1.5rem",
        border: "2px solid #059669",
        borderRadius: "8px",
        backgroundColor: "#ecfdf5",
      }}
    >
      <h2 style={{ color: "#047857", margin: "0 0 1rem 0" }}>
        🌍 Global Business Dashboard
      </h2>
      <p
        style={{ color: "#6b7280", margin: "0 0 1.5rem 0", fontSize: "0.9rem" }}
      >
        Complete view of your business across all domains using one Stripe
        account. Data synced from server + local IndexedDB.
      </p>

      {/* Tab Navigation */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        {(["overview", "products", "payments"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: activeTab === tab ? "#059669" : "#e5e7eb",
              color: activeTab === tab ? "white" : "#374151",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: "500",
              textTransform: "capitalize",
            }}
          >
            {tab}
          </button>
        ))}
        <button
          onClick={loadGlobalData}
          disabled={loading}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "0.875rem",
            fontWeight: "500",
          }}
        >
          {loading ? "🔄 Loading..." : "🔄 Refresh"}
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div>
          {/* Global Statistics */}
          {globalAnalytics && (
            <div style={{ marginBottom: "2rem" }}>
              <h3 style={{ color: "#1f2937", marginBottom: "1rem" }}>
                📊 Global Statistics (Stripe Data)
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "1rem",
                  marginBottom: "2rem",
                }}
              >
                <div
                  style={{
                    padding: "1rem",
                    backgroundColor: "white",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "2rem",
                      fontWeight: "bold",
                      color: "#059669",
                    }}
                  >
                    {globalAnalytics.totalProducts}
                  </div>
                  <div style={{ color: "#6b7280", fontSize: "0.875rem" }}>
                    Total Products
                  </div>
                </div>
                <div
                  style={{
                    padding: "1rem",
                    backgroundColor: "white",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "2rem",
                      fontWeight: "bold",
                      color: "#059669",
                    }}
                  >
                    {formatCurrency(globalAnalytics.totalRevenue)}
                  </div>
                  <div style={{ color: "#6b7280", fontSize: "0.875rem" }}>
                    Total Revenue
                  </div>
                </div>
                <div
                  style={{
                    padding: "1rem",
                    backgroundColor: "white",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "2rem",
                      fontWeight: "bold",
                      color: "#059669",
                    }}
                  >
                    {globalAnalytics.totalSuccessfulPayments}
                  </div>
                  <div style={{ color: "#6b7280", fontSize: "0.875rem" }}>
                    Successful Payments
                  </div>
                </div>
                <div
                  style={{
                    padding: "1rem",
                    backgroundColor: "white",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "2rem",
                      fontWeight: "bold",
                      color: "#059669",
                    }}
                  >
                    {globalAnalytics.domainCount}
                  </div>
                  <div style={{ color: "#6b7280", fontSize: "0.875rem" }}>
                    Active Domains
                  </div>
                </div>
              </div>

              {/* Domain Breakdown */}
              <h4 style={{ color: "#1f2937", marginBottom: "1rem" }}>
                Domain Breakdown
              </h4>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {Object.entries(globalAnalytics.domainStats).map(
                  ([domain, stats]) => (
                    <div
                      key={domain}
                      style={{
                        padding: "0.75rem",
                        backgroundColor:
                          domain === currentDomain ? "#dbeafe" : "white",
                        border: `1px solid ${
                          domain === currentDomain ? "#3b82f6" : "#d1d5db"
                        }`,
                        borderRadius: "4px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong style={{ color: "#1f2937" }}>{domain}</strong>
                        {domain === currentDomain && (
                          <span
                            style={{
                              marginLeft: "0.5rem",
                              padding: "0.125rem 0.375rem",
                              backgroundColor: "#3b82f6",
                              color: "white",
                              borderRadius: "3px",
                              fontSize: "0.75rem",
                            }}
                          >
                            Current
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                        {stats.products} products •{" "}
                        {formatCurrency(stats.revenue)} revenue
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Local Analytics */}
          {localAnalytics && (
            <div>
              <h3 style={{ color: "#1f2937", marginBottom: "1rem" }}>
                💾 Local IndexedDB Analytics
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <div
                  style={{
                    padding: "0.75rem",
                    backgroundColor: "white",
                    borderRadius: "4px",
                    border: "1px solid #d1d5db",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: "bold",
                      color: "#7c3aed",
                    }}
                  >
                    {localAnalytics.totalProducts}
                  </div>
                  <div style={{ color: "#6b7280", fontSize: "0.75rem" }}>
                    Products (Local)
                  </div>
                </div>
                <div
                  style={{
                    padding: "0.75rem",
                    backgroundColor: "white",
                    borderRadius: "4px",
                    border: "1px solid #d1d5db",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: "bold",
                      color: "#7c3aed",
                    }}
                  >
                    {localAnalytics.totalOrders}
                  </div>
                  <div style={{ color: "#6b7280", fontSize: "0.75rem" }}>
                    Orders (Local)
                  </div>
                </div>
                <div
                  style={{
                    padding: "0.75rem",
                    backgroundColor: "white",
                    borderRadius: "4px",
                    border: "1px solid #d1d5db",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: "bold",
                      color: "#7c3aed",
                    }}
                  >
                    {formatCurrency(localAnalytics.totalRevenue)}
                  </div>
                  <div style={{ color: "#6b7280", fontSize: "0.75rem" }}>
                    Revenue (Local)
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Products Tab */}
      {activeTab === "products" && (
        <div>
          <h3 style={{ color: "#1f2937", marginBottom: "1rem" }}>
            📦 All Products Across Domains ({globalProducts.length})
          </h3>
          {globalProducts.length === 0 ? (
            <p style={{ color: "#6b7280", fontStyle: "italic" }}>
              No products found across any domains.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {globalProducts.map((product) => (
                <div
                  key={product.id}
                  style={{
                    padding: "1rem",
                    backgroundColor:
                      product.domain === currentDomain ? "#dbeafe" : "white",
                    border: `1px solid ${
                      product.domain === currentDomain ? "#3b82f6" : "#d1d5db"
                    }`,
                    borderRadius: "6px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "start",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: "0 0 0.5rem 0", color: "#1f2937" }}>
                        {product.name}
                      </h4>
                      <p
                        style={{
                          margin: "0 0 0.5rem 0",
                          color: "#6b7280",
                          fontSize: "0.875rem",
                        }}
                      >
                        {product.description}
                      </p>
                      <div
                        style={{
                          display: "flex",
                          gap: "1rem",
                          fontSize: "0.875rem",
                        }}
                      >
                        <span style={{ color: "#059669", fontWeight: "bold" }}>
                          {formatCurrency(product.price)}
                        </span>
                        <span style={{ color: "#6b7280" }}>
                          Domain: <strong>{product.domain}</strong>
                        </span>
                        <span style={{ color: "#6b7280" }}>
                          Created: {formatDate(product.created)}
                        </span>
                      </div>
                    </div>
                    {product.domain === currentDomain && (
                      <span
                        style={{
                          padding: "0.25rem 0.5rem",
                          backgroundColor: "#3b82f6",
                          color: "white",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: "500",
                        }}
                      >
                        Current Domain
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === "payments" && globalAnalytics && (
        <div>
          <h3 style={{ color: "#1f2937", marginBottom: "1rem" }}>
            💳 Recent Payments Across All Domains
          </h3>
          {globalAnalytics.recentPayments.length === 0 ? (
            <p style={{ color: "#6b7280", fontStyle: "italic" }}>
              No recent payments found.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {globalAnalytics.recentPayments.map((payment) => (
                <div
                  key={payment.id}
                  style={{
                    padding: "1rem",
                    backgroundColor:
                      payment.domain === currentDomain ? "#dbeafe" : "white",
                    border: `1px solid ${
                      payment.domain === currentDomain ? "#3b82f6" : "#d1d5db"
                    }`,
                    borderRadius: "6px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: "bold", color: "#1f2937" }}>
                        {formatCurrency(payment.amount)}
                      </div>
                      <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                        {payment.customer_email} • {payment.domain}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                        {formatDate(payment.created)} • ID:{" "}
                        {payment.id.substring(0, 10)}...
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          padding: "0.25rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: "500",
                          backgroundColor:
                            payment.status === "succeeded"
                              ? "#d1fae5"
                              : "#fee2e2",
                          color:
                            payment.status === "succeeded"
                              ? "#065f46"
                              : "#991b1b",
                        }}
                      >
                        {payment.status.toUpperCase()}
                      </span>
                      {payment.domain === currentDomain && (
                        <div
                          style={{
                            marginTop: "0.25rem",
                            padding: "0.125rem 0.375rem",
                            backgroundColor: "#3b82f6",
                            color: "white",
                            borderRadius: "3px",
                            fontSize: "0.625rem",
                          }}
                        >
                          Current Domain
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalDataComponent;
