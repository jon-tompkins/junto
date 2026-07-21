## Verdict: GO on extractor, BLOCKED on data sourcing

Question: can junto extract VC-style entity-events from recent source content strongly enough to synthesize a non-trading dispatch?

Evidence: reran the exact spike input (42 real tweets from 12 Crypto VC Radar sources, 7-day window) through a live Claude Opus pass using `run.ts`'s production system prompt and schema (`model-events.json`), and compared it head-to-head against the earlier heuristic fallback (`events.json`).

What the model pass proved:
- **Precision is the win.** The heuristic emitted 4 "events", and all 4 were false positives: it tagged token-drawdown market stats as `exit`s (cryptorank_io) and turned a wheat-contract Alvin Roth quote into "a16zcrypto expressed a deployment thesis around hiring me". The Opus pass correctly rejected every one of those non-events.
- The model returned only the 2 genuinely explicit events in the window — both Network School capital-allocation moves (Kazakhstan MOU signed; Malaysia 500M+ MYR expansion put on hold) — with clean entity/counterparty/evidence fields and no invented amounts. Its vague-post failure mode is the desired one.
- So the LLM extractor quality itself is settled: it produces a clean, low-noise entity-event feed that renders a credible founder-facing dispatch. Wiring the sibling extractor into production is a GO.

What actually blocks the dispatch:
- **The source roster is the problem, not the extractor.** This "Crypto VC Radar" window was ~95% market data, whale-watching, macro takes, and football — only 2 of 42 posts were real deal/allocation events, and zero were classic fundraise / fund_launch / hire. A high-quality extractor over a low-deal-flow roster still yields a thin dispatch.
- Confirms the standing note: VC Radar stays thesis/commentary-flavored until deal-flow sources are pulled in. The next lever is source curation (fundraise-announcement accounts, fund press, syndicate feeds), not extractor tuning.

Recommendation: ship the LLM sibling extractor to production as-is (precision validated), but gate the dispatch's "GO live" on adding real deal-flow sources to the roster. Do not judge extraction quality by event count on the current roster — the ceiling there is set by the inputs.

### Edge case
- A vague momentum post produces no events, which is the desired failure mode — and on this real roster the model held that line across dozens of borderline market-commentary posts, not just the synthetic probe.

### Note on this run
- This box exposes Claude via the Claude Code / OpenClaw runtime (OAuth), not a raw `ANTHROPIC_API_KEY`, so `run.ts`'s SDK path still falls back to heuristic when executed standalone. The model pass above was performed with the same prompt/schema through the available Opus runtime; to reproduce inside `run.ts` unattended, inject an `ANTHROPIC_API_KEY` into the repo process env.
