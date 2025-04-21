const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');
const puppeteer = require('puppeteer');
const SSE = require('express-sse');

const app = express();
const sse = new SSE();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const sessions = {};

// Updated proxy fetch function
async function getProxyWithPort8080() {
  try {
    const response = await fetch('https://free-proxy-list.net/');
    const html = await response.text();
    const $ = cheerio.load(html);
    const proxies = [];

    $('#proxylisttable tbody tr').each((index, element) => {
      const tds = $(element).find('td');
      const ip = $(tds[0]).text().trim();
      const port = $(tds[1]).text().trim();
      const isHttps = $(tds[6]).text().trim();

      if (port === '8080') {
        proxies.push({ ip, port, isHttps });
      }
    });

    console.log(`Found ${proxies.length} proxies on port 8080`);

    if (proxies.length === 0) throw new Error('No proxies with port 8080 found.');

    const selectedProxy = proxies[Math.floor(Math.random() * proxies.length)];
    console.log('Using proxy:', `${selectedProxy.ip}:${selectedProxy.port}`);
    return selectedProxy;
  } catch (error) {
    console.error('Proxy fetch error:', error.message);
    throw error;
  }
}

// Main endpoint
app.post('/submit', async (req, res) => {
  const { link, sessionId } = req.body;
  if (!link || !sessionId) {
    return res.status(400).json({ error: 'Missing link or sessionId' });
  }

  sessions[sessionId] = sse;
  sse.send('Launching Puppeteer...', sessionId);

  try {
    const proxy = await getProxyWithPort8080();
    const proxyUrl = `http://${proxy.ip}:${proxy.port}`;

    const browser = await puppeteer.launch({
      args: [`--proxy-server=${proxyUrl}`],
      headless: true
    });

    const page = await browser.newPage();
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

// SSE event endpoint
app.get('/events/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  sessions[sessionId] = sse;
  sse.init(req, res);
});

// Server start
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
