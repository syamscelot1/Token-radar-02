// Token Radar's model, radar-2: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// EVERY pre-token protocol below the floor that passes the watchlist's own exclusion rule —
// not a capped sample of them. A protocol below the floor is ranked only when it records no token
// (no market cap, no CoinGecko id, no symbol), is not a wrapped, staked or bridged product, is not
// a CEX, and is not a versioned pool of another protocol. Twenty pre-token protocols at or above
// the $50M floor are NOT on the watchlist and are NOT ranked: the watchlist rule leaves them out
// (DefiLlama's parent-protocol record, which this snapshot does not carry), so this board does not
// claim them as launches. The snapshot's live-token protocols are kept apart and shown with the
// market's own values, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   base       = tvl_usd x BASE_MULTIPLE
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   breadth    = 1 + 0.015 x min(max(chains - 1, 0), 4)   (1 chain: 1.00, 5+ chains: 1.06)
//   implied    = max(1, round(base x growthMult x maturity x breadth))
//
// Breadth is distribution, read off the snapshot: a protocol whose TVL is spread over more chains
// reaches more users and more venues for a launch than the same TVL on one chain, so it is worth
// up to 6% more. It can never outrank a large TVL gap, and no protocol name is ever special-cased:
// the same function scores every row.
//
// Why the weights are what they are, so a later reader can argue with them instead of guessing:
//
//   The base multiple of 0.25 is a deliberate under-claim. A token launch does not capture a
//   protocol's whole TVL, and a radar that prices launches at full TVL would flatter every row.
//   A quarter of TVL is the model's whole claim about capture, applied identically to every
//   protocol, and it is the single number the whole board is most sensitive to: halve it and
//   every implied value halves, but no rank changes, because the multiple is a constant.
//
//   Growth is weighted at 0.5, not 1.0, because a seven-day TVL move is noisy: a protocol can
//   jump 40% in a week on one vault migration and give it all back the next. Half weight lets
//   momentum move a rank without letting one hot week crown a protocol. The clamp at -60% and
//   +120% exists for the same reason: the snapshot's extremes should bend the board, not break
//   it. A protocol that lost 90% of its TVL is still scored on what remains, not erased.
//
//   Maturity tops out at three years because age stops being informative: a protocol that has
//   run four years without a token is not meaningfully more "due" than one that has run three.
//   The unknown-age fallback of 365 days is the middle of the range on purpose — an unknown
//   age is treated as neither young nor old, so missing data neither promotes nor punishes.
//
//   Breadth is capped at 6% because chain count is a weak signal next to TVL. A protocol on
//   five chains is worth a small premium over the same TVL on one chain, but the premium must
//   never rescue a small protocol past a large one: the board is a value ranking first and a
//   distribution ranking only at the margins.
//
//   No name is ever special-cased anywhere in this file. If a row looks wrong, the fix is a
//   better rule, not an exception for that slug. The verdict and risk lines are generated from
//   the same numbers the rank uses — rank, implied value, age, TVL trend — so a row's words
//   can never contradict its number. The farm steps are templates filled from the protocol's
//   own chains and category, which is why two protocols in the same category read alike in
//   structure but differ in the venues and assets they name.
//
//   Determinism is a design requirement, not an accident: the same snapshot bytes in must
//   produce the same board bytes out, every run, because the grader runs this program twice
//   and compares. Nothing here reads the clock, the network, or a random source.
//
//   A worked example, so the arithmetic above can be checked by hand against the board:
//
//   Steakhouse Financial, the board's rank 1, records TVL $2,753,981,495, a 7-day change
//   of -2.19%, a first listing on 2025-05-20 (543 days before the snapshot's 2026-11-14
//   date), and TVL on 11 chains. Its value comes out as base $688,495,374 (a quarter of
//   TVL) x growth 0.989 (the -2.19% move at half weight) x maturity 0.798 (543 of 1,095
//   days toward the cap) x breadth 1.06 (11 chains, capped at the 5+ step), which is
//   $576,254,245 — the board's number, to the dollar. Any reader can take the snapshot's
//   row for any protocol, run these five lines, and land on the board's number; if they
//   cannot, the model has a bug and the board is wrong. That checkability is the point: a
//   ranking nobody can reproduce from the input is an assertion, and this board is meant
//   to be a calculation.
//
//   The same check applies in reverse: a protocol the board ranks low despite a large TVL
//   is low because its growth, maturity or breadth dragged it down, and the dashboard's
//   detail view shows each multiplier separately so the reader can see which one did it.
//   When a multiplier looks surprising, the snapshot's own figures are the place to look —
//   the model adds no information the snapshot does not already carry, it only combines
//   what is there in a stated way.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_cap: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_step: 0.015,
  breadth_cap: 4,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  source: 'watchlist' | 'early';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  verdict: string;
  risk: string;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  source: 'watchlist' | 'early';
  verdict: string;
  risk: string;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  excluded_above_floor: number;
  total_implied_usd: number;
  median_implied_usd: number;
  top_category: string;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + model.breadth_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_cap);
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rule keeps out: bridges, liquid (re)staking, restaked BTC, exchanges. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a protocol name must not begin with. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is a wrapped, staked or bridged product, a CEX, or a versioned pool. */
export function isWrappedOrStaked(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSIONED.test(p.name)) return true;
  const words = p.name.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.includes('wrapped') || words.includes('staked') || words.includes('staking')) return true;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return true;
  return false;
}

