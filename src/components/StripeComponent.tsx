import React, { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { db, Product, Order, Subscription } from "../utils/indexedDB";

interface User {
  id: string;
  email: string;
  name: string;
  domain: string;
}

interface StripeComponentProps {
  user: User | null;
  currentDomain: string;
}

// Card element options
const cardElementOptions = {
  style: {
    base: {
      fontSize: "16px",
      color: "#424770",
      "::placeholder": {
        color: "#aab7c4",
      },
    },
    invalid: {
      color: "#9e2146",
    },
  },
};

// Payment form component (needs to be inside Elements provider)
const PaymentForm: React.FC<{
  product: Product;
  user: User;
  onPaymentSuccess: (order: Order) => void;
  onSubscriptionSuccess: (subscription: Subscription) => void;
  onCancel: () => void;
}> = ({ product, user, onPaymentSuccess, onSubscriptionSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const token = localStorage.getItem("authToken");

      if (product.type === "subscription") {
        // Handle subscription
        const subscriptionResponse = await fetch(
          "/api/stripe/create-subscription-intent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              token,
              domain: user.domain,
              priceId: product.priceId,
              productId: product.id,
            }),
          }
        );

        const subscriptionResult = await subscriptionResponse.json();

        if (!subscriptionResult.success) {
          throw new Error(subscriptionResult.error);
        }

        // Create subscription in IndexedDB
        const subscription: Subscription = {
          id: subscriptionResult.subscriptionId,
          status: "incomplete",
          productName: product.name,
          productId: product.id,
          price: product.price,
          interval: product.interval!,
          currentPeriodStart: Date.now(),
          currentPeriodEnd:
            Date.now() +
            (product.interval === "month" ? 30 : 365) * 24 * 60 * 60 * 1000,
          created: Date.now(),
          domain: user.domain,
        };

        await db.saveSubscription(subscription);

        // Confirm subscription payment with card
        const cardElement = elements.getElement(CardElement);
        const { error: confirmError, paymentIntent } =
          await stripe.confirmCardPayment(subscriptionResult.clientSecret, {
            payment_method: {
              card: cardElement!,
              billing_details: {
                name: user.name,
                email: user.email,
              },
            },
          });

        if (confirmError) {
          setError(confirmError.message || "Subscription setup failed");
          await db.updateSubscriptionStatus(subscription.id, "incomplete");
        } else if (paymentIntent?.status === "succeeded") {
          await db.updateSubscriptionStatus(subscription.id, "active");
          const updatedSubscription = {
            ...subscription,
            status: "active" as const,
          };
          onSubscriptionSuccess(updatedSubscription);
        }
      } else {
        // Handle one-time payment
        const paymentIntentResponse = await fetch(
          "/api/stripe/create-payment-intent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              token,
              domain: user.domain,
              priceId: product.priceId,
              productId: product.id,
            }),
          }
        );

        const paymentIntentResult = await paymentIntentResponse.json();

        if (!paymentIntentResult.success) {
          throw new Error(paymentIntentResult.error);
        }

        // Create order in IndexedDB
        const order: Order = {
          id: paymentIntentResult.paymentIntentId,
          productId: product.id,
          productName: product.name,
          amount: product.price,
          currency: "usd",
          domain: user.domain,
          customerEmail: user.email,
          status: "pending",
          paymentIntentId: paymentIntentResult.paymentIntentId,
          created: Date.now(),
        };

        await db.saveOrder(order);

        // Confirm payment with card
        const cardElement = elements.getElement(CardElement);
        const { error: confirmError, paymentIntent } =
          await stripe.confirmCardPayment(paymentIntentResult.clientSecret, {
            payment_method: {
              card: cardElement!,
              billing_details: {
                name: user.name,
                email: user.email,
              },
            },
          });

        if (confirmError) {
          setError(confirmError.message || "Payment failed");
          await db.updateOrderStatus(order.id, "failed");
        } else if (paymentIntent.status === "succeeded") {
          await db.updateOrderStatus(order.id, "succeeded");
          const updatedOrder = { ...order, status: "succeeded" as const };
          onPaymentSuccess(updatedOrder);
        }
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h4 style={{ margin: "0 0 0.5rem 0", color: "#1f2937" }}>
          Purchase: {product.name}
        </h4>
        <p style={{ margin: "0 0 1rem 0", color: "#6b7280" }}>
          {product.description}
        </p>
        <p
          style={{
            margin: "0 0 1rem 0",
            fontSize: "1.25rem",
            fontWeight: "bold",
          }}
        >
          ${product.price.toFixed(2)}
        </p>
      </div>

      <div
        style={{
          padding: "0.75rem",
          border: "1px solid #d1d5db",
          borderRadius: "6px",
          marginBottom: "1rem",
        }}
      >
        <CardElement options={cardElementOptions} />
      </div>

      {error && (
        <div
          style={{
            color: "#dc2626",
            backgroundColor: "#fee2e2",
            padding: "0.75rem",
            borderRadius: "6px",
            marginBottom: "1rem",
            fontSize: "0.875rem",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "1rem" }}>
        <button
          type="submit"
          disabled={!stripe || processing}
          style={{
            flex: 1,
            padding: "0.75rem",
            backgroundColor: processing ? "#9ca3af" : "#10b981",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: processing ? "not-allowed" : "pointer",
            fontSize: "1rem",
            fontWeight: "500",
          }}
        >
          {processing ? "Processing..." : `Pay $${product.price.toFixed(2)}`}
        </button>
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
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

// Main Stripe component
const StripeComponent: React.FC<StripeComponentProps> = ({
  user,
  currentDomain,
}) => {
  const [stripePromise, setStripePromise] = useState<Promise<any> | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCreateSubscriptionForm, setShowCreateSubscriptionForm] =
    useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);

  // Form states
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productPrice, setProductPrice] = useState("");

  // Subscription form states
  const [subscriptionName, setSubscriptionName] = useState("");
  const [subscriptionDescription, setSubscriptionDescription] = useState("");
  const [subscriptionPrice, setSubscriptionPrice] = useState("");
  const [subscriptionInterval, setSubscriptionInterval] = useState<
    "month" | "year"
  >("month");

  useEffect(() => {
    // Load Stripe publishable key
    const loadStripeConfig = async () => {
      try {
        const response = await fetch("/api/stripe/config");
        const config = await response.json();
        if (config.publishableKey) {
          setStripePromise(loadStripe(config.publishableKey));
        }
      } catch (error) {
        console.error("Failed to load Stripe config:", error);
      }
    };

    loadStripeConfig();
  }, []);

  useEffect(() => {
    if (user) {
      loadProducts();
      loadOrders();
      loadSubscriptions();
    }
  }, [user, currentDomain]);

  const loadProducts = async () => {
    try {
      // Load from IndexedDB first
      const localProducts = await db.getProducts(currentDomain);
      setProducts(localProducts);

      // Also fetch from server to sync
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/stripe/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          domain: currentDomain,
        }),
      });

      const result = await response.json();
      if (result.success) {
        // Update IndexedDB with server data
        for (const product of result.products) {
          await db.saveProduct(product);
        }
        setProducts(result.products);
      }
    } catch (error) {
      console.error("Failed to load products:", error);
    }
  };

  const loadOrders = async () => {
    try {
      const localOrders = await db.getOrders(currentDomain);
      setOrders(localOrders);
    } catch (error) {
      console.error("Failed to load orders:", error);
    }
  };

  const loadSubscriptions = async () => {
    try {
      // Load from IndexedDB first
      const localSubscriptions = await db.getSubscriptions(currentDomain);
      setSubscriptions(localSubscriptions);

      // Also fetch from server to sync
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/stripe/subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          domain: currentDomain,
        }),
      });

      const result = await response.json();
      if (result.success) {
        // Update IndexedDB with server data
        for (const subscription of result.subscriptions) {
          await db.saveSubscription(subscription);
        }
        setSubscriptions(result.subscriptions);
      }
    } catch (error) {
      console.error("Failed to load subscriptions:", error);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/stripe/create-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          domain: currentDomain,
          name: productName,
          description: productDescription,
          price: parseFloat(productPrice),
        }),
      });

      const result = await response.json();
      if (result.success) {
        // Save to IndexedDB
        await db.saveProduct(result.product);

        // Update local state
        setProducts([...products, result.product]);

        // Reset form
        setProductName("");
        setProductDescription("");
        setProductPrice("");
        setShowCreateForm(false);

        alert("Product created successfully!");
      } else {
        alert(`Failed to create product: ${result.error}`);
      }
    } catch (error) {
      console.error("Error creating product:", error);
      alert("Failed to create product");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/stripe/create-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          domain: currentDomain,
          name: subscriptionName,
          description: subscriptionDescription,
          price: parseFloat(subscriptionPrice),
          interval: subscriptionInterval,
        }),
      });

      const result = await response.json();
      if (result.success) {
        // Save to IndexedDB
        await db.saveProduct(result.product);

        // Update local state
        setProducts([...products, result.product]);

        // Reset form
        setSubscriptionName("");
        setSubscriptionDescription("");
        setSubscriptionPrice("");
        setSubscriptionInterval("month");
        setShowCreateSubscriptionForm(false);

        alert("Subscription product created successfully!");
      } else {
        alert(`Failed to create subscription: ${result.error}`);
      }
    } catch (error) {
      console.error("Error creating subscription:", error);
      alert("Failed to create subscription");
    } finally {
      setLoading(false);
    }
  };

  const handleBuyProduct = (product: Product) => {
    // Validate product before allowing purchase
    if (!product.priceId) {
      alert(
        "Error: This product doesn't have a valid price ID. Unable to process payment."
      );
      return;
    }

    if (product.price <= 0) {
      alert(
        "Error: This product has an invalid price ($0.00). Unable to process payment."
      );
      return;
    }

    console.log(
      `🛒 Attempting to buy product: ${product.name} for $${product.price} (Price ID: ${product.priceId})`
    );
    setSelectedProduct(product);
    setShowPaymentForm(true);
  };

  const handlePaymentSuccess = (order: Order) => {
    setOrders([...orders, order]);
    setShowPaymentForm(false);
    setSelectedProduct(null);
    alert(`Payment successful! Order ID: ${order.id}`);
  };

  const handleSubscriptionSuccess = (subscription: Subscription) => {
    setSubscriptions([...subscriptions, subscription]);
    setShowPaymentForm(false);
    setSelectedProduct(null);
    alert(`Subscription activated! Subscription ID: ${subscription.id}`);
  };

  const handleCancelPayment = () => {
    setShowPaymentForm(false);
    setSelectedProduct(null);
  };

  const handleCancelSubscription = async (subscriptionId: string) => {
    if (
      !confirm(
        "Are you sure you want to cancel this subscription? It will remain active until the end of the current billing period."
      )
    ) {
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/stripe/cancel-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          domain: currentDomain,
          subscriptionId,
        }),
      });

      const result = await response.json();
      if (result.success) {
        // Update local subscription
        await db.updateSubscriptionStatus(subscriptionId, "canceled", true);

        // Refresh subscriptions list
        loadSubscriptions();

        alert(
          "Subscription will be canceled at the end of the current billing period."
        );
      } else {
        alert(`Failed to cancel subscription: ${result.error}`);
      }
    } catch (error) {
      console.error("Error canceling subscription:", error);
      alert("Failed to cancel subscription");
    }
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
          💳 Stripe Integration
        </h2>
        <p style={{ color: "#6b7280", margin: 0 }}>
          Please log in to access Stripe payment features
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "1.5rem",
        border: "2px solid #8b5cf6",
        borderRadius: "8px",
        backgroundColor: "#faf5ff",
      }}
    >
      <h2 style={{ color: "#7c3aed", margin: "0 0 1rem 0" }}>
        💳 Stripe Payment System
      </h2>
      <p
        style={{ color: "#6b7280", margin: "0 0 1.5rem 0", fontSize: "0.9rem" }}
      >
        Create and purchase products using one Stripe account across all
        domains. Products and orders are stored locally per domain.
      </p>

      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setShowCreateForm(true)}
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
        >
          <span>✨</span>
          Create Product
        </button>
        <button
          onClick={() => setShowCreateSubscriptionForm(true)}
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
        >
          <span>🔄</span>
          Create Subscription
        </button>
        <button
          onClick={loadProducts}
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
        >
          <span>🔄</span>
          Refresh Products
        </button>
      </div>

      {/* Products List */}
      <div style={{ marginBottom: "2rem" }}>
        <h3 style={{ color: "#1f2937", marginBottom: "1rem" }}>
          Products for {currentDomain}
        </h3>
        {products.length === 0 ? (
          <p style={{ color: "#6b7280", fontStyle: "italic" }}>
            No products created yet. Create your first product above!
          </p>
        ) : (
          <div style={{ display: "grid", gap: "1rem" }}>
            {products.map((product) => (
              <div
                key={product.id}
                style={{
                  padding: "1rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  backgroundColor: "white",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
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
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: "1.125rem",
                        fontWeight: "bold",
                        color: "#059669",
                      }}
                    >
                      ${product.price.toFixed(2)}
                      {product.type === "subscription" &&
                        product.interval &&
                        `/${product.interval}`}
                    </p>
                    <span
                      style={{
                        padding: "0.125rem 0.375rem",
                        backgroundColor:
                          product.type === "subscription"
                            ? "#fbbf24"
                            : "#3b82f6",
                        color: "white",
                        borderRadius: "3px",
                        fontSize: "0.75rem",
                        fontWeight: "500",
                      }}
                    >
                      {product.type === "subscription"
                        ? "Subscription"
                        : "One-time"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleBuyProduct(product)}
                  disabled={!product.priceId || product.price <= 0}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor:
                      !product.priceId || product.price <= 0
                        ? "#9ca3af"
                        : "#f59e0b",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor:
                      !product.priceId || product.price <= 0
                        ? "not-allowed"
                        : "pointer",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                  }}
                >
                  {!product.priceId || product.price <= 0
                    ? "Invalid Price"
                    : product.type === "subscription"
                    ? "Subscribe"
                    : "Buy Now"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Orders List */}
      <div>
        <h3 style={{ color: "#1f2937", marginBottom: "1rem" }}>
          Recent Orders
        </h3>
        {orders.length === 0 ? (
          <p style={{ color: "#6b7280", fontStyle: "italic" }}>
            No orders yet.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {orders
              .slice()
              .reverse()
              .slice(0, 5)
              .map((order) => (
                <div
                  key={order.id}
                  style={{
                    padding: "0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "4px",
                    backgroundColor: "white",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.875rem",
                  }}
                >
                  <div>
                    <strong>{order.productName}</strong> - $
                    {order.amount.toFixed(2)}
                    <br />
                    <span style={{ color: "#6b7280" }}>
                      {new Date(order.created).toLocaleDateString()}
                    </span>
                  </div>
                  <span
                    style={{
                      padding: "0.25rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: "500",
                      backgroundColor:
                        order.status === "succeeded"
                          ? "#d1fae5"
                          : order.status === "failed"
                          ? "#fee2e2"
                          : "#fef3c7",
                      color:
                        order.status === "succeeded"
                          ? "#065f46"
                          : order.status === "failed"
                          ? "#991b1b"
                          : "#92400e",
                    }}
                  >
                    {order.status.toUpperCase()}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Subscriptions List */}
      <div style={{ marginTop: "2rem" }}>
        <h3 style={{ color: "#1f2937", marginBottom: "1rem" }}>
          Active Subscriptions
        </h3>
        {subscriptions.length === 0 ? (
          <p style={{ color: "#6b7280", fontStyle: "italic" }}>
            No active subscriptions.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {subscriptions.map((subscription) => (
              <div
                key={subscription.id}
                style={{
                  padding: "0.75rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  backgroundColor: "white",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.875rem",
                }}
              >
                <div>
                  <strong>{subscription.productName}</strong> - $
                  {subscription.price.toFixed(2)}/{subscription.interval}
                  <br />
                  <span style={{ color: "#6b7280" }}>
                    Next billing:{" "}
                    {new Date(
                      subscription.currentPeriodEnd
                    ).toLocaleDateString()}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      padding: "0.25rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: "500",
                      backgroundColor:
                        subscription.status === "active"
                          ? "#d1fae5"
                          : subscription.status === "canceled"
                          ? "#fee2e2"
                          : "#fef3c7",
                      color:
                        subscription.status === "active"
                          ? "#065f46"
                          : subscription.status === "canceled"
                          ? "#991b1b"
                          : "#92400e",
                    }}
                  >
                    {subscription.status.toUpperCase()}
                  </span>
                  {subscription.status === "active" &&
                    !subscription.cancelAtPeriodEnd && (
                      <button
                        onClick={() =>
                          handleCancelSubscription(subscription.id)
                        }
                        style={{
                          padding: "0.25rem 0.5rem",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  {subscription.cancelAtPeriodEnd && (
                    <span style={{ fontSize: "0.75rem", color: "#f59e0b" }}>
                      Cancels at period end
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Product Modal */}
      {showCreateForm && (
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
            }}
          >
            <h3 style={{ marginBottom: "1rem", color: "#1f2937" }}>
              ✨ Create New Product
            </h3>
            <form onSubmit={handleCreateProduct}>
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    color: "#374151",
                  }}
                >
                  Product Name
                </label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "1rem",
                  }}
                  placeholder="e.g., Premium Course"
                />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    color: "#374151",
                  }}
                >
                  Description
                </label>
                <textarea
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  required
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "1rem",
                    resize: "vertical",
                  }}
                  placeholder="Describe your product..."
                />
              </div>
              <div style={{ marginBottom: "1.5rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    color: "#374151",
                  }}
                >
                  Price (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={productPrice}
                  onChange={(e) => setProductPrice(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "1rem",
                  }}
                  placeholder="0.00"
                />
              </div>
              <div style={{ display: "flex", gap: "1rem" }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "0.75rem",
                    backgroundColor: loading ? "#9ca3af" : "#8b5cf6",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontSize: "1rem",
                    fontWeight: "500",
                  }}
                >
                  {loading ? "Creating..." : "Create Product"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  style={{
                    padding: "0.75rem 1.5rem",
                    backgroundColor: "#6b7280",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "1rem",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Subscription Modal */}
      {showCreateSubscriptionForm && (
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
            }}
          >
            <h3 style={{ marginBottom: "1rem", color: "#1f2937" }}>
              🔄 Create New Subscription
            </h3>
            <form onSubmit={handleCreateSubscription}>
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    color: "#374151",
                  }}
                >
                  Subscription Name
                </label>
                <input
                  type="text"
                  value={subscriptionName}
                  onChange={(e) => setSubscriptionName(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "1rem",
                  }}
                  placeholder="e.g., Premium Monthly Plan"
                />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    color: "#374151",
                  }}
                >
                  Description
                </label>
                <textarea
                  value={subscriptionDescription}
                  onChange={(e) => setSubscriptionDescription(e.target.value)}
                  required
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "1rem",
                    resize: "vertical",
                  }}
                  placeholder="Describe your subscription plan..."
                />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    color: "#374151",
                  }}
                >
                  Price (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={subscriptionPrice}
                  onChange={(e) => setSubscriptionPrice(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "1rem",
                  }}
                  placeholder="9.99"
                />
              </div>
              <div style={{ marginBottom: "1.5rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    color: "#374151",
                  }}
                >
                  Billing Interval
                </label>
                <select
                  value={subscriptionInterval}
                  onChange={(e) =>
                    setSubscriptionInterval(e.target.value as "month" | "year")
                  }
                  required
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "1rem",
                  }}
                >
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: "1rem" }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "0.75rem",
                    backgroundColor: loading ? "#9ca3af" : "#f59e0b",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontSize: "1rem",
                    fontWeight: "500",
                  }}
                >
                  {loading ? "Creating..." : "Create Subscription"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateSubscriptionForm(false)}
                  style={{
                    padding: "0.75rem 1.5rem",
                    backgroundColor: "#6b7280",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "1rem",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentForm && selectedProduct && stripePromise && (
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
            }}
          >
            <h3 style={{ marginBottom: "1rem", color: "#1f2937" }}>
              💳 Complete Payment
            </h3>
            <Elements stripe={stripePromise}>
              <PaymentForm
                product={selectedProduct}
                user={user}
                onPaymentSuccess={handlePaymentSuccess}
                onSubscriptionSuccess={handleSubscriptionSuccess}
                onCancel={handleCancelPayment}
              />
            </Elements>
          </div>
        </div>
      )}
    </div>
  );
};

export default StripeComponent;
