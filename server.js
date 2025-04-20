const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve HTML from 'public' folder

let clientRes = null;
let logs = [];

// Progress endpoint to stream logs to the client
app.get('/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clientRes = res;

  const sendLog = (log) => {
    res.write(`data: ${log}\n\n`);
  };

  logs.forEach(sendLog);

  req.on('close', () => {
    clientRes = null;
  });
});

// Helper function to log messages
function pushLog(message) {
  console.log(message);
  logs.push(message);
  if (clientRes) clientRes.write(`data: ${message}\n\n`);
}

// Root endpoint to start a Puppeteer task
app.get('/', async (req, res) => {
  let browser = null;

  try {
    // Log that the process is starting
    pushLog("🚀 Starting Puppeteer...");

    // Launch headless Chromium using chrome-aws-lambda
    const executablePath = await chromium.executablePath;
    
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      executablePath: executablePath || '/usr/bin/google-chrome',
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    // Navigate to a test page
    pushLog("🌐 Navigating to example.com...");
    await page.goto('https://example.com', { waitUntil: 'networkidle2' });

    // Get the page title
    const title = await page.title();
    
    // Log and send the page title to the client
    pushLog(`Page Title: ${title}`);
    res.send(`
      <h1>Puppeteer on Heroku is working!</h1>
      <p>Page Title: ${title}</p>
    `);
  } catch (err) {
    console.error('❌ Automation error:', err);
    pushLog(`❌ Error: ${err.message}`);
    res.status(500).send(`❌ Automation error: ${err.message}`);
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
});

// Submit endpoint to start the TikTok view process
app.post('/submit', async (req, res) => {
  const { link } = req.body;
  if (!link) return res.status(400).json({ message: "TikTok link is required" });

  let browser;

  try {
    logs = [];
    pushLog("🚀 Let it begin...");

    const chromeExecutablePath = await chromium.executablePath;

    if (!chromeExecutablePath) throw new Error("Chrome executable not found.");

    pushLog(`Using Chrome path: ${chromeExecutablePath}`);

    // Launch the browser with Puppeteer
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: chromeExecutablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    pushLog("🌐 Navigating to site...");
    await page.goto('https://leofame.com/free-tiktok-views', { waitUntil: 'load' });

    pushLog("📝 Typing TikTok link...");
    await page.waitForSelector('input[name="free_link"]', { timeout: 10000 });
    await page.type('input[name="free_link"]', link);

    pushLog("🚀 Submitting...");
    await page.click('button[type="submit"]');

    pushLog("⏳ Waiting for progress...");
    await page.waitForSelector('.progress-bar', { timeout: 60000 });

    // Simulate the progress bar updates
    for (let progress = 0; progress <= 100; progress += 2) {
      pushLog(`Progress: ${progress}%`);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Wait until the progress bar reaches 100%
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

    // Handle the popup status and send the appropriate response
    if (popupStatus === 'Success') {
      pushLog("🎉 Success: Views added!");
      return res.json({ message: "✅ Success: Views successfully added!" });
    } else if (popupStatus === 'Error') {
      pushLog("❌ Error: Submission failed.");
      return res.json({ message: "⚠️ Error: Try again later." });
    } else {
      pushLog("❔ Unknown popup status.");
      return res.json({ message: "⚠️ Error: Try again later." });
    }

  } catch (err) {
    if (browser) await browser.close();
    pushLog(`❌ Error: ${err.message}`);
    return res.status(500).json({ message: "❌ Automation error: " + err.message });
  }
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
