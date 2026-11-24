// Dev tool: render the dashboard on the snapshot and capture the three
// screenshots the dossier carries. Not part of the entry's run.
//   node tools/shoot.ts <snapshot.json>
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRadar } from '../lib/board.ts';
import { parseSnapshot } from '../lib/model.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const stage = join(ROOT, '.stage');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
const radar = buildRadar(parseSnapshot(readFileSync(process.argv[2]!, 'utf8')));
const rows = radar.rows.map(({ farm_steps: _d, ...rest }) => rest);
writeFileSync(join(stage, 'data.js'), `window.RADAR=${JSON.stringify({ ...radar, rows })};\n`);
cpSync(join(ROOT, 'dashboard'), join(stage, 'dashboard'), { recursive: true });

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const url = 'file://' + join(stage, 'dashboard', 'index.html');
const shots: [string, string, number][] = [
  ['1-board.jpg', '', 0],
  ['2-detail.jpg', `#open=${radar.rows[0]!.slug}`, 0],
  ['3-filtered.jpg', '#fam=Trading&seg=rising', 330],
];
const errors: string[] = [];
page.on('pageerror', (e: Error) => errors.push(e.message));
mkdirSync(join(ROOT, 'screenshots'), { recursive: true });
for (const [name, hash, scrollY] of shots) {
  await page.goto('about:blank');
  await page.goto(url + hash);
  await page.waitForTimeout(250);
  if (scrollY) await page.evaluate((y: number) => window.scrollTo(0, y), scrollY);
  // Pick the JPEG quality that lands each image near 320 KB (the rules ask for 300 to 350 KB).
  let q = 92, buf: Buffer = Buffer.alloc(0);
  for (let i = 0; i < 8; i++) {
    buf = await page.screenshot({ type: 'jpeg', quality: q });
    if (buf.length > 350_000) q -= 3; else if (buf.length < 300_000 && q < 99) q += 1; else break;
  }
  writeFileSync(join(ROOT, 'screenshots', name), buf);
  console.log(name, buf.length, 'q', q);
}
await browser.close();
if (errors.length) { console.error('page errors:', errors); process.exit(1); }
