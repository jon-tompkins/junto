# VC Event Extractor Spike

Question: can junto turn recent VC-focused source content into structured `entity-event` records that are good enough to synthesize a founder/investor dispatch?

Artifact:
- `run.ts` pulls real recent tweets from the live VC newsletters/source rosters, extracts events with a VC taxonomy, aggregates duplicates, and writes outputs beside this README.

Run:

```bash
cd /home/ubuntu/.openclaw/workspace/repos/junto
npx tsx spikes/001-vc-event-extractor/run.ts
```

Outputs:
- `sampled-tweets.json` — the ranked real-input tweet sample sent to the extractor
- `events.json` — raw extracted events
- `aggregated-events.json` — deduped event feed
- `sample-dispatch.md` — quick synthesized dispatch built from the structured events
- `verdict.md` — spike verdict in the required format

Notes:
- This is intentionally a repo-local spike, not production code.
- It reuses the live Supabase + Anthropic config from the repo environment.
- The extractor is a sibling concept to `src/lib/trading/extract.ts`; it does not touch the trading path.
