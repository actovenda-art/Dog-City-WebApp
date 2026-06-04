import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
try {
  await page.goto('http://127.0.0.1:4173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'dev@example.com');
  await page.click('button:has-text("Entrar com email e PIN")');
  const hasPinError = await page.locator('text=Informe os 6 dígitos do PIN.').count();
  console.log('pin_error_before', hasPinError);
  const pinDigits = ['6','5','4','3','2','1'];
  for (const digit of pinDigits) {
    await page.click(`button:has-text("${digit}")`);
  }
  await page.click('button:has-text("Entrar com email e PIN")');
  await page.waitForTimeout(2500);
  console.log('url_after', page.url());
  const bodyText = await page.locator('body').innerText();
  console.log('has_login', bodyText.includes('Entrar com email e PIN'));
  console.log('has_error', bodyText.includes('Não foi possível autenticar') || bodyText.includes('não foi possível autenticar'));
  console.log('text_snippet', bodyText.slice(0, 500));
} finally {
  await browser.close();
}
