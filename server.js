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

// Use Puppeteer to scrape proxies from https://free-proxy-list.net/
async function getProxyWithPort8080() {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('https://free-proxy-list.net/', { waitUntil: 'networkidle2' });

    const proxies = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#proxylisttable tbody tr'));
      return rows.map(row => {
        const cells = row.querySelectorAll('td');
        return {
          ip: cells[0]?.innerText.trim(),
          port: cells[1]?.innerText.trim(),
          isHttps: cells[6]?.innerText.trim()
        };
      }).filter(proxy => proxy.port === '8080');
    });

    await browser.close();

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

app.get('/events/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  sessions[sessionId] = sse;
  sse.init(req, res);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
