// Token Radar v2: farm plans.
//
// Every plan is built from the protocol's own record: its main chain decides
// how money gets there and what each transaction costs, its category decides
// what to do once there, its age and seven-day trend decide how long to hold
// and when to leave, and the board's implied value decides what the position
// could earn. Each step carries a dollar cost and a time, and the plan sums them.

import { MODEL, familyOf, type Protocol, type Valuation } from './model.ts';

export interface Step {
  /** What to do, in the words a farmer can follow. */
  do: string;
  /** What it costs in dollars, gas and fees; capital that stays yours is not a cost. */
  cost_usd: number;
  /** The cost in words. */
  cost: string;
  /** How long it takes. */
  time: string;
  /** Hands-on minutes, for the plan's total. */
  minutes: number;
}

export interface Plan {
  capital_usd: number;
  hold_days: number;
  steps: Step[];
  fees_usd: number;
  hands_on_minutes: number;
  /** What `capital_usd` could earn if MODEL.user_share of the implied value goes to users pro rata to TVL. */
  ev_usd: number;
  ev_net_usd: number;
  exit_tvl_usd: number;
}

interface ChainCost {
  /** Dollars per ordinary transaction. */
  tx: number;
  /** How to get USDC onto the chain, and what that costs. */
  route: string;
  route_usd: number;
  route_min: number;
  /** The gas token the wallet needs. */
  gas: string;
}

/** What a transaction and a deposit route cost on a protocol's main chain (November 2026 orders of magnitude). */
export function chainCost(chain: string): ChainCost {
  switch (chain) {
    case 'Ethereum':
      return { tx: 6, route: 'withdraw USDC from an exchange straight to Ethereum mainnet', route_usd: 4, route_min: 10, gas: 'about $30 of ETH' };
    case 'Solana':
      return { tx: 0.01, route: 'withdraw USDC from an exchange straight to Solana', route_usd: 1, route_min: 5, gas: 'about $3 of SOL' };
    case 'Bitcoin':
      return { tx: 2, route: 'withdraw BTC from an exchange to a native SegWit address you hold', route_usd: 3, route_min: 40, gas: 'BTC for fees' };
    case 'Tron':
      return { tx: 1.5, route: 'withdraw USDT from an exchange straight to Tron', route_usd: 1, route_min: 5, gas: 'about $5 of TRX' };
    case 'Binance':
      return { tx: 0.05, route: 'withdraw USDC from an exchange straight to BNB Chain', route_usd: 0.5, route_min: 5, gas: 'about $2 of BNB' };
    case 'Sui':
    case 'Aptos':
      return { tx: 0.01, route: `withdraw USDC from an exchange straight to ${chain}`, route_usd: 1, route_min: 5, gas: `about $2 of ${chain === 'Sui' ? 'SUI' : 'APT'}` };
    case 'Base':
    case 'Arbitrum':
    case 'OP Mainnet':
    case 'Optimism':
    case 'Polygon':
    case 'Avalanche':
      return { tx: 0.05, route: `withdraw USDC from an exchange straight to ${chain} (most large exchanges support it)`, route_usd: 1, route_min: 5, gas: chain === 'Polygon' ? 'about $2 of POL' : chain === 'Avalanche' ? 'about $2 of AVAX' : `about $3 of ETH on ${chain}` };
    case 'Hyperliquid L1':
      return { tx: 0.05, route: 'deposit USDC to Hyperliquid from Arbitrum through its bridge', route_usd: 1.5, route_min: 10, gas: 'about $2 of HYPE' };
    default:
      return { tx: 0.1, route: `withdraw USDC to Ethereum or Arbitrum, then bridge to ${chain} through its canonical bridge or a bridge aggregator`, route_usd: 3, route_min: 20, gas: `about $3 of ${chain}'s gas token` };
  }
}

const usd = (x: number) => (x >= 100 ? `$${Math.round(x).toLocaleString('en-US')}` : x >= 1 ? `$${x.toFixed(x % 1 ? 2 : 0)}` : x >= 0.01 ? `$${x.toFixed(2)}` : 'under $0.01');

export function money(x: number): string {
  const a = Math.abs(x);
  if (a >= 1e9) return `$${(x / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(x / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(x / 1e3).toFixed(0)}K`;
  return usd(x);
}

/** The position the plan farms with: bigger and older protocols get a bigger ticket, never more than $2,500. */
export function capitalFor(p: Protocol): number {
  if (p.tvl_usd >= 1e9) return 2500;
  if (p.tvl_usd >= 2.5e8) return 1500;
  if (p.tvl_usd >= 5e7) return 1000;
  return 500;
}

/** How long to stay: young protocols run longer seasons; a shrinking one gets a checkpoint sooner. */
export function holdDaysFor(age: number | null, change: number | null): number {
  let d = age === null ? 60 : age < 180 ? 90 : age < 540 ? 60 : 45;
  if (change !== null && change <= -15) d = Math.min(d, 30);
  return d;
}

