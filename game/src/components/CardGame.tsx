// game/src/components/CardGame.tsx
import { useState, useEffect, useRef } from 'react';
import './CardGame.css';
import { useI18n } from '../core/i18n';
import { loadStoryOverlay, mergeStringOverlay } from '../core/storyI18n';
import { loadNewFormatStory } from '../core/newFormatLoader';
import { fetchYaml } from '../core/fetchYaml';
import { SunOutlined, MoonOutlined, InfoCircleOutlined, LinkOutlined, CheckOutlined } from '@ant-design/icons';
import MusicBar from './MusicBar';
import AboutModal, { AUTHOR } from './AboutModal';
import type { Language } from '../core/i18n';

// ─── CardPulseIcon — card outline + heart suit + QRS trace ───────────────────
const CardPulseIcon = ({ size = 16, color = 'currentColor' }: { size?: number | string, color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
    <rect x="4" y="2" width="16" height="20" rx="2.5" strokeWidth="1.8" />
    <path d="M12,12.5 C9.5,10.5 7.5,9 7.5,7.5 A3,3 0,0,1 12,5 A3,3 0,0,1 16.5,7.5 C16.5,9 14.5,10.5 12,12.5 Z"
          strokeWidth="1.6" />
    <path d="M5.5,17 L8,17 L8.5,18.5 L9.5,13.5 L10.5,19.5 L11.5,17 L18.5,17"
          strokeWidth="1.8" />
  </svg>
);

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

interface VarDef { label: string; value: number; max: number; color: string; higherIsBetter?: boolean; }
interface EffectDef { variable: string; delta: number; }

interface PlayerCard {
  id: string; name: string; type: string; cost: number;
  emoji: string; flavor?: string; effects: EffectDef[];
  duration?: number;
  /** Permanent cards stay in hand after being played — never consumed, not counted toward hand limit */
  permanent?: boolean;
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
  meta: { id: string; name: string; period_start?: string; period_end?: string;
          country?: string; description: string; science_note?: string; tags?: string[]; };
  variables: Record<string, VarDef>;
  goalVariables: string[];
  game: { plays_per_turn: number; max_turns: number; hand_size: number; env_per_turn: number; draw_per_turn?: number; };
  lose_conditions: Array<{ condition: string; message: string }>;
  win_conditions?: Array<{ condition: string; message: string }>;
  player_cards: PlayerCard[];
  environment_cards: EnvCard[];
  cardBackFate: string;
  cardBackPlayer: string;
  music: string[];
}
interface LogEntry { text: string; type: 'pos' | 'neg' | 'neutral'; turn: number; }

// ─── Layout constants (all cards share the same dimensions) ───────────────────
//
// Row heights:
//   ROW_GAUGE   = top/bottom HP bar strips
//   ROW_CARD = 4 card rows (env-hand / env-board / ply-board / ply-hand)
//   ROW_CTRL = controls strip between hand and HP bar
//
// Card graphic size = CARD_W × CARD_H, identical across hand / board / deck piles.
// ROW_CARD = CARD_H + vertical padding for cost/duration badge overflow (8px each) + breathing room.

const CARD_W   = 132;   // px
const CARD_H   = 154;   // px
const ROW_CARD = 190;   // px
const ROW_GAUGE = 84;   // px — gauge row (replaces flat HP bars)
const ROW_CTRL = 40;    // px

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
    // Dark — mirrors sim_gui's C.dark exactly for shared tokens
    ? { bg: '#111111', panel: '#1a1a1a', border: '#2a2a2a',
        text: 'rgba(255,255,255,0.92)', textSec: 'rgba(255,255,255,0.75)',
        textMute: 'rgba(255,255,255,0.52)', primary: '#52c41a',
        sectionBg: '#111111', cardBg: '#222222', logBg: '#0d0d0d',
        barTrack: 'rgba(255,255,255,0.07)',
        envBg: '#161616', plyBg: '#111111', deckBg: '#111111' }
    // Light — mirrors sim_gui's C.light exactly for shared tokens
    : { bg: '#f5f5f5', panel: '#ffffff', border: '#e0e0e0',
        text: '#1a2e22', textSec: '#6b7280', textMute: 'rgba(0,0,0,0.55)',
        primary: '#007A33', sectionBg: '#efefef', cardBg: '#ffffff', logBg: '#efefef',
        barTrack: 'rgba(0,0,0,0.07)',
        envBg: '#f0f0f0', plyBg: '#f5f5f5', deckBg: '#f5f5f5' };
}

// ─── Font scale ───────────────────────────────────────────────────────────────

function makeFontScale(base: number) {
  return {
    xs:   base - 5,   // tiny labels, mono counts, row labels
    sm:   base - 3,   // secondary text, log, buttons
    md:   base,       // body
    lg:   base + 2,   // turn counter, section text
    xl:   base + 4,   // header title
    card: base + 8,   // card name — large for readability
    eff:  base - 1,   // card effect values
  };
}

// ─── Font size selector ───────────────────────────────────────────────────────

