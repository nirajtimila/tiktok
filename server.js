const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());

const sessions = {};
const logs = {};

function addLog(sessionId, message) {
  const prefix = sessionId ? `[${sessionId}] ` : '';
  if (sessionId) {
    if (!logs[sessionId]) logs[sessionId] = [];
    logs[sessionId].push(prefix + message);
  }
  console.log(prefix + message);
}

app.post('/submit', async (req, res) => {
  const { link, sessionId } = req.body;

  if (!link || !sessionId) {
    return res.status(400).json({ message: 'Invalid request.' });
  }

  sessions[sessionId] = true;
  logs[sessionId] = [];

  addLog(sessionId, 'Launching Puppeteer...');

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    addLog(sessionId, 'Navigating to site...');
    await page.goto(link, { waitUntil: 'networkidle2', timeout: 30000 });

    addLog(sessionId, '✅ Page loaded successfully!');
    await new Promise(resolve => setTimeout(resolve, 2000));

    await browser.close();
    addLog(sessionId, '✅ Puppeteer session finished.');

    res.json({ message: '✅ Views sent successfully!' });
  } catch (err) {
    addLog(sessionId, `❌ Error: ${err.message}`);
    res.status(500).json({ message: '❌ Something went wrong.' });
  } finally {
    setTimeout(() => delete logs[sessionId], 15000); // Auto-clear logs after 15s
    setTimeout(() => delete sessions[sessionId], 15000);
  }
});

app.get('/progress', (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId) return res.status(400).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const interval = setInterval(() => {
    if (!sessions[sessionId]) {
      clearInterval(interval);
      return res.end();
    }

    const sessionLogs = logs[sessionId] || [];
    if (sessionLogs.length > 0) {
      const next = sessionLogs.shift();
      res.write(`data: ${next}\n\n`);
    }
  }, 500);

  req.on('close', () => {
    clearInterval(interval);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
