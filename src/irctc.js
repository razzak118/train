const fs = require('fs');
const path = require('path');
const { fillFirst, pressEnter, pauseForUser, sleep, firstVisible } = require('./ui');

const SELECTORS = {
  loginButton: [
    'a[aria-label*="Login in application"]',
    'a.loginText',
    'button:has-text("LOGIN")',
    'button:has-text("Login")',
    'a:has-text("LOGIN")',
    'text=LOGIN'
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

async function openSite(page, config) {
  console.log(`Opening ${config.url}`);
  await page.goto(config.url, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  await page.waitForTimeout(1000);

  const welcomeDialog = page.locator('[role="dialog"]:visible').first();
  const englishButton = welcomeDialog
    .locator('button')
    .filter({ hasText: /^\s*English\s*$/i })
    .first();

  if (await englishButton.isVisible({ timeout: 10000 }).catch(() => false)) {
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
  if (await okButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await okButton.click();
    await confirmationDialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }
}

async function tryLogin(page, config) {
  const user = process.env.IRCTC_USER;
  const password = process.env.IRCTC_PASSWORD;
  const usernameField = await firstVisible(page, LOGIN_FORM_SELECTORS);

  if (!usernameField) {
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

  console.log('Credentials filled. CAPTCHA is intentionally left to you.');
  await pauseForUser(
    page,
    'CAPTCHA CHECKPOINT: credentials are filled. Complete CAPTCHA and submit login in the browser, then press Enter here to start train search.'
  );
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
    return await action();
  } catch (error) {
    if (!await handleLoginCheckpoint(page, config, reason)) throw error;
    return action();
  }
}

async function fillJourney(page, config) {
  const { from, to, date } = config.journey;

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
    'input.ui-inputtext:not(.ui-autocomplete-input)',
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
      async () => {
        await dateField.fill(date);
        await dateField.press('Tab');
        await page.waitForTimeout(300);

        const calendar = page.locator(
          '.ui-datepicker:visible, .p-datepicker:visible, [class*="datepicker"]:visible'
        ).first();
        if (await calendar.isVisible({ timeout: 500 }).catch(() => false)) {
          await dateField.press('Escape');
        }
      },
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

async function choosePreferredTrain(page, preferredTrains) {
  if (!preferredTrains?.length) {
    console.log('No preferred trains configured; leaving selection to the user.');
    return false;
  }

  for (const trainNumber of preferredTrains) {
    const candidates = [
      `text=${trainNumber}`,
      `[data-train-number="${trainNumber}"]`,
      `*:has-text("${trainNumber}")`
    ];

    for (const selector of candidates) {
      const locator = page.locator(selector).first();
      try {
        if (await locator.isVisible({ timeout: 1200 })) {
          console.log(`Found preferred train ${trainNumber}.`);
          // We deliberately stop at the first matching train card/text and do not
          // automate the final booking/payment confirmation.
          await locator.scrollIntoViewIfNeeded();
          return true;
        }
      } catch (_) {}
    }
  }

  console.log('No configured preferred train was detected automatically.');
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
  await sleep(2500);
  await handleLoginCheckpoint(page, config, 'continuing after train search');
  await choosePreferredTrain(page, config.preferredTrains);

  await pauseForUser(
    page,
    'TRAIN CHECKPOINT: verify/select the intended train and class in the browser, then press Enter to continue.'
  );

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
