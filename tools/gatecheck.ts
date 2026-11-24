// Dev tool: re-check an output folder against the gate's published rows.
//   node tools/gatecheck.ts <out dir> <snapshot.json>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const [out, snapPath] = process.argv.slice(2) as [string, string];
const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
const fail: string[] = [];
const ok = (c: boolean, m: string) => { if (!c) fail.push(m); };
// board_file, sorted_by_value, coverage, farm_steps
const rows = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8')).rows;
const known = new Set(snap.protocols.map((p: any) => p.slug));
ok(rows.length >= 100 && rows.length <= 4000, 'row count');
ok(statSync(join(out, 'board.json')).size <= 8 * 1024 * 1024, 'board size');
const ranks = rows.map((r: any) => r.rank).sort((a: number, b: number) => a - b);
ok(ranks.every((r: number, i: number) => r === i + 1), 'ranks 1..N');
const byRank = [...rows].sort((a: any, b: any) => a.rank - b.rank);
ok(byRank.every((r: any, i: number) => i === 0 || r.implied_value_usd <= byRank[i - 1].implied_value_usd), 'value order');
ok(new Set(rows.map((r: any) => r.implied_value_usd)).size > 1, 'distinct values');
for (const r of rows) {
  ok(typeof r.slug === 'string' && /^\S{1,128}$/.test(r.slug) && known.has(r.slug), `slug ${r.slug}`);
  ok(typeof r.name === 'string' && r.name.length > 0, `name ${r.slug}`);
  ok(Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd <= 1e14, `value ${r.slug}`);
  ok(Array.isArray(r.farm_steps) && r.farm_steps.length >= 3 && r.farm_steps.length <= 12, `steps ${r.slug}`);
  for (const s of r.farm_steps) ok(s.trim().length >= 20 && s.trim().length <= 600, `step len ${r.slug} ${s.trim().length}`);
}
ok(new Set(rows.map((r: any) => r.slug)).size === rows.length, 'unique slugs');
const have = new Set(rows.map((r: any) => r.slug));
ok(snap.watchlist.every((w: string) => have.has(w)), 'watchlist coverage');
// dashboard_files
const files: string[] = [];
const walk = (d: string, rel = '') => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p, rel + n + '/') : files.push(rel + n); } };
walk(join(out, 'dashboard'));
ok(files.includes('index.html') && files.some((f) => f.endsWith('.css')) && files.some((f) => f.endsWith('.js')), 'dashboard trio');
for (const f of files) {
  ok(/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(f.split('/').pop()!), `name ${f}`);
  const t = readFileSync(join(out, 'dashboard', f), 'utf8');
  if (f.endsWith('.css')) ok(!/https?:\/\//.test(t), `url in ${f}`);
  if (f.endsWith('.html')) ok(!/=\s*["']?\s*https?:\/\//i.test(t), `url attr in ${f}`);
  if (f.endsWith('.js')) ok(!/(import|from|require\(|import\()\s*['"]https?:/.test(t), `url import in ${f}`);
}
// screenshots
for (const n of readdirSync(join(out, 'screenshots'))) {
  const b = readFileSync(join(out, 'screenshots', n));
  ok(b.length <= 512 * 1024, `${n} bytes`);
  let w = 0, h = 0;
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length; ) { const m = b[i + 1]!; const len = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc3) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; } i += 2 + len; }
    ok(b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9, `${n} whole jpeg`);
  }
  ok(Math.max(w, h) <= 1440 && Math.min(w, h) >= 800, `${n} dims ${w}x${h}`);
  console.log(n, b.length, `${w}x${h}`);
}
ok(statSync(join(out, 'dossier.json')).size <= 1.5 * 1024 * 1024, 'dossier size');
console.log(fail.length ? 'FAIL\n' + fail.slice(0, 20).join('\n') : `PASS: ${rows.length} rows, ${files.length} dashboard files`);
process.exit(fail.length ? 1 : 0);
