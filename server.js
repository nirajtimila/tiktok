const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // ← added uuid

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Logs per session
const sessionLogs = new Map();

// Progress endpoint (now uses sessionId)
app.get('/progress', (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId) return res.status(400).end('Missing sessionId');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const logs = sessionLogs.get(sessionId) || [];
  logs.forEach(log => res.write(`data: ${log}\n\n`));

  const interval = setInterval(() => {
    const newLogs = sessionLogs.get(sessionId) || [];
    while (logs.length < newLogs.length) {
      const nextLog = newLogs[logs.length];
      res.write(`data: ${nextLog}\n\n`);
      logs.push(nextLog);
    }
  }, 1000);

  req.on('close', () => clearInterval(interval));
});

// Main submit route
app.post('/submit', async (req, res) => {
  const { link } = req.body;
  if (!link) return res.status(400).json({ message: "TikTok link is required" });

  const sessionId = uuidv4();
  sessionLogs.set(sessionId, []);

  const pushLog = (msg) => {
    const tag = `[${sessionId}] ${msg}`;
    console.log(tag);
    sessionLogs.get(sessionId).push(tag);
  };

  let browser;
  try {
    pushLog("🚀 Let it begin...");

    const executablePath = process.env.NODE_ENV === 'production' ? puppeteer.executablePath() : undefined;
    pushLog(`Using Chromium path: ${executablePath || 'default bundled Chromium'}`);

    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    pushLog("🌐 Navigating to site...");
    await page.goto('https://leofame.com/free-tiktok-views', { waitUntil: 'load', timeout: 60000 });

    pushLog("📝 Typing TikTok link...");
    await page.waitForSelector('input[name="free_link"]', { timeout: 10000 });
    await page.type('input[name="free_link"]', link);

    pushLog("🚀 Submitting...");
    await page.click('button[type="submit"]');

    pushLog("⏳ Waiting for progress...");
    await page.waitForSelector('.progress-bar', { timeout: 60000 });

    for (let progress = 0; progress <= 100; progress += 2) {
      pushLog(`Progress: ${progress}%`);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    await page.waitForFunction(() => {
      const el = document.querySelector('.progress-bar');
      return el && (el.innerText.includes("100") || el.style.width === "100%");
    }, { timeout: 60000 });

    pushLog("✅ Progress complete. Finalizing...");
    await new Promise(resolve => setTimeout(resolve, 30000));

    pushLog("🔍 Checking result...");
    const popupStatus = await page.evaluate(() => {
      const popup = document.querySelector('.swal2-popup.swal2-modal.swal2-icon-success.swal2-show');
      if (!popup) return 'No Popup';
      const icon = popup.querySelector('.swal2-icon');
      if (icon && icon.classList.contains('swal2-icon-error')) return 'Error';
      if (popup.classList.contains('swal2-icon-success')) return 'Success';
      return 'Unknown';
    });

    await browser.close();

    let finalMessage = "";
    if (popupStatus === 'Success') {
      finalMessage = "✅ Success: Views successfully added!";
      pushLog("🎉 " + finalMessage);
    } else if (popupStatus === 'Error') {
      finalMessage = "⚠️ Error: Try again later.";
      pushLog("❌ Error: Submission failed.");
    } else {
      finalMessage = "⚠️ Error: Try again later.";
      pushLog("❔ Unknown popup status.");
    }

    return res.json({ message: finalMessage, sessionId });

  } catch (err) {
    if (browser) await browser.close();
    pushLog(`❌ Error: ${err.message}`);
    return res.status(500).json({ message: "❌ Automation error: " + err.message, sessionId });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
