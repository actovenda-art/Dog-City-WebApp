const { test } = require('@playwright/test');

test('login dev smoke', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/login');
  await page.getByLabel('Login').fill('dev@example.com');
  for (const digit of ['6','5','4','3','2','1']) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Entrar com email e PIN' }).click();
  await page.waitForTimeout(3000);
  console.log('url_after=' + page.url());
  console.log('body_has_login=' + (await page.locator('body').innerText()).includes('Entrar com email e PIN'));
});
