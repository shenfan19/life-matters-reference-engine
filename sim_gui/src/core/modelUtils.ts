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
