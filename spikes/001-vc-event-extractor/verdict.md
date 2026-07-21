## Verdict: PARTIAL

Question: can junto extract VC-style entity-events from recent source content strongly enough to synthesize a non-trading dispatch?
Evidence: `npx tsx spikes/001-vc-event-extractor/run.ts` (heuristic mode) sampled 42 tweets from 12 sources, extracted 4 raw events, and deduped them into 3 structured events. Edge-case probe returned 0 events for a vague "venture is back" post.
What worked: real source content produced the intended event taxonomy (fundraise / fund_launch / hire / exit / stance), and the aggregated feed was clean enough to render a founder-facing sample dispatch without falling back to tickers.
What failed or surprised us: this box did not expose `ANTHROPIC_API_KEY`, so the spike validated the data shape with a deterministic fallback extractor rather than the intended LLM-based sibling extractor.
Recommendation: wire the same sibling extractor into production next, but rerun this exact spike with Anthropic creds before treating extraction quality as settled. The data model is promising; the LLM quality still needs a clean live pass.

### Edge case
- A vague momentum post produced no events, which is the desired failure mode.