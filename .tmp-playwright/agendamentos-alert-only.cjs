const { chromium } = require('C:/Users/admin/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    await page.goto('http://127.0.0.1:4175', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('local_app_client_Responsavel', JSON.stringify([]));
    });
    await page.goto('http://127.0.0.1:4175/agendamentos', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'C:/Users/admin/Downloads/dog-city-brasil (1)/.tmp-playwright/agendamentos-codexmock-seeded-carteira-alert-desktop.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();
