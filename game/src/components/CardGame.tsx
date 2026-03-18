// game/src/components/CardGame.tsx
// Self-contained card game engine + UI, reads game_story.yaml via API

import { useState, useEffect, useCallback } from 'react';
import './CardGame.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VarDef {
  label: string;
  value: number;
  max: number;
  color: string;
}

interface EffectDef {
  variable: string;
  delta: number;
}

interface PlayerCard {
  id: string;
  name: string;
  type: string;
  cost: number;
  emoji: string;
  flavor?: string;
  effects: EffectDef[];
}

interface EnvCard {
  id: string;
  name: string;
  emoji: string;
  description: string;
  science?: string;
  always_active?: boolean;
  condition?: string;
  probability?: number;
  effects: EffectDef[];
}

interface GameStory {
  meta: {
    id: string;
    name: string;
    period?: string;
    location?: string;
    description: string;
    science_note?: string;
    tags?: string[];
  };
  variables: Record<string, VarDef>;
  game: {
    ap_per_turn: number;
    max_turns: number;
    hand_size: number;
  };
  lose_conditions: Array<{ condition: string; message: string }>;
  win_conditions?: Array<{ condition: string; message: string }>;
  player_cards: PlayerCard[];
  environment_cards: EnvCard[];
}

interface LogEntry {
  text: string;
  type: 'pos' | 'neg' | 'neutral';
  turn: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function evalCond(cond: string, state: Record<string, number>): boolean {
  let expr = cond
    .replace(/\bAND\b/gi, '&&')
    .replace(/\bOR\b/gi, '||');
  for (const [k, v] of Object.entries(state)) {
    expr = expr.replace(new RegExp(`\\b${k}\\b`, 'g'), String(Math.round(v)));
  }
  try { return Function(`'use strict';return(${expr})`)() as boolean; }
  catch { return false; }
}

function applyEffects(
  effects: EffectDef[],
  state: Record<string, number>,
  vars: Record<string, VarDef>,
): Record<string, number> {
  const next = { ...state };
  for (const eff of effects) {
    if (next[eff.variable] !== undefined) {
      const max = vars[eff.variable]?.max ?? 100;
      next[eff.variable] = Math.max(0, Math.min(max, next[eff.variable] + eff.delta));
    }
  }
  return next;
}

function drawHand(deck: PlayerCard[], size: number): PlayerCard[] {
  return [...deck].sort(() => Math.random() - 0.5).slice(0, Math.min(size, deck.length));
}

function fmtEffects(
  effects: EffectDef[],
  vars: Record<string, VarDef>,
): string {
  return effects.map(e => {
    const label = vars[e.variable]?.label ?? e.variable;
    return `${label} ${e.delta > 0 ? '+' : ''}${e.delta}`;
  }).join('  ');
}

const TYPE_COLORS: Record<string, string> = {
  medical:   '#1677ff',
  social:    '#fa8c16',
  tech:      '#722ed1',
  tactical:  '#f5222d',
  logistics: '#13c2c2',
  economic:  '#eb2f96',
  political: '#52c41a',
};

function getC(dark: boolean) {
  return dark ? {
    bg: '#0d1a10', panel: '#111f16', border: '#1e3824',
    text: 'rgba(255,255,255,0.92)', textSec: 'rgba(255,255,255,0.72)',
    textMute: 'rgba(255,255,255,0.42)', primary: '#52c41a',
    sectionBg: '#0a1409', cardBg: '#162a1b', logBg: '#0a1409',
  } : {
    bg: '#f5faf6', panel: '#ffffff', border: '#c8e6c9',
    text: '#1a2e22', textSec: '#3d5c47', textMute: 'rgba(0,0,0,0.45)',
    primary: '#007A33', sectionBg: '#edf7f0', cardBg: '#f8fcf9', logBg: '#edf7f0',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  storyPath: string;
  isDarkMode: boolean;
  onBack: () => void;
}

export default function CardGame({ storyPath, isDarkMode, onBack }: Props) {
  const c = getC(isDarkMode);

  const [story, setStory] = useState<GameStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Game state
  const [gs, setGs] = useState<Record<string, number>>({});
  const [ap, setAp] = useState(3);
  const [turn, setTurn] = useState(1);
  const [hand, setHand] = useState<PlayerCard[]>([]);
  const [phase, setPhase] = useState<'player' | 'environment'>('player');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [triggeredEnv, setTriggeredEnv] = useState<Set<string>>(new Set());
  const [outcome, setOutcome] = useState<{ win: boolean; message: string } | null>(null);

  // Load story
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const cleanPath = storyPath.replace(/^mods\//, '');
        const res = await fetch(`/api/file/${cleanPath}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || '加载失败');
        const s: GameStory = data.data.content;
        setStory(s);
        const initGs: Record<string, number> = {};
        for (const [k, v] of Object.entries(s.variables)) initGs[k] = v.value;
        setGs(initGs);
        setAp(s.game.ap_per_turn);
        setHand(drawHand(s.player_cards, s.game.hand_size));
        const openMsg = s.meta.period
          ? `${s.meta.name} · ${s.meta.period}`
          : `${s.meta.name}`;
        setLogs([{ text: `游戏开始：${openMsg}`, type: 'neutral', turn: 1 }]);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [storyPath]);

  const checkLose = useCallback((state: Record<string, number>) => {
    if (!story) return null;
    for (const lc of story.lose_conditions) {
      if (evalCond(lc.condition, state)) return { win: false, message: lc.message };
    }
    return null;
  }, [story]);

  const checkWin = useCallback((state: Record<string, number>) => {
    if (!story?.win_conditions?.length) return null;
    for (const wc of story.win_conditions) {
      if (evalCond(wc.condition, state)) return { win: true, message: wc.message };
    }
    return null;
  }, [story]);

  const addLog = (text: string, type: LogEntry['type'], t: number) =>
    setLogs(prev => [{ text, type, turn: t }, ...prev]);

  // Play a player card
  const playCard = (card: PlayerCard) => {
    if (phase !== 'player' || ap < card.cost || !story || outcome) return;
    const newGs = applyEffects(card.effects, gs, story.variables);
    setGs(newGs);
    setAp(p => p - card.cost);
    setHand(p => p.filter(c => c.id !== card.id));
    addLog(`▶ [${card.name}]  ${fmtEffects(card.effects, story.variables)}`, 'pos', turn);
    const loss = checkLose(newGs);
    if (loss) { setOutcome(loss); return; }
    const win = checkWin(newGs);
    if (win) setOutcome(win);
  };

  // End turn → environment phase
  const endTurn = () => {
    if (phase !== 'player' || !story || outcome) return;
    setPhase('environment');
    addLog('── 环境阶段 ──', 'neutral', turn);

    setTimeout(() => {
      let state = { ...gs };
      const triggered = new Set<string>();

      for (const ec of story.environment_cards) {
        const condOk = !ec.condition || evalCond(ec.condition, state);
        const probOk = ec.probability === undefined || Math.random() < ec.probability;
        if (ec.always_active || (condOk && probOk)) {
          state = applyEffects(ec.effects, state, story.variables);
          triggered.add(ec.id);
          const isGood = ec.effects.every(e => e.delta >= 0);
          addLog(`  ${ec.emoji} ${ec.name}  ${fmtEffects(ec.effects, story.variables)}`, isGood ? 'pos' : 'neg', turn);
        }
      }

      setTriggeredEnv(triggered);
      setGs(state);

      const loss = checkLose(state);
      if (loss) { setOutcome(loss); setPhase('player'); return; }
      const earlyWin = checkWin(state);
      if (earlyWin) { setOutcome(earlyWin); setPhase('player'); return; }

      const nextTurn = turn + 1;
      if (nextTurn > story.game.max_turns) {
        const winMatch = checkWin(state);
        const endMsg = winMatch
          ? winMatch.message
          : '你坚持到了最后，但未能完全达成目标。历史将铭记这段时光。';
        setOutcome({ win: !!winMatch, message: endMsg });
        setPhase('player');
        return;
      }

      setTurn(nextTurn);
      setAp(story.game.ap_per_turn);
      setHand(drawHand(story.player_cards, story.game.hand_size));
      setPhase('player');
      addLog(`── 回合 ${nextTurn} ──`, 'neutral', nextTurn);
    }, 900);
  };

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.bg, color: c.textMute, fontSize: 13 }}>
      加载场景中…
    </div>
  );

  if (error || !story) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: c.bg, gap: 12 }}>
      <div style={{ color: '#f5222d', fontSize: 13 }}>加载失败: {error}</div>
      <button onClick={onBack} style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 16px', cursor: 'pointer', color: c.textSec, fontSize: 12 }}>← 返回</button>
    </div>
  );

  const maxTurns = story.game.max_turns;
  const apTotal = story.game.ap_per_turn;
  const varEntries = Object.entries(story.variables);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: c.bg, color: c.text, overflow: 'hidden', fontSize: 13, position: 'relative' }}>

      {/* ── Top bar ── */}
      <div style={{
        height: 46, flexShrink: 0,
        background: c.panel, borderBottom: `1px solid ${c.border}`,
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 14,
      }}>
        {/* Wave icon */}
        <svg viewBox="0 0 44 28" width="38" height="24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 14 Q7 2 12 14 Q17 26 22 14 Q27 2 32 14 Q37 26 42 14"
                stroke={c.primary} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>

        <span style={{ fontSize: 13, fontWeight: 700, color: c.text, fontFamily: 'Georgia, serif' }}>{story.meta.name}</span>
        {story.meta.period && (
          <span style={{ fontSize: 11, color: c.textMute, fontFamily: 'monospace' }}>{story.meta.period}</span>
        )}

        <div style={{ flex: 1 }} />

        {/* Turn counter */}
        <span style={{ fontSize: 11, color: c.textMute, fontFamily: 'monospace' }}>
          回合 {turn} / {maxTurns}
        </span>

        {/* AP indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {Array.from({ length: apTotal }).map((_, i) => (
            <div key={i} style={{
              width: 9, height: 9, borderRadius: '50%',
              background: i < ap ? c.primary : (isDarkMode ? '#2a4a2a' : '#c8e6c9'),
              transition: 'background 0.2s',
            }} />
          ))}
          <span style={{ fontSize: 10, color: c.textMute, marginLeft: 3, fontFamily: 'monospace' }}>AP</span>
        </div>

        {/* End turn */}
        <button
          onClick={endTurn}
          disabled={phase !== 'player' || !!outcome}
          style={{
            padding: '4px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: phase === 'player' && !outcome ? c.primary : 'transparent',
            border: `1px solid ${phase === 'player' && !outcome ? c.primary : c.border}`,
            color: phase === 'player' && !outcome ? '#fff' : c.textMute,
            cursor: phase === 'player' && !outcome ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
        >
          {phase === 'environment' ? '环境中…' : '结束回合'}
        </button>

        {/* Back */}
        <button
          onClick={onBack}
          style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: c.textMute, fontSize: 12 }}
        >
          ← 返回
        </button>
      </div>

      {/* ── Status bars ── */}
      <div style={{
        flexShrink: 0, background: c.sectionBg, borderBottom: `1px solid ${c.border}`,
        padding: '7px 16px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {varEntries.map(([key, vdef]) => {
          const pct = Math.max(0, Math.min(100, (gs[key] ?? 0) / vdef.max * 100));
          const val = Math.round(gs[key] ?? 0);
          const isLow = key !== 'epidemic' && val <= 22;
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 155 }}>
              <span style={{ fontSize: 11, color: c.textMute, width: 58, flexShrink: 0, whiteSpace: 'nowrap' }}>{vdef.label}</span>
              <div style={{
                flex: 1, height: 6, background: isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
                borderRadius: 3, overflow: 'hidden', minWidth: 70,
              }}>
                <div
                  className={isLow ? 'bar-warn' : ''}
                  style={{
                    width: `${pct}%`, height: '100%',
                    background: isLow ? '#f5222d' : vdef.color,
                    borderRadius: 3, transition: 'width 0.4s ease',
                  }}
                />
              </div>
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: c.text, width: 28, textAlign: 'right', flexShrink: 0 }}>{val}</span>
            </div>
          );
        })}
      </div>

      {/* ── Main body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Center: environment + hand ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 12px 12px 16px' }}>

          {/* Environment zone */}
          <div style={{ flexShrink: 0, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.textMute, marginBottom: 8 }}>
              当前环境
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {story.environment_cards.map(ec => {
                const active = triggeredEnv.has(ec.id);
                const isPassive = !!ec.always_active;
                const typeColor = isPassive ? '#f5222d' : (ec.probability !== undefined ? '#722ed1' : '#fa8c16');
                return (
                  <div
                    key={ec.id}
                    className={`env-card ${active ? 'env-triggered' : ''}`}
                    style={{
                      width: 136, padding: '8px 10px',
                      background: c.panel,
                      border: `1px solid ${active ? typeColor : c.border}`,
                      borderLeft: `3px solid ${typeColor}`,
                      borderRadius: 6,
                      opacity: isPassive || active ? 1 : 0.48,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <span style={{ fontSize: 14 }}>{ec.emoji}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: c.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ec.name}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: typeColor, opacity: 0.85, marginBottom: 4, fontWeight: 600 }}>
                      {isPassive ? '每回合' : ec.probability !== undefined ? `${Math.round(ec.probability * 100)}% 概率` : '条件触发'}
                    </div>
                    {ec.effects.map((e, i) => {
                      const label = story.variables[e.variable]?.label ?? e.variable;
                      return (
                        <div key={i} style={{ fontSize: 10, fontFamily: 'monospace', color: e.delta > 0 ? '#52c41a' : '#ff7875' }}>
                          Δ{label} {e.delta > 0 ? '+' : ''}{e.delta}
                        </div>
                      );
                    })}
                    {ec.science && (
                      <div style={{ fontSize: 9, color: c.textMute, marginTop: 4, fontStyle: 'italic', lineHeight: 1.3 }}>
                        {ec.science}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: c.border, flexShrink: 0, marginBottom: 14 }} />

          {/* Hand zone */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.textMute, marginBottom: 10, flexShrink: 0 }}>
              手牌 ({hand.length}) · {ap}/{apTotal} AP
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', overflow: 'auto', paddingBottom: 4 }}>
              {hand.map(card => {
                const canPlay = ap >= card.cost && phase === 'player' && !outcome;
                const typeColor = TYPE_COLORS[card.type] ?? '#8c8c8c';
                return (
                  <div
                    key={card.id}
                    onClick={() => canPlay && playCard(card)}
                    className={`player-card ${canPlay ? 'card-playable' : 'card-disabled'}`}
                    style={{
                      width: 128, minHeight: 185,
                      background: c.cardBg,
                      border: `1px solid ${c.border}`,
                      borderLeft: `4px solid ${typeColor}`,
                      borderRadius: 8,
                      padding: '10px 10px 8px',
                      cursor: canPlay ? 'pointer' : 'not-allowed',
                      display: 'flex', flexDirection: 'column',
                      position: 'relative',
                    }}
                  >
                    {/* Cost badge */}
                    <div style={{
                      position: 'absolute', top: -9, right: -9,
                      width: 22, height: 22, borderRadius: '50%',
                      background: typeColor, border: `2px solid ${c.panel}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: '#fff', zIndex: 1,
                    }}>
                      {card.cost}
                    </div>

                    {/* Emoji */}
                    <div style={{ fontSize: 28, textAlign: 'center', marginBottom: 6 }}>{card.emoji}</div>

                    {/* Name */}
                    <div style={{ fontSize: 12, fontWeight: 700, color: c.text, textAlign: 'center', marginBottom: 8, lineHeight: 1.3 }}>
                      {card.name}
                    </div>

                    {/* Effects */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {card.effects.map((e, i) => {
                        const label = story.variables[e.variable]?.label ?? e.variable;
                        return (
                          <div key={i} style={{ fontSize: 10, fontFamily: 'monospace', textAlign: 'center', color: e.delta > 0 ? '#52c41a' : '#ff7875' }}>
                            Δ{label} {e.delta > 0 ? '+' : ''}{e.delta}
                          </div>
                        );
                      })}
                    </div>

                    {/* Flavor */}
                    {card.flavor && (
                      <div style={{ fontSize: 9, color: c.textMute, textAlign: 'center', fontStyle: 'italic', marginTop: 6, lineHeight: 1.3 }}>
                        {card.flavor}
                      </div>
                    )}

                    {/* Type */}
                    <div style={{ fontSize: 9, color: typeColor, textAlign: 'center', marginTop: 4, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      {card.type}
                    </div>
                  </div>
                );
              })}
              {hand.length === 0 && phase === 'player' && !outcome && (
                <div style={{ color: c.textMute, fontSize: 12, padding: '16px 0' }}>手牌已出完 — 结束回合抽下一手</div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: event log ── */}
        <div style={{
          width: 210, flexShrink: 0,
          borderLeft: `1px solid ${c.border}`,
          background: c.logBg,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 12px 6px',
            borderBottom: `1px solid ${c.border}`,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: c.textMute, flexShrink: 0,
          }}>
            事件日志
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {logs.map((log, i) => (
              <div key={i} style={{
                fontSize: 11, lineHeight: 1.45,
                color: log.type === 'pos' ? (isDarkMode ? '#86efac' : '#005c20')
                     : log.type === 'neg' ? '#ff7875'
                     : c.textMute,
                paddingBottom: log.text.startsWith('──') ? 4 : 0,
                fontWeight: log.text.startsWith('──') ? 600 : 400,
              }}>
                {log.text}
              </div>
            ))}
          </div>

          {/* Science disclaimer */}
          {story.meta.science_note && (
            <div style={{
              padding: '8px 12px', borderTop: `1px solid ${c.border}`,
              fontSize: 9.5, color: c.textMute, lineHeight: 1.5,
              fontStyle: 'italic', flexShrink: 0,
            }}>
              {story.meta.science_note}
            </div>
          )}
        </div>
      </div>

      {/* ── Settlement overlay ── */}
      {outcome && (
        <div className="settlement-fade" style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.82)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 999,
        }}>
          <div style={{
            background: c.panel,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            padding: '44px 52px',
            textAlign: 'center',
            maxWidth: 460, width: '90%',
            boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
          }}>
            <div style={{ fontSize: 56, marginBottom: 14 }}>{outcome.win ? '🏆' : '💀'}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.text, marginBottom: 10, fontFamily: 'Georgia, serif' }}>
              {outcome.win ? '历史留名' : '历史警示'}
            </div>
            <div style={{ fontSize: 13, color: c.textSec, lineHeight: 1.65, marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>
              {outcome.message}
            </div>

            {/* Final variable stats */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 28, flexWrap: 'wrap' }}>
              {varEntries.map(([key, vdef]) => (
                <div key={key} style={{ textAlign: 'center', minWidth: 60 }}>
                  <div style={{ fontSize: 10, color: c.textMute, marginBottom: 3 }}>{vdef.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: vdef.color, fontFamily: 'monospace' }}>
                    {Math.round(gs[key] ?? 0)}
                  </div>
                </div>
              ))}
            </div>

            {/* Survive turn info */}
            <div style={{ fontSize: 11, color: c.textMute, marginBottom: 20 }}>
              存活至第 {Math.min(turn, maxTurns)} / {maxTurns} 回合
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '8px 22px', borderRadius: 6,
                  background: c.primary, border: 'none',
                  color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}
              >
                再试一次
              </button>
              <button
                onClick={onBack}
                style={{
                  padding: '8px 22px', borderRadius: 6,
                  background: 'none', border: `1px solid ${c.border}`,
                  color: c.textSec, cursor: 'pointer', fontSize: 13,
                }}
              >
                返回选关
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
