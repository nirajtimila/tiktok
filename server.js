const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
require('dotenv').config();
const fetch = require('node-fetch'); // For ScraperAPI if needed
const proxies = require('./proxies');  // Import your proxy list

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_NAME = process.env.SERVER_NAME || "Default Server";

app.use(cors());
app.use(express.json());

const sessions = new Map();

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

// Function to get a random proxy with port 8080
function getRandomProxy() {
  const port8080Proxies = proxies.filter(p => p.port === 8080);
  if (port8080Proxies.length === 0) {
    throw new Error("No proxies available on port 8080");
  }
  const randomIndex = Math.floor(Math.random() * port8080Proxies.length);
  return port8080Proxies[randomIndex];
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

    // Get a random proxy from the list (only port 8080)
    const proxy = getRandomProxy();
    const proxyUrl = `http://${proxy.username}:${proxy.password}@${proxy.ip}:${proxy.port}`;

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
        `--proxy-server=${proxy.ip}:${proxy.port}`  // Use IP and port only for proxy-server
      ]
    });

    const page = await browser.newPage();

    // Authenticate the proxy
    await page.authenticate({
      username: proxy.username,
      password: proxy.password
    });

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

    // Simulate progress
    for (let progress = 0; progress <= 100; progress += 2) {
      pushLog(sessionId, `Progress: ${progress}%`);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    await page.waitForFunction(() => {
      const el = document.querySelector('.progress-bar');
      return el && (el.innerText.includes("100") || el.style.width === "100%");
    }, { timeout: 60000 });

    pushLog(sessionId, "✅ Progress complete. Finalizing...Sending views/likes...");
    await new Promise(resolve => setTimeout(resolve, 30000));

    pushLog(sessionId, "🔍 Checking result...");
    const popupStatus = await page.evaluate(() => {
      const popup = document.querySelector('.swal2-popup.swal2-modal.swal2-icon-success.swal2-show');
      if (!popup) return 'No Popup';
      const icon = popup.querySelector('.swal2-icon');
      if (icon && icon.classList.contains('swal2-icon-error')) return 'Error';
      if (popup.classList.contains('swal2-icon-success')) return 'Success';
      return 'Unknown';
    });

    await browser.close();

    if (popupStatus === 'Success') {
      pushLog(sessionId, "🎉 Success!");
      return res.json({ message: `✅ Success: ${type === 'likes' ? 'Likes' : 'Views'} successfully added!` });
    } else if (popupStatus === 'Error') {
      pushLog(sessionId, "❌ Error: Submission failed.");
      return res.json({ message: "⚠️ Error: Try again later." });
    } else {
      pushLog(sessionId, "❔ Unknown error. Please try again with different video or wait 24 hour ⏳");
      return res.json({ message: "⚠️ Error: Try again later." });
    }

  } catch (err) {
    if (browser) await browser.close();
    pushLog(sessionId, `❌ Error: ${err.message}`);
    return res.status(500).json({ message: "❌ Automation error: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`${SERVER_NAME} running on port ${PORT}`);
});