function FontSizer({ fontSize, onFontSize, c }: { fontSize: number; onFontSize: (n: number) => void; c: ReturnType<typeof getC> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${c.border}`, borderRadius: 6, overflow: 'hidden' }}>
      {([14, 16, 18] as const).map(size => (
        <button key={size} onClick={() => onFontSize(size)} style={{
          padding: '3px 7px', border: 'none', cursor: 'pointer',
          background: fontSize === size ? c.primary : 'transparent',
          color: fontSize === size ? '#fff' : c.textMute,
          fontSize: 11, fontWeight: 600, lineHeight: 1, transition: 'all 0.12s',
        }}>{size}</button>
      ))}
    </div>
  );
}

// ─── Gauge ────────────────────────────────────────────────────────────────────

type FS = ReturnType<typeof makeFontScale>;

const G_SIZE = 62;
const G_R    = 23;
const G_CX   = G_SIZE / 2;
const G_CY   = G_SIZE / 2;
const G_CIRC = 2 * Math.PI * G_R;
const G_ARC  = G_CIRC * 0.75;   // 270° visible arc
const G_GAP  = G_CIRC * 0.25;   // 90° gap at bottom
const G_SW   = 5.5;              // stroke width

// Convert arc-length position to SVG path string (no transform needed)
// Arc starts at 135° from 3-o'clock (= 7:30 position) and goes clockwise
function gaugeArcPath(startLen: number, endLen: number): string {
  const toRad = (deg: number) => deg * Math.PI / 180;
  const a1 = toRad(135 + (startLen / G_CIRC) * 360);
  const a2 = toRad(135 + (endLen   / G_CIRC) * 360);
  const x1 = G_CX + G_R * Math.cos(a1), y1 = G_CY + G_R * Math.sin(a1);
  const x2 = G_CX + G_R * Math.cos(a2), y2 = G_CY + G_R * Math.sin(a2);
  const large = ((endLen - startLen) / G_CIRC * 360) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${G_R} ${G_R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function Gauge({ varKey, label, value, baseValue, max, higherIsBetter = true, primary, c, fs, hoverEffects }: {
  varKey: string; label: string; value: number; baseValue: number; max: number;
  higherIsBetter?: boolean; primary: string;
  c: ReturnType<typeof getC>; fs: FS;
  hoverEffects: EffectDef[];
}) {
  // Solid arc uses baseValue (= gs normally, = preEnvGs in cumulative mode)
  const rawPct     = Math.max(0, Math.min(1, baseValue / max));
  // Normalize: goodness 1.0 = best, 0.0 = danger
  const goodness   = higherIsBetter ? rawPct : 1 - rawPct;
  const fillLen    = G_ARC * goodness;
  const stateColor = goodness > 0.55 ? primary : goodness > 0.28 ? '#faad14' : '#f5222d';
  // Center label always shows actual gs value
  const displayValue = value;

  // Hover delta → goodness change
  const hoverEff = hoverEffects.find(e => e.variable === varKey);
  let previewLen = 0, previewStart = 0, previewPositive = true;
  if (hoverEff) {
    const rawDelta      = hoverEff.delta / max;
    const goodnessDelta = higherIsBetter ? rawDelta : -rawDelta;
    previewPositive     = goodnessDelta >= 0;
    if (goodnessDelta > 0) {
      previewStart = fillLen;
      previewLen   = Math.min(G_ARC * goodnessDelta, G_ARC - fillLen);
    } else {
      previewLen   = Math.min(G_ARC * Math.abs(goodnessDelta), fillLen);
      previewStart = fillLen - previewLen;
    }
  }
  const previewColor = previewPositive ? '#52c41a' : '#f5222d';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      <svg width={G_SIZE} height={G_SIZE} viewBox={`0 0 ${G_SIZE} ${G_SIZE}`}>
        {/* Track arc */}
        <circle cx={G_CX} cy={G_CY} r={G_R}
          fill="none" stroke={c.barTrack} strokeWidth={G_SW}
          strokeDasharray={`${G_ARC} ${G_GAP}`} strokeLinecap="round"
          transform={`rotate(135 ${G_CX} ${G_CY})`}
        />
        {/* Main fill arc */}
        <circle cx={G_CX} cy={G_CY} r={G_R}
          fill="none" stroke={stateColor} strokeWidth={G_SW}
          strokeDasharray={`${fillLen} ${G_CIRC - fillLen}`} strokeLinecap="round"
          transform={`rotate(135 ${G_CX} ${G_CY})`}
          style={{ transition: 'stroke-dasharray 0.35s ease, stroke 0.25s' }}
        />
        {/* Hollow preview arc — path-based so we can use dasharray for the dotted pattern */}
        {hoverEff && previewLen > 1 && (
          <path
            d={gaugeArcPath(previewStart, previewStart + previewLen)}
            fill="none"
            stroke={previewColor}
            strokeWidth={G_SW}
            strokeLinecap="round"
            strokeDasharray="3.5 2.5"
            opacity={0.85}
          />
        )}
        {/* Value — always shows actual gs value */}
        <text x={G_CX} y={G_CY + 1} textAnchor="middle" dominantBaseline="middle"
          fontSize={fs.sm} fontWeight="700" fill={hoverEff ? previewColor : stateColor} fontFamily="monospace">
          {displayValue}
        </text>
        {/* Lower-is-better indicator */}
        {!higherIsBetter && (
          <text x={G_CX} y={G_SIZE - 5} textAnchor="middle" dominantBaseline="auto"
            fontSize={fs.xs - 2} fill={c.textMute} fontFamily="sans-serif">↓好</text>
        )}
      </svg>
      <div style={{ fontSize: fs.xs - 1, color: c.textMute, textAlign: 'center', marginTop: -2, lineHeight: 1.2, maxWidth: G_SIZE }}>
        {label}
      </div>
    </div>
  );
}

// ─── DeckPile — same CARD_W × CARD_H as hand/board cards ─────────────────────

function DeckPile({ label, count, total, faceUp, accentColor, c, fs, cards, vars, cardBack }: {
  label: string; count: number; total: number;
  faceUp?: boolean; accentColor?: string; c: ReturnType<typeof getC>; fs: FS;
  cards?: (PlayerCard | EnvCard)[]; vars?: Record<string, VarDef>;
  cardBack?: string;
}) {
  const [hov, setHov] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <span style={{ color: c.textMute, fontSize: fs.xs, fontWeight: 700,
                     letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>
        {label}
      </span>
      <div style={{ position: 'relative', width: CARD_W, height: CARD_H, flexShrink: 0 }}>
        {count === 0 ? (
          <div style={{ width: CARD_W, height: CARD_H, borderRadius: 8,
                        border: `1px dashed ${c.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: c.textMute, fontSize: fs.sm }}>空</span>
          </div>
        ) : [2, 1, 0].map(i => (
          <div key={i} style={{
            position: 'absolute', left: i * 2, top: -i * 2,
            width: CARD_W, height: CARD_H, borderRadius: 8,
            background: (faceUp && cardBack) ? 'transparent' : faceUp ? (accentColor ? accentColor + '18' : c.sectionBg) : c.cardBg,
            border: (faceUp && cardBack) ? 'none' : `1px solid ${faceUp ? (accentColor ?? c.border) : c.border}`,
            display: i === 0 ? 'flex' : 'block',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {i === 0 && faceUp && (cardBack
              ? <img src={cardBack} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 7, filter: 'grayscale(1)', opacity: 0.55 }}
                  onError={e => { if (!e.currentTarget.src.includes('assets_common')) e.currentTarget.src = '/stories/assets_common/card_back_fate.png'; }} />
              : <span style={{ color: accentColor ?? c.textMute, fontSize: fs.sm, fontWeight: 700 }}>弃牌</span>
            )}
            {i === 0 && !faceUp && (cardBack
              ? <img src={cardBack} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 7 }}
                  onError={e => { if (!e.currentTarget.src.includes('assets_common')) e.currentTarget.src = '/stories/assets_common/card_back_fate.png'; }} />
              : <span style={{ color: c.textMute, fontSize: fs.xl, opacity: 0.18 }}>?</span>
            )}
          </div>
        ))}
      </div>
      <span style={{ color: c.textMute, fontFamily: 'monospace', fontSize: fs.xs, fontWeight: 600 }}>
        {count}/{total}
      </span>

      {/* Hover tooltip — card list summary */}
      {hov && cards && cards.length > 0 && (
        <div style={{
          position: 'absolute', right: CARD_W + 14, top: 0, zIndex: 200,
          width: 220, maxHeight: 320, overflowY: 'auto',
          background: c.panel, border: `1px solid ${c.border}`, borderRadius: 8,
          padding: '8px 0', boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
        }}>
          <div style={{ padding: '0 12px 6px', color: c.textMute, fontSize: fs.xs, fontWeight: 700,
                        letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${c.border}`, marginBottom: 4 }}>
            {label} ({cards.length})
          </div>
          {cards.map((card, i) => {
            const isPlayer = 'cost' in card;
            const typeColor = isPlayer ? (TYPE_COLORS[(card as PlayerCard).type] ?? '#8c8c8c') : '#fa8c16';
            return (
              <div key={i} style={{ padding: '5px 12px', borderBottom: i < cards.length - 1 ? `1px solid ${c.border}` : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, color: c.text, fontSize: fs.sm }}>{card.name}</span>
                  {isPlayer && (
                    <span style={{ fontSize: fs.xs, color: typeColor, fontWeight: 700,
                                   background: typeColor + '22', padding: '0 5px', borderRadius: 4 }}>
                      {(card as PlayerCard).cost} AP
                    </span>
                  )}
                  {'probability' in card && (card as EnvCard).probability !== undefined && (
                    <span style={{ fontSize: fs.xs, color: '#fa8c16' }}>
                      {Math.round(((card as EnvCard).probability ?? 0) * 100)}%
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {card.effects.map((e, j) => {
                    const vLabel = vars?.[e.variable]?.label ?? e.variable;
                    return (
                      <span key={j} style={{ fontFamily: 'monospace', fontSize: fs.xs,
                                             color: e.delta > 0 ? '#52c41a' : '#f5222d', fontWeight: 600 }}>
                        {vLabel} {e.delta > 0 ? '+' : ''}{e.delta}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── DashedSlot — empty card slot placeholder ─────────────────────────────────

function DashedSlot({ c, variant = 'keep' }: { c: ReturnType<typeof getC>; variant?: 'play' | 'keep' | 'discard' }) {
  const accent = variant === 'play' ? '#faad14' : variant === 'discard' ? '#8c8c8c' : '#1677ff';
  return (
    <div style={{
      width: CARD_W, height: CARD_H, flexShrink: 0, borderRadius: 8,
      border: `1.5px dashed ${accent}55`,
      background: accent + '11',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ color: accent + '66', fontSize: 11, fontFamily: 'monospace' }}>
        {variant === 'play' ? '打出' : variant === 'discard' ? '放弃' : '保留'}
      </span>
    </div>
  );
}

// ─── FaceDownCard — uniform card-back for opponent hand ───────────────────────

function FaceDownCard({ c, fs, cardBack }: { c: ReturnType<typeof getC>; fs: FS; cardBack?: string }) {
  return (
    <div style={{
      width: CARD_W, height: CARD_H, flexShrink: 0, borderRadius: 8,
      background: c.envBg, border: `1px solid ${c.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {cardBack
        ? <img src={cardBack} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 7 }}
            onError={e => { if (!e.currentTarget.src.includes('assets_common')) e.currentTarget.src = '/stories/assets_common/card_back_fate.png'; }} />
        : <span style={{ color: c.textMute, fontSize: fs.xl, opacity: 0.2 }}>?</span>
      }
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
  fs: FS;
  // cost badge (player cards only)
  cost?: number;
  // duration: -1=permanent ∞, 0=instant 即, N=countdown
  duration?: number;
  // board remaining (board variant)
  remaining?: number;
  // interaction
  onClick?: () => void;
  onDiscard?: () => void;
  canPlay?: boolean;
  className?: string;
  // drag-to-discard / right-click-to-discard
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
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
  // permanent card — stays in hand, always usable
  permanent?: boolean;
  // force "hovered" visual even without mouse (cumulative mode float)
  floated?: boolean;
  // extra inline style (e.g. excess-card highlight)
  style?: React.CSSProperties;
}

function GameCard({
  name, effects, typeColor, vars, c, fs,
  cost, duration, remaining,
  onClick, onDiscard, canPlay = true, className = '',
  showRecall, flavor, hovered, onMouseEnter, onMouseLeave,
  triggered, showMissed, permanent, floated, style: extraStyle,
  draggable: isDraggable, onDragStart, onDragEnd, onContextMenu,
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
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`${className} ${triggered !== undefined ? (triggered ? 'env-card env-triggered' : 'env-card') : ''}`}
      style={{
        width: CARD_W, height: CARD_H, flexShrink: 0,
        background: c.cardBg,
        border: `1px solid ${permanent ? c.primary : c.border}`,
        borderRadius: 10,
        padding: '12px 10px 10px',
        cursor: isDraggable ? 'grab' : onClick ? (canPlay ? 'pointer' : 'not-allowed') : 'default',
        display: 'flex', flexDirection: 'column', gap: 6,
        position: 'relative',
        transform: (hovered || floated) ? 'translateY(-4px)' : undefined,
        boxShadow: (hovered || floated) ? `0 6px 18px rgba(0,0,0,0.22)` : undefined,
        transition: 'transform 0.15s, box-shadow 0.15s',
        ...extraStyle,
      }}
    >
      {/* Tooltip */}
      {hovered && flavor && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)',
          background: c.panel, border: `1px solid ${c.border}`,
          borderRadius: 7, padding: '7px 10px',
          color: c.textSec, fontStyle: 'italic', lineHeight: 1.5, fontSize: fs.sm,
          width: 200, zIndex: 100, pointerEvents: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.28)', whiteSpace: 'normal',
        }}>{flavor}</div>
      )}

      {/* Recall button */}
      {showRecall && (
        <div style={{
          position: 'absolute', top: -6, right: -6,
          width: 16, height: 16, borderRadius: '50%',
          background: c.sectionBg, border: `1px solid ${c.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: c.textMute, fontSize: fs.xs, zIndex: 2,
        }}>↩</div>
      )}

      {/* Discard button — bottom LEFT, visible on hand cards that can be staged for discard */}
      {onDiscard && (
        <div
          onClick={e => { e.stopPropagation(); onDiscard(); }}
          style={{
            position: 'absolute', bottom: -6, left: -6,
            width: 18, height: 18, borderRadius: '50%',
            background: c.sectionBg, border: `1px solid ${c.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: c.textMute, fontSize: fs.xs - 1, zIndex: 2, cursor: 'pointer',
            lineHeight: 1,
          }}>✕</div>
      )}

      {/* Permanent badge — bottom RIGHT */}
      {permanent && (
        <div style={{
          position: 'absolute', bottom: -6, right: -6,
          width: 18, height: 18, borderRadius: '50%',
          background: c.primary, border: `2px solid ${c.panel}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: fs.xs + 1, color: '#fff', fontWeight: 900, zIndex: 2, lineHeight: 1,
        }}>∞</div>
      )}

      {/* Cost badge — top LEFT (player cards only) */}
      {cost !== undefined && (
        <div style={{
          position: 'absolute', top: -8, left: -8,
          width: 20, height: 20, borderRadius: '50%',
          background: typeColor, border: `2px solid ${c.panel}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, color: '#fff', fontSize: fs.xs, zIndex: 1,
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
          fontSize: fs.xs, zIndex: 1,
        }}>
          {rem !== undefined ? remLabel : durLabel}
        </div>
      )}

      {/* Card name — large for readability */}
      <div style={{ fontWeight: 700, color: c.text, fontSize: fs.card, lineHeight: 1.2, marginBottom: 2 }}>
        {name}
      </div>

      {/* "未触发" label for env cards */}
      {showMissed && triggered === false && (
        <div style={{ color: c.textMute, fontSize: fs.xs }}>未触发</div>
      )}

      {/* Effects */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {effects.map((e, i) => {
          const label = vars[e.variable]?.label ?? e.variable;
          return (
            <div key={i} style={{ fontFamily: 'monospace', fontSize: fs.eff, fontWeight: 600,
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

interface Props { storyPath: string; isDarkMode: boolean; onToggleDark: () => void; onBack: () => void; fontSize: number; onFontSize: (n: number) => void; }

function ShareButton({ storyPath, c, fs }: { storyPath: string; c: any; fs: any }) {
  const [copied, setCopied] = useState(false);
  const handleShare = () => {
    const clean = storyPath.replace(/^mods\//, '');
    const url = `${window.location.origin}${window.location.pathname}?story=${clean}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={handleShare} title="复制分享链接"
      style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: copied ? c.primary : c.textMute, display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}>
      {copied ? <CheckOutlined /> : <LinkOutlined />}
    </button>
  );
}

export default function CardGame({ storyPath, isDarkMode, onToggleDark, onBack, fontSize, onFontSize }: Props) {
  const c = getC(isDarkMode);
  const fs = makeFontScale(fontSize);
  const { language, setLanguage, t, isLoaded } = useI18n();
  const langAtLoad = useRef(language);

  const [story, setStory]     = useState<GameStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // ── Core game state ──────────────────────────────────────────────────────────
  const [gs, setGs]               = useState<Record<string, number>>({});
  const [playsLeft, setPlaysLeft] = useState(3);
  const [turn, setTurn]           = useState(1);
  const [hand, setHand]           = useState<PlayerCard[]>([]);
  const [playerDeck, setPlayerDeck]       = useState<PlayerCard[]>([]);
  const [playerDiscard, setPlayerDiscard] = useState<PlayerCard[]>([]);
  const [playerDeckTotal, setPlayerDeckTotal] = useState(0);

  const [board, setBoard]                 = useState<BoardCard[]>([]);
  const [playedCards, setPlayedCards]     = useState<PlayerCard[]>([]);
  const [stagedDiscards, setStagedDiscards] = useState<PlayerCard[]>([]);
  const [turnInitGs, setTurnInitGs]       = useState<Record<string, number>>({});
  const [dragOverDiscard, setDragOverDiscard] = useState(false);
  const [dragOverPlay, setDragOverPlay]       = useState(false);
  const [dragOverHand, setDragOverHand]       = useState(false);
  const [dragSource, setDragSource]           = useState<'hand' | 'played' | 'discard' | null>(null);
  // Snapshot of gs at the moment the player clicks End Turn (before any env resolution)
  const [preEnvGs, setPreEnvGs]       = useState<Record<string, number>>({});

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
  const [hoveredCardId, setHoveredCardId]             = useState<string | null>(null);
  const [boardHoveredEffects, setBoardHoveredEffects] = useState<EffectDef[]>([]);
  const [totalDeltaMode, setTotalDeltaMode]           = useState(false);
  const [aboutOpen, setAboutOpen]                     = useState(false);
  const [showScenarioIntro, setShowScenarioIntro]     = useState(false);

  // ── Animation state ──────────────────────────────────────────────────────────
  // Map<cardId, staggerIndex> for newly drawn cards entering hand
  const [newlyDealtMap, setNewlyDealtMap] = useState<Map<string, number>>(new Map());
  // ID of the card just staged to the play zone
  const [lastStagedId, setLastStagedId]   = useState<string | null>(null);
  // Set of env card IDs being revealed this turn
  const [revealAnimIds, setRevealAnimIds] = useState<Set<string>>(new Set());

  // Helper: negate all deltas
  const negate = (effs: EffectDef[]): EffectDef[] => effs.map(e => ({ ...e, delta: -e.delta }));

  // Merge arrays of effects by variable (sum deltas)
  const mergeEffects = (...groups: EffectDef[][]): EffectDef[] => {
    const map = new Map<string, number>();
    for (const group of groups)
      for (const e of group)
        map.set(e.variable, (map.get(e.variable) ?? 0) + e.delta);
    return Array.from(map.entries()).map(([variable, delta]) => ({ variable, delta }));
  };

  const handHoverEffects = hoveredCardId
    ? (hand.find(hc => hc.id === hoveredCardId)?.effects ?? [])
    : [];

  // Cumulative delta = all this turn's effects: triggered env cards + board cards + staged played cards
  const triggeredEnvEffects = envRevealed.filter(r => r.triggered).flatMap(r => r.card.effects);
  const boardEffects        = board.flatMap(bc => bc.card.effects);
  const stagedEffects       = playedCards.flatMap(c => c.effects);
  const cumulativeTurnDelta = mergeEffects(triggeredEnvEffects, boardEffects, stagedEffects);

  // hoverEffects fed to gauges:
  // Non-cumulative: hand card hover (add) OR board/env card hover (negate = counterfactual)
  // Cumulative:     all this turn's effects always shown + optional hand card hover on top
  const hoverEffects: EffectDef[] = totalDeltaMode
    ? mergeEffects(cumulativeTurnDelta, handHoverEffects)
    : handHoverEffects.length > 0 ? handHoverEffects : boardHoveredEffects;

  // In cumulative mode, gauge solid arc shows preEnvGs (start-of-turn base)
  // The dashed arc then shows the full turn delta
  const gaugeBase: Record<string, number> = totalDeltaMode ? preEnvGs : gs;

  // ── Persist ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!story) return;
    writeGameState(storyPath, {
      gs, playsLeft, turn, hand, playerDeck, playerDiscard, playerDeckTotal,
      board, playedCards, stagedDiscards, turnInitGs,
      envHand, envEventDeck, envEventDiscard, envEventTotal, envRevealed,
      phase, logs, outcome,
    });
  }, [gs, playsLeft, turn, hand, playerDeck, playerDiscard, playerDeckTotal,
      board, playedCards, stagedDiscards, turnInitGs,
      envHand, envEventDeck, envEventDiscard, envEventTotal, envRevealed,
      phase, logs, outcome]);

  // ── Load story ───────────────────────────────────────────────────────────────
  useEffect(() => {
    langAtLoad.current = language;
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const clean = storyPath.replace(/^mods\//, '');
        const content = await fetchYaml(clean);
        let s: GameStory = await loadNewFormatStory(clean, content);
        if (!s?.meta || !s?.variables || !s?.player_cards) throw new Error(t('game.load_failed'));
        const overlay = await loadStoryOverlay(clean, langAtLoad.current);
        if (overlay) s = mergeStringOverlay(s, overlay);
        setStory(s);

        const saved = readGameState(storyPath);
        if (saved) {
          setGs(saved.gs ?? {});
          setPlaysLeft(saved.playsLeft ?? s.game.plays_per_turn);
          setTurn(saved.turn ?? 1);
          setHand(saved.hand ?? []);
          setPlayerDeck(saved.playerDeck ?? []);
          setPlayerDiscard(saved.playerDiscard ?? []);
          setPlayerDeckTotal(saved.playerDeckTotal ?? s.player_cards.length);
          setBoard(saved.board ?? []);
          setPlayedCards(saved.playedCards ?? []);
          setStagedDiscards(saved.stagedDiscards ?? []);
          setTurnInitGs(saved.turnInitGs ?? saved.gs ?? {});
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
          // Permanent cards start directly in hand and never enter the deck
          const permCards   = s.player_cards.filter(c => c.permanent);
          const deckCards   = s.player_cards.filter(c => !c.permanent);
          const shuffledPly = shuffle(deckCards);
          const initHandSize = Math.min(s.game.hand_size, shuffledPly.length);
          const total        = shuffledPly.length; // permanent cards not counted in deck total

          setGs(initGs); setTurnInitGs(initGs);
          setPlaysLeft(s.game.plays_per_turn);
          setTurn(1);
          setHand([...permCards, ...shuffledPly.slice(0, initHandSize)]);
          setPlayerDeck(shuffledPly.slice(initHandSize));
          setPlayerDiscard([]);
          setPlayerDeckTotal(total);
          setBoard([]); setPlayedCards([]); setStagedDiscards([]);
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
      } finally { 
        setLoading(false); 
        // Only show scenario intro if not previously seen for this specific story
        const viewed = JSON.parse(localStorage.getItem('game_viewed_stories') ?? '[]');
        if (!viewed.includes(storyPath)) {
          setShowScenarioIntro(true);
        }
      }
    };
    load();
  }, [storyPath]);

  // ── Play card ─────────────────────────────────────────────────────────────────
  const playCard = (card: PlayerCard) => {
    if (phase !== 'player' || !story || outcome) return;
    if (!card.permanent && playsLeft <= 0) return;
    const newGs = applyEffects(card.effects, gs, story.variables);
    setGs(newGs);
    if (card.permanent) {
      // Permanent cards: effects apply, no play slot consumed, card stays in hand
    } else {
      setPlaysLeft(p => p - 1);
      setHand(p => p.filter(c => c.id !== card.id));
      setPlayedCards(prev => [...prev, card]);
      // Trigger stage-in animation for this card
      setLastStagedId(card.id);
      setTimeout(() => setLastStagedId(null), 400);
    }
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
    setPlaysLeft(prev => prev + 1);
    setHand(prev => [...prev, card]);
    // setLogs removed — silent during turn
  };

  // ── Stage card for discard (active choice, reversible until end turn) ─────────
  const stageDiscard = (card: PlayerCard) => {
    if (phase !== 'player' || !story || outcome) return;
    if (card.permanent) return;
    setHand(prev => prev.filter(c => c.id !== card.id));
    setStagedDiscards(prev => [...prev, card]);
  };

  // ── Drag helpers ──────────────────────────────────────────────────────────────

  const clearDragState = () => {
    setDragOverDiscard(false);
    setDragOverPlay(false);
    setDragOverHand(false);
    setDragSource(null);
  };

  const startDrag = (e: React.DragEvent, card: PlayerCard, source: 'hand' | 'played' | 'discard') => {
    e.dataTransfer.setData('cardId', card.id);
    e.dataTransfer.setData('dragSource', source);
    e.dataTransfer.effectAllowed = 'move';
    setDragSource(source);
  };

  // ── Atomic cross-zone moves (recalculate gs) ──────────────────────────────────

  const movePlayedToDiscard = (cardId: string) => {
    if (phase !== 'player' || !story || outcome) return;
    const idx = playedCards.findIndex(c => c.id === cardId);
    if (idx < 0) return;
    const card = playedCards[idx];
    const remaining = playedCards.filter((_, i) => i !== idx);
    let newGs = { ...turnInitGs };
    for (const bc of board) newGs = applyEffects(bc.card.effects, newGs, story.variables);
    for (const pc of remaining) newGs = applyEffects(pc.effects, newGs, story.variables);
    setGs(newGs);
    setPlayedCards(remaining);
    setPlaysLeft(prev => prev + 1);
    setStagedDiscards(prev => [...prev, card]);
  };

  const moveDiscardToPlayed = (cardId: string) => {
    if (phase !== 'player' || !story || outcome) return;
    if (playsLeft <= 0) return;
    const idx = stagedDiscards.findIndex(c => c.id === cardId);
    if (idx < 0) return;
    const card = stagedDiscards[idx];
    const remaining = stagedDiscards.filter((_, i) => i !== idx);
    let newGs = { ...turnInitGs };
    for (const bc of board) newGs = applyEffects(bc.card.effects, newGs, story.variables);
    for (const pc of [...playedCards, card]) newGs = applyEffects(pc.effects, newGs, story.variables);
    setGs(newGs);
    setStagedDiscards(remaining);
    setPlayedCards(prev => [...prev, card]);
    setPlaysLeft(prev => prev - 1);
  };

  // ── Drop zone handlers ─────────────────────────────────────────────────────────

  const handleDiscardDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handlePlayDragOver    = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleHandDragOver    = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const handleDiscardDrop = (e: React.DragEvent) => {
    e.preventDefault();
    clearDragState();
    const cardId = e.dataTransfer.getData('cardId');
    const source = e.dataTransfer.getData('dragSource') as 'hand' | 'played' | 'discard';
    if (source === 'hand') {
      const card = hand.find(c => c.id === cardId);
      if (card) stageDiscard(card);      // stageDiscard already checks handOverflow via canDiscardCard gating
    } else if (source === 'played') {
      movePlayedToDiscard(cardId);       // not gated by overflow — card is not in hand
    }
  };

  const handlePlayDrop = (e: React.DragEvent) => {
    e.preventDefault();
    clearDragState();
    const cardId = e.dataTransfer.getData('cardId');
    const source = e.dataTransfer.getData('dragSource') as 'hand' | 'played' | 'discard';
    if (source === 'hand') {
      const card = hand.find(c => c.id === cardId);
      if (card && (card.permanent || playsLeft > 0)) playCard(card);
    } else if (source === 'discard') {
      moveDiscardToPlayed(cardId);
    }
  };

  const handleHandDrop = (e: React.DragEvent) => {
    e.preventDefault();
    clearDragState();
    const cardId = e.dataTransfer.getData('cardId');
    const source = e.dataTransfer.getData('dragSource') as 'hand' | 'played' | 'discard';
    if (source === 'played') {
      const idx = playedCards.findIndex(c => c.id === cardId);
      if (idx >= 0) recallCard(idx);
    } else if (source === 'discard') {
      const idx = stagedDiscards.findIndex(c => c.id === cardId);
      if (idx >= 0) recallDiscard(idx);
    }
  };

  // ── Recall staged discard back to hand ────────────────────────────────────────
  const recallDiscard = (idx: number) => {
    if (phase !== 'player' || !story || outcome) return;
    const card = stagedDiscards[idx];
    setStagedDiscards(prev => prev.filter((_, i) => i !== idx));
    setHand(prev => [...prev, card]);
  };

  // ── End turn ──────────────────────────────────────────────────────────────────
  const endTurn = () => {
    if (phase !== 'player' || !story || outcome) return;
    setPreEnvGs({ ...gs });   // snapshot before any resolution
    setPhase('env');

    const curGs          = gs;
    const curTurn        = turn;
    const curHand        = hand;
    const curDeck        = playerDeck;
    const curPlyDiscard  = playerDiscard;
    const curStagedDiscs = stagedDiscards;
    const curEnvHand     = envHand;       // face-down cards drawn last turn → resolve now
    const curEvtDeck    = envEventDeck;
    const curEvtDisc    = envEventDiscard;
    const curBoard      = board;
    const curPlayed     = playedCards;
    const passiveEnv    = story.environment_cards.filter(e => e.always_active);

    setTimeout(() => {
      let state = { ...curGs };
      const nextBoard: BoardCard[] = [];
      const revealed: RevealedEnvCard[] = [];
      const newPlyDiscard: PlayerCard[] = [...curPlyDiscard];
      const newLogs: LogEntry[] = [];

      // 0. Commit staged discards
      for (const card of curStagedDiscs) {
        newPlyDiscard.push(card);
        newLogs.push({ text: `放弃了 [${card.name}]`, type: 'neutral', turn: curTurn });
      }

      // 1. Commit staged played cards to log
      for (const card of curPlayed) {
        newLogs.push({ text: `打出 [${card.name}]  ${fmtEffects(card.effects, story.variables)}`, type: 'pos', turn: curTurn });
      }
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

      // 6. Player draw — staging discards made room; space = hand_size - remaining reg hand
      const nextTurn   = curTurn + 1;
      let plyDeck      = [...curDeck];
      let plyDiscard   = [...newPlyDiscard];
      const permHand   = curHand.filter(c => c.permanent);
      const regHand    = curHand.filter(c => !c.permanent);
      const space      = story.game.hand_size - regHand.length;
      const drawPerTurn = story.game.draw_per_turn ?? DRAW_PER_TURN;
      const drawCard   = Math.max(0, Math.min(drawPerTurn, space, plyDeck.length));
      const newCards   = plyDeck.slice(0, drawCard);
      plyDeck          = plyDeck.slice(drawCard);

      // Commit
      setBoard(nextBoard);
      setPlayedCards([]);
      setStagedDiscards([]);
      setPlayerDiscard(plyDiscard);
      setPlayerDeck(plyDeck);
      setEnvHand(newEnvHand);
      setEnvEventDeck(evtDeck);
      setEnvEventDiscard(evtUsedNew);
      setEnvRevealed(revealed);
      setGs(state);
      setLogs(prev => [...newLogs, ...prev]);

      // Trigger env reveal animation
      const revIds = new Set(revealed.filter(r => !r.isPassive).map(r => r.card.id));
      if (revIds.size > 0) {
        setRevealAnimIds(revIds);
        setTimeout(() => setRevealAnimIds(new Set()), 600);
      }

      const loss = checkLosePure(state, story.lose_conditions);
      if (loss) { setOutcome(loss); setPhase('player'); return; }
      const earlyWin = checkWinPure(state, story.win_conditions);
      if (earlyWin) { setOutcome(earlyWin); setPhase('player'); return; }

      if (nextTurn > story.game.max_turns) {
        const w = checkWinPure(state, story.win_conditions);
        setOutcome({ win: !!w, message: w?.message ?? '回合结束，目标未能完全实现。' });
        setPhase('player'); return;
      }

      const newPlays   = story.game.plays_per_turn;
      const nextHand   = [...permHand, ...regHand, ...newCards];
      setTurn(nextTurn);
      setPlaysLeft(newPlays);
      setTurnInitGs(state);
      setHand(nextHand);
      // Trigger deal animation for newly drawn cards
      if (newCards.length > 0) {
        const dealMap = new Map(newCards.map((card, i) => [card.id, i] as [string, number]));
        setNewlyDealtMap(dealMap);
        setTimeout(() => setNewlyDealtMap(new Map()), 600);
      }
      setPhase('player');
      setLogs(prev => [{ text: `── 第 ${nextTurn} 回合 ──`, type: 'neutral', turn: nextTurn }, ...prev]);
    }, 800);
  };

  // ── Loading / error ───────────────────────────────────────────────────────────
  const cEarly = getC(isDarkMode);
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: cEarly.bg, color: cEarly.textMute }}>
      {t('game.loading')}
    </div>
  );
  if (error || !story) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: cEarly.bg, gap: 10 }}>
      <div style={{ color: '#f5222d' }}>{t('game.load_failed')}: {error}</div>
      <button onClick={onBack} style={{ marginTop: 4, background: 'none', border: `1px solid ${cEarly.border}`, borderRadius: 6, padding: '5px 14px', cursor: 'pointer', color: cEarly.textSec }}>{t('game.back')}</button>
    </div>
  );

  const maxTurns    = story.game.max_turns;
  const playsTotal  = story.game.plays_per_turn;
  const goalSet   = new Set(story.goalVariables ?? []);
  const goalPairs = Object.entries(story.variables).filter(([k]) => goalSet.has(k));
  const defPairs  = Object.entries(story.variables).filter(([k]) => !goalSet.has(k));
  const allPairs  = Object.entries(story.variables);
  const canAct = phase === 'player' && !outcome;
  // Discard is only permitted when regular hand cards exceed the hand size limit
  const handOverflow = hand.filter(hc => !hc.permanent).length > story.game.hand_size;

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
  //   1. HP row (goals)         ROW_GAUGE
  //   2. Env hand (face-down)   ROW_CARD
  //   3. Env board (revealed)   ROW_CARD
  //   4. Player board           ROW_CARD
  //   5. Player hand            ROW_CARD
  //   6. Controls               ROW_CTRL
  //   7. HP row (status)        ROW_GAUGE
  //
  //  Right col sections 1-4 align with main rows 2-5.

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: c.bg, color: c.text, overflow: 'hidden', position: 'relative' }}>

      {/* ── Top bar ── */}
      <div style={{ height: 50, flexShrink: 0, background: c.panel, borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10 }}>
        <CardPulseIcon size={28} color={c.primary} />
        <span style={{ fontSize: fs.xl, fontWeight: 700, color: c.text, fontFamily: 'Georgia, serif', flexShrink: 0 }}>{t('app.title')}</span>
        <span style={{ color: c.textMute, fontSize: fs.sm, flexShrink: 0 }}>· {t('about.subtitle')}</span>
        <div style={{ width: 1, height: 14, background: c.border, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, color: c.textSec, fontSize: fs.sm, flexShrink: 0 }}>{story.meta.name}</span>
        <div style={{ flex: 1 }} />
        {/* ── Inline music controls ── */}
        {story.music && story.music.length > 0 && (
          <MusicBar tracks={story.music} c={c} fs={fs} />
        )}
        <ShareButton storyPath={storyPath} c={c} fs={fs} />
        <button onClick={() => { clearGameState(); window.location.reload(); }}
          style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', color: c.textMute, fontSize: fs.sm }}>
          {t('game.retry')}
        </button>
        <button onClick={onBack}
          style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', color: c.textSec, fontSize: fs.sm }}>
          {t('game.back')}
        </button>
        <FontSizer fontSize={fontSize} onFontSize={onFontSize} c={c} />
        <select value={language} onChange={e => setLanguage(e.target.value as Language)}
          style={{ padding: '2px 5px', borderRadius: 6, border: `1px solid ${c.border}`, background: c.panel, color: c.textMute, cursor: 'pointer', outline: 'none', fontSize: fs.sm }}>
          <option value="en">EN</option>
          <option value="zh-CN">CHS</option>
          <option value="zh-TW">CHT</option>
        </select>
        <button onClick={onToggleDark}
          style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: c.textSec, display: 'flex', alignItems: 'center' }}>
          {isDarkMode ? <MoonOutlined /> : <SunOutlined />}
        </button>
        <button onClick={() => setAboutOpen(true)}
          style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: c.textSec, display: 'flex', alignItems: 'center' }}
          title="About">
          <InfoCircleOutlined />
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflowY: 'auto', minHeight: 0 }}>

        {/* ════ Left sidebar: log ════ */}
        <div style={{
          width: 168, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${c.border}`,
          background: c.logBg,
        }}>
          {/* Turn + plays info */}
          <div style={{ flexShrink: 0, padding: '10px 12px 8px', borderBottom: `1px solid ${c.border}` }}>
            <div style={{ color: c.primary, fontWeight: 700, fontSize: fs.lg, fontFamily: 'monospace', marginBottom: 6 }}>
              回合 {turn}<span style={{ color: c.textMute, fontWeight: 400, fontSize: fs.sm }}>/{maxTurns}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {Array.from({ length: playsTotal }).map((_, i) => (
                <div key={i} style={{ width: 9, height: 9, borderRadius: 2, background: i < playsLeft ? c.primary : c.barTrack, transition: 'background 0.2s' }} />
              ))}
            </div>
          </div>

          {/* Event log */}
          <div style={{ flex: 1, padding: '4px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {logs.map((log, i) => (
              <div key={i} style={{
                lineHeight: 1.35, fontSize: fs.xs, wordBreak: 'break-all',
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* ─ Row 1: Goal gauges ─ */}
          <div style={{
            height: ROW_GAUGE, flexShrink: 0,
            background: c.panel,
            borderBottom: `1px solid ${c.border}`,
            padding: '0 14px',
            display: 'flex', alignItems: 'center', gap: 10, overflowX: 'auto',
          }}>
            <span style={{ color: c.textMute, fontSize: fs.xs, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>目标</span>
            {goalPairs.length === 0
              ? <span style={{ color: c.textMute, opacity: 0.35 }}>—</span>
              : goalPairs.map(([key, vdef]) => (
                <Gauge key={key} varKey={key} label={vdef.label}
                  value={Math.round(gs[key] ?? 0)}
                  baseValue={Math.round(gaugeBase[key] ?? gs[key] ?? 0)}
                  max={vdef.max}
                  higherIsBetter={vdef.higherIsBetter !== false}
                  primary={c.primary} c={c} fs={fs} hoverEffects={hoverEffects} />
              ))}
          </div>

          {/* ─ Row 2: Env board (revealed this turn) ─ */}
          <div style={{
            height: ROW_CARD, flexShrink: 0,
            background: c.envBg,
            borderBottom: `2px solid ${c.border}`,
            display: 'flex', alignItems: 'center',
            padding: '0 12px', gap: 8,
            overflowX: 'auto', overflowY: 'hidden',
          }}>
            <span style={{ color: 'rgba(128,128,128,0.45)', fontSize: fs.xs, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0, writingMode: 'vertical-rl', userSelect: 'none' }}>事件</span>
            {envRevealed.length === 0
              ? <span style={{ color: c.textMute, opacity: 0.2 }}>—</span>
              : envRevealed.map(({ card: ec, triggered, isPassive }, idx) => {
                const typeColor = isPassive ? '#f5222d'
                                : ec.probability !== undefined ? '#722ed1' : '#fa8c16';
                // Triggered cards: effects already in gs → show reverse (counterfactual)
                // Untriggered cards: effects NOT in gs → show positive (what could have been)
                const hoverEffs = triggered ? negate(ec.effects) : ec.effects;
                const isRevealing = !isPassive && revealAnimIds.has(ec.id);
                return (
                  <GameCard
                    key={`${ec.id}-${idx}`}
                    name={ec.name}
                    effects={ec.effects}
                    typeColor={typeColor}
                    vars={story.variables}
                    c={c} fs={fs}
                    duration={isPassive ? -1 : 1}
                    triggered={triggered}
                    showMissed={!isPassive}
                    floated={totalDeltaMode}
                    className={isRevealing ? 'card-reveal-in' : ''}
                    style={isRevealing ? { animationDelay: `${idx * 60}ms` } : undefined}
                    onMouseEnter={() => setBoardHoveredEffects(hoverEffs)}
                    onMouseLeave={() => setBoardHoveredEffects([])}
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
            <span style={{ color: 'rgba(128,128,128,0.45)', fontSize: fs.xs, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0, writingMode: 'vertical-rl', userSelect: 'none' }}>应对</span>

            {/* Confirmed board cards (from previous turns) */}
            {board.map(bc => {
              const typeColor = TYPE_COLORS[bc.card.type] ?? '#8c8c8c';
              return (
                <GameCard
                  key={bc.iid}
                  name={bc.card.name}
                  effects={bc.card.effects}
                  typeColor={typeColor}
                  vars={story.variables}
                  c={c} fs={fs}
                  remaining={bc.remaining}
                  floated={totalDeltaMode}
                  onMouseEnter={() => !totalDeltaMode && setBoardHoveredEffects(negate(bc.card.effects))}
                  onMouseLeave={() => setBoardHoveredEffects([])}
                />
              );
            })}

            {board.length > 0 && <div style={{ width: 1, height: '60%', background: c.border, flexShrink: 0 }} />}

            {/* Play slots — drop target for hand→play and discard→play */}
            <div
              onDragOver={canAct ? handlePlayDragOver : undefined}
              onDragEnter={canAct ? () => setDragOverPlay(true) : undefined}
              onDragLeave={canAct ? () => setDragOverPlay(false) : undefined}
              onDrop={canAct ? handlePlayDrop : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0 8px', borderRadius: 8, flexShrink: 0,
                border: dragOverPlay ? '2px dashed #faad14' : '2px dashed transparent',
                background: dragOverPlay ? 'rgba(250,173,20,0.06)' : 'transparent',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {Array.from({ length: playsTotal }).map((_, i) => {
                const card = playedCards[i];
                if (card) {
                  const typeColor = TYPE_COLORS[card.type] ?? '#8c8c8c';
                  return (
                    <GameCard
                      key={`staged-${card.id}-${i}`}
                      name={card.name}
                      effects={card.effects}
                      typeColor={typeColor}
                      vars={story.variables}
                      c={c} fs={fs}
                      duration={card.duration}
                      floated={totalDeltaMode}
                      onClick={() => canAct && recallCard(i)}
                      canPlay={canAct}
                      showRecall={canAct}
                      draggable={canAct}
                      onDragStart={canAct ? (e) => startDrag(e, card, 'played') : undefined}
                      onDragEnd={clearDragState}
                      className={lastStagedId === card.id ? 'card-stage-in' : ''}
                    />
                  );
                }
                return <DashedSlot key={`play-slot-${i}`} c={c} variant="play" />;
              })}
            </div>

            {/* ── Discard staging zone (drag-drop target) ── */}
            <div style={{ width: 1, height: '60%', background: c.border, flexShrink: 0, marginLeft: 4 }} />
            <span style={{ color: dragOverDiscard ? '#8c8c8c' : 'rgba(128,128,128,0.3)', fontSize: fs.xs, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0, writingMode: 'vertical-rl', userSelect: 'none', transition: 'color 0.15s' }}>放弃</span>
            <div
              onDragOver={canAct && (dragSource === 'played' || (dragSource === 'hand' && handOverflow)) ? handleDiscardDragOver : undefined}
              onDragEnter={canAct && (dragSource === 'played' || (dragSource === 'hand' && handOverflow)) ? () => setDragOverDiscard(true) : undefined}
              onDragLeave={canAct ? () => setDragOverDiscard(false) : undefined}
              onDrop={canAct ? handleDiscardDrop : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0 8px', borderRadius: 8, flexShrink: 0,
                border: dragOverDiscard ? '2px dashed #8c8c8c' : '2px dashed transparent',
                background: dragOverDiscard ? 'rgba(140,140,140,0.08)' : 'transparent',
                transition: 'border-color 0.15s, background 0.15s',
                minWidth: CARD_W + 16,
              }}
            >
              {stagedDiscards.map((card, i) => {
                const typeColor = TYPE_COLORS[card.type] ?? '#8c8c8c';
                return (
                  <GameCard
                    key={`discard-staged-${card.id}-${i}`}
                    name={card.name}
                    effects={card.effects}
                    typeColor={typeColor}
                    vars={story.variables}
                    c={c} fs={fs}
                    duration={card.duration}
                    onClick={() => canAct && recallDiscard(i)}
                    canPlay={canAct}
                    showRecall={canAct}
                    draggable={canAct}
                    onDragStart={canAct ? (e) => startDrag(e, card, 'discard') : undefined}
                    onDragEnd={clearDragState}
                    style={{ opacity: 0.55, filter: 'grayscale(45%)' }}
                  />
                );
              })}
              {stagedDiscards.length === 0 && <DashedSlot key="discard-hint" c={c} variant="discard" />}
            </div>
          </div>

          {/* ─ Row 5: Player hand (drop target for played→hand and discard→hand) ─ */}
          <div
            onDragOver={canAct && (dragSource === 'played' || dragSource === 'discard') ? handleHandDragOver : undefined}
            onDragEnter={canAct && (dragSource === 'played' || dragSource === 'discard') ? () => setDragOverHand(true) : undefined}
            onDragLeave={canAct ? () => setDragOverHand(false) : undefined}
            onDrop={canAct ? handleHandDrop : undefined}
            style={{
              height: ROW_CARD, flexShrink: 0,
              background: dragOverHand ? (dark ? 'rgba(22,119,255,0.06)' : 'rgba(22,119,255,0.04)') : c.plyBg,
              borderBottom: `1px solid ${dragOverHand ? '#1677ff' : c.border}`,
              display: 'flex', alignItems: 'center',
              padding: '0 12px', gap: 8,
              overflowX: 'auto', overflowY: 'hidden',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            <span style={{ color: 'rgba(128,128,128,0.45)', fontSize: fs.xs, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0, writingMode: 'vertical-rl', userSelect: 'none' }}>手牌</span>

            {(() => {
              const permCards = hand.filter(c => c.permanent);
              const regCards  = hand.filter(c => !c.permanent);
              const handSize  = story.game.hand_size;

              const renderCard = (card: PlayerCard, excess = false) => {
                const canPlay        = (card.permanent || playsLeft > 0) && canAct;
                // Discard only allowed when hand exceeds limit (overflow constraint)
                const canDiscardCard = canAct && !card.permanent && handOverflow;
                const typeColor      = TYPE_COLORS[card.type] ?? '#8c8c8c';
                const dealIdx        = newlyDealtMap.get(card.id) ?? -1;
                const outlineStyle: React.CSSProperties = excess
                  ? { outline: `2px solid #f5222d`, outlineOffset: -2 }
                  : {};
                const dealStyle: React.CSSProperties = dealIdx >= 0
                  ? { animationDelay: `${dealIdx * 75}ms` }
                  : {};
                return (
                  <GameCard
                    key={card.id}
                    name={card.name}
                    effects={card.effects}
                    typeColor={typeColor}
                    vars={story.variables}
                    c={c} fs={fs}
                    duration={card.duration}
                    permanent={card.permanent}
                    onClick={() => { if (canPlay) playCard(card); }}
                    onDiscard={canDiscardCard ? () => stageDiscard(card) : undefined}
                    draggable={canAct && !card.permanent}
                    onDragStart={canAct && !card.permanent ? (e) => startDrag(e, card, 'hand') : undefined}
                    onDragEnd={clearDragState}
                    canPlay={canPlay}
                    className={`player-card ${canPlay ? 'card-playable' : 'card-disabled'}${dealIdx >= 0 ? ' card-deal-in' : ''}`}
                    flavor={card.flavor}
                    hovered={hoveredCardId === card.id}
                    onMouseEnter={() => setHoveredCardId(card.id)}
                    onMouseLeave={() => setHoveredCardId(null)}
                    style={{ ...outlineStyle, ...dealStyle }}
                    onContextMenu={canDiscardCard ? (e) => { e.preventDefault(); stageDiscard(card); } : undefined}
                  />
                );
              };

              if (hand.length === 0 && canAct)
                return <span style={{ color: c.textMute, opacity: 0.4 }}>{t('game.hand.empty')}</span>;

              return <>
                {/* Keep slots for regular cards */}
                {Array.from({ length: handSize }).map((_, i) => {
                  const card = regCards[i];
                  if (card) return renderCard(card);
                  return <DashedSlot key={`keep-slot-${i}`} c={c} />;
                })}
                {/* Excess regular cards — highlighted red, will discard at end of turn */}
                {regCards.slice(handSize).map(card => renderCard(card, true))}
                {/* Permanent cards — always appended after slots, no limit */}
                {permCards.map(card => renderCard(card))}
              </>;
            })()}
          </div>

          {/* ─ Controls strip ─ */}
          <div style={{
            height: ROW_CTRL, flexShrink: 0,
            padding: '0 14px',
            borderBottom: `1px solid ${c.border}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {canAct && hand.filter(c => !c.permanent).length >= story.game.hand_size && stagedDiscards.length === 0 && (
              <span style={{ color: '#fa8c16', fontFamily: 'monospace', fontWeight: 600, fontSize: fs.xs }}>放弃一张牌以抽新牌</span>
            )}
            <div style={{ flex: 1 }} />
            {/* Total-delta mode toggle */}
            <button
              onClick={() => setTotalDeltaMode(m => !m)}
              title={totalDeltaMode ? '切换：仅显示单卡增量' : '切换：显示应对累计增量'}
              style={{
                padding: '2px 9px', borderRadius: 5, fontSize: fs.xs, fontWeight: 600, cursor: 'pointer',
                background: totalDeltaMode ? c.primary + '22' : 'none',
                border: `1px solid ${totalDeltaMode ? c.primary : c.border}`,
                color: totalDeltaMode ? c.primary : c.textMute,
                transition: 'all 0.15s',
              }}
            >
              {totalDeltaMode ? '∑ 累计' : '∑'}
            </button>
            <button
              onClick={endTurn}
              disabled={!canAct}
              style={{
                padding: '4px 20px', borderRadius: 5, fontWeight: 600, fontSize: fs.sm,
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

          {/* ─ Row 7: Status gauges ─ */}
          <div style={{
            height: ROW_GAUGE, flexShrink: 0,
            background: c.sectionBg,
            padding: '0 14px',
            display: 'flex', alignItems: 'center', gap: 10, overflowX: 'auto',
          }}>
            <span style={{ color: c.textMute, fontSize: fs.xs, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>状态</span>
            {defPairs.length === 0
              ? <span style={{ color: c.textMute, opacity: 0.35 }}>—</span>
              : defPairs.map(([key, vdef]) => (
                <Gauge key={key} varKey={key} label={vdef.label}
                  value={Math.round(gs[key] ?? 0)}
                  baseValue={Math.round(gaugeBase[key] ?? gs[key] ?? 0)}
                  max={vdef.max}
                  higherIsBetter={vdef.higherIsBetter !== false}
                  primary={c.primary} c={c} fs={fs} hoverEffects={hoverEffects} />
              ))}
          </div>

        </div>{/* end main */}

        {/* ════ Right deck column ════ */}
        {/* Sections align 1:1 with rows 1-6 by sharing the same height constants */}
        <div style={{
          width: CARD_W + 18, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          background: c.deckBg, borderLeft: `1px solid ${c.border}`,
        }}>
          {/* Row 1 placeholder (aligns with goal gauges) */}
          <div style={{ height: ROW_GAUGE, flexShrink: 0, borderBottom: `1px solid ${c.border}` }} />

          {/* Row 2: Env discard (aligns with env board) */}
          <div style={deckSectionStyle(c.border + ' 2px')}>
            <DeckPile label="事件弃" count={envEventDiscard.length} total={envEventTotal} faceUp accentColor="#fa8c16"
              cards={envEventDiscard} vars={story.variables} c={c} fs={fs} cardBack={story.cardBackFate} />
          </div>

          {/* Row 3: Player discard (aligns with player board + discard staging) */}
          <div style={deckSectionStyle()}>
            <DeckPile label="我方弃" count={playerDiscard.length} total={playerDeckTotal} faceUp accentColor="#722ed1"
              cards={playerDiscard} vars={story.variables} c={c} fs={fs} cardBack={story.cardBackPlayer} />
          </div>

          {/* Row 4: Player deck (aligns with player hand) */}
          <div style={{ ...deckSectionStyle(), borderBottom: `1px solid ${c.border}` }}>
            <DeckPile label="我方" count={playerDeck.length} total={playerDeckTotal}
              cards={playerDeck} vars={story.variables} c={c} fs={fs} cardBack={story.cardBackPlayer} />
          </div>

          {/* Placeholder aligns with controls + status */}
          <div style={{ flex: 1 }} />
        </div>

        {/* ── Scenario Intro / Disclaimer Overlay ── */}
        {isLoaded && showScenarioIntro && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20
          }}>
            <div style={{
              background: c.panel, borderRadius: 16,
              maxWidth: 520, width: '90%', maxHeight: '90vh', overflowY: 'auto',
              padding: '40px 48px',
              boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Story name */}
              <div style={{ fontSize: fs.xl, fontWeight: 700, color: c.text, marginBottom: 6, fontFamily: 'Georgia, serif', textAlign: 'center' }}>
                {story.meta.name}
              </div>

              {/* Disclaimer label */}
              <div style={{ fontSize: fs.md, fontWeight: 700, color: c.textSec, textAlign: 'center', marginBottom: 20, marginTop: 4 }}>
                {t('disclaimer.title')}
              </div>

              {/* Intro */}
              <div style={{ color: c.textSec, fontSize: fs.sm, lineHeight: 1.7, marginBottom: 20 }}>
                {t('disclaimer.intro')}
              </div>

              {/* Points */}
              <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 18, marginBottom: 28 }}>
                {Array.isArray(t('disclaimer.points')) && (t('disclaimer.points') as string[]).map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12, color: c.textSec, fontSize: fs.sm, lineHeight: 1.6 }}>
                    <span style={{ color: c.primary, flexShrink: 0, marginTop: 2 }}>·</span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  const viewed = JSON.parse(localStorage.getItem('game_viewed_stories') ?? '[]');
                  if (!viewed.includes(storyPath)) {
                    viewed.push(storyPath);
                    localStorage.setItem('game_viewed_stories', JSON.stringify(viewed));
                  }
                  setShowScenarioIntro(false);
                }}
                style={{
                  alignSelf: 'center', padding: '11px 48px', borderRadius: 10,
                  background: c.primary, color: '#fff',
                  border: 'none', cursor: 'pointer',
                  fontSize: fs.md, fontWeight: 700, minWidth: 160,
                  transition: 'opacity 0.2s',
                }}
              >
                {t('disclaimer.start')}
              </button>
            </div>
          </div>
        )}
      </div>{/* end body */}

      {/* ── Status bar ── */}
      <div style={{
        height: 28, flexShrink: 0,
        background: c.sectionBg, borderTop: `1px solid ${c.border}`,
        display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 12, color: c.textMute,
        fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace',
        fontSize: fs.xs, userSelect: 'none',
      }}>
        <span>{story.meta.name}</span>
        {story.meta.period_start && <>
          <span style={{ opacity: 0.25 }}>│</span>
          <span>{story.meta.period_end && story.meta.period_end !== story.meta.period_start
            ? `${story.meta.period_start}–${story.meta.period_end}`
            : story.meta.period_start}
          </span>
        </>}
        {story.meta.country && <>
          <span style={{ opacity: 0.25 }}>│</span>
          <span>{story.meta.country}</span>
        </>}
        <span style={{ flex: 1, textAlign: 'center', opacity: 0.8, fontSize: fs.xs - 1, fontStyle: 'italic', padding: '0 20px' }}>
          {typeof t('statusBar.disclaimer') === 'string' ? t('statusBar.disclaimer') : ''}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{t('statusBar.license')}</span>
          <span style={{ opacity: 0.2 }}>│</span>
          <span>{AUTHOR.version}</span>
        </span>
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} c={c} fs={fs} />

      {/* ── Outcome overlay ── */}
      {outcome && (
        <div className="settlement-fade" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: c.panel, border: `1px solid ${c.border}`, borderRadius: 12, padding: '36px 44px', textAlign: 'center', maxWidth: 440, width: '90%', boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }}>
            <div style={{ fontSize: fs.xl + 28, marginBottom: 10 }}>{outcome.win ? '🏆' : '💀'}</div>
            <div style={{ fontSize: fs.lg, fontWeight: 700, color: c.text, marginBottom: 8, fontFamily: 'Georgia, serif' }}>
              {outcome.win ? t('game.win_title') : t('game.lose_title')}
            </div>
            <div style={{ color: c.textSec, lineHeight: 1.65, margin: '0 auto 18px', maxWidth: 340, fontSize: fs.sm }}>{outcome.message}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
              {allPairs.map(([key, vdef]) => (
                <div key={key} style={{ textAlign: 'center', minWidth: 50 }}>
                  <div style={{ color: c.textMute, marginBottom: 2, fontSize: fs.xs }}>{vdef.label}</div>
                  <div style={{ fontSize: fs.md, fontWeight: 700, color: vdef.color, fontFamily: 'monospace' }}>{Math.round(gs[key] ?? 0)}</div>
                </div>
              ))}
            </div>
            <div style={{ color: c.textMute, marginBottom: 16, fontSize: fs.sm }}>回合 {Math.min(turn, maxTurns)} / {maxTurns}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => { clearGameState(); window.location.reload(); }}
                style={{ padding: '6px 18px', borderRadius: 6, background: c.primary, border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: fs.sm }}>
                {t('game.retry')}
              </button>
              <button onClick={onBack}
                style={{ padding: '6px 18px', borderRadius: 6, background: 'none', border: `1px solid ${c.border}`, color: c.textSec, cursor: 'pointer', fontSize: fs.sm }}>
                {t('game.back_select')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
