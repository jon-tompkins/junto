// LLM-written lessons/theses sometimes invent hard rules that are not in the
// mandate (e.g. a "48-hour rule" that forces a close on "Day 2"). Once a rule
// appears in a thesis or lesson it gets copied forward and reinforced. This
// guard is appended to every trading prompt that sees learnings/theses.
export const NO_INVENTED_RULES = `

RULES ARE ONLY WHAT THE MANDATE GUIDELINES SAY. Do not invent or enforce time-based rules (e.g. "48-hour rule", "close EOD Day 2", "max hold N days") unless the guidelines above state one explicitly. Lessons, theses and journal notes that claim such a rule are wrong — ignore them and do not repeat them. A position's age is only what its held= / entry timestamp says, in hours; do not count calendar days.`;
