// game/src/components/StorySelect.tsx
// Academic-style story selection screen

import { useEffect, useState } from 'react';
import { Spin } from 'antd';
import { SunOutlined, MoonOutlined, RocketOutlined } from '@ant-design/icons';

interface StoryCard {
  path: string;
  title: string;
  period: string;
  location: string;
  difficulty: string;
  description: string;
  tags: string[];
  turns: number;
}

const DIFF: Record<string, { label: string; color: string }> = {
  easy:   { label: '容易', color: '#52c41a' },
  medium: { label: '中等', color: '#faad14' },
  hard:   { label: '困难', color: '#f5222d' },
};

function getC(dark: boolean) {
  return dark ? {
    bg: '#0d1a10', panel: '#111f16', border: '#1e3824',
    text: 'rgba(255,255,255,0.92)', textSec: 'rgba(255,255,255,0.72)',
    textMute: 'rgba(255,255,255,0.4)', primary: '#52c41a',
    cardHover: 'rgba(82,196,26,0.06)',
  } : {
    bg: '#f5faf6', panel: '#ffffff', border: '#c8e6c9',
    text: '#1a2e22', textSec: '#3d5c47', textMute: 'rgba(0,0,0,0.42)',
    primary: '#007A33', cardHover: '#e8f5e9',
  };
}

interface Props {
  isDarkMode: boolean;
  onToggleDark: () => void;
  onSelect: (path: string) => void;
}

export default function StorySelect({ isDarkMode, onToggleDark, onSelect }: Props) {
  const c = getC(isDarkMode);
  const [stories, setStories] = useState<StoryCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStories(); }, []);

  const loadStories = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/files');
      const result = await res.json();
      if (!result.success) return;

      // Collect game_story.yaml paths
      const paths: string[] = [];
      const scan = (nodes: any[]) => {
        nodes.forEach(node => {
          if (node.type === 'file' && (node.key?.endsWith('game_story.yaml') || node.key?.endsWith('game_story.yml'))) {
            paths.push(node.key);
          }
          if (node.children) scan(node.children);
        });
      };
      result.data.forEach((n: any) => scan(n.children ?? [n]));

      // Load metadata for each
      const loaded = await Promise.all(paths.map(async path => {
        const base: StoryCard = { path, title: path, period: '', location: '', difficulty: 'medium', description: '', tags: [], turns: 15 };
        try {
          const clean = path.replace(/^mods\//, '');
          const r = await fetch(`/api/file/${clean}`);
          const d = await r.json();
          if (d.success && d.data?.content?.meta) {
            const m = d.data.content.meta;
            const g = d.data.content.game ?? {};
            return {
              ...base,
              title: m.name ?? base.title,
              period: m.period ?? '',
              location: m.location ?? '',
              difficulty: m.difficulty ?? 'medium',
              description: m.description ?? '',
              tags: m.tags ?? [],
              turns: g.max_turns ?? 15,
            };
          }
        } catch {}
        return base;
      }));

      setStories(loaded);
    } catch {}
    finally { setLoading(false); }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: c.bg, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        height: 52, flexShrink: 0,
        background: c.panel, borderBottom: `1px solid ${c.border}`,
        display: 'flex', alignItems: 'center', padding: '0 24px',
      }}>
        {/* Wave wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 'auto' }}>
          <svg viewBox="0 0 44 28" width="44" height="28" fill="none">
            <path d="M2 14 Q7 2 12 14 Q17 26 22 14 Q27 2 32 14 Q37 26 42 14"
                  stroke={c.primary} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: c.text, fontFamily: 'Georgia, serif' }}>Life Matters</span>
            <span style={{ fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: c.textMute, fontFamily: 'monospace' }}>Interactive</span>
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={onToggleDark}
            style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: c.textSec, fontSize: 13, display: 'flex', alignItems: 'center' }}
          >
            {isDarkMode ? <SunOutlined /> : <MoonOutlined />}
          </button>
          <button
            onClick={() => window.open('http://localhost:5173', '_blank')}
            style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '4px 12px', cursor: 'pointer', color: c.textSec, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <RocketOutlined style={{ fontSize: 11 }} /> 仿真平台
          </button>
        </div>
      </div>

      {/* ── Hero ── */}
      <div style={{ padding: '44px 40px 24px', textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: c.text, marginBottom: 10, fontFamily: 'Georgia, serif' }}>
          选择历史场景
        </div>
        <div style={{ fontSize: 13, color: c.textMute, maxWidth: 500, margin: '0 auto', lineHeight: 1.65 }}>
          每个场景基于真实历史事件与科学模型，将复杂的动力学系统转化为可交互的决策游戏。
          <br />
          <span style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.04em' }}>Converter: ODE/SIR models → turn-based card mechanics</span>
        </div>
      </div>

      {/* ── Story grid ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 40px 40px' }}>
        <Spin spinning={loading}>
          {!loading && stories.length === 0 && (
            <div style={{ textAlign: 'center', color: c.textMute, marginTop: 60, fontSize: 13, lineHeight: 1.7 }}>
              未找到场景文件。<br />
              请确保 <code style={{ fontFamily: 'monospace', fontSize: 12 }}>mods/scenarios/to_game/</code> 下有 <code style={{ fontFamily: 'monospace', fontSize: 12 }}>game_story.yaml</code>。
            </div>
          )}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16, maxWidth: 1080, margin: '0 auto',
          }}>
            {stories.map(s => (
              <StoryCardItem key={s.path} story={s} c={c} isDarkMode={isDarkMode} onSelect={() => onSelect(s.path)} />
            ))}
          </div>
        </Spin>
      </div>
    </div>
  );
}

function StoryCardItem({ story, c, isDarkMode, onSelect }: { story: StoryCard; c: any; isDarkMode: boolean; onSelect: () => void }) {
  const [hov, setHov] = useState(false);
  const diff = DIFF[story.difficulty] ?? { label: story.difficulty, color: '#8c8c8c' };

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? c.cardHover : c.panel,
        border: `1px solid ${hov ? c.primary : c.border}`,
        borderRadius: 10, padding: '20px 22px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        transform: hov ? 'translateY(-2px)' : 'none',
        boxShadow: hov
          ? `0 6px 20px ${isDarkMode ? 'rgba(82,196,26,0.14)' : 'rgba(0,80,30,0.12)'}`
          : '0 1px 4px rgba(0,0,0,0.07)',
      }}
    >
      {/* Title row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text, lineHeight: 1.35, flex: 1, fontFamily: 'Georgia, serif' }}>
          {story.title}
        </div>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 10, flexShrink: 0, marginLeft: 8,
          background: diff.color + '22', color: diff.color, fontWeight: 700,
        }}>
          {diff.label}
        </span>
      </div>

      {/* Period / location */}
      {(story.period || story.location) && (
        <div style={{ fontSize: 11, color: c.textMute, marginBottom: 8, fontFamily: 'monospace', letterSpacing: '0.04em' }}>
          {[story.period, story.location].filter(Boolean).join(' · ')}
        </div>
      )}

      {/* Description */}
      <div style={{ fontSize: 12, color: c.textSec, lineHeight: 1.6, marginBottom: 12 }}>
        {story.description.length > 130 ? story.description.slice(0, 130) + '…' : story.description}
      </div>

      {/* Tags + turns */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        {story.tags.slice(0, 3).map(tag => (
          <span key={tag} style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 8,
            border: `1px solid ${c.border}`, color: c.textMute,
          }}>
            {tag}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: c.textMute, fontFamily: 'monospace' }}>
          {story.turns} 回合
        </span>
      </div>
    </div>
  );
}
