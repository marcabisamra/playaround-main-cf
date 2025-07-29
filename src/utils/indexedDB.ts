// IndexedDB utilities for storing products and orders

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  priceId: string;
  domain: string;
  created: number;
  type?: "one-time" | "subscription";
  interval?: "month" | "year" | null;
}

export interface Order {
  id: string;
  productId: string;
  productName: string;
  amount: number;
  currency: string;
  domain: string;
  customerEmail: string;
  status: "pending" | "succeeded" | "failed";
  paymentIntentId: string;
  created: number;
}

export interface Subscription {
  id: string;
  status: "active" | "canceled" | "past_due" | "unpaid" | "incomplete";
  productName: string;
  productId: string;
  price: number;
  interval: "month" | "year";
  currentPeriodStart: number;
  currentPeriodEnd: number;
  created: number;
  domain: string;
  cancelAtPeriodEnd?: boolean;
}

const DB_NAME = "MultiDomainStore";
const DB_VERSION = 2; // Updated version for new subscription store
const PRODUCTS_STORE = "products";
const ORDERS_STORE = "orders";
const SUBSCRIPTIONS_STORE = "subscriptions";

class IndexedDBHelper {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create products store
        if (!db.objectStoreNames.contains(PRODUCTS_STORE)) {
          const productsStore = db.createObjectStore(PRODUCTS_STORE, {
            keyPath: "id",
          });
          productsStore.createIndex("domain", "domain", { unique: false });
        }

        // Create orders store
        if (!db.objectStoreNames.contains(ORDERS_STORE)) {
          const ordersStore = db.createObjectStore(ORDERS_STORE, {
            keyPath: "id",
          });
          ordersStore.createIndex("domain", "domain", { unique: false });
          ordersStore.createIndex("status", "status", { unique: false });
        }

        // Create subscriptions store
        if (!db.objectStoreNames.contains(SUBSCRIPTIONS_STORE)) {
          const subscriptionsStore = db.createObjectStore(SUBSCRIPTIONS_STORE, {
            keyPath: "id",
          });
          subscriptionsStore.createIndex("domain", "domain", { unique: false });
          subscriptionsStore.createIndex("status", "status", { unique: false });
        }
      };
    });
  }

  // Product operations
  async saveProduct(product: Product): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PRODUCTS_STORE], "readwrite");
      const store = transaction.objectStore(PRODUCTS_STORE);
      const request = store.put(product);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getProducts(domain: string): Promise<Product[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PRODUCTS_STORE], "readonly");
      const store = transaction.objectStore(PRODUCTS_STORE);
      const index = store.index("domain");
      const request = index.getAll(domain);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getProduct(id: string): Promise<Product | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PRODUCTS_STORE], "readonly");
      const store = transaction.objectStore(PRODUCTS_STORE);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  // Order operations
  async saveOrder(order: Order): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([ORDERS_STORE], "readwrite");
      const store = transaction.objectStore(ORDERS_STORE);
      const request = store.put(order);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getOrders(domain: string): Promise<Order[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([ORDERS_STORE], "readonly");
      const store = transaction.objectStore(ORDERS_STORE);
      const index = store.index("domain");
      const request = index.getAll(domain);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async updateOrderStatus(
    orderId: string,
    status: Order["status"]
  ): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([ORDERS_STORE], "readwrite");
      const store = transaction.objectStore(ORDERS_STORE);
      const getRequest = store.get(orderId);

      getRequest.onsuccess = () => {
        const order = getRequest.result;
        if (order) {
          order.status = status;
          const updateRequest = store.put(order);
          updateRequest.onerror = () => reject(updateRequest.error);
          updateRequest.onsuccess = () => resolve();
        } else {
          reject(new Error("Order not found"));
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // Subscription operations
  async saveSubscription(subscription: Subscription): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [SUBSCRIPTIONS_STORE],
        "readwrite"
      );
      const store = transaction.objectStore(SUBSCRIPTIONS_STORE);
      const request = store.put(subscription);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getSubscriptions(domain: string): Promise<Subscription[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [SUBSCRIPTIONS_STORE],
        "readonly"
      );
      const store = transaction.objectStore(SUBSCRIPTIONS_STORE);
      const index = store.index("domain");
      const request = index.getAll(domain);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getAllSubscriptions(): Promise<Subscription[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [SUBSCRIPTIONS_STORE],
        "readonly"
      );
      const store = transaction.objectStore(SUBSCRIPTIONS_STORE);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async updateSubscriptionStatus(
    subscriptionId: string,
    status: Subscription["status"],
    cancelAtPeriodEnd?: boolean
  ): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [SUBSCRIPTIONS_STORE],
        "readwrite"
      );
      const store = transaction.objectStore(SUBSCRIPTIONS_STORE);
      const getRequest = store.get(subscriptionId);

      getRequest.onsuccess = () => {
        const subscription = getRequest.result;
        if (subscription) {
          subscription.status = status;
          if (cancelAtPeriodEnd !== undefined) {
            subscription.cancelAtPeriodEnd = cancelAtPeriodEnd;
          }
          const updateRequest = store.put(subscription);
          updateRequest.onerror = () => reject(updateRequest.error);
          updateRequest.onsuccess = () => resolve();
        } else {
          reject(new Error("Subscription not found"));
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // Global operations (across all domains)
  async getAllProducts(): Promise<Product[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PRODUCTS_STORE], "readonly");
      const store = transaction.objectStore(PRODUCTS_STORE);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getAllOrders(): Promise<Order[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([ORDERS_STORE], "readonly");
      const store = transaction.objectStore(ORDERS_STORE);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getGlobalAnalytics(): Promise<{
    totalProducts: number;
    totalOrders: number;
    totalRevenue: number;
    totalSubscriptions: number;
    domainBreakdown: Record<
      string,
      {
        products: number;
        orders: number;
        revenue: number;
        subscriptions: number;
      }
    >;
  }> {
    if (!this.db) await this.init();

    const [products, orders, subscriptions] = await Promise.all([
      this.getAllProducts(),
      this.getAllOrders(),
      this.getAllSubscriptions(),
    ]);

    const domainBreakdown: Record<
      string,
      {
        products: number;
        orders: number;
        revenue: number;
        subscriptions: number;
      }
    > = {};

    // Process products
    products.forEach((product) => {
      if (!domainBreakdown[product.domain]) {
        domainBreakdown[product.domain] = {
          products: 0,
          orders: 0,
          revenue: 0,
          subscriptions: 0,
        };
      }
      domainBreakdown[product.domain].products++;
    });

    // Process orders
    let totalRevenue = 0;
    orders.forEach((order) => {
      if (!domainBreakdown[order.domain]) {
        domainBreakdown[order.domain] = {
          products: 0,
          orders: 0,
          revenue: 0,
          subscriptions: 0,
        };
      }
      domainBreakdown[order.domain].orders++;

      if (order.status === "succeeded") {
        domainBreakdown[order.domain].revenue += order.amount;
        totalRevenue += order.amount;
      }
    });

    // Process subscriptions
    subscriptions.forEach((subscription) => {
      if (!domainBreakdown[subscription.domain]) {
        domainBreakdown[subscription.domain] = {
          products: 0,
          orders: 0,
          revenue: 0,
          subscriptions: 0,
        };
      }
      domainBreakdown[subscription.domain].subscriptions++;
    });

    return {
      totalProducts: products.length,
      totalOrders: orders.length,
      totalRevenue,
      totalSubscriptions: subscriptions.length,
      domainBreakdown,
    };
  }
}

// Export singleton instance
export const db = new IndexedDBHelper();
