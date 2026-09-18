const { chromium } = require("playwright");
const fs = require("fs");
const path = "/snap/bin/brave";

async function createBrowser() {
    const configuredProfile = process.env.IRCTC_BROWSER_PROFILE || "./user-data";
    const profileLock = `${configuredProfile}/SingletonLock`;
    const profileIsLocked = (() => {
        try {
            fs.lstatSync(profileLock);
            return true;
        } catch (_) {
            return false;
        }
    })();
    const profileDir = profileIsLocked
        ? `${configuredProfile}-run-${process.pid}`
        : configuredProfile;

    if (profileDir !== configuredProfile) {
        console.log(`Browser profile is busy; using ${profileDir} for this run.`);
    }

    const context = await chromium.launchPersistentContext(
        profileDir,
        {
            headless: false,
            executablePath: path
        }
    );

    const page = await context.newPage();

    return { context, page };
}

module.exports = { createBrowser };