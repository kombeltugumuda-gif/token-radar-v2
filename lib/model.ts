// Token Radar v2: the value model.
//
// One sealed DefiLlama snapshot in, one ranked board out. Every number on the
// board follows from the snapshot's own fields; no protocol name is ever read
// by the model, and every constant below is printed on the dashboard.
//
//   implied value = TVL x peer multiple x growth x runway x reach
//
//   peer multiple  What the market pays per dollar of TVL for protocols of the
//                  same kind, read from this snapshot's live tokens (market cap
//                  over TVL). Small categories are noisy, so each category's
//                  log-median is shrunk toward its family's, and each family's
//                  toward the whole market's (empirical Bayes, weight n/(n+k)).
//   growth         1 + 0.4 tanh(change_7d / 20): smooth, bounded 0.6 to 1.4.
//   runway         0.75 + 0.45 (1 - e^(-days/540)): how long the protocol has
//                  run with no token, 0.75 on day one, about 0.98 after a year.
//   reach          1 + 0.03 per chain beyond the first, up to six: 1.00 to 1.18.
//
// The same function prices the protocols whose token already trades, and the
// dashboard's Model check compares that price with their real market cap.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export const MODEL = {
  version: 'radar-v2.1',
  shrink_k: 4,
  multiple_min: 0.04,
  multiple_max: 1.5,
  growth_amp: 0.4,
  growth_scale: 20,
  runway_floor: 0.75,
  runway_gain: 0.45,
  runway_days: 540,
  unknown_age_days: 365,
  reach_step: 0.03,
  reach_max_chains: 6,
  user_share: 0.1,
} as const;

/** Categories grouped by what the protocol does, so a thin category borrows from its kin. */
export const FAMILIES: Record<string, string[]> = {
  Credit: ['Lending', 'CDP', 'CDP Manager', 'Collateral Markets', 'Uncollateralized Lending', 'RWA Lending', 'NFT Lending'],
  Trading: ['Dexs', 'Derivatives', 'Prediction Market', 'Options', 'Options Vault', 'Interest Rate Derivatives', 'OTC Marketplace', 'DEX Aggregator', 'Perpetuals'],
  'Asset management': ['Risk Curators', 'Onchain Capital Allocator', 'Yield', 'Yield Aggregator', 'Basis Trading', 'Liquidity Manager', 'Farm', 'Leveraged Farming', 'Indexes'],
  'Real-world assets': ['RWA'],
  'Staking & BTC': ['Liquid Staking', 'Restaking', 'Liquid Restaking', 'Staking Pool', 'Restaked BTC', 'Anchor BTC', 'Decentralized BTC'],
  Stablecoins: ['Stablecoin Wrapper', 'Dual-Token Stablecoin', 'Algo-Stables', 'Stablecoin Issuer'],
  Infrastructure: ['Chain', 'Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Payments', 'Privacy', 'Governance Incentives', 'Insurance', 'Crypto Card Issuer', 'CeDeFi', 'Launchpad', 'Services', 'SoFi'],
};

const FAMILY_OF = new Map<string, string>();
for (const [family, cats] of Object.entries(FAMILIES)) for (const c of cats) FAMILY_OF.set(c, family);

export function familyOf(category: string | null): string {
  return (category !== null && FAMILY_OF.get(category)) || 'Other';
}

/** No market cap, no CoinGecko id, no ticker: DefiLlama records no token. */
export function recordsNoToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

// The house's watchlist rule, applied below the floor too, so the early finds
// are held to the same test as the watchlist: no wrapped, staked or bridged
// product of a token that trades, no versioned pool, no exchange.
const SET_ASIDE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const VERSION_SUFFIX = /\s(v|V)?\d+(\.\d+)*$/;
const DERIVATIVE_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Why a no-token protocol stays off the board, or null when it is a radar subject. */
export function setAsideReason(p: Protocol): string | null {
  if (p.category !== null && SET_ASIDE_CATEGORIES.has(p.category)) return `${p.category}: a product of a token that already trades`;
  if (VERSION_SUFFIX.test(p.name)) return 'versioned pool of a larger protocol';
  if (DERIVATIVE_WORD.test(p.name)) return 'wrapped or staked product';
  if (EXCHANGE_PREFIX.test(p.name)) return "an exchange's own product";
  return null;
}

