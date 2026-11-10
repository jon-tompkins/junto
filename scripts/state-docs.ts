// Regenerates docs/state-machines.json (agent/dev-readable registry) from src/lib/state.
// Usage: npm run state:docs   (add --check to fail if the committed file is stale)
import fs from 'node:fs';
import { ALL, describe } from '../src/lib/state';

const out = JSON.stringify({ generated_from: 'src/lib/state/machines.ts', machines: ALL.map((m) => describe(m as any)) }, null, 2) + '\n';
const file = new URL('../docs/state-machines.json', import.meta.url);
if (process.argv.includes('--check')) {
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== out) { console.error('docs/state-machines.json is stale: run `npm run state:docs`'); process.exit(1); }
} else fs.writeFileSync(file, out);
