const fs = require('fs');
const path = require('path');
const { fillFirst, pressEnter, pauseForUser, sleep, firstVisible } = require('./ui');

const SELECTORS = {
  menuButton: [
    '.h_menu_drop_button.hidden-xs a:has(i.fa-align-justify)',
    '.h_menu_drop_button a:has(i.fa-align-justify)',
    'a:has(i.fa-align-justify)'
  ],
  loginButton: [
    'a[aria-label*="Login in application"]',
    'a.loginText',
    'button:has-text("LOGIN")',
    'button:has-text("Login")',
    'a:has-text("LOGIN")',
    'text=LOGIN'
  ],
  loginSubmit: [
    'button:has-text("SIGN IN")',
    'button:has-text("Sign In")',
    'button:has-text("LOGIN")',
    'button[type="submit"]',
    'input[type="submit"]'
  ],
  username: [
    'input[aria-label*="User Name"]',
    'input[placeholder*="User Name"]',
    'input[placeholder*="User ID"]',
    'input[aria-label*="User"]',
    'input[type="text"]'
  ],
  password: [
    'input[type="password"]',
    'input[placeholder*="Password"]',
    'input[aria-label*="Password"]'
  ],
  from: [
    'input[aria-label*="Enter From station"]',
    'input[placeholder*="From"]',
    'input[placeholder*="From Station"]',
    'input[aria-label*="From"]',
    'p-autocomplete input:first-of-type'
  ],
  to: [
    'input[aria-label*="Enter To station"]',
    'input[placeholder*="To"]',
    'input[placeholder*="To Station"]',
    'input[aria-label*="To"]',
    'p-autocomplete input:nth-of-type(2)'
  ],
  findTrains: [
    'button:has-text("Search Trains")',
    'button:has-text("Find Trains")',
    'button:has-text("Search")',
    'button:has-text("Find trains")'
  ]
};

const LOGIN_FORM_SELECTORS = [
  'input[aria-label*="User Name"]',
  'input[placeholder*="User Name"]',
  'input[placeholder*="User ID"]'
];

