// game/src/core/fetchYaml.ts
// Fetch a YAML file from /stories/ and parse it client-side.
// cleanPath is relative to mods/, e.g. "stories/marie_curie/game_story.yaml"

import yaml from 'js-yaml';

export async function fetchYaml(cleanPath: string): Promise<any> {
  const res = await fetch(`/${cleanPath}`);
  if (!res.ok) throw new Error(`Failed to fetch ${cleanPath}: HTTP ${res.status}`);
  const text = await res.text();
  return yaml.load(text);
}
