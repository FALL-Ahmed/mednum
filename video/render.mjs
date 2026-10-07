// Fabrique la pub : un navigateur ouvre ad.html, dessine chaque image (seek(t)), puis ffmpeg assemble le MP4.
// Usage : node render.mjs            -> out/axone-pub.mp4
//         node render.mjs 12.5 4 24  -> images seules à ces instants (aperçu rapide), dans out/preview/
import puppeteer from 'puppeteer-core';
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const file = pathToFileURL(resolve('ad.html')).href;
const previewTimes = process.argv.slice(2).map(Number).filter(n => !Number.isNaN(n));

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--allow-file-access-from-files', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto(file, { waitUntil: 'networkidle0' });
await page.evaluate(() => window.ready);
await page.evaluate(() => Promise.all([...document.images].map(i => i.decode?.().catch(() => {}))));

if (previewTimes.length) {
  mkdirSync('out/preview', { recursive: true });
  for (const t of previewTimes) {
    await page.evaluate(t => window.seek(t), t);
    await page.screenshot({ path: `out/preview/t${String(t).replace('.', '_')}.jpg`, type: 'jpeg', quality: 80 });
  }
  await browser.close();
  console.log('Aperçus dans out/preview/');
  process.exit(0);
}

const { FPS, DUR } = await page.evaluate(() => ({ FPS: window.FPS, DUR: window.DUR }));
if (existsSync('frames')) rmSync('frames', { recursive: true, force: true });
mkdirSync('frames', { recursive: true });
mkdirSync('out', { recursive: true });
const total = Math.round(FPS * DUR);
for (let i = 0; i < total; i++) {
  await page.evaluate(t => window.seek(t), i / FPS);
  await page.screenshot({ path: `frames/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  if (i % 60 === 0) console.log(`image ${i}/${total}`);
}
await browser.close();
execFileSync(ffmpegPath, ['-y', '-framerate', String(FPS), '-i', 'frames/f%04d.jpg', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-movflags', '+faststart', 'out/axone-pub.mp4'], { stdio: 'inherit' });
console.log('Vidéo prête : out/axone-pub.mp4');
