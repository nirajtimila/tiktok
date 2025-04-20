const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store logs and connected clients per session
const logs = {};
const clients = {};

// Push a log to a session's log stream
function pushLog(sessionId, message) {
  console.log(`[${sessionId}] ${message}`);
  if (!logs[sessionId]) logs[sessionId] = [];
  logs[sessionId].push(message);
  if (clients[sessionId]) {
    clients[sessionId].write(`data: ${message}\n\n`);
  }
}

// Stream logs to the client
app.get('/progress', (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId) return res.status(400).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients[sessionId] = res;
  (logs[sessionId] || []).forEach(log => res.write(`data: ${log}\n\n`));

  req.on('close', () => {
    delete clients[sessionId];
  });
});

// Clear logs every 15 seconds
setInterval(() => {
  for (const sessionId in logs) {
    logs[sessionId] = [];
  }
}, 15000);

// Handle view generation
app.post('/submit', async (req, res) => {
  const { link, sessionId } = req.body;
  if (!link || !sessionId) {
    return res.status(400).json({ message: 'TikTok link and sessionId are required' });
  }

  let browser;

  try {
    logs[sessionId] = [];
    pushLog(sessionId, "🚀 Let it begin...");

    const executablePath = '/usr/bin/google-chrome'; // Docker-safe path
    pushLog(sessionId, `Using Chrome path: ${executablePath}`);

    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

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
  console.log(`🚀 Server is running on port ${PORT}`);
});
