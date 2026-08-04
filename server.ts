import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());

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

// Mercado Pago Webhook Notification Receiver
app.post("/api/mercadopago/webhook", async (req, res) => {
  try {
    const { action, type, data } = req.body;
    console.log("Mercado Pago Webhook Received:", { action, type, id: data?.id, query: req.query });
    
    // Always acknowledge receipt to Mercado Pago
    return res.status(200).json({ received: true, timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error("Error processing Mercado Pago Webhook:", err);
    return res.status(200).json({ received: true, error: err.message });
  }
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
