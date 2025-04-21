const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const { SocksProxyAgent } = require('socks-proxy-agent'); // Import SOCKS Proxy Agent
require('dotenv').config(); // For local .env files

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_NAME = process.env.SERVER_NAME || "Default Server";

app.use(cors());
app.use(express.json());

const sessions = new Map(); // key: sessionId, value: { res, logs[] }

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
  const { link, sessionId, proxy } = req.body; // Proxy passed as part of the request
  if (!link || !sessionId) {
    return res.status(400).json({ message: "TikTok link and sessionId are required" });
  }

  let browser;
  try {
    sessions.set(sessionId, { res: sessions.get(sessionId)?.res, logs: [] });

    pushLog(sessionId, "🚀 Let it begin...");

    const executablePath = process.env.NODE_ENV === 'production' ? puppeteer.executablePath() : undefined;
    //pushLog(sessionId, `Using Chromium path: ${executablePath || 'default bundled Chromium'}`);

    // Set up SOCKS5 Proxy
    const proxyUrl = `socks5://${proxy.ip}:${proxy.port}`;
    const agent = new SocksProxyAgent(proxyUrl); // Create a SOCKS5 agent

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
        `--proxy-server=${proxyUrl}` // Set the proxy here
      ],
      ignoreHTTPSErrors: true,
      // pass the agent to the page to use the proxy
      defaultViewport: { width: 1280, height: 800 },
      userDataDir: './puppeteer_data',
      pipe: true
    });

    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      request.continue();
    });

    pushLog(sessionId, "🌐 Navigating to site...");
    await page.goto('https://leofame.com/free-tiktok-views', { waitUntil: 'load' });

    pushLog(sessionId, "📝 Typing TikTok link...");
    await page.waitForSelector('input[name="free_link"]', { timeout: 10000 });
    await page.type('input[name="free_link"]', link);

    pushLog(sessionId, "🚀 Submitting...");
    await page.click('button[type="submit"]');

    pushLog(sessionId, "⏳ Waiting for progress...");
    await page.waitForSelector('.progress-bar', { timeout: 60000 });

    for (let progress = 0; progress <= 100; progress += 2) {
      pushLog(sessionId, `Progress: ${progress}%`);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    await page.waitForFunction(() => {
      const el = document.querySelector('.progress-bar');
      return el && (el.innerText.includes("100") || el.style.width === "100%");
    }, { timeout: 60000 });

    pushLog(sessionId, "✅ Progress complete. Finalizing...");
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
      pushLog(sessionId, "🎉 Success: Views added!");
      return res.json({ message: "✅ Success: Views successfully added!" });
    } else if (popupStatus === 'Error') {
      pushLog(sessionId, "❌ Error: Submission failed.");
      return res.json({ message: "⚠️ Error: Try again later." });
    } else {
      pushLog(sessionId, "❔ Unknown popup status.");
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
