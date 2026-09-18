function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: 1500 })) return locator;
    } catch (_) {
      // Try the next selector.
    }
  }
  return null;
}

async function clickFirst(page, selectors, description) {
  const locator = await firstVisible(page, selectors);
  if (!locator) {
    throw new Error(`Could not find ${description}. Run with DEBUG=1 and inspect the current DOM.`);
  }
  await locator.click();
  return locator;
}

async function fillFirst(page, selectors, value, description) {
  const locator = await firstVisible(page, selectors);
  if (!locator) {
    throw new Error(`Could not find ${description}. Run with DEBUG=1 and inspect the current DOM.`);
  }
  await locator.fill(String(value));
  return locator;
}

async function pressEnter(locator) {
  await locator.press('Enter');
}

async function pauseForUser(page, message) {
  console.log(`\n${message}`);
  await page.bringToFront();
  await page.waitForFunction(() => document.visibilityState === 'visible');
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  await new Promise(resolve => process.stdin.once('data', resolve));
}

module.exports = {
  sleep,
  firstVisible,
  clickFirst,
  fillFirst,
  pressEnter,
  pauseForUser
};
