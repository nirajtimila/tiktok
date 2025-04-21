const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const SSE = require('express-sse');

const app = express();
const sse = new SSE();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const sessions = {};

// Fetch proxies with port 443
async function getProxiesWithPort443() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('https://free-proxy-list.net/', { waitUntil: 'domcontentloaded' });

  const proxies = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#proxylisttable tbody tr'));
    return rows.map(row => {
      const cells = row.querySelectorAll('td');
      return {
        ip: cells[0]?.innerText.trim(),
        port: cells[1]?.innerText.trim(),
        isHttps: cells[6]?.innerText.trim()
      };
    }).filter(proxy => proxy.port === '443');
  });

  await browser.close();

  if (proxies.length === 0) throw new Error('No proxies with port 443 found.');
  return proxies;
}

app.post('/submit', async (req, res) => {
  const { link, sessionId } = req.body;
  if (!link || !sessionId) {
    return res.status(400).json({ error: 'Missing link or sessionId' });
  }

  sessions[sessionId] = sse;
  sse.send('Launching Puppeteer...', sessionId);

  let proxies;
  try {
    proxies = await getProxiesWithPort443();
  } catch (err) {
    console.error('Proxy fetch error:', err.message);
    sse.send(`Proxy fetch error: ${err.message}`, sessionId);
    return res.status(500).json({ error: err.message });
  }

  let success = false;
  let browser;
  for (let attempt = 0; attempt < Math.min(5, proxies.length); attempt++) {
    const proxy = proxies[Math.floor(Math.random() * proxies.length)];
    const proxyUrl = `http://${proxy.ip}:${proxy.port}`;
    console.log(`Attempt ${attempt + 1}: Trying proxy ${proxyUrl}`);
    sse.send(`Using proxy: ${proxyUrl}`, sessionId);

    try {
      browser = await puppeteer.launch({
        args: [`--proxy-server=${proxyUrl}`, '--no-sandbox', '--disable-setuid-sandbox'],
        headless: true,
        timeout: 60000
      });

      const page = await browser.newPage();

      sse.send('Navigating to site...', sessionId);
      await page.goto('https://leofame.com/free-tiktok-views', {
        timeout: 90000,
        waitUntil: 'domcontentloaded'
      });

      const linkInput = await page.$('#link');
      if (!linkInput) throw new Error('Link input not found. Proxy may be blocked.');

      sse.send('Filling form...', sessionId);
      await page.type('#link', link);
      await page.click('#submit');

      sse.send('Waiting for confirmation...', sessionId);
      await page.waitForSelector('.result', { timeout: 30000 });

      const resultText = await page.$eval('.result', el => el.textContent.trim());
      sse.send(`Done: ${resultText}`, sessionId);

      await browser.close();
      success = true;
      return res.json({ success: true, message: resultText });
    } catch (err) {
      console.error(`Attempt ${attempt + 1} failed:`, err.message);
      sse.send(`Attempt ${attempt + 1} failed: ${err.message}`, sessionId);
      if (browser) await browser.close();
    }
  }

  if (!success) {
    sse.send(`All proxy attempts failed.`, sessionId);
    return res.status(500).json({ error: 'All proxy attempts failed' });
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
