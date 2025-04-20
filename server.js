const express = require('express');
const chromium = require('chrome-aws-lambda');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', async (req, res) => {
  let browser = null;

  try {
    // Launch headless Chromium using chrome-aws-lambda
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath || '/usr/bin/google-chrome',
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    // Navigate to a test page
    await page.goto('https://example.com', { waitUntil: 'networkidle2' });

    // Get the page title
    const title = await page.title();

    res.send(`
      <h1>Puppeteer on Heroku is working!</h1>
      <p>Page Title: ${title}</p>
    `);
  } catch (err) {
    console.error('❌ Automation error:', err);
    res.status(500).send(`❌ Automation error: ${err.message}`);
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
