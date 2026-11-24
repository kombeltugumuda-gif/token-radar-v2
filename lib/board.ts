// Token Radar v2: the board and the dashboard's data.

import { farmPlan, stepText, type Plan } from './farm.ts';
import { FAMILIES, MODEL, familyOf, modelCheck, peerTable, recordsNoToken, setAsideReason, value, type ModelCheck, type Snapshot, type Valuation } from './model.ts';

export interface Row {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  family: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  segment: 'watchlist' | 'early';
  token_status: 'no token recorded';
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  /** Implied value over TVL: what the model pays per dollar locked. */
  value_per_tvl: number;
  model: Valuation & { peer_n: number; family_n: number; peer_raw: number | null };
  plan: Plan;
  farm_steps: string[];
}

export interface Radar {
  as_of: string;
  source: string;
  floor_usd: number;
  model: typeof MODEL;
  families: Record<string, string[]>;
  counts: { protocols: number; no_token: number; watchlist: number; early: number; set_aside: number; trading: number };
  set_aside: { reason: string; count: number }[];
  peers: { category: string; family: string; n: number; raw: number | null; multiple: number; low: number; high: number; on_board: number }[];
  check: ModelCheck;
  rows: Row[];
}

const bySlug = (a: { slug: string }, b: { slug: string }) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/** The board: every watchlist protocol and every other no-token protocol that passes the house's rule, ranked by implied value. */
export function buildRadar(s: Snapshot): Radar {
  const table = peerTable(s.protocols);
  const watch = new Set(s.watchlist);
  const noToken = s.protocols.filter(recordsNoToken);
  const aside = new Map<string, number>();
  const subjects = noToken.filter((p) => {
    if (watch.has(p.slug)) return true;
    const why = setAsideReason(p);
    if (why !== null) aside.set(why.replace(/^[^:]+: /, ''), (aside.get(why.replace(/^[^:]+: /, '')) ?? 0) + 1);
    return why === null;
  });
  const scored = subjects.map((p) => ({ p, v: value(p, s.as_of, table) })).sort((a, b) => b.v.implied - a.v.implied || bySlug(a.p, b.p));
  const rows: Row[] = scored.map(({ p, v }, i) => {
    const peer = table.rows.get(p.category ?? 'Uncategorised')!;
    const plan = farmPlan(p, v);
    return {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      family: familyOf(p.category),
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      segment: watch.has(p.slug) ? 'watchlist' : 'early',
      token_status: 'no token recorded',
      implied_value_usd: v.implied,
      implied_low_usd: v.low,
      implied_high_usd: v.high,
      value_per_tvl: Math.round((v.implied / p.tvl_usd) * 10_000) / 10_000,
      model: { ...v, peer_n: peer.n, family_n: peer.family_n, peer_raw: peer.raw_median },
      plan,
      farm_steps: plan.steps.map(stepText),
    };
  });
  const onBoard = new Map<string, number>();
  for (const r of rows) onBoard.set(r.category ?? 'Uncategorised', (onBoard.get(r.category ?? 'Uncategorised') ?? 0) + 1);
  const check = modelCheck(s);
  return {
    as_of: s.as_of,
    source: s.source,
    floor_usd: s.floor_usd,
    model: MODEL,
    families: FAMILIES,
    counts: {
      protocols: s.protocols.length,
      no_token: noToken.length,
      watchlist: s.watchlist.length,
      early: rows.length - s.watchlist.length,
      set_aside: noToken.length - rows.length,
      trading: s.protocols.length - noToken.length,
    },
    set_aside: [...aside].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    peers: [...table.rows.values()]
      .filter((r) => onBoard.has(r.category) || r.n > 0)
      .map((r) => ({ category: r.category, family: r.family, n: r.n, raw: r.raw_median, multiple: r.multiple, low: r.low, high: r.high, on_board: onBoard.get(r.category) ?? 0 }))
      .sort((a, b) => b.on_board - a.on_board || b.n - a.n || (a.category < b.category ? -1 : 1)),
    check,
    rows,
  };
}

/** Why the gate would refuse this board, or null. */
export function boardIssue(rows: Row[], s: Snapshot): string | null {
  if (rows.length < 100 || rows.length > 4000) return `${rows.length} rows; the gate takes 100 to 4,000`;
  const have = new Set(rows.map((r) => r.slug));
  const known = new Set(s.protocols.map((p) => p.slug));
  const miss = s.watchlist.filter((w) => !have.has(w));
  if (miss.length) return `watchlist slugs missing: ${miss.slice(0, 5).join(', ')}`;
  if (have.size !== rows.length) return 'a slug appears twice';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (!known.has(r.slug)) return `${r.slug} is not in the snapshot`;
    if (r.rank !== i + 1) return `row ${i} has rank ${r.rank}`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd < 1 || r.implied_value_usd > 1e14) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) return `${r.slug} outranks a lower value`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const t of r.farm_steps) if (t.trim().length < 20 || t.trim().length > 600) return `${r.slug} has a farm step of ${t.trim().length} characters`;
  }
  if (rows[0]!.implied_value_usd === rows[rows.length - 1]!.implied_value_usd) return 'every row has the same implied value';
  return null;
}