function loadConfig() {
  const file = path.resolve(__dirname, '..', 'config', 'booking.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function handleLanguageDialogs(page, waitMs = 1000) {
  const welcomeDialog = page.locator('[role="dialog"]:visible').first();
  const englishButton = welcomeDialog
    .locator('button')
    .filter({ hasText: /^\s*English\s*$/i })
    .first();

  if (await englishButton.isVisible({ timeout: waitMs }).catch(() => false)) {
    await englishButton.click();
    await welcomeDialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  // IRCTC can show a second confirmation alert after the language selection.
  // It must be dismissed before the search inputs can receive keyboard events.
  const confirmationDialog = page.locator('[role="dialog"]:visible').first();
  const okButton = confirmationDialog
    .locator('button')
    .filter({ hasText: /^\s*OK\s*$/i })
    .first();
  if (await okButton.isVisible({ timeout: Math.min(waitMs, 3000) }).catch(() => false)) {
    await okButton.click();
    await confirmationDialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }
}

async function openSite(page, config) {
  console.log(`Opening ${config.url}`);
  await page.goto(config.url, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  await page.waitForTimeout(1000);
  await handleLanguageDialogs(page, 10000);
}

async function tryLogin(page, config) {
  await handleLanguageDialogs(page);
  const user = process.env.IRCTC_USER;
  const password = process.env.IRCTC_PASSWORD;
  const usernameField = await firstVisible(page, LOGIN_FORM_SELECTORS);

  if (!usernameField) {
    const menuButton = await firstVisible(page, SELECTORS.menuButton);
    if (menuButton) {
      await menuButton.click();
      await page.waitForTimeout(400);
    }

    let login = await firstVisible(page, SELECTORS.loginButton);
    if (!login) {
      await page.locator(SELECTORS.loginButton.join(', ')).first().waitFor({
        state: 'visible',
        timeout: 5000
      }).catch(() => {});
      login = await firstVisible(page, SELECTORS.loginButton);
    }
    if (!login) {
      console.log('Login button not found; continuing with the existing browser session.');
      return;
    }

    await login.click();
    await page.locator(LOGIN_FORM_SELECTORS.join(', ')).first().waitFor({
      state: 'visible',
      timeout: 10000
    }).catch(() => {});
  }

  const visibleUsernameField = await firstVisible(page, LOGIN_FORM_SELECTORS);
  if (!visibleUsernameField) {
    console.log('Login form did not open; continuing with the existing browser session.');
    return;
  }

  if (!config.options.fillLoginCredentials || !user || !password) {
    await pauseForUser(
      page,
      'LOGIN CHECKPOINT: the login form is open. Log in manually, complete CAPTCHA, then press Enter here to start train search.'
    );
    return;
  }

  await visibleUsernameField.fill(user);
  await fillFirst(page, SELECTORS.password, password, 'IRCTC password field');

  const loginDialog = page.locator('app-login:visible, [role="dialog"]:visible').last();
  const submit = loginDialog.locator(SELECTORS.loginSubmit.join(', ')).first();
  if (!await submit.isVisible({ timeout: 2000 }).catch(() => false)) {
    throw new Error('Login credentials were filled, but the Sign In button was not found.');
  }
  await submit.click();
  await page.waitForTimeout(1500);
  console.log('Credentials submitted. Continuing to train search.');
}

async function loginDialogVisible(page) {
  const usernameField = await firstVisible(page, LOGIN_FORM_SELECTORS);
  if (usernameField) return true;

  return Boolean(await firstVisible(page, SELECTORS.password));
}

async function handleLoginCheckpoint(page, config, reason) {
  if (!await loginDialogVisible(page)) return false;

  const user = process.env.IRCTC_USER;
  const password = process.env.IRCTC_PASSWORD;
  const usernameField = await firstVisible(page, LOGIN_FORM_SELECTORS);

  if (usernameField && config.options.fillLoginCredentials && user && password) {
    await usernameField.fill(user);
    await fillFirst(page, SELECTORS.password, password, 'IRCTC password field');
    const loginDialog = page.locator('app-login:visible, [role="dialog"]:visible').last();
    const submit = loginDialog.locator(SELECTORS.loginSubmit.join(', ')).first();
    if (await submit.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submit.click();
      await page.waitForTimeout(1500);
      return true;
    }
  }

  await pauseForUser(
    page,
    `LOGIN/CAPTCHA CHECKPOINT: IRCTC requested login while ${reason}. Complete the login and CAPTCHA in the browser, then press Enter here to continue.`
  );
  return true;
}

async function dismissLoginPrompt(page) {
  const loginDialog = page.locator(
    'app-login[role="dialog"]:visible, .ui-dialog:visible:has(input[type="password"])'
  ).first();
  if (!await loginDialog.isVisible({ timeout: 500 }).catch(() => false)) return false;

  const closeButton = loginDialog.locator([
    'button[aria-label*="Close"]',
    'button[title*="Close"]',
    'button.ui-dialog-titlebar-close',
    'a.ui-dialog-titlebar-close',
    '.ui-dialog-titlebar-close',
    'button:has-text("×")'
  ].join(', ')).first();

  if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeButton.click();
  } else {
    await page.keyboard.press('Escape');
  }

  await loginDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  return true;
}

async function withLoginRecovery(page, config, action, reason) {
  try {
    await handleLanguageDialogs(page);
    return await action();
  } catch (error) {
    await handleLanguageDialogs(page);
    if (!await handleLoginCheckpoint(page, config, reason)) throw error;
    return action();
  }
}

async function setJourneyDate(dateField, date) {
  for (const method of ['keyboard', 'fill']) {
    await dateField.click();
    if (method === 'keyboard') {
      await dateField.press('Control+A');
      await dateField.press('Backspace');
      await dateField.type(date, { delay: 40 });
    } else {
      await dateField.fill(date);
    }
    await dateField.press('Tab');
    await pageWaitForDateCommit(dateField);

    if (await dateField.inputValue() === date) return;
  }

  const actualDate = await dateField.inputValue();
  throw new Error(`Journey date was not committed: expected ${date}, got ${actualDate || '(empty)'}`);
}

async function pageWaitForDateCommit(dateField) {
  const page = dateField.page();
  await page.waitForTimeout(300);
  const calendar = page.locator(
    '.ui-datepicker:visible, .p-datepicker:visible, [class*="datepicker"]:visible'
  ).first();
  if (await calendar.isVisible({ timeout: 500 }).catch(() => false)) {
    await dateField.press('Escape');
    await page.waitForTimeout(200);
  }
}

async function fillJourney(page, config) {
  const { from, to, date } = config.journey;

  await handleLanguageDialogs(page);

  await page.locator(SELECTORS.from[0]).waitFor({ state: 'visible', timeout: 30000 });

  const fromField = await withLoginRecovery(
    page,
    config,
    () => fillFirst(page, SELECTORS.from, from, 'origin station field'),
    'filling the origin station'
  );
  await sleep(500);
  await withLoginRecovery(page, config, () => pressEnter(fromField), 'selecting the origin station');

  // The current UI can expose multiple autocomplete inputs. Prefer the last visible
  // candidate for the destination after the origin has been selected.
  const toField = await firstVisible(page, SELECTORS.to);
  if (!toField) throw new Error('Could not find destination station field.');
  await withLoginRecovery(page, config, () => toField.fill(to), 'filling the destination station');
  await sleep(500);
  await withLoginRecovery(page, config, () => pressEnter(toField), 'selecting the destination station');

  const dateFields = [
    'input.ui-inputtext:not(.ui-autocomplete-input):not([type="checkbox"])',
    'input[aria-label*="Enter Journey Date"]',
    'input[placeholder*="DD/MM/YYYY"]',
    'input[formcontrolname*="journey"]',
    'input[placeholder*="Journey Date"]',
    'input[placeholder*="Date"]',
    'input[aria-label*="Journey Date"]'
  ];
  let dateField = await firstVisible(page, dateFields);
  if (dateField) {
    await withLoginRecovery(
      page,
      config,
      () => setJourneyDate(dateField, date),
      'filling the journey date'
    );
  } else {
    console.log('Journey date field was not identified automatically. Please set it manually.');
  }

  await page.waitForTimeout(1000);
  await handleLoginCheckpoint(page, config, 'preparing the train search');

  const searchButton = await firstVisible(page, SELECTORS.findTrains);
  if (!searchButton) throw new Error('Could not find Find Trains/Search button.');

  try {
    await searchButton.click({ timeout: 5000 });
  } catch (error) {
    if (!await handleLoginCheckpoint(page, config, 'submitting the train search')) throw error;
    await searchButton.click({ timeout: 10000 });
  }
  console.log('Journey search submitted.');
}

async function findTrainRow(page, trainNumber) {
  const pattern = new RegExp(`\\b${trainNumber}\\b`);
  const component = page.locator('app-train-avl-enq').filter({ hasText: pattern }).first();
  if (await component.isVisible({ timeout: 2500 }).catch(() => false)) return component;

  const number = page.getByText(pattern).first();
  if (!await number.isVisible({ timeout: 1500 }).catch(() => false)) return null;

  return number.locator(
    'xpath=ancestor::*[(self::tr or self::li or contains(@class,"train") or contains(@class,"Train") or contains(@class,"card")) and (.//button or .//*[@role="button"])][1]'
  ).first();
}

function classCode(className) {
  return className.match(/\(([A-Z0-9-]+)\)/i)?.[1] || className;
}

async function findClassSection(row, className) {
  const code = classCode(className);
  const tile = row.locator('.pre-avl, [class*="pre-avl"], [class*="class-avl"], [class*="classAvl"]')
    .filter({ hasText: new RegExp(`${code}|${className.replace(/[()]/g, '\\$&')}`, 'i') })
    .first();
  if (await tile.isVisible({ timeout: 1500 }).catch(() => false)) return tile;

  const label = row.getByText(new RegExp(`${code}|${className.replace(/[()]/g, '\\$&')}`, 'i')).first();
  if (!await label.isVisible({ timeout: 1500 }).catch(() => false)) return null;

  return label.locator(
    'xpath=ancestor::*[(self::td or self::li or contains(@class,"class") or contains(@class,"Class") or contains(@class,"avl") or contains(@class,"Avl") or contains(@class,"pre"))][1]'
  ).first();
}

async function refreshClass(section) {
  if (!section) return false;
  const refreshControls = section.locator([
    'button[aria-label*="refresh" i]',
    'button[title*="refresh" i]',
    '[role="button"][aria-label*="refresh" i]',
    'button:has-text("Refresh")',
    'a:has-text("Refresh")',
    '[role="link"]:has-text("Refresh")',
    '.link:has-text("Refresh")',
    'i[class*="refresh" i]',
    'i[class*="repeat" i]',
    '.fa-refresh',
    '.fa-repeat',
    '.pi-refresh'
  ].join(', '));
  const control = refreshControls.first();
  if (!await control.isVisible({ timeout: 1500 }).catch(() => false)) return false;
  await control.click().catch(async () => {
    await control.locator('xpath=..').click().catch(async () => {
      await control.locator('xpath=../..').click();
    });
  });
  await sleep(1500);
  return true;
}

function dateMatches(text, date) {
  const [day, month, year] = date.split('/');
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthName = monthNames[Number(month) - 1];
  return text.includes(date) ||
    new RegExp(`\\b${day}\\s*[-/ ]?\\s*(?:${month}|${Number(month)}|${monthName}|${monthName.slice(0, 3)})\\b`, 'i').test(text);
}

async function bookAvailableClass(row, section, journeyDate) {
  if (!section) return false;
  const availabilityArea = row.locator('[avllazyload]').first();
  await availabilityArea.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  let options = availabilityArea.locator('button, a, [role="button"], [role="link"], [tabindex]');

  if (!await availabilityArea.isVisible({ timeout: 500 }).catch(() => false) ||
      await options.count() === 0) {
    options = row.locator('button, a, [role="button"], [role="link"], [tabindex], div, span')
      .filter({ hasText: /AVAILABLE|AVL|RAC/i });
  }

  const tryDateOptions = async optionLocator => {
    const matches = [];
    for (let index = 0; index < await optionLocator.count(); index += 1) {
      const option = optionLocator.nth(index);
      const text = await option.innerText().catch(() => '');
      if (!await option.isVisible().catch(() => false) || text.length > 220 ||
          !dateMatches(text, journeyDate) ||
          !/\b(?:AVAILABLE|AVL|RAC)\b/i.test(text) ||
          /\b(?:WL|WAITING|REGRET|NOT\s+AVAILABLE|CANCELLED)\b/i.test(text)) continue;

      matches.push({ option, text: text.trim() });
    }

    matches.sort((left, right) => left.text.length - right.text.length);
    for (const { option, text } of matches) {
      if (!await option.isVisible().catch(() => false)) continue;

      console.log(`Selecting ${journeyDate} availability: ${text.slice(0, 120)}`);
      await option.click();
      await sleep(700);
      const book = row.locator(
        'button.train_Search:not(.disable-book), button:has-text("Book Now"), button:has-text("Book")'
      ).last();
      if (!await book.isVisible({ timeout: 3000 }).catch(() => false)) return false;
      await book.click();
      return true;
    }
    return false;
  };

  if (await tryDateOptions(options)) return true;

  // Some IRCTC builds render date choices as clickable div/span tiles without
  // tabindex or an ARIA role.
  const renderedDateTiles = row.locator('div, span, li').filter({
    hasText: /AVAILABLE|AVL|RAC/i
  });
  if (await tryDateOptions(renderedDateTiles)) return true;

  const areaText = await row.innerText().catch(() => '');
  console.log(`No available option for ${journeyDate}: ${areaText.slice(0, 180)}`);
  return false;
}

async function chooseAvailableTrain(page, className, journeyDate) {
  const resultReady = await page.waitForFunction(
    () => Boolean(document.querySelector('app-train-avl-enq, [class*="train-avl"], [class*="train_avl"]')) ||
      /Train\s*(?:Name|Number|No\.?)/i.test(document.body.innerText),
    { timeout: 45000 }
  ).then(() => true).catch(() => false);

  if (!resultReady) {
    console.log('IRCTC did not render a train-results view within 45 seconds.');
    return false;
  }

  const numbers = [];
  const components = page.locator('app-train-avl-enq');
  for (let index = 0; index < await components.count(); index += 1) {
    const text = await components.nth(index).innerText().catch(() => '');
    const number = text.match(/\b\d{4,5}\b/)?.[0];
    if (number && !numbers.includes(number)) numbers.push(number);
  }

  if (!numbers.length) {
    const pageText = await page.locator('body').innerText().catch(() => '');
    for (const value of pageText.match(/\b\d{4,5}\b/g) || []) {
      if (!numbers.includes(value)) numbers.push(value);
    }
  }

  console.log(`Checking ${numbers.length} trains in page order for ${className} on ${journeyDate}.`);

  for (const trainNumber of numbers) {
    const row = await findTrainRow(page, trainNumber);
    if (!row) continue;

    await row.scrollIntoViewIfNeeded();
    const section = await findClassSection(row, className);
    if (!section || !await refreshClass(section)) {
      console.log(`Sleeper refresh control not found for train ${trainNumber}.`);
      continue;
    }

    if (!await bookAvailableClass(row, section, journeyDate)) {
      console.log(`Train ${trainNumber} has no available ${className}; checking next train.`);
      continue;
    }
    console.log(`Selected ${trainNumber} with available ${className} seats.`);
    return true;
  }

  console.log(`No train with refreshed available ${className} seats was found for ${journeyDate}.`);
  return false;
}

async function fillPassengers(page, passengers) {
  if (!passengers?.length) return;

  console.log(`Passenger data prepared for ${passengers.length} passenger(s).`);

  // Passenger-page DOM changes are common, so this stage is deliberately conservative:
  // detect a booking/passenger form and pause rather than guessing selectors that could
  // fill the wrong field after a site change.
  const nameField = await firstVisible(page, [
    'input[placeholder*="Passenger Name"]',
    'input[placeholder*="Name"]',
    'input[aria-label*="Passenger Name"]'
  ]);

  if (!nameField) {
    console.log('Passenger form not detected yet. Navigate to the passenger form manually.');
    return;
  }

  const passenger = passengers[0];
  await nameField.fill(passenger.name);

  const ageField = await firstVisible(page, [
    'input[placeholder*="Age"]',
    'input[aria-label*="Age"]'
  ]);
  if (ageField) await ageField.fill(String(passenger.age));

  console.log('First passenger fields filled where safe selectors were available.');
}

async function runFlow(page, config) {
  await openSite(page, config);
  await tryLogin(page, config);

  await fillJourney(page, config);
  await handleLoginCheckpoint(page, config, 'continuing after train search');
  const selectedTrain = await chooseAvailableTrain(
    page,
    config.journey.class,
    config.journey.date
  );

  if (!selectedTrain) {
    await pauseForUser(
      page,
      'TRAIN CHECKPOINT: automatic selection did not find an available train. Verify/select the intended train and class in the browser, then press Enter to continue.'
    );
  }

  await page.waitForFunction(
    () => Boolean(document.querySelector(
      'input[placeholder*="Passenger Name"], input[aria-label*="Passenger Name"], input[type="password"]'
    )) || /passenger|psgn/i.test(location.href),
    { timeout: 20000 }
  ).catch(() => {});
  await handleLoginCheckpoint(page, config, 'opening the passenger form');
  await fillPassengers(page, config.passengers);

  await pauseForUser(
    page,
    'PASSENGER CHECKPOINT: verify all passenger information and complete any fields the assistant did not identify safely. Press Enter when ready.'
  );

  if (config.options.pauseBeforePayment) {
    await pauseForUser(
      page,
      'PAYMENT CHECKPOINT: continue to payment in the browser yourself. Approve/authorize payment yourself. Press Enter only after you are finished.'
    );
  }

  console.log('\nFlow complete. No CAPTCHA solver, OTP reader, payment PIN entry, or payment authorization was automated.');
}

module.exports = { loadConfig, runFlow };
