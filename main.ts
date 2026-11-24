// Token Radar v2: a make.fun token-radar-01 entry. Node 22.18+, standard library only.
//
// Reads /input/snapshot.json (or --input <file>), ranks every protocol that
// records no token by an implied value (lib/model.ts), gives each a costed farm
// plan (lib/farm.ts), and writes /output: board.json, data.js for the page,
// the dashboard/ and screenshots/ folders, and dossier.json last.
//
// Locally, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json

import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar } from './lib/board.ts';
import { parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

/** Copy a folder's plain files (recursively), skipping dot-files. */
function copyTree(from: string, to: string): number {
  mkdirSync(to, { recursive: true });
  let n = 0;
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    const st = statSync(src);
    if (st.isDirectory()) n += copyTree(src, join(to, name));
    else if (st.isFile()) {
      copyFileSync(src, join(to, name));
      n++;
    }
  }
  return n;
}

const input = arg('--input', '/input/snapshot.json');
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const snapshot = parseSnapshot(readFileSync(statSync(input).isDirectory() ? join(input, 'snapshot.json') : input, 'utf8'));
const radar = buildRadar(snapshot);
const issue = boardIssue(radar.rows, snapshot);
if (issue) throw new Error(`board would fail the gate: ${issue}`);

mkdirSync(out, { recursive: true });
for (const d of ['dashboard', 'screenshots']) rmSync(join(out, d), { recursive: true, force: true });

// board.json: the gate's fields plus the model's inputs and the structured plan.
const boardRows = radar.rows.map((r) => ({
  rank: r.rank,
  slug: r.slug,
  name: r.name,
  implied_value_usd: r.implied_value_usd,
  farm_steps: r.farm_steps,
  category: r.category,
  segment: r.segment,
  token_status: r.token_status,
  tvl_usd: r.tvl_usd,
  change_7d: r.change_7d,
  listed_at: r.listed_at,
  chains: r.chains,
  implied_range_usd: [r.implied_low_usd, r.implied_high_usd],
  model: { peer_multiple: r.model.multiple, growth: r.model.growth, runway: r.model.runway, reach: r.model.reach, age_days: r.model.age_days },
  farm: { capital_usd: r.plan.capital_usd, hold_days: r.plan.hold_days, fees_usd: r.plan.fees_usd, hands_on_minutes: r.plan.hands_on_minutes, ev_usd: r.plan.ev_usd },
}));
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ model: radar.model.version, as_of: radar.as_of, rows: boardRows })}\n`);
// data.js: the same board for the page, which reads it with a plain <script>, no fetch and no network.
const pageRows = radar.rows.map(({ farm_steps: _drop, ...rest }) => rest);
writeFileSync(join(out, 'data.js'), `window.RADAR=${JSON.stringify({ ...radar, rows: pageRows })};\n`);

copyTree(join(ROOT, 'dashboard'), join(out, 'dashboard'));
const shots = copyTree(join(ROOT, 'screenshots'), join(out, 'screenshots'));
if (shots < 3 || shots > 4) throw new Error(`screenshots/ holds ${shots} images; hand in 3 or 4`);

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);
const c = radar.counts;
console.log(`${c.protocols} protocols; ${radar.rows.length} ranked (${c.watchlist} watchlist + ${c.early} early), ${c.set_aside} set aside, ${c.trading} already trade. Model check rho ${radar.check.spearman_model} on ${radar.check.n} live tokens.`);
