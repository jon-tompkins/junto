# Dispatch Proposals: Crypto-VC-Activity & Macro (Jul 14 2026)

Two new non-ticker-centric dispatch types + the mechanics to support "topics without tickers."

## Current config primitives (what we have to work with)
- `newsletters_v2.prompt` — system prompt (voice + output FORMAT). Falls back to `prompt_template_id` or default `NEWSLETTER_SYSTEM_PROMPT`.
- `newsletters_v2.secondary_prompt` — free-form **topical scope / hard filter** (already used pre-source-selection in generator-v2.ts:129-139). Off-scope content dropped even if high-engagement.
- `newsletter_sources` — attached sources (twitter/youtube/newsletter). Each source has a living `source_analyst_profiles` row (summary + positions JSONB).
- `watchlist_id` — pins a ticker set; matching content gets **2.5x engagement uprank** (generator-v2.ts:98-107). Cashtag-only.
- `newsletter_labels` — discovery tags only (crypto/macro/etc.), NOT fed to synthesis.
- Ticker extraction — regex `\$([A-Z]{1,6})` on generated output → `newsletter_runs.tickers`.
- Model: Haiku, 350-word hedge-fund-brief format, 48h recent + 7d context window.

## The core gap: everything is cashtag-shaped
Uprank, extraction, and watchlists all key on `$TICKER`. Crypto-VC ("a16z led a $40M round in X", "Paradigm hiring") and macro ("Fed on hold, dot plot shifts") are **entity/keyword-shaped**, not ticker-shaped. Two ways to close it:

### Path A — ship now, zero schema change
Use `secondary_prompt` as the scope engine + tight source curation + a tailored prompt template. Good enough to launch both dispatches this week. Topics are handled purely by (a) which sources are attached and (b) the scope filter text.

### Path B — the real unlock (small schema change)
Generalize the uprank from cashtags to **watch terms**. Add `newsletters_v2.watch_terms TEXT[]` (or a `keyword_watchlists` table mirroring watchlists). In `engagementScore()`, if any watch term (case-insensitive substring / word-boundary) appears in content, apply the same 2.5x boost. Now "a16z", "Paradigm", "FOMC", "rate cut", "Series A" become first-class upranked entities — no ticker required. Also extend post-hoc extraction to tag runs with matched entities for the same `@>` discovery queries we do for tickers. ~half a day of work, reuses all existing plumbing.

Recommendation: launch on Path A, ship Path B within the same sprint since it's what makes topic dispatches actually good.

---

## Prompt architecture (how to layer prompts / sub-prompts)
Keep three distinct layers — don't cram scope into the system prompt:
1. **System prompt (template)** = voice + OUTPUT FORMAT. Create two new `prompt_templates`:
   - **"Macro Desk"** sections: `Tape` (cross-asset 1-liner) / `Rates & Fed` / `Data & Events` / `Positioning` / `Watch` (calendar) / `Sources`.
   - **"Crypto VC Flow"** sections: `Flow` (what got funded) / `Active Funds` (who's deploying) / `New Launches` / `People Moves` / `Token Watch` (liquid proxies) / `Sources`.
   Both drop the mandatory `$TICKER Calls` block that the default brief forces (wrong shape for these).
2. **secondary_prompt** = the scope filter + explicit include/exclude list. This is the sub-prompt. Example (macro): "IN: FOMC, Fed speakers, CPI/PCE/NFP, yields, DXY, credit spreads, global central banks. OUT: single-stock earnings, crypto price action, memecoins."
3. **watch_terms (Path B)** = the entities to uprank. Not prose — a list. Macro: FOMC, dot plot, rate cut, QT, CPI, PCE, jobless claims, Powell, ECB, BoJ. VC: a16z, Paradigm, Sequoia, Coinbase Ventures, Series A/B, seed, raised, led the round.

## Watchlist integration
- **Macro**: pin a watchlist of macro proxies → TLT, IEF, ^TNX, DXY, VIX, GLD, HYG, USO. Gives the model concrete levels to anchor to and auto-tags runs.
- **Crypto VC**: pin liquid proxies → SOL, ETH, BTC, COIN, HOOD, plus L1/L2 tokens of ecosystems VCs are funding. Pair with Path-B watch_terms for the fund/round entities.
- Watchlists stay ticker-only; watch_terms cover the rest. Two complementary uprank channels.

## Suggested source sets (starting rosters — curate/trim after first runs)
**Crypto VC activity:**
- Funds/curators: @a16zcrypto, @paradigm, @cdixon, @DelphiDigital, @MessariCrypto, @DefiLlama (raises), @CryptoRank_io (funding tracker), @tier10k, @lookonchain, @arkham
- Builders/founders signal deploys before press: @haydenzadams, @dabit3, ecosystem leads
- Newsletters: The Block research, Messari, Delphi

**Macro:**
- Fed whisperer + data: @NickTimiraos (WSJ), @GregDaco, @LizAnnSonders, @RobinBrooksIIF, @jsblokland
- Macro strategists: @MacroAlf (Alfonso Peccatiello), @biancoresearch, @SoberLook, @concodanomics, @DiMartinoBooth
- Wire/calendar: @business (Bloomberg), @firstsquawk, @LiveSquawk

Sources are the highest-leverage lever here — the scope filter only works if the roster is right. Recommend seeding ~12-15 each, then pruning by which handles actually drive cited signal after a week.

## Handling topics in the absence of tickers (summary)
1. Scope via `secondary_prompt` include/exclude (Path A, immediate).
2. Uprank via `watch_terms` keyword match reusing the 2.5x boost (Path B).
3. Tag runs with matched entities (extend ticker-extraction) for cross-dispatch discovery / entity pages ("everything mentioning a16z this week") — the same programmatic-SEO surface we want for tickers, now for funds/themes.
4. Lean on `source_analyst_profiles` — for macro/VC the *stance of the source* ("MacroAlf: leaning dovish since Jun") is often the signal, more than any ticker.

## Rollout
1. Create 2 prompt_templates (Macro Desk, Crypto VC Flow).
2. Create 2 newsletters_v2 rows (public), attach source rosters, set secondary_prompt scope, pin watchlists.
3. Ship Path B watch_terms + uprank + entity tagging.
4. Run daily for a week, prune sources, tune scope. Add entity discovery pages.
