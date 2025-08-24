const path = require("path");
const express = require("express");
const compression = require("compression");

const app = express();
const API = "https://api2.bags.fm/api/v1";
const PORT = process.env.PORT || 3000;

// === put your bearer here or in env ===
const BAGS_BEARER =
  process.env.BAGS_BEARER ||
  "Bearer <YOUR-BEARER-HERE>";

// --- util: node >=18 has global fetch; if not, uncomment the next line
// const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

app.use(compression());

/* CORS */
const ALLOW_ORIGINS = new Set([
  "https://degenbags.fun",
  process.env.RENDER_EXTERNAL_URL,
].filter(Boolean));

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  if (ALLOW_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// static frontend
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR, { maxAge: "1h", etag: true }));

// proxy GMGN.ai logo
app.get("/api/gmgn-logo", async (req, res) => {
  try {
    const url = "https://gmgn.ai/static/logo.svg";
    const upstream = await fetch(url, { headers: { "User-Agent": "DegenBagsProxy/1.0" } });
    const buffer = await upstream.arrayBuffer();
    res
      .status(upstream.status)
      .set("Content-Type", "image/svg+xml")
      .set("Cross-Origin-Resource-Policy", "cross-origin")
      .send(Buffer.from(buffer));
  } catch (err) {
    console.error(`[Proxy] GMGN.ai logo error:`, err);
    res.status(500).send("Failed to load GMGN.ai logo");
  }
});

// generic proxy
async function proxyJSON(res, url, { withAuth = false } = {}) {
  try {
    const headers = {
      "User-Agent": "DegenBagsProxy/1.0",
      Accept: "application/json, text/plain, */*",
    };
    if (withAuth && BAGS_BEARER) headers.Authorization = BAGS_BEARER;
    const upstream = await fetch(url, { headers, redirect: "follow" });
    const text = await upstream.text();
    const ct = upstream.headers.get("content-type") || "";
    const looksJson = text && (text.trim().startsWith("{") || text.trim().startsWith("["));
    res
      .status(upstream.status)
      .type(ct || (looksJson ? "application/json; charset=utf-8" : "text/plain"))
      .send(text);
  } catch (err) {
    console.error(`[Proxy] Error for ${url}:`, err);
    res.status(500).json({ success: false, error: err.message || "proxy error" });
  }
}

/* -------- API routes -------- */

// feeds (no auth)
app.get("/api/feed", async (req, res) => {
  await proxyJSON(res, `${API}/token-launch/feed`);
});
app.get("/api/leaderboard", async (req, res) => {
  await proxyJSON(res, `${API}/token-launch/leaderboard`);
});

// top holders
app.get("/api/token-top-holders", (req, res) => {
  const ca = req.query.tokenAddress;
  if (!ca) return res.status(400).json({ success: false, error: "missing tokenAddress" });
  proxyJSON(res, `${API}/token/${encodeURIComponent(ca)}/top-holders`, { withAuth: true });
});


// creator data
app.get("/api/creator", (req, res) => {
  const tokenMint = req.query.tokenMint;
  if (!tokenMint) return res.status(400).json({ success: false, error: "missing tokenMint" });
  proxyJSON(res, `${API}/token-launch/creator/v2?tokenMint=${encodeURIComponent(tokenMint)}`, { withAuth: true });
});

// market data
app.get("/api/market", (req, res) => {
  const ca = req.query.tokenAddress;
  if (!ca) return res.status(400).json({ success: false, error: "missing tokenAddress" });
  proxyJSON(res, `${API}/bags/token/find?tokenAddress=${encodeURIComponent(ca)}`, { withAuth: true });
});

// token overview
app.get("/api/token-overview", (req, res) => {
  const ca = req.query.tokenAddress;
  if (!ca) return res.status(400).json({ success: false, error: "missing tokenAddress" });
  proxyJSON(res, `${API}/token/${encodeURIComponent(ca)}-overview?extensions=allTimeHigh,creationMetadata`, { withAuth: true });
});

// token ohlcv
app.get("/api/token-ohlcv", (req, res) => {
  const ca = req.query.tokenAddress;
  const { resolution = 1, from, to } = req.query;
  if (!ca) return res.status(400).json({ success: false, error: "missing tokenAddress" });
  if (!from || !to) return res.status(400).json({ success: false, error: "missing from or to timestamp" });
  proxyJSON(res, `${API}/token/${encodeURIComponent(ca)}/ohlcv/v2?resolution=${resolution}&from=${from}&to=${to}`, { withAuth: true });
});

// token trades
app.get("/api/token-trades", (req, res) => {
  const ca = req.query.tokenAddress;
  if (!ca) return res.status(400).json({ success: false, error: "missing tokenAddress" });
  proxyJSON(res, `${API}/token/${encodeURIComponent(ca)}/trades`, { withAuth: true });
});

// alpha
app.get("/api/subscription", async (req, res) => {
  const auth = req.headers.authorization || BAGS_BEARER;
  if (!auth) return res.status(401).json({ success: false, error: "missing authorization" });
  await proxyJSON(res, `${API}/subscription`, { withAuth: true });
});
app.get("/api/subscription/info/:uuid", async (req, res) => {
  const uuid = req.params.uuid;
  if (!uuid) return res.status(400).json({ success: false, error: "missing uuid" });
  await proxyJSON(res, `${API}/subscription/info/${encodeURIComponent(uuid)}`, { withAuth: true });
});

// token details page
app.get("/token/:tokenAddress", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "token.html"));
});

// SPA fallback
app.get("*", (req, res, next) => {
  if (!(req.headers.accept || "").includes("text/html")) return next();
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () =>
  console.log(`✅ DegenBags server running on port ${PORT}`)
);