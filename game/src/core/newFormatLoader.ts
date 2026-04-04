// Loader for the folder-based story format (mods/stories/*/game_story.yaml)
// Converts new schema → GameStory shape expected by CardGame.tsx

// ── Shared label/color hints ──────────────────────────────────────────────────

const VAR_LABELS: Record<string, string> = {
  health: '生命值', money: '金钱', radiation: '辐射', research_progress: '研究进度',
  insight: '洞见', faith: '信念', food: '食物', epidemic: '疫情', status: '状态',
};

const VAR_COLORS: Record<string, string> = {
  health: '#52c41a', money: '#faad14', radiation: '#f5222d', research_progress: '#1677ff',
  insight: '#722ed1', faith: '#1677ff', food: '#faad14', epidemic: '#f5222d',
};

const COLOR_POOL = ['#52c41a', '#1677ff', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96'];

// ── API helper ────────────────────────────────────────────────────────────────

async function fetchParsed(relPath: string): Promise<any> {
  const r = await fetch(`/api/file/${relPath}`);
  if (!r.ok) throw new Error(`Failed to fetch ${relPath}: HTTP ${r.status}`);
  const d = await r.json();
  if (!d.success) throw new Error(`API error for ${relPath}: ${d.error}`);
  return d.data?.content;
}

// ── Card converters ───────────────────────────────────────────────────────────

function convertEffects(effects: any[]): Array<{ variable: string; delta: number }> {
  return (effects ?? []).map((e: any) => ({
    variable: e.target ?? e.variable,
    delta: Number(e.delta ?? e.value ?? 0),
  }));
}

function toPlayerCard(raw: any) {
  return {
    id: raw.id,
    name: raw.display?.name ?? raw.name ?? raw.id,
    type: raw.channel ?? raw.category ?? 'medical',
    cost: raw.cost ?? 1,
    emoji: raw.display?.icon ?? '🃏',
    flavor: raw.display?.flavor ?? raw.display?.description,
    effects: convertEffects(raw.effects),
    // undefined / 0 = instant spell; -1 = permanent; N > 0 = countdown turns
    duration: raw.duration !== undefined ? Number(raw.duration) : undefined,
  };
}

function toEnvCard(raw: any, probability: number) {
  return {
    id: raw.id,
    name: raw.display?.name ?? raw.name ?? raw.id,
    emoji: raw.display?.icon ?? '🌍',
    description: raw.display?.description ?? '',
    science: raw.display?.flavor,
    always_active: raw.always_active ?? false,
    condition: raw.condition && raw.condition !== 'null' ? raw.condition : undefined,
    probability: raw.always_active ? undefined : probability,
    effects: convertEffects(raw.effects),
  };
}

// ── Win / lose condition builders ─────────────────────────────────────────────

function buildConditions(raw: any) {
  const wins: Array<{ condition: string; message: string }> = [];
  const loses: Array<{ condition: string; message: string }> = [];

  // Prefer structured endings (grade S/A = win, D/F = lose)
  if (Array.isArray(raw.endings)) {
    for (const e of raw.endings) {
      const cond = e.condition?.replace(/\band\b/gi, '&&').replace(/\bor\b/gi, '||') ?? '';
      const msg = `【${e.title ?? e.grade}】${e.description ?? ''}`;
      if (e.grade === 'D' || e.grade === 'F') {
        loses.push({ condition: cond, message: msg });
      } else {
        wins.push({ condition: cond, message: msg });
      }
    }
  }

  // Fallback to simple win_condition / lose_condition blocks
  if (wins.length === 0 && raw.win_condition) {
    const wc = raw.win_condition;
    if (wc.type === 'reach_target') {
      wins.push({ condition: `${wc.target_variable} >= ${wc.target_value}`, message: wc.description ?? '目标达成！' });
    }
  }

  if (loses.length === 0) {
    const lc = raw.lose_condition;
    const msg = lc?.description ?? '生命值归零。';
    loses.push({ condition: 'health <= 0', message: msg });
  }

  return { wins, loses };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Loads a new-format story (game_story.yaml + cards/) and returns
 * a GameStory object compatible with CardGame.tsx.
 *
 * @param cleanPath  Path relative to mods/, e.g. "stories/marie_curie/game_story.yaml"
 * @param rawStory   Already-parsed game_story.yaml content (from the first /api/file/ call)
 */
export async function loadNewFormatStory(cleanPath: string, rawStory: any): Promise<any> {
  const storyDir = cleanPath.replace(/\/game_story\.ya?ml$/, '');

  // ── Load player cards ───────────────────────────────────────────────────────
  const playerCards: any[] = [];
  for (const entry of rawStory.player_deck ?? []) {
    const cardRelPath = `${storyDir}/${entry.path ?? entry}`;
    const card = await fetchParsed(cardRelPath);
    playerCards.push(toPlayerCard(card));
  }

  // ── Load env cards ──────────────────────────────────────────────────────────
  const envEntries: Array<{ raw: any; weight: number }> = [];
  for (const entry of rawStory.env_deck ?? []) {
    const cardRelPath = `${storyDir}/${entry.path ?? entry}`;
    const card = await fetchParsed(cardRelPath);
    envEntries.push({ raw: card, weight: entry.weight ?? 100 });
  }

  const totalWeight = envEntries.reduce((s, e) => s + e.weight, 0);
  const perTurn = rawStory.turns?.env_cards_per_turn ?? 2;
  const envCards = envEntries.map(({ raw, weight }) => {
    const prob = totalWeight > 0 ? Math.min(1, (weight / totalWeight) * perTurn) : 0.5;
    return toEnvCard(raw, Math.round(prob * 100) / 100);
  });

  // ── Build variables from initial_state ─────────────────────────────────────
  const initState: Record<string, number> = rawStory.initial_state ?? {};
  // variable_display provides per-story overrides for label/color/max
  const varDisplay: Record<string, any> = rawStory.variable_display ?? {};
  const variables: Record<string, any> = {};
  let colorIdx = 0;
  for (const [key, value] of Object.entries(initState)) {
    const disp = varDisplay[key] ?? {};
    variables[key] = {
      label: disp.label ?? VAR_LABELS[key] ?? key,
      value: Number(value),
      max:   disp.max   ?? 100,
      color: disp.color ?? VAR_COLORS[key] ?? COLOR_POOL[colorIdx++ % COLOR_POOL.length],
    };
  }
  // Apply health_mapping display override (takes priority over variable_display)
  if (rawStory.health_mapping?.display && variables[rawStory.health_mapping.source_variable]) {
    variables[rawStory.health_mapping.source_variable].label = rawStory.health_mapping.display;
  }

  // ── Win / lose ──────────────────────────────────────────────────────────────
  const { wins, loses } = buildConditions(rawStory);

  // ── Extract goal variables (win-condition targets) ─────────────────────────
  const goalVariables: string[] = [];
  if (rawStory.win_condition?.type === 'reach_target' && rawStory.win_condition?.target_variable) {
    goalVariables.push(rawStory.win_condition.target_variable);
  }

  // ── Assemble GameStory ──────────────────────────────────────────────────────
  return {
    meta: {
      id: cleanPath,
      name: rawStory.meta?.name ?? '',
      period: rawStory.meta?.period ?? '',
      location: rawStory.meta?.location ?? '',
      description: rawStory.meta?.description ?? '',
      science_note: rawStory.meta?.science_note,
      tags: rawStory.meta?.tags ?? [],
    },
    variables,
    goalVariables,
    game: {
      ap_per_turn: rawStory.turns?.action_points ?? 3,
      max_turns: rawStory.turns?.total ?? 15,
      hand_size: rawStory.turns?.player_hand_size ?? 5,
      env_per_turn: rawStory.turns?.env_cards_per_turn ?? 2,
    },
    lose_conditions: loses,
    win_conditions: wins,
    player_cards: playerCards,
    environment_cards: envCards,
  };
}

