import yaml from 'js-yaml';

export interface ThesisCriterionDraft {
  id: string;
  description: string;
  type: string;
  timeframe?: string;
  weight?: 'high' | 'medium' | 'low';
  threshold?: string;
  check?: string;
}

export interface ThesisTradeDraft {
  id: string;
  symbol: string;
  venue?: string;
  name?: string;
  type?: string;
  role?: string;
  rationale?: string;
  entry?: {
    zone_low?: string;
    zone_high?: string;
    conditions?: string;
  };
  exit?: {
    target?: string;
    stop?: string;
    timeframe?: string;
  };
  sizing?: string;
  structure?: string;
}

export interface ThesisSourceDraft {
  type: string;
  ref: string;
  date?: string;
}

export interface ThesisFrontmatter {
  id?: string;
  title: string;
  created?: string;
  updated?: string;
  conviction: number;
  status?: string;
  tags?: string[];
  horizon?: string;
  visibility?: string;
  sources?: ThesisSourceDraft[];
  thesis: string;
  mechanism?: string;
  validation_criteria?: ThesisCriterionDraft[];
  invalidation_criteria?: ThesisCriterionDraft[];
  trades?: ThesisTradeDraft[];
  risks?: string[];
  related_theses?: string[];
  notes?: string;
}

export interface ParsedThesis {
  frontmatter: ThesisFrontmatter;
  body: string;
  raw: string;
}

/**
 * Extract a fenced markdown block from an LLM response.
 * The expected format is ```...``` containing the full thesis file.
 * Falls back to the raw text if no fence is found.
 */
function extractFencedBlock(text: string): string {
  // Match ``` or ```yaml or ```markdown fences
  const fenceMatch = text.match(/```(?:yaml|markdown|md)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) return fenceMatch[1];
  return text.trim();
}

/**
 * Parse a thesis file containing YAML frontmatter (between --- markers) + body.
 */
export function parseThesisFile(raw: string): ParsedThesis {
  const cleaned = extractFencedBlock(raw);

  // Match --- ... --- frontmatter block followed by body
  const fmMatch = cleaned.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error('Could not find YAML frontmatter delimited by --- markers.');
  }

  const [, yamlText, body] = fmMatch;

  let frontmatter: ThesisFrontmatter;
  try {
    frontmatter = yaml.load(yamlText) as ThesisFrontmatter;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown YAML parse error';
    throw new Error(`YAML parse failed: ${msg}`);
  }

  // Basic validation
  if (!frontmatter || typeof frontmatter !== 'object') {
    throw new Error('Frontmatter parsed to non-object');
  }
  if (!frontmatter.title) throw new Error('Frontmatter missing required field: title');
  if (!frontmatter.thesis) throw new Error('Frontmatter missing required field: thesis');
  if (typeof frontmatter.conviction !== 'number' || frontmatter.conviction < 1 || frontmatter.conviction > 5) {
    throw new Error('Frontmatter conviction must be a number 1-5');
  }

  return {
    frontmatter,
    body: body.trim(),
    raw: cleaned,
  };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}
