// LLM-written lessons/theses sometimes invent hard rules that are not in the
// mandate (e.g. a "48-hour rule" that forces a close on "Day 2"). Once a rule
// appears in a thesis or lesson it gets copied forward and reinforced. This
// guard is appended to every trading prompt that sees learnings/theses.
export const NO_INVENTED_RULES = `

RULES ARE ONLY WHAT THE MANDATE GUIDELINES SAY. Time-based exits (the staleness limit) are enforced by the engine itself at the exact limit — never propose, announce, schedule or pre-empt a time-based close yourself, and never write "close EOD Day N" or similar into a thesis. Lessons, theses and journal notes that claim you must close at some time are wrong — ignore them. A position's age is only what its held= / entry timestamp says, in hours; do not count calendar days.`;
