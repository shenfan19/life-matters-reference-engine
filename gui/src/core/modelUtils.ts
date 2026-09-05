const DESCRIPTION_LABELS: Record<string, string> = {
  brief: 'Brief', need: 'Need', problem: 'Problem', method: 'Method',
  simulation: 'Simulation', optimization: 'Optimization', result: 'Result',
  conclusion: 'Conclusion', limitations: 'Limitations', usage: 'Usage',
};

function descriptionLabel(key: string): string {
  return DESCRIPTION_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

export function getDescriptionSections(description: any): Array<{ key: string; label: string; text: string }> {
  if (!description) return [];
  if (typeof description === 'string') {
    const text = description.trim();
    return text ? [{ key: 'brief', label: 'Brief', text }] : [];
  }
  if (typeof description !== 'object') return [];
  return Object.entries(description)
    .filter(([, value]) => value != null && String(value).trim())
    .map(([key, value]) => ({ key, label: descriptionLabel(key), text: String(value).trim() }));
}

export function descriptionText(description: any): string {
  return getDescriptionSections(description).map(s => s.text).join('\n\n');
}

export function descriptionSummary(description: any): string {
  const sections = getDescriptionSections(description);
  return sections.find(s => s.key === 'brief')?.text || sections[0]?.text || '';
}

export interface RefEntry { citation: string; description?: string }

export function getModelReferences(content: any): RefEntry[] {
  const refs = content?.references;
  if (!Array.isArray(refs)) return [];
  return refs
    .map((r: any): RefEntry => (typeof r === 'string' ? { citation: r } : { citation: r?.citation ?? '', description: r?.description }))
    .sort((a: RefEntry, b: RefEntry) => a.citation.localeCompare(b.citation));
}

export interface ParsedRating { score: number; note: string }

export function parseRating(raw: unknown): ParsedRating {
  const str = String(raw ?? '');
  const m = str.match(/^(-?\d*\.?\d+)/);
  const score = m ? Math.max(0, Math.min(1, parseFloat(m[1]))) : 0;
  const note = str.replace(/^-?\d*\.?\d+\s*-\s*/, '');
  return { score, note };
}

export interface ParsedReviewed { reviewed: boolean; note: string }

export function parseReviewed(raw: unknown): ParsedReviewed {
  // Absent field defaults to reviewed: only an explicit `false - ...` line marks a model unreviewed.
  if (raw == null) return { reviewed: true, note: '' };
  const str = String(raw);
  const m = str.match(/^(true|false)/i);
  const reviewed = m ? m[1].toLowerCase() === 'true' : Boolean(raw);
  const note = str.replace(/^(true|false)\s*-?\s*/i, '');
  return { reviewed, note };
}

const RATING_MAX_STARS = 4; // 4 stars makes each of the five anchors 0/0.25/0.5/0.75/1.0 map to a whole star count, never a half star

export function ratingStars(score: number): string {
  const halfSteps = Math.round(score * RATING_MAX_STARS * 2) / 2;
  const full = Math.floor(halfSteps);
  const half = halfSteps - full >= 0.5 ? 1 : 0;
  const empty = RATING_MAX_STARS - full - half;
  return '●'.repeat(full) + (half ? '◐' : '') + '○'.repeat(empty);
}
