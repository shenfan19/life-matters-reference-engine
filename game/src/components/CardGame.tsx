// game/src/components/CardGame.tsx
import { useState, useEffect, useRef } from 'react';
import './CardGame.css';
import { useI18n } from '../core/i18n';
import { loadStoryOverlay, mergeStringOverlay } from '../core/storyI18n';
import { loadNewFormatStory } from '../core/newFormatLoader';
import { SunOutlined, MoonOutlined } from '@ant-design/icons';
import type { Language } from '../core/i18n';

// ─── Persistence helpers ───────────────────────────────────────────────────────

const APP_PERSIST_KEY = 'game_persist';
const DRAW_PER_TURN   = 2;

function readGameState(storyPath: string): Record<string, any> | null {
  try {
    const root = JSON.parse(localStorage.getItem(APP_PERSIST_KEY) ?? '{}');
    const gs = root.gameState;
    return gs?.storyPath === storyPath ? gs : null;
  } catch { return null; }
}
function writeGameState(storyPath: string, state: Record<string, any>) {
  try {
    const root = JSON.parse(localStorage.getItem(APP_PERSIST_KEY) ?? '{}');
    localStorage.setItem(APP_PERSIST_KEY, JSON.stringify({ ...root, gameState: { storyPath, ...state } }));
  } catch {}
}
function clearGameState() {
  try {
    const root = JSON.parse(localStorage.getItem(APP_PERSIST_KEY) ?? '{}');
    delete root.gameState;
    localStorage.setItem(APP_PERSIST_KEY, JSON.stringify(root));
  } catch {}
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface VarDef { label: string; value: number; max: number; color: string; }
interface EffectDef { variable: string; delta: number; }

interface PlayerCard {
  id: string; name: string; type: string; cost: number;
  emoji: string; flavor?: string; effects: EffectDef[];
  duration?: number;
}

interface BoardCard {
  card: PlayerCard;
  remaining: number; // -1 = permanent; N > 0 = turns left
  iid: string;
}

interface EnvCard {
  id: string; name: string; emoji: string; description: string;
  science?: string; always_active?: boolean; condition?: string;
  probability?: number; effects: EffectDef[];
}
interface RevealedEnvCard { card: EnvCard; triggered: boolean; isPassive?: boolean; }

interface GameStory {
  meta: { id: string; name: string; period?: string; location?: string;
          description: string; science_note?: string; tags?: string[]; };
  variables: Record<string, VarDef>;
  goalVariables: string[];
  game: { ap_per_turn: number; max_turns: number; hand_size: number; env_per_turn: number; };
  lose_conditions: Array<{ condition: string; message: string }>;
  win_conditions?: Array<{ condition: string; message: string }>;
  player_cards: PlayerCard[];
  environment_cards: EnvCard[];
}
interface LogEntry { text: string; type: 'pos' | 'neg' | 'neutral'; turn: number; }

// ─── Layout constants (all cards share the same dimensions) ───────────────────
//
// Row heights:
//   ROW_HP   = top/bottom HP bar strips
//   ROW_CARD = 4 card rows (env-hand / env-board / ply-board / ply-hand)
//   ROW_CTRL = controls strip between hand and HP bar
//
// Card graphic size = CARD_W × CARD_H, identical across hand / board / deck piles.
// ROW_CARD = CARD_H + vertical padding for cost/duration badge overflow (8px each) + breathing room.

const CARD_W   = 100;   // px
const CARD_H   = 106;   // px — fits name + 3 effect lines @ 12px
const ROW_CARD = 142;   // px — CARD_H + ~18px top + ~18px bottom
const ROW_HP   = 50;    // px — HP bar strips (env goals top, player status bottom)
const ROW_CTRL = 36;    // px — AP / turn / end-turn button

// ─── Pure helpers ─────────────────────────────────────────────────────────────

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

function fmtEffects(effects: EffectDef[], vars: Record<string, VarDef>): string {
  return effects.map(e => {
    const label = vars[e.variable]?.label ?? e.variable;
    return `${label} ${e.delta > 0 ? '+' : ''}${e.delta}`;
  }).join('  ');
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function checkLosePure(
  state: Record<string, number>,
  conditions: Array<{ condition: string; message: string }>,
): { win: boolean; message: string } | null {
  for (const lc of conditions)
    if (evalCond(lc.condition, state)) return { win: false, message: lc.message };
  return null;
}

function checkWinPure(
  state: Record<string, number>,
  conditions: Array<{ condition: string; message: string }> | undefined,
): { win: boolean; message: string } | null {
  if (!conditions?.length) return null;
  for (const wc of conditions)
    if (evalCond(wc.condition, state)) return { win: true, message: wc.message };
  return null;
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
        sectionBg: '#0a1409', cardBg: '#162a1b', logBg: '#091208',
        barTrack: 'rgba(255,255,255,0.07)',
        envBg: '#0d1020', plyBg: '#0a1409', deckBg: '#080f08' }
    : { bg: '#f6ffed', panel: '#ffffff', border: '#c8e6c9',
        text: '#1a2e22', textSec: '#3d5c47', textMute: 'rgba(0,0,0,0.40)',
        primary: '#007A33', sectionBg: '#edf7f0', cardBg: '#f8fcf9', logBg: '#e8f5ea',
        barTrack: 'rgba(0,0,0,0.07)',
        envBg: '#ede8f7', plyBg: '#edf7f0', deckBg: '#e0f0e8' };
}

// ─── HpBar ────────────────────────────────────────────────────────────────────

function HpBar({ label, value, max, color, barTrack, textColor, warn }: {
  label: string; value: number; max: number; color: string;
  barTrack: string; textColor: string; warn?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div style={{ flex: '1 1 150px', minWidth: 120 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: textColor, fontWeight: 600, fontSize: 11 }}>{label}</span>
        <span style={{ color: warn ? '#f5222d' : textColor, fontFamily: 'monospace', fontWeight: 700, fontSize: 11 }}>
          {Math.round(value)}<span style={{ fontWeight: 400, opacity: 0.5 }}>/{max}</span>
        </span>
      </div>
      <div style={{ height: 7, background: barTrack, borderRadius: 4, overflow: 'hidden' }}>
        <div
          className={warn ? 'bar-warn' : ''}
          style={{ width: `${pct * 100}%`, height: '100%', background: warn ? '#f5222d' : color,
                   borderRadius: 4, transition: 'width 0.4s ease' }}
        />
      </div>
    </div>
  );
}

// ─── DeckPile — same CARD_W × CARD_H as hand/board cards ─────────────────────

function DeckPile({ label, count, total, faceUp, accentColor, c }: {
  label: string; count: number; total: number;
  faceUp?: boolean; accentColor?: string; c: ReturnType<typeof getC>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <span style={{ color: c.textMute, fontSize: 10, fontWeight: 700,
                     letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>
        {label}
      </span>
      <div style={{ position: 'relative', width: CARD_W, height: CARD_H, flexShrink: 0 }}>
        {count === 0 ? (
          <div style={{ width: CARD_W, height: CARD_H, borderRadius: 8,
                        border: `1px dashed ${c.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: c.textMute, fontSize: 12 }}>空</span>
          </div>
        ) : [2, 1, 0].map(i => (
          <div key={i} style={{
            position: 'absolute', left: i * 2, top: -i * 2,
            width: CARD_W, height: CARD_H, borderRadius: 8,
            background: faceUp ? (accentColor ? accentColor + '18' : c.sectionBg) : c.cardBg,
            border: `1px solid ${faceUp ? (accentColor ?? c.border) : c.border}`,
            display: i === 0 ? 'flex' : 'block',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {i === 0 && faceUp && (
              <span style={{ color: accentColor ?? c.textMute, fontSize: 11, fontWeight: 700 }}>弃牌</span>
            )}
            {i === 0 && !faceUp && (
              <span style={{ color: c.textMute, fontSize: 22, opacity: 0.18 }}>?</span>
            )}
          </div>
        ))}
      </div>
      <span style={{ color: c.textMute, fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>
        {count}/{total}
      </span>
    </div>
  );
}

// ─── FaceDownCard — uniform card-back for opponent hand ───────────────────────

function FaceDownCard({ c }: { c: ReturnType<typeof getC> }) {
  return (
    <div style={{
      width: CARD_W, height: CARD_H, flexShrink: 0, borderRadius: 8,
      background: c.envBg, border: `1px solid ${c.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ color: c.textMute, fontSize: 24, opacity: 0.2 }}>?</span>
    </div>
  );
}

// ─── GameCard — unified card renderer (player hand, env board, player board) ──
//
// Props:
//   variant: 'env'    — environment card (show name + effects + duration badge right)
//            'player' — player hand card (cost badge left, duration badge right)
//            'board'  — board/staged card (minimal: name + remaining)

interface GameCardProps {
  name: string;
  effects: EffectDef[];
  typeColor: string;
  vars: Record<string, VarDef>;
  c: ReturnType<typeof getC>;
  // cost badge (player cards only)
  cost?: number;
  // duration: -1=permanent ∞, 0=instant 即, N=countdown
  duration?: number;
  // board remaining (board variant)
  remaining?: number;
  // interaction
  onClick?: () => void;
  canPlay?: boolean;
  className?: string;
  // recall button
  showRecall?: boolean;
  // tooltip
  flavor?: string;
  hovered?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  // env-specific
  triggered?: boolean;
  showMissed?: boolean;
}

function GameCard({
  name, effects, typeColor, vars, c,
  cost, duration, remaining,
  onClick, canPlay = true, className = '',
  showRecall, flavor, hovered, onMouseEnter, onMouseLeave,
  triggered, showMissed,
}: GameCardProps) {
  const dur = duration ?? 0;
  const rem = remaining;

  const durLabel = dur === -1 ? '∞' : dur === 0 ? '即' : String(dur);
  const durColor = dur === -1 ? c.primary : dur === 0 ? c.border : '#fa8c16';
  const durTextColor = dur === 0 ? c.textMute : '#fff';

  const remLabel = rem === undefined ? null : rem === -1 ? '∞' : String(rem);
  const remColor = rem === -1 ? c.primary : '#fa8c16';

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`${className} ${triggered !== undefined ? (triggered ? 'env-card env-triggered' : 'env-card') : ''}`}
      style={{
        width: CARD_W, height: CARD_H, flexShrink: 0,
        background: c.cardBg,
        border: triggered !== undefined
          ? `1px solid ${triggered ? typeColor : c.border}`
          : `1px solid ${c.border}`,
        borderLeft: `4px solid ${typeColor}`,
        borderRadius: 8,
        padding: '8px 8px 6px',
        cursor: onClick ? (canPlay ? 'pointer' : 'not-allowed') : 'default',
        display: 'flex', flexDirection: 'column', gap: 3,
        position: 'relative',
      }}
    >
      {/* Tooltip */}
      {hovered && flavor && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)',
          background: c.panel, border: `1px solid ${c.border}`,
          borderRadius: 7, padding: '7px 10px',
          color: c.textSec, fontStyle: 'italic', lineHeight: 1.5, fontSize: 11,
          width: 180, zIndex: 100, pointerEvents: 'none',
          boxShadow: '0 6px 18px rgba(0,0,0,0.22)', whiteSpace: 'normal',
        }}>{flavor}</div>
      )}

      {/* Recall button */}
      {showRecall && (
        <div style={{
          position: 'absolute', top: -6, right: -6,
          width: 16, height: 16, borderRadius: '50%',
          background: c.sectionBg, border: `1px solid ${c.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: c.textMute, fontSize: 10, zIndex: 2,
        }}>↩</div>
      )}

      {/* Cost badge — top LEFT (player cards only) */}
      {cost !== undefined && (
        <div style={{
          position: 'absolute', top: -8, left: -8,
          width: 20, height: 20, borderRadius: '50%',
          background: typeColor, border: `2px solid ${c.panel}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, color: '#fff', fontSize: 11, zIndex: 1,
        }}>{cost}</div>
      )}

      {/* Duration / remaining badge — top RIGHT (all cards with duration) */}
      {(duration !== undefined || rem !== undefined) && (
        <div style={{
          position: 'absolute', top: -8, right: -8,
          width: 20, height: 20, borderRadius: '50%',
          background: rem !== undefined ? remColor : durColor,
          border: `2px solid ${c.panel}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700,
          color: rem !== undefined ? '#fff' : durTextColor,
          fontSize: 10, zIndex: 1,
        }}>
          {rem !== undefined ? remLabel : durLabel}
        </div>
      )}

      {/* Card name */}
      <div style={{ fontWeight: 700, color: c.text, fontSize: 12, lineHeight: 1.3 }}>
        {name}
      </div>

      {/* "未触发" label for env cards */}
      {showMissed && triggered === false && (
        <div style={{ color: c.textMute, fontSize: 10 }}>未触发</div>
      )}

      {/* Effects */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {effects.map((e, i) => {
          const label = vars[e.variable]?.label ?? e.variable;
          return (
            <div key={i} style={{ fontFamily: 'monospace', fontSize: 11,
                                  color: e.delta > 0 ? '#52c41a' : '#ff7875' }}>
              {label} {e.delta > 0 ? '+' : ''}{e.delta}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { storyPath: string; isDarkMode: boolean; onToggleDark: () => void; onBack: () => void; }

export default function CardGame({ storyPath, isDarkMode, onToggleDark, onBack }: Props) {
  const c = getC(isDarkMode);
  const { language, setLanguage, t } = useI18n();
  const langAtLoad = useRef(language);

  const [story, setStory]     = useState<GameStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // ── Core game state ──────────────────────────────────────────────────────────
  const [gs, setGs]               = useState<Record<string, number>>({});
  const [ap, setAp]               = useState(3);
  const [turn, setTurn]           = useState(1);
  const [hand, setHand]           = useState<PlayerCard[]>([]);
  const [playerDeck, setPlayerDeck]       = useState<PlayerCard[]>([]);
  const [playerDiscard, setPlayerDiscard] = useState<PlayerCard[]>([]);
  const [playerDeckTotal, setPlayerDeckTotal] = useState(0);

  const [board, setBoard]             = useState<BoardCard[]>([]);
  const [playedCards, setPlayedCards] = useState<PlayerCard[]>([]);
  const [turnInitGs, setTurnInitGs]   = useState<Record<string, number>>({});
  const [turnInitAp, setTurnInitAp]   = useState(3);

  // Env state
  // envHand: drawn this turn (face-down), will be revealed next env phase
  // envEventDeck: not yet drawn
  // envEventDiscard: revealed + resolved (used)
  const [envHand, setEnvHand]                 = useState<EnvCard[]>([]);
  const [envEventDeck, setEnvEventDeck]       = useState<EnvCard[]>([]);
  const [envEventDiscard, setEnvEventDiscard] = useState<EnvCard[]>([]);
  const [envEventTotal, setEnvEventTotal]     = useState(0);
  const [envRevealed, setEnvRevealed]         = useState<RevealedEnvCard[]>([]);

  const [phase, setPhase]     = useState<'player' | 'env'>('player');
  const [logs, setLogs]       = useState<LogEntry[]>([]);
  const [outcome, setOutcome] = useState<{ win: boolean; message: string } | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  // ── Persist ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!story) return;
    writeGameState(storyPath, {
      gs, ap, turn, hand, playerDeck, playerDiscard, playerDeckTotal,
      board, playedCards, turnInitGs, turnInitAp,
      envHand, envEventDeck, envEventDiscard, envEventTotal, envRevealed,
      phase, logs, outcome,
    });
  }, [gs, ap, turn, hand, playerDeck, playerDiscard, playerDeckTotal,
      board, playedCards, turnInitGs, turnInitAp,
      envHand, envEventDeck, envEventDiscard, envEventTotal, envRevealed,
      phase, logs, outcome]);

  // ── Load story ───────────────────────────────────────────────────────────────
  useEffect(() => {
    langAtLoad.current = language;
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const clean = storyPath.replace(/^mods\//, '');
        const res   = await fetch(`/api/file/${clean}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data  = await res.json();
        if (!data.success) throw new Error(data.error || t('game.load_failed'));
        let s: GameStory = await loadNewFormatStory(clean, data.data?.content);
        if (!s?.meta || !s?.variables || !s?.player_cards) throw new Error(t('game.load_failed'));
        const overlay = await loadStoryOverlay(clean, langAtLoad.current);
        if (overlay) s = mergeStringOverlay(s, overlay);
        setStory(s);

        const saved = readGameState(storyPath);
        if (saved) {
          setGs(saved.gs ?? {});
          setAp(saved.ap ?? s.game.ap_per_turn);
          setTurn(saved.turn ?? 1);
          setHand(saved.hand ?? []);
          setPlayerDeck(saved.playerDeck ?? []);
          setPlayerDiscard(saved.playerDiscard ?? []);
          setPlayerDeckTotal(saved.playerDeckTotal ?? s.player_cards.length);
          setBoard(saved.board ?? []);
          setPlayedCards(saved.playedCards ?? []);
          setTurnInitGs(saved.turnInitGs ?? saved.gs ?? {});
          setTurnInitAp(saved.turnInitAp ?? s.game.ap_per_turn);
          setEnvHand(saved.envHand ?? []);
          setEnvEventDeck(saved.envEventDeck ?? []);
          setEnvEventDiscard(saved.envEventDiscard ?? []);
          setEnvEventTotal(saved.envEventTotal ?? 0);
          setEnvRevealed(saved.envRevealed ?? []);
          setPhase(saved.phase ?? 'player');
          setLogs(saved.logs ?? []);
          setOutcome(saved.outcome ?? null);
        } else {
          const initGs: Record<string, number> = {};
          for (const [k, v] of Object.entries(s.variables)) initGs[k] = v.value;
          const eventEnv    = s.environment_cards.filter(ec => !ec.always_active);
          const shuffledEvt = shuffle(eventEnv);
          const shuffledPly = shuffle(s.player_cards);
          const initHandSize = Math.min(s.game.hand_size, shuffledPly.length);
          const total        = shuffledPly.length;

          setGs(initGs); setTurnInitGs(initGs);
          setAp(s.game.ap_per_turn); setTurnInitAp(s.game.ap_per_turn);
          setTurn(1);
          setHand(shuffledPly.slice(0, initHandSize));
          setPlayerDeck(shuffledPly.slice(initHandSize));
          setPlayerDiscard([]);
          setPlayerDeckTotal(total);
          setBoard([]); setPlayedCards([]);
          // Pre-draw initial env hand so opponent shows cards from turn 1
          const initDrawN   = Math.min(s.game.env_per_turn, shuffledEvt.length);
          const initEnvHand = shuffledEvt.slice(0, initDrawN);
          const initEvtDeck = shuffledEvt.slice(initDrawN);
          setEnvHand(initEnvHand);
          setEnvEventDeck(initEvtDeck);
          setEnvEventDiscard([]);
          setEnvEventTotal(shuffledEvt.length);
          setEnvRevealed([]);
          setPhase('player');
          setOutcome(null);
          setLogs([{ text: `${s.meta.name}${s.meta.period ? ' · ' + s.meta.period : ''}`, type: 'neutral', turn: 1 }]);
        }
      } catch (e: any) {
        setError(e.message ?? t('game.load_failed'));
      } finally { setLoading(false); }
    };
    load();
  }, [storyPath]);

  // ── Play card ─────────────────────────────────────────────────────────────────
  const playCard = (card: PlayerCard) => {
    if (phase !== 'player' || ap < card.cost || !story || outcome) return;
    const newGs = applyEffects(card.effects, gs, story.variables);
    setGs(newGs);
    setAp(p => p - card.cost);
    setHand(p => p.filter(c => c.id !== card.id));
    setPlayedCards(prev => [...prev, card]);
    setLogs(prev => [{ text: `[${card.name}]  ${fmtEffects(card.effects, story.variables)}`, type: 'pos', turn }, ...prev]);
    const loss = checkLosePure(newGs, story.lose_conditions);
    if (loss) { setOutcome(loss); return; }
    const win = checkWinPure(newGs, story.win_conditions);
    if (win) setOutcome(win);
  };

  // ── Recall card ───────────────────────────────────────────────────────────────
  const recallCard = (idx: number) => {
    if (phase !== 'player' || !story || outcome) return;
    const card      = playedCards[idx];
    const remaining = playedCards.filter((_, i) => i !== idx);
    let newGs = { ...turnInitGs };
    for (const pc of remaining) newGs = applyEffects(pc.effects, newGs, story.variables);
    setPlayedCards(remaining);
    setGs(newGs);
    setAp(turnInitAp - remaining.reduce((s, pc) => s + pc.cost, 0));
    setHand(prev => [...prev, card]);
    setLogs(prev => [{ text: `收回 [${card.name}]`, type: 'neutral', turn }, ...prev]);
  };

  // ── End turn ──────────────────────────────────────────────────────────────────
  const endTurn = () => {
    if (phase !== 'player' || !story || outcome) return;
    setPhase('env');

    const curGs         = gs;
    const curTurn       = turn;
    const curHand       = hand;
    const curDeck       = playerDeck;
    const curPlyDiscard = playerDiscard;
    const curEnvHand    = envHand;       // face-down cards drawn last turn → resolve now
    const curEvtDeck    = envEventDeck;
    const curEvtDisc    = envEventDiscard;
    const curBoard      = board;
    const curPlayed     = playedCards;
    const passiveEnv    = story.environment_cards.filter(e => e.always_active);

    setTimeout(() => {
      let state = { ...curGs };
      const newLogs: LogEntry[] = [];
      const revealed: RevealedEnvCard[] = [];
      const newPlyDiscard: PlayerCard[] = [...curPlyDiscard];

      // 1. Board cards trigger, decrement, expired → player discard
      const nextBoard: BoardCard[] = [];
      for (const bc of curBoard) {
        state = applyEffects(bc.card.effects, state, story.variables);
        const durLabel = bc.remaining === -1 ? '永久' : `${bc.remaining}回合`;
        newLogs.push({
          text: `[${bc.card.name}] 触发  ${fmtEffects(bc.card.effects, story.variables)}  (${durLabel})`,
          type: bc.card.effects.every(e => e.delta >= 0) ? 'pos' : 'neg',
          turn: curTurn,
        });
        if (bc.remaining === -1) {
          nextBoard.push(bc);
        } else if (bc.remaining > 1) {
          nextBoard.push({ ...bc, remaining: bc.remaining - 1 });
        } else {
          newPlyDiscard.push(bc.card);
        }
      }

      // 2. Staged cards: duration → board, instant → player discard
      for (const card of curPlayed) {
        const dur = card.duration;
        if (dur !== undefined && dur !== 0) {
          nextBoard.push({ card, remaining: dur, iid: `${card.id}-${Date.now()}-${Math.random()}` });
          newLogs.push({ text: `[${card.name}] 驻场  (${dur === -1 ? '永久' : dur + ' 回合'})`, type: 'neutral', turn: curTurn });
        } else {
          newPlyDiscard.push(card);
        }
      }

      // 3. Passive env trigger (always_active)
      for (const ec of passiveEnv) {
        state = applyEffects(ec.effects, state, story.variables);
        newLogs.push({
          text: `${ec.name}  ${fmtEffects(ec.effects, story.variables)}`,
          type: ec.effects.every(e => e.delta >= 0) ? 'pos' : 'neg',
          turn: curTurn,
        });
        revealed.push({ card: ec, triggered: true, isPassive: true });
      }

      // 4. Flip & resolve curEnvHand (drawn last turn, now visible)
      //    After resolving, they go to envEventDiscard (used pile)
      let evtUsedNew = [...curEvtDisc];
      for (const ec of curEnvHand) {
        const condOk    = !ec.condition || evalCond(ec.condition, state);
        const probOk    = ec.probability === undefined || Math.random() < ec.probability;
        const triggered = condOk && probOk;
        if (triggered) {
          state = applyEffects(ec.effects, state, story.variables);
          newLogs.push({
            text: `${ec.name}  ${fmtEffects(ec.effects, story.variables)}`,
            type: ec.effects.every(e => e.delta >= 0) ? 'pos' : 'neg',
            turn: curTurn,
          });
        }
        revealed.push({ card: ec, triggered });
        evtUsedNew.push(ec);
      }

      // 5. Draw new env cards into next envHand (face-down for next player turn)
      let evtDeck = [...curEvtDeck];
      if (evtDeck.length < story.game.env_per_turn && evtUsedNew.length > 0) {
        evtDeck    = shuffle([...evtDeck, ...evtUsedNew]);
        evtUsedNew = [];
        newLogs.push({ text: `事件牌组重新洗牌`, type: 'neutral', turn: curTurn });
      }
      const drawEnvN   = Math.min(story.game.env_per_turn, evtDeck.length);
      const newEnvHand = evtDeck.splice(0, drawEnvN);

      // 6. Player draw (reshuffle if needed)
      const nextTurn = curTurn + 1;
      let plyDeck    = [...curDeck];
      let plyDiscard = [...newPlyDiscard];
      if (plyDeck.length < DRAW_PER_TURN && plyDiscard.length > 0) {
        plyDeck    = shuffle([...plyDeck, ...plyDiscard]);
        plyDiscard = [];
        newLogs.push({ text: `玩家牌组重新洗牌`, type: 'neutral', turn: curTurn });
      }
      const space    = story.game.hand_size - curHand.length;
      const drawCard = Math.max(0, Math.min(DRAW_PER_TURN, space, plyDeck.length));
      const newCards = plyDeck.slice(0, drawCard);
      plyDeck        = plyDeck.slice(drawCard);

      // Commit
      setBoard(nextBoard);
      setPlayedCards([]);
      setPlayerDiscard(plyDiscard);
      setPlayerDeck(plyDeck);
      setEnvHand(newEnvHand);
      setEnvEventDeck(evtDeck);
      setEnvEventDiscard(evtUsedNew);
      setEnvRevealed(revealed);
      setGs(state);
      setLogs(prev => [...newLogs, ...prev]);

      const loss = checkLosePure(state, story.lose_conditions);
      if (loss) { setOutcome(loss); setPhase('player'); return; }
      const earlyWin = checkWinPure(state, story.win_conditions);
      if (earlyWin) { setOutcome(earlyWin); setPhase('player'); return; }

      if (nextTurn > story.game.max_turns) {
        const w = checkWinPure(state, story.win_conditions);
        setOutcome({ win: !!w, message: w?.message ?? '回合结束，目标未能完全实现。' });
        setPhase('player'); return;
      }

      const newAp = story.game.ap_per_turn;
      setTurn(nextTurn);
      setAp(newAp);
      setTurnInitAp(newAp);
      setTurnInitGs(state);
      if (drawCard > 0) setHand(prev => [...prev, ...newCards]);
      setPhase('player');
      setLogs(prev => [{ text: `── 第 ${nextTurn} 回合 ──`, type: 'neutral', turn: nextTurn }, ...prev]);
    }, 800);
  };

  // ── Loading / error ───────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1a10', color: 'rgba(255,255,255,0.4)' }}>
      {t('game.loading')}
    </div>
  );
  if (error || !story) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0d1a10', gap: 10 }}>
      <div style={{ color: '#f5222d' }}>{t('game.load_failed')}: {error}</div>
      <button onClick={onBack} style={{ marginTop: 4, background: 'none', border: '1px solid #1e3824', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>{t('game.back')}</button>
    </div>
  );

  const maxTurns  = story.game.max_turns;
  const apTotal   = story.game.ap_per_turn;
  const goalSet   = new Set(story.goalVariables ?? []);
  const goalPairs = Object.entries(story.variables).filter(([k]) => goalSet.has(k));
  const defPairs  = Object.entries(story.variables).filter(([k]) => !goalSet.has(k));
  const allPairs  = Object.entries(story.variables);
  const canAct    = phase === 'player' && !outcome;

  // Right column deck sections share the same height as each card row
  const deckSectionStyle = (borderColor?: string): React.CSSProperties => ({
    height: ROW_CARD, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderBottom: `1px solid ${borderColor ?? c.border}`,
    padding: '0 6px',
  });

  // ── Render ────────────────────────────────────────────────────────────────────
  //
  // Layout:
  //  [Top bar 50px]
  //  [Left log | Main 6-row | Right deck col]
  //
  //  Main rows (top → bottom):
  //   1. HP row (goals)         ROW_HP
  //   2. Env hand (face-down)   ROW_CARD
  //   3. Env board (revealed)   ROW_CARD
  //   4. Player board           ROW_CARD
  //   5. Player hand            ROW_CARD
  //   6. Controls               ROW_CTRL
  //   7. HP row (status)        ROW_HP
  //
  //  Right col sections 1-4 align with main rows 2-5.

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: c.bg, color: c.text, overflow: 'hidden', position: 'relative' }}>

      {/* ── Top bar ── */}
      <div style={{ height: 50, flexShrink: 0, background: c.panel, borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10 }}>
        <svg viewBox="0 0 44 28" width="38" height="24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 14 Q7 2 12 14 Q17 26 22 14 Q27 2 32 14 Q37 26 42 14"
                stroke={c.primary} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ fontSize: 18, fontWeight: 700, color: c.text, fontFamily: 'Georgia, serif', flexShrink: 0 }}>Life Matters</span>
        <div style={{ width: 1, height: 14, background: c.border, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, color: c.textSec, fontSize: 13, flexShrink: 0 }}>{story.meta.name}</span>
        {story.meta.period && <span style={{ color: c.textMute, fontFamily: 'monospace', fontSize: 12, flexShrink: 0 }}>{story.meta.period}</span>}
        <div style={{ flex: 1 }} />
        <button onClick={() => { clearGameState(); window.location.reload(); }}
          style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', color: c.textMute, fontSize: 12 }}>
          {t('game.retry')}
        </button>
        <button onClick={onBack}
          style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', color: c.textSec, fontSize: 12 }}>
          {t('game.back')}
        </button>
        <select value={language} onChange={e => setLanguage(e.target.value as Language)}
          style={{ padding: '2px 5px', borderRadius: 6, border: `1px solid ${c.border}`, background: c.panel, color: c.textMute, cursor: 'pointer', outline: 'none', fontSize: 12 }}>
          <option value="en">EN</option>
          <option value="zh-CN">CHS</option>
          <option value="zh-TW">CHT</option>
        </select>
        <button onClick={onToggleDark}
          style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: c.textSec, display: 'flex', alignItems: 'center' }}>
          {isDarkMode ? <MoonOutlined /> : <SunOutlined />}
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ════ Left sidebar: log ════ */}
        <div style={{
          width: 168, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${c.border}`,
          background: c.logBg,
        }}>
          {/* Turn + AP info */}
          <div style={{ flexShrink: 0, padding: '10px 12px 8px', borderBottom: `1px solid ${c.border}` }}>
            <div style={{ color: c.primary, fontWeight: 700, fontSize: 18, fontFamily: 'monospace', marginBottom: 6 }}>
              回合 {turn}<span style={{ color: c.textMute, fontWeight: 400, fontSize: 13 }}>/{maxTurns}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {Array.from({ length: apTotal }).map((_, i) => (
                <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i < ap ? c.primary : c.barTrack, transition: 'background 0.2s' }} />
              ))}
              <span style={{ color: c.textMute, marginLeft: 3, fontFamily: 'monospace', fontSize: 11 }}>{ap}/{apTotal} AP</span>
            </div>
          </div>

          {/* Event log */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {logs.map((log, i) => (
              <div key={i} style={{
                lineHeight: 1.35, fontSize: 11, wordBreak: 'break-all',
                color: log.type === 'pos' ? (isDarkMode ? '#86efac' : '#005c20')
                     : log.type === 'neg' ? '#ff7875' : c.textMute,
                fontWeight: log.text.startsWith('──') ? 700 : 400,
                paddingBottom: log.text.startsWith('──') ? 2 : 0,
              }}>
                {log.text}
              </div>
            ))}
          </div>
        </div>

        {/* ════ Main game area ════ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

          {/* ─ Row 1: Env HP bars (goals) ─ */}
          <div style={{
            height: ROW_HP, flexShrink: 0,
            background: c.panel,
            borderBottom: `1px solid ${c.border}`,
            padding: '6px 14px',
            display: 'flex', flexWrap: 'wrap', gap: '4px 20px', alignItems: 'center',
          }}>
            <span style={{ color: c.textMute, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>目标</span>
            {goalPairs.length === 0
              ? <span style={{ color: c.textMute, opacity: 0.35 }}>—</span>
              : goalPairs.map(([key, vdef]) => (
                <HpBar key={key} label={vdef.label} value={Math.round(gs[key] ?? 0)} max={vdef.max}
                  color={vdef.color} barTrack={c.barTrack} textColor={c.textSec} />
              ))}
          </div>

          {/* ─ Row 2: Env hand (opponent, face-down) ─ */}
          <div style={{
            height: ROW_CARD, flexShrink: 0,
            background: c.envBg,
            borderBottom: `1px solid ${c.border}`,
            display: 'flex', alignItems: 'center',
            padding: '0 12px', gap: 8,
            overflowX: 'auto', overflowY: 'hidden',
          }}>
            <span style={{ color: 'rgba(128,128,128,0.45)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0, writingMode: 'vertical-rl', transform: 'rotate(180deg)', userSelect: 'none' }}>手牌</span>
            {envHand.length === 0
              ? <span style={{ color: c.textMute, opacity: 0.2 }}>—</span>
              : envHand.map((_, i) => <FaceDownCard key={i} c={c} />)
            }
          </div>

          {/* ─ Row 3: Env board (revealed this turn) ─ */}
          <div style={{
            height: ROW_CARD, flexShrink: 0,
            background: c.envBg,
            borderBottom: `2px solid ${c.border}`,
            display: 'flex', alignItems: 'center',
            padding: '0 12px', gap: 8,
            overflowX: 'auto', overflowY: 'hidden',
          }}>
            <span style={{ color: 'rgba(128,128,128,0.45)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0, writingMode: 'vertical-rl', transform: 'rotate(180deg)', userSelect: 'none' }}>环境</span>
            {envRevealed.length === 0
              ? <span style={{ color: c.textMute, opacity: 0.2 }}>—</span>
              : envRevealed.map(({ card: ec, triggered, isPassive }, idx) => {
                const typeColor = isPassive ? '#f5222d'
                                : ec.probability !== undefined ? '#722ed1' : '#fa8c16';
                return (
                  <GameCard
                    key={`${ec.id}-${idx}`}
                    name={ec.name}
                    effects={ec.effects}
                    typeColor={typeColor}
                    vars={story.variables}
                    c={c}
                    duration={isPassive ? -1 : 1}
                    triggered={triggered}
                    showMissed={!isPassive}
                  />
                );
              })}
          </div>

          {/* ─ Row 4: Player board ─ */}
          <div style={{
            height: ROW_CARD, flexShrink: 0,
            background: c.plyBg,
            borderBottom: `1px solid ${c.border}`,
            display: 'flex', alignItems: 'center',
            padding: '0 12px', gap: 8,
            overflowX: 'auto', overflowY: 'hidden',
          }}>
            <span style={{ color: 'rgba(128,128,128,0.45)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0, writingMode: 'vertical-rl', transform: 'rotate(180deg)', userSelect: 'none' }}>场地</span>

            {/* Confirmed board cards */}
            {board.map(bc => {
              const typeColor = TYPE_COLORS[bc.card.type] ?? '#8c8c8c';
              return (
                <GameCard
                  key={bc.iid}
                  name={bc.card.name}
                  effects={bc.card.effects}
                  typeColor={typeColor}
                  vars={story.variables}
                  c={c}
                  remaining={bc.remaining}
                />
              );
            })}

            {board.length > 0 && playedCards.length > 0 && (
              <div style={{ width: 1, height: '60%', background: c.border, flexShrink: 0 }} />
            )}

            {/* Staged cards (playable this turn, can recall) */}
            {playedCards.map((card, idx) => {
              const typeColor = TYPE_COLORS[card.type] ?? '#8c8c8c';
              return (
                <GameCard
                  key={`staged-${card.id}-${idx}`}
                  name={card.name}
                  effects={card.effects}
                  typeColor={typeColor}
                  vars={story.variables}
                  c={c}
                  duration={card.duration}
                  onClick={() => canAct && recallCard(idx)}
                  canPlay={canAct}
                  showRecall={canAct}
                />
              );
            })}

            {board.length === 0 && playedCards.length === 0 && (
              <span style={{ color: c.textMute, opacity: 0.18 }}>— 无驻场卡 —</span>
            )}
          </div>

          {/* ─ Row 5: Player hand ─ */}
          <div style={{
            height: ROW_CARD, flexShrink: 0,
            background: c.plyBg,
            borderBottom: `1px solid ${c.border}`,
            display: 'flex', alignItems: 'center',
            padding: '0 12px', gap: 8,
            overflowX: 'auto', overflowY: 'hidden',
          }}>
            <span style={{ color: 'rgba(128,128,128,0.45)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0, writingMode: 'vertical-rl', transform: 'rotate(180deg)', userSelect: 'none' }}>手牌</span>

            {hand.length === 0 && canAct
              ? <span style={{ color: c.textMute, opacity: 0.4 }}>{t('game.hand.empty')}</span>
              : hand.map(card => {
                const canPlay   = ap >= card.cost && canAct;
                const typeColor = TYPE_COLORS[card.type] ?? '#8c8c8c';
                return (
                  <GameCard
                    key={card.id}
                    name={card.name}
                    effects={card.effects}
                    typeColor={typeColor}
                    vars={story.variables}
                    c={c}
                    cost={card.cost}
                    duration={card.duration}
                    onClick={() => canPlay && playCard(card)}
                    canPlay={canPlay}
                    className={`player-card ${canPlay ? 'card-playable' : 'card-disabled'}`}
                    flavor={card.flavor}
                    hovered={hoveredCardId === card.id}
                    onMouseEnter={() => setHoveredCardId(card.id)}
                    onMouseLeave={() => setHoveredCardId(null)}
                  />
                );
              })}
          </div>

          {/* ─ Controls strip ─ */}
          <div style={{
            height: ROW_CTRL, flexShrink: 0,
            padding: '0 14px',
            borderBottom: `1px solid ${c.border}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {hand.length >= story.game.hand_size && (
              <span style={{ color: '#fa8c16', fontFamily: 'monospace', fontWeight: 600, fontSize: 11 }}>手牌已满</span>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={endTurn}
              disabled={!canAct}
              style={{
                padding: '4px 20px', borderRadius: 5, fontWeight: 600, fontSize: 13,
                background: canAct ? c.primary : 'transparent',
                border: `1px solid ${canAct ? c.primary : c.border}`,
                color: canAct ? '#fff' : c.textMute,
                cursor: canAct ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s',
              }}
            >
              {phase === 'env' ? '结算中…' : t('game.end_turn')}
            </button>
          </div>

          {/* ─ Row 6: Player HP bars (status) ─ */}
          <div style={{
            height: ROW_HP, flexShrink: 0,
            background: c.sectionBg,
            padding: '6px 14px',
            display: 'flex', flexWrap: 'wrap', gap: '4px 20px', alignItems: 'center',
          }}>
            <span style={{ color: c.textMute, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>状态</span>
            {defPairs.length === 0
              ? <span style={{ color: c.textMute, opacity: 0.35 }}>—</span>
              : defPairs.map(([key, vdef]) => {
                const val    = Math.round(gs[key] ?? 0);
                const isWarn = val <= 20 && key !== 'epidemic' && key !== 'radiation';
                return (
                  <HpBar key={key} label={vdef.label} value={val} max={vdef.max}
                    color={vdef.color} barTrack={c.barTrack} textColor={c.textSec} warn={isWarn} />
                );
              })}
          </div>

        </div>{/* end main */}

        {/* ════ Right deck column ════ */}
        {/* Sections align 1:1 with rows 1-6 by sharing the same height constants */}
        <div style={{
          width: CARD_W + 18, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          background: c.deckBg, borderLeft: `1px solid ${c.border}`,
        }}>
          {/* Row 1 placeholder (HP height) */}
          <div style={{ height: ROW_HP, flexShrink: 0, borderBottom: `1px solid ${c.border}` }} />

          {/* Row 2: Env deck (aligns with env hand) */}
          <div style={deckSectionStyle()}>
            <DeckPile label="事件" count={envEventDeck.length} total={envEventTotal} c={c} />
          </div>

          {/* Row 3: Env discard (aligns with env board) */}
          <div style={deckSectionStyle(c.border + ' 2px')}>
            <DeckPile label="事件弃" count={envEventDiscard.length} total={envEventTotal} faceUp accentColor="#fa8c16" c={c} />
          </div>

          {/* Row 4: Player discard (aligns with player board) */}
          <div style={deckSectionStyle()}>
            <DeckPile label="我方弃" count={playerDiscard.length} total={playerDeckTotal} faceUp accentColor="#722ed1" c={c} />
          </div>

          {/* Row 5: Player deck (aligns with player hand) */}
          <div style={{ ...deckSectionStyle(), borderBottom: `1px solid ${c.border}` }}>
            <DeckPile label="我方" count={playerDeck.length} total={playerDeckTotal} c={c} />
          </div>

          {/* Rows 6-7 placeholder */}
          <div style={{ flex: 1 }} />
        </div>

      </div>{/* end body */}

      {/* ── Outcome overlay ── */}
      {outcome && (
        <div className="settlement-fade" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: c.panel, border: `1px solid ${c.border}`, borderRadius: 12, padding: '36px 44px', textAlign: 'center', maxWidth: 440, width: '90%', boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>{outcome.win ? '🏆' : '💀'}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: c.text, marginBottom: 8, fontFamily: 'Georgia, serif' }}>
              {outcome.win ? t('game.win_title') : t('game.lose_title')}
            </div>
            <div style={{ color: c.textSec, lineHeight: 1.65, margin: '0 auto 18px', maxWidth: 340, fontSize: 13 }}>{outcome.message}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
              {allPairs.map(([key, vdef]) => (
                <div key={key} style={{ textAlign: 'center', minWidth: 50 }}>
                  <div style={{ color: c.textMute, marginBottom: 2, fontSize: 11 }}>{vdef.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: vdef.color, fontFamily: 'monospace' }}>{Math.round(gs[key] ?? 0)}</div>
                </div>
              ))}
            </div>
            <div style={{ color: c.textMute, marginBottom: 16, fontSize: 12 }}>回合 {Math.min(turn, maxTurns)} / {maxTurns}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => { clearGameState(); window.location.reload(); }}
                style={{ padding: '6px 18px', borderRadius: 6, background: c.primary, border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                {t('game.retry')}
              </button>
              <button onClick={onBack}
                style={{ padding: '6px 18px', borderRadius: 6, background: 'none', border: `1px solid ${c.border}`, color: c.textSec, cursor: 'pointer' }}>
                {t('game.back_select')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
