const { chromium } = require('C:/Users/admin/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    await page.goto('http://127.0.0.1:4173/login', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'dev@example.com');
    for (const digit of ['6','5','4','3','2','1']) {
      await page.getByRole('button', { name: digit, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Entrar com email e PIN' }).click();
    await page.waitForTimeout(4000);
    console.log('url_after=' + page.url());
    const bodyText = await page.locator('body').innerText();
    console.log('has_login=' + bodyText.includes('Entrar com email e PIN'));
    console.log('has_error=' + (bodyText.includes('N„o foi possÌvel autenticar') || bodyText.includes('n√£o foi poss√≠vel autenticar')));
    console.log(bodyText.slice(0, 1200));
  } finally {
    await browser.close();
  }
})();