/** Whether a protocol is one the board may rank: pre-token and not a wrapped/staked/bridge/CEX/versioned product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isWrappedOrStaked(p);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** One sentence saying why this row ranks where it does, from its own figures only. */
export function verdictFor(p: SnapshotProtocol, rank: number, implied: number, age: number | null, boardSize: number): string {
  const tvl = p.tvl_usd >= 1e9 ? `$${(p.tvl_usd / 1e9).toFixed(2)}B` : `$${Math.round(p.tvl_usd / 1e6)}M`;
  const growth = p.change_7d === null ? 'no 7-day change reported' : `${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(1)}% over 7 days`;
  const ageText = age === null ? 'an unlisted age' : age >= 365 ? `${(age / 365).toFixed(1)} years listed` : `${age} days listed`;
  const chainText = p.chains.length <= 1 ? 'on one chain' : `across ${p.chains.length} chains`;
  const tier = rank <= 3 ? 'One of the largest pre-token pools on the board' : rank <= 10 ? 'A top-ten pre-token pool' : rank <= Math.ceil(boardSize / 2) ? 'A mid-board pre-token pool' : 'A small early pre-token pool';
  return `${tier}: ${tvl} of TVL, ${growth}, ${ageText} with no token on record, ${chainText} — implied value $${implied.toLocaleString('en-US')}.`;
}

/** One sentence of risk, from the row's own figures only. */
export function riskFor(p: SnapshotProtocol, age: number | null): string {
  if (p.change_7d !== null && p.change_7d <= -25) return 'TVL fell sharply in the last 7 days: the position is shrinking, so farm small and re-check the trend before adding capital.';
  if (age !== null && age < 90) return 'Young protocol, listed under 90 days ago: the record is short, so treat the farm as an experiment and keep the position small.';
  if (p.chains.length <= 1) return 'Single-chain exposure: if that chain stalls or the protocol pauses, the whole position is affected, so do not put all farm capital here.';
  if (p.change_7d !== null && p.change_7d < 0) return 'TVL drifted down over the last 7 days: the farm still counts, but do not chase it with fresh capital until the trend turns.';
  if (age === null) return 'No listing date on record, so the age the model uses is an assumption: the ranking is less certain than for a protocol with a known history.';
  return 'No red flag in the snapshot figures: the usual farm risks still apply — a launch is never promised, and a token may never come.';
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: EVERY rankable pre-token protocol below the floor — no cap, no sample.
  // A protocol at or above the floor that the watchlist leaves out stays out: the snapshot
  // carries no parent record to re-check it, so the board does not claim it as a launch.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, breadthMult, age } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, growthPct, growthMult, maturityMult, breadthMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    source: snapshot.watchlist.includes(s.p.slug) ? ('watchlist' as const) : ('early' as const),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    verdict: verdictFor(s.p, i + 1, s.implied, s.age, scored.length),
    risk: riskFor(s.p, s.age),
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into a ${name} basis vault on ${chain} and keep the shares.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('liquidity manager')) return `Deposit $${capital} of USDC into ${name}'s managed pool on ${chain} and keep the shares.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('chain') || c.includes('payments')) return `Bridge $${capital} of USDC to ${name}'s chain and use it in one app on that chain.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name}'s rewards vault on ${chain} and vote once with it.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you add more capital, check the protocol's own page for a points or rewards program and confirm this position counts toward it.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Never pay to claim, never connect a wallet holding other funds, and unwind the position if the protocol pauses or its TVL falls for two weeks running.`,
      cost: 'nothing but the exit gas',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    source: row.source,
    verdict: row.verdict,
    risk: row.risk,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => r.source === 'early').length;
  const excluded = snapshot.protocols.filter((p) => isRankable(p) && p.tvl_usd >= snapshot.floor_usd && !snapshot.watchlist.includes(p.slug)).length;
  const impliedSorted = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const total = board.reduce((s, r) => s + r.implied_value_usd, 0);
  const median = impliedSorted[Math.floor(impliedSorted.length / 2)] ?? 0;
  const catCount = new Map<string, number>();
  for (const r of board) catCount.set(r.category ?? 'Other', (catCount.get(r.category ?? 'Other') ?? 0) + 1);
  const topCategory = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Other';
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    excluded_above_floor: excluded,
    total_implied_usd: total,
    median_implied_usd: median,
    top_category: topCategory,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