/** The category's own moves: one to enter and one to keep the wallet active, with their transaction counts. */
function moves(p: Protocol, cap: string, chain: string): { enter: string; enterTx: number; keep: string; keepTx: number; keepWhat: string } {
  const c = p.category ?? '';
  const n = p.name;
  const fam = familyOf(p.category);
  if (c === 'Risk Curators' || c === 'Onchain Capital Allocator')
    return {
      enter: `Deposit ${cap} of USDC into ${n}'s largest USDC vault on ${chain} (sort its vaults by TVL on its own app and pick the top one), and keep the vault shares in the same wallet`,
      enterTx: 2,
      keep: `Top up the vault by $50 every two weeks rather than once, so the wallet shows a deposit history and not a single transfer`,
      keepTx: 1,
      keepWhat: 'a $50 top-up',
    };
  if (c === 'Dexs')
    return {
      enter: `Swap half of ${cap} into the pair's other asset and add both to ${n}'s deepest stablecoin or blue-chip pool on ${chain}; on a ranged pool, set the range about 5% either side of the price`,
      enterTx: 3,
      keep: `Make two swaps of about $100 each week through ${n}'s router, and re-centre the range when the price leaves it`,
      keepTx: 2,
      keepWhat: 'two $100 swaps',
    };
  if (c === 'Derivatives' || c === 'Interest Rate Derivatives' || c === 'Options Vault')
    return {
      enter: `Deposit ${cap} of USDC as margin on ${n} and put most of it in its liquidity or insurance vault, keeping $100 free for trading`,
      enterTx: 2,
      keep: `Open and close one delta-neutral position of about $200 notional each week (long and short in equal size, or a single 1x hedge), so volume is counted without market risk`,
      keepTx: 2,
      keepWhat: 'a hedged $200 round trip',
    };
  if (c === 'Prediction Market')
    return {
      enter: `Fund ${n} with ${cap} of USDC and leave most of it as idle balance or in its liquidity rewards programme, if it runs one`,
      enterTx: 1,
      keep: `Place two small positions of about $20 each week on markets that resolve within days, and hold them to resolution`,
      keepTx: 2,
      keepWhat: 'two $20 positions',
    };
  if (fam === 'Credit')
    return {
      enter: `Supply ${cap} of USDC to ${n} on ${chain}, then borrow about 20% of it in a second stablecoin so the wallet counts as both a lender and a borrower; keep the health factor above 2`,
      enterTx: 3,
      keep: `Repay and re-borrow a small part of the loan every two weeks; check the health factor at the same time`,
      keepTx: 2,
      keepWhat: 'a repay and re-borrow',
    };
  if (c === 'RWA')
    return {
      enter: `Mint or buy ${cap} of ${n}'s yield-bearing asset on ${chain}; if minting asks for KYC, finish it first and expect a minimum ticket, and buy on a DEX instead when the minimum is above your capital`,
      enterTx: 2,
      keep: `Use the asset once a month the way the protocol rewards, such as posting it as collateral or adding it to its listed pool`,
      keepTx: 2,
      keepWhat: 'one collateral or pool action',
    };
  if (fam === 'Staking & BTC')
    return {
      enter: `Stake ${cap} of the native asset through ${n} on ${chain} and keep its receipt token; on a Bitcoin layer, bridge BTC in through the protocol's own deposit page`,
      enterTx: 2,
      keep: `Put the receipt token to work once a month in a pool or market ${n} lists as a partner, so the points of both count`,
      keepTx: 1,
      keepWhat: 'one partner-pool deposit',
    };
  if (fam === 'Stablecoins' || c === 'Basis Trading' || c === 'Yield' || c === 'Yield Aggregator')
    return {
      enter: `Mint ${cap} of ${n}'s stable or yield token with USDC on ${chain} and stake it in the protocol's own savings or points vault`,
      enterTx: 2,
      keep: `Move a small part (about $50) through the protocol's listed pool or lending market every two weeks; partner use is what points programmes weight most`,
      keepTx: 2,
      keepWhat: 'a $50 partner-pool move',
    };
  if (c === 'Chain' || c === 'Payments' || c === 'Privacy')
    return {
      enter: `Bridge ${cap} to ${n} through its official bridge and keep it in the chain's native staking or main lending app`,
      enterTx: 2,
      keep: `Make three ordinary transactions a week on the chain (a swap, a transfer, a deposit) on different days`,
      keepTx: 3,
      keepWhat: 'three ordinary transactions',
    };
  if (c === 'Insurance')
    return {
      enter: `Deposit ${cap} of USDC into ${n}'s underwriting or cover-capital pool on ${chain}`,
      enterTx: 2,
      keep: `Buy one small cover (about $500 covered) for another protocol you use, so the wallet is a buyer as well as a provider`,
      keepTx: 1,
      keepWhat: 'one small cover purchase',
    };
  return {
    enter: `Deposit ${cap} of USDC into ${n}'s main product on ${chain} and keep the position open`,
    enterTx: 2,
    keep: `Make one ordinary action in ${n}'s app each week (a deposit, a claim or a vote)`,
    keepTx: 1,
    keepWhat: 'one ordinary action',
  };
}

