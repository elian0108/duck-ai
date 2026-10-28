const fs = require('fs');
const path = require('path');
require('dotenv').config();

function resolveChromePath() {
  const envPath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;

  if (process.platform === 'win32') {
    if (envPath && fs.existsSync(envPath)) return envPath;
    const winDefaults = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : null
    ].filter(Boolean);
    for (const p of winDefaults) {
      if (fs.existsSync(p)) return p;
    }
    return envPath || winDefaults[0];
  } else if (process.platform === 'darwin') {
    if (envPath && !envPath.startsWith('C:') && fs.existsSync(envPath)) return envPath;
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else {
    // Linux / Docker container
    // If a Windows path was copied over in .env (e.g. C:\Program Files\...), ignore it
    if (envPath && !envPath.startsWith('C:') && !envPath.includes('\\') && fs.existsSync(envPath)) {
      return envPath;
    }
    const linuxCandidates = [
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium'
    ];
    for (const p of linuxCandidates) {
      if (fs.existsSync(p)) return p;
    }
    return '/usr/bin/google-chrome-stable';
  }
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  defaultModel: process.env.DEFAULT_MODEL || 'gpt-6-luna',
  poolSize: parseInt(process.env.POOL_SIZE || '2', 10),
  chromePath: resolveChromePath(),
  headless: process.env.HEADLESS === 'false' || process.env.HEADLESS === '0' ? false : 'new',
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '60000', 10),
  apiKey: process.env.API_KEY || null, // Optional API Key auth if configured
};

module.exports = config;
