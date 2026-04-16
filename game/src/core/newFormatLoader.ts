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

// ── Fetch helper ──────────────────────────────────────────────────────────────

import { fetchYaml } from './fetchYaml';

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

function toEnvCard(raw: any) {
  return {
    id: raw.id,
    name: raw.display?.name ?? raw.name ?? raw.id,
    emoji: raw.display?.icon ?? '🌍',
    description: raw.display?.description ?? '',
    science: raw.display?.flavor,
    always_active: raw.always_active ?? false,
    condition: raw.condition && raw.condition !== 'null' ? raw.condition : undefined,
    // probability only from explicit YAML field — weight affects draw frequency, not trigger chance
    probability: raw.always_active ? undefined : (raw.probability ?? undefined),
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

  // ── Load player cards (supports copies: N for deck duplication) ────────────
  const playerCards: any[] = [];
  for (const entry of rawStory.player_deck ?? []) {
    const cardRelPath = `${storyDir}/${entry.path ?? entry}`;
    const card = await fetchYaml(cardRelPath);
    const copies = entry.copies ?? 1;
    const base = toPlayerCard(card);
    for (let i = 0; i < copies; i++) {
      playerCards.push(copies > 1 ? { ...base, id: `${base.id}_${i + 1}` } : base);
    }
  }

  // ── Load env cards ──────────────────────────────────────────────────────────
  const envEntries: Array<{ raw: any; weight: number }> = [];
  for (const entry of rawStory.env_deck ?? []) {
    const cardRelPath = `${storyDir}/${entry.path ?? entry}`;
    const card = await fetchYaml(cardRelPath);
    envEntries.push({ raw: card, weight: entry.weight ?? 100 });
  }

  const totalWeight = envEntries.reduce((s, e) => s + e.weight, 0);
  const perTurn = rawStory.turns?.env_cards_per_turn ?? 2;
  const envCards = envEntries.map(({ raw, weight }) => {
    return toEnvCard(raw);
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
      label:           disp.label ?? VAR_LABELS[key] ?? key,
      value:           Number(value),
      max:             disp.max   ?? 100,
      color:           disp.color ?? VAR_COLORS[key] ?? COLOR_POOL[colorIdx++ % COLOR_POOL.length],
      higherIsBetter:  disp.higher_is_better !== false,   // default true; set false for stress/radiation/etc.
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

  // ── Card backs — accept at top level OR nested under meta: ──────────────
  const COMMON = '/stories/assets_common';
  const toAssetUrl = (rel: string | undefined, commonFile: string) =>
    rel ? `/${storyDir}/${rel}` : `${COMMON}/${commonFile}`;
  const cardBackFateRaw   = rawStory.card_back_fate   ?? rawStory.meta?.card_back_fate;
  const cardBackPlayerRaw = rawStory.card_back_player ?? rawStory.meta?.card_back_player;

  // ── Music tracks — accept string or array, at top level OR under meta: ───
  const rawMusic = rawStory.music ?? rawStory.meta?.music;
  const musicList: string[] = rawMusic == null ? []
    : Array.isArray(rawMusic) ? rawMusic.filter(Boolean)
    : [String(rawMusic)];
  const music: string[] = musicList.length > 0
    ? musicList.map((p: string) => `/${storyDir}/${p}`)
    : [`${COMMON}/music.mid`];

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
      author: rawStory.meta?.author ?? '',
    },
    variables,
    goalVariables,
    game: {
      plays_per_turn:  rawStory.turns?.plays_per_turn ?? rawStory.turns?.action_points ?? 3,
      max_turns:       rawStory.turns?.total ?? 15,
      hand_size:       rawStory.turns?.player_hand_size ?? 5,
      env_per_turn:    rawStory.turns?.env_cards_per_turn ?? 2,
      draw_per_turn:   rawStory.turns?.draw_per_turn ?? undefined,
    },
    lose_conditions: loses,
    win_conditions: wins,
    player_cards: playerCards,
    environment_cards: envCards,
    cardBackFate: toAssetUrl(cardBackFateRaw, 'card_back_fate.png'),
    cardBackPlayer: toAssetUrl(cardBackPlayerRaw, 'card_back_player.png'),
    music,
  };
}