const dur = (m: number) => (m >= 60 ? `${Math.round(m / 6) / 10} hours` : `${m} minutes`);

/** The whole plan for one protocol. */
export function farmPlan(p: Protocol, v: Valuation): Plan {
  const chain = p.chains[0] ?? 'Ethereum';
  const cc = chainCost(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(v.age_days, p.change_7d);
  const weeks = Math.ceil(hold / 7);
  const m = moves(p, usd(capital), chain);
  const share = MODEL.user_share;
  const ev = Math.round(((v.implied * share) / p.tvl_usd) * capital);
  const exitTvl = Math.round(p.tvl_usd * 0.7);

  const enterCost = cc.tx * m.enterTx;
  const keepEach = cc.tx * m.keepTx;
  const keepCount = m.keepWhat.includes('two weeks') || m.keep.includes('every two weeks') ? Math.ceil(weeks / 2) : m.keep.includes('once a month') ? Math.ceil(hold / 30) : weeks;
  const keepCost = keepEach * keepCount;
  const exitCost = cc.tx * 2 + cc.route_usd;

  const steps: Step[] = [
    {
      do: `Set up a fresh wallet used only for this farm, and fund it: ${cc.route}. Keep ${cc.gas} in it for gas`,
      cost_usd: cc.route_usd,
      cost: `${usd(cc.route_usd)} in withdrawal and bridge fees`,
      time: dur(cc.route_min),
      minutes: cc.route_min,
    },
    {
      do: m.enter,
      cost_usd: enterCost,
      cost: `${usd(enterCost)} of gas for ${m.enterTx} transactions; the ${usd(capital)} stays yours`,
      time: '15 minutes',
      minutes: 15,
    },
    {
      do: `${m.keep}. Over ${hold} days that is ${keepCount} rounds of ${m.keepWhat}`,
      cost_usd: keepCost,
      cost: `${usd(keepEach)} a round, ${usd(keepCost)} in all`,
      time: `10 minutes a round, ${dur(keepCount * 10)} in all`,
      minutes: keepCount * 10,
    },
    {
      do: `Find ${p.name}'s points or rewards page from its official site (not from a reply or an ad), connect the wallet read-only and confirm the deposit is counted; check again every two weeks`,
      cost_usd: 0,
      cost: 'nothing',
      time: `5 minutes, then 5 minutes every two weeks`,
      minutes: 5 + Math.ceil(hold / 14) * 5,
    },
    {
      do: `Hold for ${hold} days${v.age_days !== null && v.age_days < 180 ? ' (it is under six months old, so a season likely runs longer)' : ''}. Leave early if its TVL falls under ${money(exitTvl)} (30% below today's ${money(p.tvl_usd)}) or the protocol is exploited: a shrinking protocol rarely rewards late farmers`,
      cost_usd: 0,
      cost: `no fee; ${usd(capital)} is tied up for ${hold} days`,
      time: `${hold} days`,
      minutes: 0,
    },
    {
      do: `Size the prize: if ${Math.round(share * 100)}% of the board's ${money(v.implied)} implied value went to users pro rata to TVL, ${usd(capital)} of ${money(p.tvl_usd)} would earn about ${usd(ev)}, against ${usd(cc.route_usd + enterCost + keepCost + exitCost)} of fees in all; skip the farm if that ratio is under 2 to 1`,
      cost_usd: 0,
      cost: 'nothing, a sum',
      time: '2 minutes',
      minutes: 2,
    },
    {
      do: `Exit: withdraw, send the funds back to an exchange, and if a token is announced claim only from the domain you checked in step 4; never pay a fee to claim and never sign an approval a claim page asks for`,
      cost_usd: exitCost,
      cost: `${usd(exitCost)} in gas and withdrawal fees`,
      time: '20 minutes',
      minutes: 20,
    },
  ];
  const fees = Math.round(steps.reduce((s, x) => s + x.cost_usd, 0) * 100) / 100;
  return {
    capital_usd: capital,
    hold_days: hold,
    steps,
    fees_usd: fees,
    hands_on_minutes: steps.reduce((s, x) => s + x.minutes, 0),
    ev_usd: ev,
    ev_net_usd: Math.round(ev - fees),
    exit_tvl_usd: exitTvl,
  };
}

/** A step as the board's string: the action, then its cost and time, within the gate's 20 to 600 characters. */
export function stepText(s: Step): string {
  const t = `${s.do}. Cost: ${s.cost}. Time: ${s.time}.`;
  return t.length <= 600 ? t : `${t.slice(0, 597)}...`;
}
