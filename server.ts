import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS for Webhooks and API endpoints
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-signature");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Set up the API Key internally to not expose it on the client
// Ideally this should be in an env file but adding here explicitly for testing as per request
const API_SPORTS_KEY = "8de59a4031f42b90cb806ee846244604";

let cachedFixtures: any = null;
let lastFetchTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

app.get("/api/live-matches", async (req, res) => {
  const now = Date.now();
  if (cachedFixtures && (now - lastFetchTime) < CACHE_TTL) {
    return res.json({ success: true, fromCache: true, data: cachedFixtures, lastFetchTime });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${today}`, {
      method: "GET",
      headers: {
        "x-apisports-key": API_SPORTS_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`API Sports Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Transform or directly return data
    cachedFixtures = data.response || [];
    lastFetchTime = now;
    
    return res.json({ success: true, fromCache: false, data: cachedFixtures, lastFetchTime });
  } catch (error: any) {
    console.error("Failed to fetch live matches:", error);
    // On error, return last known cached data if available
    if (cachedFixtures) {
       return res.json({ success: false, fromCache: true, error: error.message, data: cachedFixtures, lastFetchTime });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Mercado Pago Webhook Notification Receiver & Logs
const webhookLogs: any[] = [];

app.get("/api/mercadopago/logs", (req, res) => {
  return res.json({ success: true, count: webhookLogs.length, logs: webhookLogs });
});

app.all("/api/mercadopago/webhook", async (req, res) => {
  try {
    const timestamp = new Date().toISOString();
    const payload = req.body || {};
    const query = req.query || {};
    const headers = req.headers || {};
    
    console.log("Mercado Pago Webhook Event:", { method: req.method, action: payload.action, type: payload.type, id: payload.data?.id, query });

    const logEntry: any = {
      id: `wh_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp,
      method: req.method,
      action: payload.action || query.topic || query.type || 'order.processed',
      type: payload.type || query.type || 'payment',
      resourceId: payload.data?.id || query.id || query['data.id'] || 'test_123456',
      query,
      body: payload,
      headers: {
        'x-signature': headers['x-signature'] || null,
        'user-agent': headers['user-agent'] || null,
      }
    };

    webhookLogs.unshift(logEntry);
    if (webhookLogs.length > 200) webhookLogs.pop();

    // If it's a GET request from a browser or test tool, return full diagnostic status
    if (req.method === 'GET') {
      return res.status(200).json({ 
        status: "200 OK",
        message: "Endpoint de Webhook Mercado Pago Ativo e Operacional", 
        totalLogs: webhookLogs.length,
        lastReceived: logEntry.timestamp,
        logs: webhookLogs.slice(0, 5)
      });
    }

    // Always acknowledge POST receipt to Mercado Pago immediately with 200 OK
    return res.status(200).json({ received: true, status: 200, timestamp, logId: logEntry.id });
  } catch (err: any) {
    console.error("Error processing Mercado Pago Webhook:", err);
    return res.status(200).json({ received: true, status: 200, error: err.message });
  }
});

// Endpoint to simulate an incoming Mercado Pago payment webhook
app.post("/api/mercadopago/simulate", (req, res) => {
  const samplePayload = {
    action: "payment.created",
    api_version: "v1",
    data: { id: "10987654321" },
    date_created: new Date().toISOString(),
    id: 10987654321,
    live_mode: true,
    type: "payment",
    user_id: "2036166913129974",
    payer: {
      name: "Allan Jones",
      amount: 5.00
    }
  };

  const logEntry = {
    id: `wh_sim_${Date.now()}`,
    timestamp: new Date().toISOString(),
    method: 'POST (Simulado)',
    action: 'payment.created',
    type: 'payment',
    resourceId: '10987654321 (Allan Jones - R$ 5,00)',
    query: { topic: 'payment' },
    body: samplePayload,
    headers: { 'user-agent': 'MercadoPago-WebhookSimulator/1.0' }
  };

  webhookLogs.unshift(logEntry);
  return res.json({ success: true, message: "Webhook de R$ 5,00 (Allan Jones) simulado com sucesso!", log: logEntry });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Note: express@4.x uses '*', express@5.x uses '*all' or '*'
    // Since package.json has 'express': '^4.21.2', '*' is correct
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
