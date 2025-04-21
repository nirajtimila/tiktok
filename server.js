const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
require('dotenv').config();
const fetch = require('node-fetch'); // For fetching proxy list

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_NAME = process.env.SERVER_NAME || "Default Server";

app.use(cors());
app.use(express.json());

const sessions = new Map();

// Function to fetch and filter proxies with port 8080
async function fetchProxiesWithPort8080() {
  try {
    const response = await fetch('https://free-proxy-list.net/');
    const html = await response.text();

    // Extract the proxy list table from the HTML
    const proxyTableMatch = html.match(/<table[^>]*id="proxylisttable"[^>]*>[\s\S]*?<\/table>/);
    if (!proxyTableMatch) return [];

    const proxyTable = proxyTableMatch[0];

    // Extract rows from the table
    const rows = proxyTable.match(/<tr>[\s\S]*?<\/tr>/g);
    if (!rows || rows.length < 2) return [];

    const proxies = [];

    // Skip the header row and process the rest
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].match(/<td>(.*?)<\/td>/g);
      if (!cols || cols.length < 2) continue;

      const ip = cols[0].replace(/<td>|<\/td>/g, '').trim();
      const port = cols[1].replace(/<td>|<\/td>/g, '').trim();

      if (port === '8080') {
        proxies.push({ ip, port });
      }
    }

    return proxies;
  } catch (error) {
    console.error('Error fetching proxies:', error);
    return [];
  }
}

// Function to get a random proxy from the list
async function getRandomProxy() {
  const proxies = await fetchProxiesWithPort8080();
  if (proxies.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * proxies.length);
  return proxies[randomIndex];
}

app.get('/progress', (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId) return res.status(400).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { res, logs: [] });
  } else {
    const session = sessions.get(sessionId);
    session.res = res;
    session.logs.forEach(log => res.write(`data: ${log}\n\n`));
  }

  req.on('close', () => {
    const session = sessions.get(sessionId);
    if (session && session.res === res) {
      sessions.delete(sessionId);
    }
  });
});

function pushLog(sessionId, message) {
  const fullMessage = `[${SERVER_NAME}] ${message}`;
  console.log(`[${sessionId}] ${fullMessage}`);
  const session = sessions.get(sessionId);
  if (!session) return;
  session.logs.push(fullMessage);
  if (session.res) session.res.write(`data: ${fullMessage}\n\n`);
}

app.post('/submit', async (req, res) => {
  const { link, sessionId, type } = req.body;
  if (!link || !sessionId) {
    return res.status(400).json({ message: "TikTok link and sessionId are required" });
  }

  const targetURL = type === 'likes' ? 'https://leofame.com/free-tiktok-likes' : 'https://leofame.com/free-tiktok-views';

  let browser;
  try {
    sessions.set(sessionId, { res: sessions.get(sessionId)?.res, logs: [] });

    pushLog(sessionId, `🚀 Starting automation for ${type === 'likes' ? 'Likes' : 'Views'}...`);

    // Get a random proxy with port 8080
    const proxy = await getRandomProxy();
    if (!proxy) {
      pushLog(sessionId, "❌ No proxies available with port 8080.");
      return res.status(500).json({ message: "No proxies available with port 8080." });
    }

    const proxyUrl = `http://${proxy.ip}:${proxy.port}`;
    pushLog(sessionId, `✅ Using Proxy: ${proxy.ip}:${proxy.port}`);

    const executablePath = process.env.NODE_ENV === 'production' ? puppeteer.executablePath() : undefined;

    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        `--proxy-server=${proxyUrl}`  // Set the proxy for Puppeteer
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    pushLog(sessionId, `🌐 Preparing boost engine...`);
    await page.goto(targetURL, { waitUntil: 'load' });

    pushLog(sessionId, "📝 Connecting to TikTok servers...");
    await page.waitForSelector('input[name="free_link"]', { timeout: 10000 });
    await page.type('input[name="free_link"]', link);

    pushLog(sessionId, "🚀 Verifying your link...");
    await page.click('button[type="submit"]');

    pushLog(sessionId, "⏳ Waiting for progress...");
    await page.waitForSelector('.progress-bar', { timeout: 60000 });

    // Enhanced progress tracking
    for (let progress = 0; progress <= 100; progress += 2) {
      pushLog(sessionId, `Progress: ${progress}%`);
      await new Promise(resolve => setTimeout(resolve, 300)); // Add a delay to simulate real-time progress
    }

    // Wait until progress reaches 100% or time out
    await page.waitForFunction(() => {
      const el = document.querySelector('.progress-bar');
      return el && (el.innerText.includes("100") || el.style.width === "100%");
    }, { timeout: 60000 });

    pushLog(sessionId, "✅ Progress complete. Finalizing...Sending views/likes...");
    await new Promise(resolve => setTimeout(resolve, 30000)); // Simulate finalization

    pushLog(sessionId, "🔍 Checking result...");
   
::contentReference[oaicite:3]{index=3}
 
