// Investor-archetype "styles" — a philosophy layer that sits above the mandate.
// A proposal is shaped by three layers, in order: STYLE → mandate guidelines →
// learned memory (trading thoughts). Pure data: safe to import on client + server.

export interface TradingStyle {
  key: string;
  name: string;
  tagline: string; // one-liner for the dropdown
  philosophy: string; // injected into the proposal prompt
}

export const TRADING_STYLES: Record<string, TradingStyle> = {
  buffett: {
    key: 'buffett',
    name: 'Warren Buffett',
    tagline: 'Wonderful businesses at fair prices, held for the long term',
    philosophy: `Buy great businesses at fair prices and hold for the long term. Demand durable competitive moats, predictable owner-earnings, strong returns on capital, and trustworthy management. Insist on a margin of safety. Avoid leverage, hype, and complexity outside your circle of competence. Low turnover — only act on high-conviction, well-understood theses. Be fearful when others are greedy and greedy when others are fearful. Prefer fewer, larger positions in quality over many speculative ones.`,
  },
  munger: {
    key: 'munger',
    name: 'Charlie Munger',
    tagline: 'A few wonderful businesses, extreme patience, avoid stupidity',
    philosophy: `Concentrate in a very small number of wonderful businesses with durable moats and high returns on capital. Quality dwarfs cheapness. Patience is a weapon — inactivity is a valid and frequent choice; it is fine to reject everything and wait. Avoid stupidity rather than seek brilliance: sidestep obvious errors, fragile balance sheets, and anything outside the circle of competence. Invert — ask what would make this trade fail. Size up only on exceptional, well-understood opportunities and hold for years.`,
  },
  soros: {
    key: 'soros',
    name: 'George Soros',
    tagline: 'Reflexivity, asymmetric bets, size up when right and cut fast when wrong',
    philosophy: `Trade reflexivity: market prices shape the fundamentals that in turn shape prices, creating self-reinforcing feedback loops. Hunt inflection points where perception and reality diverge. It's not whether you're right or wrong, but how much you make when right and how little you lose when wrong — so press hard on high-conviction asymmetric setups and cut losers immediately. Be willing to be contrarian or trend-following depending on the reflexive setup. Capital preservation first, then aggressive sizing when the edge is clear.`,
  },
  druckenmiller: {
    key: 'druckenmiller',
    name: 'Stanley Druckenmiller',
    tagline: 'Concentrated high-conviction bets, ride winners, macro + liquidity',
    philosophy: `Make concentrated, high-conviction bets with asymmetric risk/reward. Preserve capital relentlessly, then bet big when the setup is exceptional — position sizing is the whole game. Liquidity and the macro regime drive everything; respect the tape. Cut losers fast and without ego; ride winners far harder than feels comfortable. It's not about how often you're right, it's about how much you make when you are. Avoid mediocre setups entirely — wait for the fat pitch.`,
  },
  lynch: {
    key: 'lynch',
    name: 'Peter Lynch',
    tagline: 'Invest in what you understand; growth at a reasonable price',
    philosophy: `Invest in what you understand. Favor growth at a reasonable price (GARP): fast-growing companies with strong, accelerating earnings and a sane PEG ratio. Know the story behind every position and what would break it. Tolerate volatility in pursuit of multibaggers, but avoid businesses you can't explain simply. Categorize the thesis (fast grower, stalwart, turnaround, cyclical) and size accordingly. Do the homework; conviction comes from understanding, not tips.`,
  },
  wood: {
    key: 'wood',
    name: 'Cathie Wood',
    tagline: 'Disruptive innovation, long-duration secular growth',
    philosophy: `Concentrate in disruptive innovation — platform shifts and exponential technologies with long-duration secular growth (5+ year horizons). Accept high volatility and deep drawdowns as the cost of owning the winners of a technological wave. Conviction is in the trajectory, not the quarter. Add on weakness when the long-term thesis is intact. Reject incrementalism and legacy businesses being disrupted. Think in terms of total addressable market and adoption curves.`,
  },
  burry: {
    key: 'burry',
    name: 'Michael Burry',
    tagline: 'Deep value, contrarian, asymmetric downside protection',
    philosophy: `Deep value and contrarian. Hunt mispriced assets the consensus has ignored or hated, and demand a hard margin of safety with asymmetric downside protection. Be willing to bet against bubbles and crowded trades when the math is undeniable. Rigorous, skeptical, balance-sheet first. Ignore narrative and price momentum; anchor to intrinsic value. Patience and conviction through pain — the thesis plays out on its timeline, not the market's.`,
  },
};

export const STYLE_OPTIONS = Object.values(TRADING_STYLES).map((s) => ({
  key: s.key,
  name: s.name,
  tagline: s.tagline,
}));

export function getTradingStyle(key: string | null | undefined): TradingStyle | null {
  if (!key) return null;
  return TRADING_STYLES[key] || null;
}
