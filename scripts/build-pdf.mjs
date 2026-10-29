// Builds the ATS-friendly PDF résumé from cv/index.html using a locally installed Edge or Chrome.
//   npm run pdf
//   npm run pdf -- --portfolio=https://your-site.example   (adds the website link to the contact line)
// Set BROWSER_PATH if your browser lives somewhere unusual.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startServer } from './serve.mjs';

const OUTPUT = 'Mojidara_Vivek_Full_Stack_Developer_CV.pdf';
const root = fileURLToPath(new URL('..', import.meta.url));
const portfolio = (process.argv.find((a) => a.startsWith('--portfolio=')) || '').split('=')[1] || '';

const candidates = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Edge/Chrome found. Set BROWSER_PATH to your browser executable.');
  process.exit(1);
}

const server = await startServer(5198);
const browser = await puppeteer.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:5198/cv/', { waitUntil: 'networkidle0' });
  if (portfolio) {
    await page.$eval('[data-portfolio]', (a, url) => {
      a.href = url;
      a.textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      a.closest('.portfolio').hidden = false;
    }, portfolio);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: `${root}${OUTPUT}`,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    tagged: true,
    outline: false,
  });
  const pages = await page.evaluate(() => Math.ceil(document.querySelector('.sheet').scrollHeight / (297 * 96 / 25.4)));
  console.log(`Wrote ${OUTPUT} (~${pages} page${pages > 1 ? 's' : ''})`);
} finally {
  await browser.close();
  server.close();
}