const DAY = 86_400_000;

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const d = Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${listedAt}T00:00:00Z`)) / DAY);
  return Number.isFinite(d) ? Math.max(0, d) : null;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo]! + (s[Math.min(lo + 1, s.length - 1)]! - s[lo]!) * (i - lo);
}

/** A live token the peer table can learn from: a market cap and a TVL, not an exchange. */
function isPeer(p: Protocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX';
}

export interface PeerRow {
  category: string;
  family: string;
  n: number;
  family_n: number;
  raw_median: number | null;
  multiple: number;
  low: number;
  high: number;
}

export interface PeerTable {
  global_median: number;
  global_n: number;
  rows: Map<string, PeerRow>;
  families: Map<string, { n: number; multiple: number }>;
}

const r4 = (x: number) => Math.round(x * 10_000) / 10_000;
const clampM = (x: number) => Math.min(MODEL.multiple_max, Math.max(MODEL.multiple_min, x));

/**
 * The peer table: per category, the log market-cap-to-TVL ratio of the live
 * tokens, shrunk toward the family and the market. `skip` leaves one protocol
 * out, for the leave-one-out model check.
 */
export function peerTable(protocols: Protocol[], skip?: string): PeerTable {
  const k = MODEL.shrink_k;
  const byCat = new Map<string, number[]>();
  const byFam = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (!isPeer(p) || p.slug === skip) continue;
    const l = Math.log(p.mcap_usd! / p.tvl_usd);
    const cat = p.category ?? 'Uncategorised';
    (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(l);
    const fam = familyOf(p.category);
    (byFam.get(fam) ?? byFam.set(fam, []).get(fam)!).push(l);
    all.push(l);
  }
  const g = median(all);
  const gSpread = (quantile(all, 0.75) - quantile(all, 0.25)) / 2;
  const famLog = new Map<string, { mu: number; spread: number; n: number }>();
  const families = new Map<string, { n: number; multiple: number }>();
  const familyNames = new Set([...Object.keys(FAMILIES), 'Other']);
  for (const fam of familyNames) {
    const xs = byFam.get(fam) ?? [];
    const n = xs.length;
    const mu = n ? (n * median(xs) + k * g) / (n + k) : g;
    const spread = n >= 4 ? (n * ((quantile(xs, 0.75) - quantile(xs, 0.25)) / 2) + k * gSpread) / (n + k) : gSpread;
    famLog.set(fam, { mu, spread, n });
    families.set(fam, { n, multiple: r4(clampM(Math.exp(mu))) });
  }
  const cats = new Set<string>([...byCat.keys(), ...protocols.map((p) => p.category ?? 'Uncategorised')]);
  const rows = new Map<string, PeerRow>();
  for (const cat of [...cats].sort()) {
    const fam = familyOf(cat === 'Uncategorised' ? null : cat);
    const f = famLog.get(fam)!;
    const xs = byCat.get(cat) ?? [];
    const n = xs.length;
    const mu = n ? (n * median(xs) + k * f.mu) / (n + k) : f.mu;
    rows.set(cat, {
      category: cat,
      family: fam,
      n,
      family_n: f.n,
      raw_median: n ? r4(Math.exp(median(xs))) : null,
      multiple: r4(clampM(Math.exp(mu))),
      low: r4(clampM(Math.exp(mu - f.spread))),
      high: r4(clampM(Math.exp(mu + f.spread))),
    });
  }
  return { global_median: r4(Math.exp(g)), global_n: all.length, rows, families };
}

export interface Valuation {
  implied: number;
  low: number;
  high: number;
  multiple: number;
  growth: number;
  runway: number;
  reach: number;
  age_days: number | null;
  age_assumed: boolean;
}

/** The model itself: one protocol, one peer table, one number (and its range). */
export function value(p: Protocol, asOf: string, table: PeerTable): Valuation {
  const peer = table.rows.get(p.category ?? 'Uncategorised')!;
  const ch = p.change_7d ?? 0;
  const growth = 1 + MODEL.growth_amp * Math.tanh(ch / MODEL.growth_scale);
  const age = ageDays(asOf, p.listed_at);
  const days = age ?? MODEL.unknown_age_days;
  const runway = MODEL.runway_floor + MODEL.runway_gain * (1 - Math.exp(-days / MODEL.runway_days));
  const reach = 1 + MODEL.reach_step * Math.min(Math.max(p.chains.length - 1, 0), MODEL.reach_max_chains);
  const base = p.tvl_usd * growth * runway * reach;
  return {
    implied: Math.max(1, Math.round(base * peer.multiple)),
    low: Math.max(1, Math.round(base * peer.low)),
    high: Math.max(1, Math.round(base * peer.high)),
    multiple: peer.multiple,
    growth: r4(growth),
    runway: r4(runway),
    reach: r4(reach),
    age_days: age,
    age_assumed: age === null,
  };
}

/** Spearman's rank correlation of two equal-length lists. */
export function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const idx = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(xs.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
      for (let t = i; t <= j; t++) r[idx[t]![1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n;
  const mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) ** 2;
    db += (rb[i]! - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number;
  symbol: string | null;
  model_usd: number;
  ratio: number;
}

export interface ModelCheck {
  n: number;
  spearman_model: number;
  spearman_tvl: number;
  median_fold_error: number;
  within_3x: number;
  median_ratio: number;
  rows: LiveRow[];
}

/**
 * The model check: every live token is priced by the model with itself left
 * out of the peer table, then compared with the market cap it really has.
 * The TVL-only baseline (TVL times the market's median multiple) ranks by TVL.
 */
export function modelCheck(s: Snapshot): ModelCheck {
  const rows: LiveRow[] = [];
  const folds: number[] = [];
  for (const p of s.protocols) {
    if (!isPeer(p)) continue;
    const v = value(p, s.as_of, peerTable(s.protocols, p.slug));
    rows.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd!,
      symbol: p.symbol,
      model_usd: v.implied,
      ratio: Number((v.implied / p.mcap_usd!).toPrecision(3)),
    });
    folds.push(Math.exp(Math.abs(Math.log(v.implied / p.mcap_usd!))));
  }
  rows.sort((a, b) => b.mcap_usd - a.mcap_usd || (a.slug < b.slug ? -1 : 1));
  return {
    n: rows.length,
    spearman_model: r4(spearman(rows.map((r) => r.model_usd), rows.map((r) => r.mcap_usd))),
    spearman_tvl: r4(spearman(rows.map((r) => r.tvl_usd), rows.map((r) => r.mcap_usd))),
    median_fold_error: Math.round(median(folds) * 100) / 100,
    within_3x: Math.round((folds.filter((f) => f <= 3).length / folds.length) * 1000) / 1000,
    median_ratio: Number(median(rows.map((r) => r.model_usd / r.mcap_usd)).toFixed(2)),
    rows,
  };
}

export function parseSnapshot(text: string): Snapshot {
  const o = JSON.parse(text) as Snapshot;
  if (typeof o !== 'object' || o === null || !Array.isArray(o.protocols) || !Array.isArray(o.watchlist)) {
    throw new Error('snapshot.json is not a snapshot: it needs protocols and a watchlist');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(o.as_of))) throw new Error('snapshot.json has no as_of date');
  for (const p of o.protocols) {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || !Number.isFinite(p.tvl_usd)) {
      throw new Error(`snapshot.json protocol ${JSON.stringify(p.slug)} lacks a slug, a name or a TVL`);
    }
    if (!Array.isArray(p.chains)) p.chains = [];
  }
  return o;
}
