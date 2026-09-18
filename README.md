# IRCTC Booking Assistant — Playwright Learning Project

This project recreates the non-CAPTCHA/non-payment parts of the old browser-automation video as a local learning project:

1. Launch a real Chromium browser.
2. Persist a browser profile in `user-data/` so you can inspect how browser state/cookies persist locally.
3. Open the IRCTC train-search page.
4. Optionally type your IRCTC username/password from environment variables.
5. Stop for the human to solve CAPTCHA/login challenges.
6. Fill journey information.
7. Detect a preferred train number when possible.
8. Stop for the human to verify/select the exact train/class.
9. Fill passenger fields where safe selectors are available.
10. Stop for the human to verify passenger information.
11. Hand off payment to the human. No payment PIN/OTP/authorization is automated.

## Important IRCTC note

IRCTC's current terms state that its website and mobile apps are for personal/non-commercial use and that automation/scripting software is prohibited. They also mention suspicious booking activity and scripting tools as grounds for action. Use this repository as a browser-automation learning project and only against services/environments where you are permitted to automate.

This project intentionally does **not** include CAPTCHA solving/bypass, anti-bot evasion, request replay, token theft, OTP interception, or payment authorization automation.

## Setup on Ubuntu

Requirements:

- Node.js 18+ (20/22 recommended)
- npm

Install:

```bash
npm install
npx playwright install chromium
```

Create the environment file:

```bash
cp .env.example .env
nano .env
```

Set:

```text
IRCTC_USER=your_user_id
IRCTC_PASSWORD=your_password
```

Or leave them empty and log in manually.

Edit:

```text
config/booking.json
```

Then run:

```bash
npm start
```

## How the browser session works

Playwright uses a persistent Chromium profile stored in:

```text
user-data/
```

This is intentionally easier to study than copying session tokens into a script. You can inspect browser storage using DevTools while the browser is running.

Do not commit `user-data/` or `.env`.

## Selector maintenance

IRCTC's frontend can change. When a selector fails, inspect the live DOM in Chromium DevTools and update the selector arrays in `src/irctc.js`.

Useful command:

```bash
npm run codegen
```

Playwright Codegen can help discover selectors while learning. Do not use it to record or automate CAPTCHA/payment authorization.

## Suggested development order

### Part A — Browser

Get `npm start` opening Chromium successfully.

### Part B — Login checkpoint

Run with credentials unset and log in manually. Then inspect cookies/storage in DevTools.

### Part C — Journey

Make the From/To/date selectors work for the current IRCTC page.

### Part D — Train selection

Make `choosePreferredTrain()` operate on the current train-card DOM.

### Part E — Passenger form

Add safe selectors for each passenger field and support multiple passengers.

### Part F — Mock site

For a full end-to-end automation demo, clone the workflow into a local mock railway site where you control the CAPTCHA and payment flow. This lets you safely implement the OCR and payment-demo pieces from the YouTube architecture.
