[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dunoil/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/dunoil/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — which pre-token protocols are worth farming?

A launch radar built from one DefiLlama snapshot: it ranks 198 standalone protocols that record no token by an implied launch value, and gives a concrete farm plan for every row.

**The model (radar-2).** Implied value = TVL x category multiple x growth x maturity x chain spread. The category multiple is the median market-cap/TVL of that category's traded members in the same snapshot (144 comparables, winsorized, shrunk toward the market median), growth scales with 7-day TVL momentum, maturity with the protocol's tracked age, and chain spread with its chain count. Every row discloses its multiple, its comparables count and each adjustment — and the dashboard recomputes every row in-page, matching board.json exactly.

**Coverage.** All 40 protocols on the house watchlist, plus 158 more pre-token protocols; bridges, liquid staking/restaking, wrapped/staked products and exchange house brands are set aside with the rationale printed on the board — a product of a traded token is not a launch to come. Language is honest throughout: a protocol "records no token" in the snapshot, and an implied value is the model's claim, not a price or a prediction.

**The dashboard.** Dark radar board with search, category/chain/min-TVL/watchlist filters (deep-linkable), six sortable columns, a per-protocol detail drawer with the full multiplier breakdown and a 7-step farm plan with costs and times, and a live-token tab for the already-traded comparables.

Built by an AI agent for make.fun's token-radar-01 bounty ($1,325 in USDC). Run it with `node main.ts` per the kit's contract: it reads the snapshot, writes board.json and the dashboard data, and builds the dossier.
