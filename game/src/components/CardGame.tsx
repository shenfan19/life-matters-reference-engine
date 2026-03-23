// game/src/components/CardGame.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import './CardGame.css';
import { useI18n } from '../core/i18n';
import { loadStoryOverlay, mergeStringOverlay } from '../core/storyI18n';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VarDef { label: string; value: number; max: number; color: string; }
interface EffectDef { variable: string; delta: number; }
interface PlayerCard {
  id: string; name: string; type: string; cost: number;
  emoji: string; flavor?: string; effects: EffectDef[];
}
interface EnvCard {
  id: string; name: string; emoji: string; description: string;
  science?: string; always_active?: boolean; condition?: string;
  probability?: number; effects: EffectDef[];
}
interface GameStory {
  meta: { id: string; name: string; period?: string; location?: string;
          description: string; science_note?: string; tags?: string[]; };
  variables: Record<string, VarDef>;
  game: { ap_per_turn: number; max_turns: number; hand_size: number; };
  lose_conditions: Array<{ condition: string; message: string }>;
  win_conditions?: Array<{ condition: string; message: string }>;
  player_cards: PlayerCard[];
  environment_cards: EnvCard[];
}
interface LogEntry { text: string; type: 'pos' | 'neg' | 'neutral'; turn: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function evalCond(cond: string, state: Record<string, number>): boolean {
  let expr = cond.replace(/\bAND\b/gi, '&&').replace(/\bOR\b/gi, '||');
  for (const [k, v] of Object.entries(state))
    expr = expr.replace(new RegExp(`\\b${k}\\b`, 'g'), String(Math.round(v)));
  try { return Function(`'use strict';return(${expr})`)() as boolean; }
  catch { return false; }
}

function applyEffects(
  effects: EffectDef[], state: Record<string, number>, vars: Record<string, VarDef>,
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

function fmtEffects(effects: EffectDef[], vars: Record<string, VarDef>): string {
  return effects.map(e => {
    const label = vars[e.variable]?.label ?? e.variable;
    return `${label} ${e.delta > 0 ? '+' : ''}${e.delta}`;
  }).join('  ');
}

const TYPE_COLORS: Record<string, string> = {
  medical: '#1677ff', social: '#fa8c16', tech: '#722ed1',
  tactical: '#f5222d', logistics: '#13c2c2', economic: '#eb2f96', political: '#52c41a',
};

function getC(dark: boolean) {
  return dark
    ? { bg: '#0d1a10', panel: '#111f16', border: '#1e3824',
        text: 'rgba(255,255,255,0.92)', textSec: 'rgba(255,255,255,0.72)',
        textMute: 'rgba(255,255,255,0.38)', primary: '#52c41a',
        sectionBg: '#0a1409', cardBg: '#162a1b', logBg: '#0a1409',
        fieldBg: '#0e1e13', barTrack: 'rgba(255,255,255,0.07)' }
    : { bg: '#f5faf6', panel: '#ffffff', border: '#c8e6c9',
        text: '#1a2e22', textSec: '#3d5c47', textMute: 'rgba(0,0,0,0.40)',
        primary: '#007A33', sectionBg: '#edf7f0', cardBg: '#f8fcf9', logBg: '#edf7f0',
        fieldBg: '#e8f5ea', barTrack: 'rgba(0,0,0,0.07)' };
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({ label, sub, c }: { label: string; sub?: string; c: ReturnType<typeof getC> }) {
  return (
    <div style={{
      padding: '6px 12px 5px', borderBottom: `1px solid ${c.border}`,
      fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: c.textMute, flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {label}
      {sub && <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', fontSize: 9.5 }}>{sub}</span>}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { storyPath: string; isDarkMode: boolean; onBack: () => void; }

export default function CardGame({ storyPath, isDarkMode, onBack }: Props) {
  const c = getC(isDarkMode);
  const { language, t } = useI18n();
  // Capture language at game-load time so mid-game language switch doesn't reset state
  const langAtLoad = useRef(language);

  const [story, setStory]   = useState<GameStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const [gs, setGs]           = useState<Record<string, number>>({});
  const [ap, setAp]           = useState(3);
  const [turn, setTurn]       = useState(1);
  const [hand, setHand]       = useState<PlayerCard[]>([]);
  const [phase, setPhase]     = useState<'player' | 'environment'>('player');
  const [logs, setLogs]       = useState<LogEntry[]>([]);
  const [triggeredEnv, setTriggeredEnv] = useState<Set<string>>(new Set());
  const [outcome, setOutcome] = useState<{ win: boolean; message: string } | null>(null);

  const [playedCards, setPlayedCards] = useState<PlayerCard[]>([]);
  const [turnInitGs, setTurnInitGs]   = useState<Record<string, number>>({});
  const [turnInitAp, setTurnInitAp]   = useState(3);

  useEffect(() => {
    langAtLoad.current = language;
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const clean = storyPath.replace(/^mods\//, '');
        const res = await fetch(`/api/file/${clean}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || t('game.load_failed'));
        let s: GameStory = data.data?.content;
        if (!s?.meta || !s?.variables || !s?.player_cards) throw new Error(t('game.load_failed'));

        // Apply language overlay if non-English
        const overlay = await loadStoryOverlay(clean, langAtLoad.current);
        if (overlay) s = mergeStringOverlay(s, overlay);

        setStory(s);
        const initGs: Record<string, number> = {};
        for (const [k, v] of Object.entries(s.variables)) initGs[k] = v.value;
        setGs(initGs); setTurnInitGs(initGs);
        setAp(s.game.ap_per_turn); setTurnInitAp(s.game.ap_per_turn);
        setHand(drawHand(s.player_cards, s.game.hand_size));
        setPlayedCards([]);
        setLogs([{ text: `${s.meta.name}${s.meta.period ? ' · ' + s.meta.period : ''}`, type: 'neutral', turn: 1 }]);
      } catch (e: any) {
        setError(e.message ?? t('game.load_failed'));
      } finally { setLoading(false); }
    };
    load();
  }, [storyPath]); // language intentionally excluded — reloading mid-game would reset state

  const checkLose = useCallback((state: Record<string, number>) => {
    if (!story) return null;
    for (const lc of story.lose_conditions)
      if (evalCond(lc.condition, state)) return { win: false, message: lc.message };
    return null;
  }, [story]);

  const checkWin = useCallback((state: Record<string, number>) => {
    if (!story?.win_conditions?.length) return null;
    for (const wc of story.win_conditions)
      if (evalCond(wc.condition, state)) return { win: true, message: wc.message };
    return null;
  }, [story]);

  const addLog = (text: string, type: LogEntry['type'], tt: number) =>
    setLogs(prev => [{ text, type, turn: tt }, ...prev]);

  const playCard = (card: PlayerCard) => {
    if (phase !== 'player' || ap < card.cost || !story || outcome) return;
    const newGs = applyEffects(card.effects, gs, story.variables);
    setGs(newGs); setAp(p => p - card.cost);
    setHand(p => p.filter(c => c.id !== card.id));
    setPlayedCards(prev => [...prev, card]);
    addLog(`▶ [${card.name}]  ${fmtEffects(card.effects, story.variables)}`, 'pos', turn);
    const loss = checkLose(newGs); if (loss) { setOutcome(loss); return; }
    const win = checkWin(newGs); if (win) setOutcome(win);
  };

  const recallCard = (idx: number) => {
    if (phase !== 'player' || !story || outcome) return;
    const card = playedCards[idx];
    const remaining = playedCards.filter((_, i) => i !== idx);
    let newGs = { ...turnInitGs };
    for (const pc of remaining) newGs = applyEffects(pc.effects, newGs, story.variables);
    setPlayedCards(remaining); setGs(newGs);
    setAp(turnInitAp - remaining.reduce((s, pc) => s + pc.cost, 0));
    setHand(prev => [...prev, card]);
    addLog(`↩ [${card.name}]`, 'neutral', turn);
  };

  const endTurn = () => {
    if (phase !== 'player' || !story || outcome) return;
    setPhase('environment');
    addLog(`── ${t('game.environment')} ──`, 'neutral', turn);
    setTimeout(() => {
      let state = { ...gs };
      const triggered = new Set<string>();
      for (const ec of story.environment_cards) {
        const condOk = !ec.condition || evalCond(ec.condition, state);
        const probOk = ec.probability === undefined || Math.random() < ec.probability;
        if (ec.always_active || (condOk && probOk)) {
          state = applyEffects(ec.effects, state, story.variables);
          triggered.add(ec.id);
          addLog(`  ${ec.emoji} ${ec.name}  ${fmtEffects(ec.effects, story.variables)}`,
            ec.effects.every(e => e.delta >= 0) ? 'pos' : 'neg', turn);
        }
      }
      setTriggeredEnv(triggered); setGs(state);
      const loss = checkLose(state);
      if (loss) { setOutcome(loss); setPhase('player'); return; }
      const earlyWin = checkWin(state);
      if (earlyWin) { setOutcome(earlyWin); setPhase('player'); return; }
      const nextTurn = turn + 1;
      if (nextTurn > story.game.max_turns) {
        const w = checkWin(state);
        setOutcome({ win: !!w, message: w?.message ?? 'You endured to the end, but the goal was not fully achieved.' });
        setPhase('player'); return;
      }
      const newAp = story.game.ap_per_turn;
      setTurn(nextTurn); setAp(newAp);
      setTurnInitGs(state); setTurnInitAp(newAp);
      setPlayedCards([]);
      setHand(drawHand(story.player_cards, story.game.hand_size));
      setPhase('player');
      addLog(`── ${t('game.turn')} ${nextTurn} ──`, 'neutral', nextTurn);
    }, 900);
  };

  // ── Loading / error ───────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.bg, color: c.textMute, fontSize: 13 }}>
      {t('game.loading')}
    </div>
  );

  if (error || !story) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: c.bg, gap: 10 }}>
      <div style={{ color: '#f5222d', fontSize: 13 }}>{t('game.load_failed')}: {error}</div>
      <div style={{ fontSize: 11, color: c.textMute, fontFamily: 'monospace' }}>{storyPath}</div>
      <button onClick={onBack} style={{ marginTop: 4, background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '5px 14px', cursor: 'pointer', color: c.textSec, fontSize: 12 }}>{t('game.back')}</button>
    </div>
  );

  const maxTurns = story.game.max_turns;
  const apTotal  = story.game.ap_per_turn;
  const varEntries = Object.entries(story.variables);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: c.bg, color: c.text, overflow: 'hidden', fontSize: 13, position: 'relative' }}>

      {/* ── Top bar ── */}
      <div style={{
        height: 42, flexShrink: 0,
        background: c.panel, borderBottom: `1px solid ${c.border}`,
        display: 'flex', alignItems: 'center', padding: '0 14px', gap: 12,
      }}>
        <svg viewBox="0 0 44 28" width="34" height="22" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 14 Q7 2 12 14 Q17 26 22 14 Q27 2 32 14 Q37 26 42 14"
                stroke={c.primary} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ fontSize: 13, fontWeight: 700, color: c.text, fontFamily: 'Georgia, serif' }}>{story.meta.name}</span>
        {story.meta.period && (
          <span style={{ fontSize: 10, color: c.textMute, fontFamily: 'monospace' }}>{story.meta.period}</span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onBack} style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 5, padding: '3px 9px', cursor: 'pointer', color: c.textMute, fontSize: 11 }}>
          {t('game.back')}
        </button>
      </div>

      {/* ── Main body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left: stat bars ── */}
        <div style={{
          width: 140, flexShrink: 0,
          borderRight: `1px solid ${c.border}`,
          background: c.sectionBg,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <SectionLabel label={t('game.stats')} c={c} />
          <div style={{
            flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around',
            padding: '10px 8px 10px',
          }}>
            {varEntries.map(([key, vdef]) => {
              const pct = Math.max(0, Math.min(1, (gs[key] ?? 0) / vdef.max));
              const val = Math.round(gs[key] ?? 0);
              const isLow = key !== 'epidemic' && val <= 22;
              const barH = 90;
              return (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
                  <span style={{
                    fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
                    color: isLow ? '#f5222d' : c.text,
                    minHeight: 16, display: 'flex', alignItems: 'flex-end',
                  }}>{val}</span>
                  <div style={{
                    width: 18, height: barH,
                    background: c.barTrack,
                    borderRadius: 3,
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    overflow: 'hidden',
                  }}>
                    <div
                      className={isLow ? 'bar-warn' : ''}
                      style={{
                        width: '100%', height: `${pct * 100}%`,
                        background: isLow ? '#f5222d' : vdef.color,
                        borderRadius: 3, transition: 'height 0.4s ease',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 9, color: c.textMute, textAlign: 'center', lineHeight: 1.25, maxWidth: 28 }}>
                    {vdef.label.length > 4 ? vdef.label.slice(0, 4) : vdef.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Center: 3 equal rows ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Row 1: Environment */}
          <div style={{
            flex: 1, borderBottom: `1px solid ${c.border}`,
            background: c.sectionBg,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <SectionLabel label={`${t('game.environment')} (${story.environment_cards.length})`} c={c} />
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 12px', alignContent: 'flex-start' }}>
              {story.environment_cards.map(ec => {
                const active = triggeredEnv.has(ec.id);
                const isPassive = !!ec.always_active;
                const typeColor = isPassive ? '#f5222d' : (ec.probability !== undefined ? '#722ed1' : '#fa8c16');
                return (
                  <div
                    key={ec.id}
                    className={`env-card ${active ? 'env-triggered' : ''}`}
                    style={{
                      width: 130, flexShrink: 0, padding: '7px 9px',
                      background: c.panel,
                      border: `1px solid ${active ? typeColor : c.border}`,
                      borderLeft: `3px solid ${typeColor}`,
                      borderRadius: 6,
                      opacity: isPassive || active ? 1 : 0.48,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                      <span style={{ fontSize: 13 }}>{ec.emoji}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: c.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ec.name}</span>
                    </div>
                    <div style={{ fontSize: 9.5, color: typeColor, marginBottom: 3, fontWeight: 600 }}>
                      {isPassive ? t('game.every_turn') : ec.probability !== undefined ? `${Math.round(ec.probability * 100)}%` : t('game.conditional')}
                    </div>
                    {ec.effects.map((e, i) => {
                      const label = story.variables[e.variable]?.label ?? e.variable;
                      return (
                        <div key={i} style={{ fontSize: 9.5, fontFamily: 'monospace', color: e.delta > 0 ? '#52c41a' : '#ff7875' }}>
                          {label} {e.delta > 0 ? '+' : ''}{e.delta}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Row 2: Played cards */}
          <div style={{
            flex: 1, borderBottom: `1px solid ${c.border}`,
            background: c.fieldBg,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <SectionLabel
              label={`${t('game.played')} (${playedCards.length})`}
              sub={playedCards.length > 0 && phase === 'player' && !outcome ? t('game.played.recall') : undefined}
              c={c}
            />
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexWrap: 'wrap', gap: 9, padding: '8px 12px', alignContent: 'flex-start' }}>
              {playedCards.length === 0 ? (
                <div style={{ color: c.textMute, fontSize: 11, opacity: 0.4, alignSelf: 'center', marginLeft: 6 }}>{t('game.no_cards_played')}</div>
              ) : playedCards.map((card, idx) => {
                const typeColor = TYPE_COLORS[card.type] ?? '#8c8c8c';
                const canRecall = phase === 'player' && !outcome;
                return (
                  <div
                    key={`${card.id}-${idx}`}
                    onClick={() => canRecall && recallCard(idx)}
                    className={canRecall ? 'played-card-recall' : ''}
                    style={{
                      width: 100, flexShrink: 0,
                      background: c.cardBg,
                      border: `1px solid ${c.border}`,
                      borderLeft: `3px solid ${typeColor}`,
                      borderRadius: 6,
                      padding: '7px 8px 6px',
                      cursor: canRecall ? 'pointer' : 'default',
                      position: 'relative', opacity: 0.85,
                    }}
                  >
                    {canRecall && (
                      <div style={{
                        position: 'absolute', top: -6, right: -6,
                        width: 16, height: 16, borderRadius: '50%',
                        background: c.sectionBg, border: `1px solid ${c.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, color: c.textMute,
                      }}>↩</div>
                    )}
                    <div style={{ fontSize: 20, textAlign: 'center', marginBottom: 3 }}>{card.emoji}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: c.text, textAlign: 'center', marginBottom: 4, lineHeight: 1.25 }}>{card.name}</div>
                    {card.effects.map((e, i) => {
                      const label = story.variables[e.variable]?.label ?? e.variable;
                      return (
                        <div key={i} style={{ fontSize: 9.5, fontFamily: 'monospace', textAlign: 'center', color: e.delta > 0 ? '#52c41a' : '#ff7875' }}>
                          {label} {e.delta > 0 ? '+' : ''}{e.delta}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Row 3: Hand */}
          <div style={{
            flex: 1,
            background: c.bg,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Hand row header — turn / AP / end-turn inline */}
            <div style={{
              padding: '5px 10px 5px 12px', borderBottom: `1px solid ${c.border}`,
              fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: c.textMute, flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>{t('game.hand')} ({hand.length})</span>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  {Array.from({ length: apTotal }).map((_, i) => (
                    <div key={i} style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: i < ap ? c.primary : c.barTrack,
                      transition: 'background 0.2s',
                    }} />
                  ))}
                  <span style={{ fontSize: 9.5, color: c.textMute, marginLeft: 2, fontFamily: 'monospace', letterSpacing: 0, textTransform: 'none', fontWeight: 400 }}>{ap}/{apTotal} AP</span>
                </div>
                <span style={{ fontSize: 9.5, color: c.textMute, fontFamily: 'monospace', letterSpacing: 0, textTransform: 'none', fontWeight: 400 }}>{t('game.turn')} {turn}/{maxTurns}</span>
                <button
                  onClick={endTurn}
                  disabled={phase !== 'player' || !!outcome}
                  style={{
                    padding: '3px 12px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                    letterSpacing: 0, textTransform: 'none',
                    background: phase === 'player' && !outcome ? c.primary : 'transparent',
                    border: `1px solid ${phase === 'player' && !outcome ? c.primary : c.border}`,
                    color: phase === 'player' && !outcome ? '#fff' : c.textMute,
                    cursor: phase === 'player' && !outcome ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s',
                  }}
                >
                  {phase === 'environment' ? t('game.env_phase') : t('game.end_turn')}
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexWrap: 'wrap', gap: 10, padding: '8px 12px', alignContent: 'flex-start' }}>
              {hand.map(card => {
                const canPlay = ap >= card.cost && phase === 'player' && !outcome;
                const typeColor = TYPE_COLORS[card.type] ?? '#8c8c8c';
                return (
                  <div
                    key={card.id}
                    onClick={() => canPlay && playCard(card)}
                    className={`player-card ${canPlay ? 'card-playable' : 'card-disabled'}`}
                    style={{
                      width: 112, flexShrink: 0,
                      background: c.cardBg,
                      border: `1px solid ${c.border}`,
                      borderLeft: `4px solid ${typeColor}`,
                      borderRadius: 8, padding: '9px 9px 7px',
                      cursor: canPlay ? 'pointer' : 'not-allowed',
                      display: 'flex', flexDirection: 'column',
                      position: 'relative', minHeight: 160,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: -8, right: -8,
                      width: 20, height: 20, borderRadius: '50%',
                      background: typeColor, border: `2px solid ${c.panel}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: '#fff', zIndex: 1,
                    }}>{card.cost}</div>
                    <div style={{ fontSize: 24, textAlign: 'center', marginBottom: 5 }}>{card.emoji}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: c.text, textAlign: 'center', marginBottom: 6, lineHeight: 1.3 }}>{card.name}</div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {card.effects.map((e, i) => {
                        const label = story.variables[e.variable]?.label ?? e.variable;
                        return (
                          <div key={i} style={{ fontSize: 9.5, fontFamily: 'monospace', textAlign: 'center', color: e.delta > 0 ? '#52c41a' : '#ff7875' }}>
                            {label} {e.delta > 0 ? '+' : ''}{e.delta}
                          </div>
                        );
                      })}
                    </div>
                    {card.flavor && (
                      <div style={{ fontSize: 8.5, color: c.textMute, textAlign: 'center', fontStyle: 'italic', marginTop: 4, lineHeight: 1.3 }}>{card.flavor}</div>
                    )}
                    <div style={{ fontSize: 8.5, color: typeColor, textAlign: 'center', marginTop: 3, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{card.type}</div>
                  </div>
                );
              })}
              {hand.length === 0 && phase === 'player' && !outcome && (
                <div style={{ color: c.textMute, fontSize: 11, alignSelf: 'center', marginLeft: 6, opacity: 0.6 }}>{t('game.hand.empty')}</div>
              )}
            </div>
          </div>

        </div>{/* end center */}

        {/* ── Right: log ── */}
        <div style={{
          width: 176, flexShrink: 0,
          borderLeft: `1px solid ${c.border}`,
          background: c.logBg,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <SectionLabel label={t('game.log')} c={c} />
          <div style={{ flex: 1, overflowY: 'auto', padding: '7px 11px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {logs.map((log, i) => (
              <div key={i} style={{
                fontSize: 10.5, lineHeight: 1.45,
                color: log.type === 'pos' ? (isDarkMode ? '#86efac' : '#005c20')
                     : log.type === 'neg' ? '#ff7875' : c.textMute,
                paddingBottom: log.text.startsWith('──') ? 4 : 0,
                fontWeight: log.text.startsWith('──') ? 600 : 400,
              }}>
                {log.text}
              </div>
            ))}
          </div>
          {story.meta.science_note && (
            <div style={{
              padding: '7px 11px', borderTop: `1px solid ${c.border}`,
              fontSize: 9, color: c.textMute, lineHeight: 1.5,
              fontStyle: 'italic', flexShrink: 0,
            }}>
              {story.meta.science_note}
            </div>
          )}
        </div>

      </div>{/* end main body */}

      {/* ── Settlement overlay ── */}
      {outcome && (
        <div className="settlement-fade" style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.82)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }}>
          <div style={{
            background: c.panel, border: `1px solid ${c.border}`,
            borderRadius: 12, padding: '40px 48px', textAlign: 'center',
            maxWidth: 440, width: '90%', boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
          }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>{outcome.win ? '🏆' : '💀'}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: c.text, marginBottom: 8, fontFamily: 'Georgia, serif' }}>
              {outcome.win ? t('game.win_title') : t('game.lose_title')}
            </div>
            <div style={{ fontSize: 12.5, color: c.textSec, lineHeight: 1.65, margin: '0 auto 20px', maxWidth: 340 }}>
              {outcome.message}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
              {varEntries.map(([key, vdef]) => (
                <div key={key} style={{ textAlign: 'center', minWidth: 52 }}>
                  <div style={{ fontSize: 9.5, color: c.textMute, marginBottom: 2 }}>{vdef.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: vdef.color, fontFamily: 'monospace' }}>
                    {Math.round(gs[key] ?? 0)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: c.textMute, marginBottom: 18 }}>
              {t('game.turn')} {Math.min(turn, maxTurns)} / {maxTurns}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{ padding: '7px 20px', borderRadius: 6, background: c.primary, border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}
              >{t('game.retry')}</button>
              <button
                onClick={onBack}
                style={{ padding: '7px 20px', borderRadius: 6, background: 'none', border: `1px solid ${c.border}`, color: c.textSec, cursor: 'pointer', fontSize: 12.5 }}
              >{t('game.back_select')}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
