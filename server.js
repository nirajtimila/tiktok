const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const SSE = require('express-sse');
const proxies = require('./proxies'); // <-- Your proxy list

const app = express();
const sse = new SSE();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const sessions = {};

app.post('/submit', async (req, res) => {
  const { link, sessionId } = req.body;
  if (!link || !sessionId) {
    return res.status(400).json({ error: 'Missing link or sessionId' });
  }

  sessions[sessionId] = sse;
  sse.send('Launching Puppeteer...', sessionId);

  // Pick a random proxy
  const proxy = proxies[Math.floor(Math.random() * proxies.length)];
  const proxyUrl = `http://${proxy.ip}:${proxy.port}`;
  console.log(`Using proxy: ${proxyUrl}`);

  try {
    const browser = await puppeteer.launch({
      args: [`--proxy-server=${proxyUrl}`, '--no-sandbox', '--disable-setuid-sandbox'],
      headless: true
    });

    const page = await browser.newPage();

    // Authenticate proxy
    await page.authenticate({
      username: proxy.username,
      password: proxy.password
    });

    sse.send('Navigating to site...', sessionId);
    await page.goto('https://leofame.com/free-tiktok-views', { timeout: 60000 });

    sse.send('Filling form...', sessionId);
    await page.type('#link', link);
    await page.click('#submit');

    sse.send('Waiting for confirmation...', sessionId);
    await page.waitForSelector('.result', { timeout: 30000 });

    const resultText = await page.$eval('.result', el => el.textContent.trim());
    sse.send(`Done: ${resultText}`, sessionId);

    await browser.close();
    res.json({ success: true, message: resultText });
  } catch (err) {
    console.error('Error:', err.message);
    sse.send(`Error: ${err.message}`, sessionId);
    res.status(500).json({ error: err.message });
  }
});

app.get('/events/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  sessions[sessionId] = sse;
  sse.init(req, res);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
