require('dotenv').config();

const { createBrowser } = require('./browser');
const { loadConfig, runFlow } = require('./irctc');

async function main() {
  const config = loadConfig();
  const { context, page } = await createBrowser();

  try {
    await runFlow(page, config);
    console.log('Browser is left open so you can inspect the final state.');
  } catch (error) {
    console.error('\nAutomation stopped:', error.message);
    console.error('The browser is intentionally left open for debugging.');
    process.exitCode = 1;
  }

  // Keep the browser alive until the user closes it.
  await new Promise(resolve => {
    context.on('close', resolve);
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
