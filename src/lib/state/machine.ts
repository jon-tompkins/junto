// Tiny, dependency-free state-machine registry.
//
// Why: myjunto has a dozen status columns whose legal values/transitions used to
// live only as scattered string literals + SQL CHECKs. Each machine is now declared
// ONCE here (states, initial, terminal, allowed transitions, owners). That single
// declaration drives:
//   UX  – consistent labels/ordering for status badges (see `label`)
//   DX  – typed unions, `checkTransition` in tests/guards, docs/state-machines.json
//   AX  – agents can read docs/state-machines.json (or `describeAll()`) to know what
//         is legal before they poke a status, instead of grepping the codebase.
//
// Enforcement is deliberately WARN-ONLY by default (see `guardTransition`): production
// behaviour is unchanged; illegal transitions are logged as `[state] ...` so we learn
// the real graph before tightening to throw. Set STATE_MACHINE_STRICT=1 to throw.

export interface MachineSpec<S extends string> {
  /** Stable id, e.g. "trade". */
  name: string;
  /** Where the state lives, e.g. "trades.status". */
  storage: string;
  states: readonly S[];
  initial: S;
  /** Extra states a row may be CREATED in (besides `initial`). */
  entries?: readonly S[];
  terminal: readonly S[];
  /** from -> allowed next states. Every state must appear as a key. */
  transitions: { readonly [K in S]: readonly S[] };
  /** Human label per state (UI badges, Telegram, agent summaries). */
  label?: { readonly [K in S]?: string };
  /** Who/what is allowed to drive transitions (free text, for docs). */
  writers?: readonly string[];
  notes?: string;
}

export type Machine<S extends string> = Readonly<MachineSpec<S>>;

export function defineMachine<S extends string>(spec: MachineSpec<S>): Machine<S> {
  const set = new Set<string>(spec.states);
  for (const s of spec.states) {
    if (!(s in spec.transitions)) throw new Error(`[state:${spec.name}] missing transitions entry for "${s}"`);
    for (const t of spec.transitions[s]) {
      if (!set.has(t)) throw new Error(`[state:${spec.name}] "${s}" -> unknown state "${t}"`);
    }
  }
  if (!set.has(spec.initial)) throw new Error(`[state:${spec.name}] unknown initial "${spec.initial}"`);
  for (const t of spec.terminal) {
    if (spec.transitions[t as S].length) throw new Error(`[state:${spec.name}] terminal "${t}" has outgoing transitions`);
  }
  return Object.freeze(spec);
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

export function checkTransition<S extends string>(m: Machine<S>, from: S | null | undefined, to: S): TransitionCheck {
  if (from == null) return to === m.initial || m.entries?.includes(to) ? { ok: true } : { ok: false, reason: `new ${m.name} must start at "${m.initial}", got "${to}"` };
  if (!(m.states as readonly string[]).includes(from)) return { ok: false, reason: `unknown ${m.name} state "${from}"` };
  if (from === to) return { ok: true }; // idempotent re-write
  return m.transitions[from].includes(to)
    ? { ok: true }
    : { ok: false, reason: `illegal ${m.name} transition "${from}" -> "${to}" (allowed: ${m.transitions[from].join(', ') || 'none, terminal'})` };
}

export function canTransition<S extends string>(m: Machine<S>, from: S | null | undefined, to: S): boolean {
  return checkTransition(m, from, to).ok;
}

export function isTerminal<S extends string>(m: Machine<S>, s: S): boolean {
  return (m.terminal as readonly string[]).includes(s);
}

/** Next states an actor may move to (drives "what can I do?" UI buttons and agent prompts). */
export function nextStates<S extends string>(m: Machine<S>, from: S): readonly S[] {
  return m.transitions[from] ?? [];
}

/**
 * Warn-only guard. Returns the check result; logs `[state] ...` on violation and
 * throws only when STATE_MACHINE_STRICT=1. Safe to call from hot paths.
 */
export function guardTransition<S extends string>(m: Machine<S>, from: S | null | undefined, to: S, ctx?: string): TransitionCheck {
  const r = checkTransition(m, from, to);
  if (!r.ok) {
    const msg = `[state] ${r.reason}${ctx ? ` (${ctx})` : ''}`;
    if (process.env.STATE_MACHINE_STRICT === '1') throw new Error(msg);
    console.warn(msg);
  }
  return r;
}

export function describe<S extends string>(m: Machine<S>) {
  return {
    name: m.name, storage: m.storage, initial: m.initial, entries: m.entries ?? [], terminal: m.terminal,
    states: m.states.map((s) => ({ id: s, label: m.label?.[s] ?? s, next: m.transitions[s] })),
    writers: m.writers ?? [], notes: m.notes ?? '',
  };
}
