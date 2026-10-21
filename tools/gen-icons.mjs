// Generuje ikony PNG aplikacji z public/icon.svg przy użyciu Chromium (Playwright).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('apps/client/public/icon.svg', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
for (const [size, file, padding] of [
  [192, 'icon-192.png', 0],
  [512, 'icon-512.png', 0],
  [512, 'icon-512-maskable.png', 0.12],
]) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - padding * 2));
  await page.setContent(
    `<body style="margin:0;background:#121212;display:grid;place-items:center;height:${size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body>`,
  );
  await page.screenshot({ path: `apps/client/public/${file}` });
}
await browser.close();
