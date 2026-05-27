import { getAnthropic, HAIKU_MODEL } from '@/lib/synthesis/client';

// Convert a markdown dispatch into plain prose suitable for TTS.
// Expands cashtags, strips formatting, conversational tone.
export async function dispatchToAudioScript(args: {
  subject: string;
  markdown: string;
  displayName: string | null;
  dateLabel: string;
}): Promise<{ script: string; usage: { input_tokens: number; output_tokens: number } | null }> {
  const { subject, markdown, displayName, dateLabel } = args;

  const prompt = `Rewrite this written intelligence brief as a 3-5 minute conversational audio script for ${displayName || 'the listener'}, dated ${dateLabel}.

RULES:
- No markdown, no headers, no bullets. Flowing prose with natural paragraph breaks.
- Expand cashtags into spoken form by spelling the letters: $BB → "B B", $LPTH → "L P T H", $ABCL → "A B C L", $TSLA → "T S L A". NEVER substitute a company name for a ticker — even if you think you recognize it, you might be wrong (e.g. $ABCL is Abcellera, not Abercrombie). Always spell. The one exception: well-known single-letter tickers can stay as the letter ($V → "V", $F → "F").
- Expand @handles to "at handle" (e.g. @crypto_condom → "at crypto condom").
- Open with a brief greeting that includes the day ("Tuesday morning brief — here's what your sources are watching today"). Don't read the subject line verbatim.
- Use signposts like "First up", "On the watchlist side", "One more thing" to transition between sections.
- End with a short sign-off.
- Keep it tight and skimmable by ear. Cut filler.
- Don't editorialize beyond what the source brief says.

Original subject: ${subject}

BRIEF:
${markdown}

Return only the audio script, nothing else.`;

  const resp = await getAnthropic().messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const script = resp.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();

  const usage = resp.usage
    ? { input_tokens: resp.usage.input_tokens, output_tokens: resp.usage.output_tokens }
    : null;

  return { script, usage };
}
