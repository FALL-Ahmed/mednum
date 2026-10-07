// Fabrique la miniature : out/miniature-9x16.jpg (1080x1920) et out/miniature-4x5.jpg (1080x1350, pour le fil Instagram / Facebook),
// puis l'ajoute comme image de couverture à la vidéo : out/axone-pub-final.mp4
import puppeteer from 'puppeteer-core';
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
mkdirSync('out', { recursive: true });
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--allow-file-access-from-files', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(resolve('thumb.html')).href, { waitUntil: 'networkidle0' });
await page.evaluate(() => window.ready);
await page.evaluate(() => Promise.all([...document.images].map(i => i.decode?.().catch(() => {}))));
await page.screenshot({ path: 'out/miniature-9x16.jpg', type: 'jpeg', quality: 95 });
await page.screenshot({ path: 'out/miniature-4x5.jpg', type: 'jpeg', quality: 95, clip: { x: 0, y: 250, width: 1080, height: 1350 } });
await browser.close();
console.log('Miniatures : out/miniature-9x16.jpg et out/miniature-4x5.jpg');

const video = existsSync('out/axone-pub-son.mp4') ? 'out/axone-pub-son.mp4' : 'out/axone-pub.mp4';
execFileSync(ffmpegPath, [
  '-y', '-i', video, '-i', 'out/miniature-9x16.jpg',
  '-map', '0', '-map', '1', '-c', 'copy', '-c:v:1', 'mjpeg', '-disposition:v:1', 'attached_pic', '-movflags', '+faststart',
  'out/axone-pub-final.mp4',
], { stdio: 'ignore' });
console.log('Vidéo avec miniature intégrée : out/axone-pub-final.mp4');
