# token-radar-v2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kombeltugumuda-gif/token-radar-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kombeltugumuda-gif/token-radar-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar. It ranks every protocol in one DefiLlama snapshot that
records no token by what its token would be worth if its record stayed as it
is, checks that price against the protocols whose token already trades, and
gives each one a costed plan to farm it.

**Model (radar-v2.1):** implied value = TVL × peer × growth × runway × reach.

- **peer**: market cap ÷ TVL of the live tokens in the same category, as a
  log-median. Thin categories are shrunk toward their family's median, and
  each family toward the whole market's (empirical Bayes, weight n/(n+4)), so
  one outlier token can't set a category's price. Clamped to 0.04–1.5×.
- **growth**: 1 + 0.4·tanh(7-day TVL change ÷ 20%), a smooth 0.6–1.4×.
- **runway**: 0.75 + 0.45·(1 − e^(−days/540)), from how long DefiLlama has
  tracked the protocol with no token.
- **reach**: +0.03 for each chain past the first, up to six.

**Model check:** every live token is priced by the same function with itself
left out of its peers. Rank correlation with real market caps is 0.43 (TVL
alone gets 0.41), and the median model ÷ market ratio is 1.05×, so the model
has no bias either way. Market caps spread widely at the same TVL, so each
row also shows a range taken from its peer set's quartiles.

**Board:** 197 rows: all 40 watchlist protocols, plus 157 early finds below
the $50M floor. Early finds must pass the watchlist's own rule: no bridge,
liquid-staking or exchange product, no versioned pool, no wrapped or staked
product. 145 no-token protocols fail that rule and are counted on the page.
The 416 protocols whose token already trades are kept off the board, in
their own view.

**Farm plans:** seven steps for each protocol, built from its main chain
(the deposit route and gas per transaction), its category (what to do and
how to stay active), its age and trend (how long to hold, when to leave),
and its implied value (what $1,000 could earn if 10% of the value went to
users pro rata to TVL). Every step has a dollar cost and a time, and the
plan adds them up.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

Needs Node 22.18 or later and nothing else. Inside the grader, the snapshot
is at `/input/snapshot.json` and the output goes to `/output`. Then open
`out/dashboard/index.html`.

- `main.ts`: reads the snapshot, writes board.json, data.js, the dashboard, the screenshots and dossier.json.
- `lib/model.ts`: the peer table, the value function and the model check.
- `lib/farm.ts`: the farm plans.
- `lib/board.ts`: the board, the dashboard's data and the gate's own checks.
- `dashboard/`: a static page (radar.js, radar.css, index.html) with no framework and no network.
- `tools/`: dev-only scripts for the screenshots and a local gate check. The entry never runs them.

---

<sub>Entered on [make.fun](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
