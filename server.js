const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // to generate unique session IDs

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store logs per session
let logsBySession = {};

// Progress endpoint to stream logs to the client
app.get('/progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  // Create a new log entry if the session doesn't exist
  if (!logsBySession[sessionId]) {
    logsBySession[sessionId] = [];
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendLog = (log) => {
    res.write(`data: ${log}\n\n`);
  };

  logsBySession[sessionId].forEach(sendLog);

  req.on('close', () => {
    // Clean up after the connection is closed
    delete logsBySession[sessionId];
  });
});

// Helper function to log messages
function pushLog(sessionId, message) {
  console.log(message);

  // Add to the specific session's logs
  if (!logsBySession[sessionId]) {
    logsBySession[sessionId] = [];
  }

  logsBySession[sessionId].push(message);

  // Keep the log count limited to avoid memory bloat
  if (logsBySession[sessionId].length > 50) {
    logsBySession[sessionId].shift(); // Remove oldest logs if necessary
  }
}

// Submit endpoint to start the TikTok view process
app.post('/submit', async (req, res) => {
  const { link } = req.body;
  if (!link) return res.status(400).json({ message: "TikTok link is required" });

  const sessionId = uuidv4(); // Create a unique session ID for each user
  let browser;

  try {
    logsBySession[sessionId] = [];
    pushLog(sessionId, "🚀 Let it begin...");

    const executablePath = process.env.NODE_ENV === 'production' ? puppeteer.executablePath() : undefined;
    pushLog(sessionId, `Using Chromium path: ${executablePath || 'default bundled Chromium'}`);

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

// Periodically clear logs to prevent too much accumulation
setInterval(() => {
  logsBySession = {}; // Clear all logs every 15 seconds
}, 15000);

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
