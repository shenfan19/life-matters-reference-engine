// game/src/components/StorySelect.tsx
import { useState, useEffect, useMemo } from 'react';
import { SunOutlined, MoonOutlined, RocketOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useI18n, type Language } from '../core/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

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

type SortKey = 'period' | 'location' | 'difficulty';
type ViewMode = 'card' | 'list';

// ─── Tag group definitions ────────────────────────────────────────────────────
// labelKey maps to locale JSON; candidates must match tag values in story YAML files.
// Tags only appear when present in loaded stories.

const TAG_GROUPS: { labelKey: string; key: string; candidates: string[] }[] = [
  {
    labelKey: 'select.tag.era', key: 'era',
    candidates: ['古代', '中世纪', '文艺复兴', '17世纪', '18世纪', '19世纪', '20世纪初', '二战', '现代', '当代',
                 'Ancient', 'Medieval', 'Renaissance', '17th century', '18th century', '19th century', '20th century', 'WWII', 'Modern', 'Contemporary'],
  },
  {
    labelKey: 'select.tag.type', key: 'type',
    candidates: ['科学', '医学', '女性', '政治', '战争', '体育', '经济', '文化', '探险', '宗教', '艺术', '社会',
                 'Science', 'Medicine', 'Women', 'Politics', 'War', 'Sports', 'Economics', 'Culture', 'Exploration', 'Religion', 'Art', 'Society'],
  },
  {
    labelKey: 'select.tag.medical', key: 'medical',
    candidates: ['CKD', '肾病', '内分泌', '蛋白质', '肌肉', '心血管', '消化系统', '传染病', '流行病', '公共卫生', '营养', '外科', '精神科', '肿瘤', '儿科',
                 'Kidney Disease', 'Endocrine', 'Protein', 'Muscle', 'Cardiovascular', 'Digestive', 'Infectious Disease', 'Epidemic', 'Public Health', 'Nutrition', 'Surgery', 'Psychiatry', 'Oncology', 'Pediatrics'],
  },
];

// ─── Difficulty map ───────────────────────────────────────────────────────────

const DIFF: Record<string, { label: string; color: string; order: number }> = {
  easy:   { label: '容易', color: '#52c41a', order: 0 },
  medium: { label: '中等', color: '#faad14', order: 1 },
  hard:   { label: '困难', color: '#f5222d', order: 2 },
};

// ─── Color scheme ─────────────────────────────────────────────────────────────

function getC(dark: boolean) {
  return dark ? {
    bg: '#0d1a10', panel: '#111f16', border: '#1e3824',
    text: 'rgba(255,255,255,0.92)', textSec: 'rgba(255,255,255,0.72)',
    textMute: 'rgba(255,255,255,0.40)', primary: '#52c41a',
    cardHover: 'rgba(82,196,26,0.07)',
    tagBg: 'rgba(82,196,26,0.12)', tagActiveBg: '#52c41a',
    toolbarBg: '#0a1409', activeSort: '#52c41a',
    filterBg: '#0d1a10', filterDivider: '#1e3824',
  } : {
    bg: '#f6ffed', panel: '#ffffff', border: '#c8e6c9',
    text: '#1a2e22', textSec: '#3d5c47', textMute: 'rgba(0,0,0,0.40)',
    primary: '#007A33', cardHover: '#e8f5e9',
    tagBg: '#e8f5e9', tagActiveBg: '#007A33',
    toolbarBg: '#edf7f0', activeSort: '#007A33',
    filterBg: '#f9fcfa', filterDivider: '#d9eedf',
  };
}

function extractYear(period: string): number {
  const m = period?.match(/\d{3,4}/);
  return m ? parseInt(m[0]) : 9999;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  isDarkMode: boolean;
  onToggleDark: () => void;
  onSelect: (path: string) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  sortBy: SortKey;
  setSortBy: (s: SortKey) => void;
  tagFilter: Record<string, string[]>;
  setTagFilter: (f: Record<string, string[]>) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StorySelect({
  isDarkMode, onToggleDark, onSelect,
  viewMode, setViewMode, sortBy, setSortBy, tagFilter, setTagFilter,
}: Props) {
  const c = getC(isDarkMode);
  const { language, setLanguage, t } = useI18n();

  const [stories, setStories] = useState<StoryCard[]>([]);
  const [loading, setLoading]  = useState(true);

  // ── Load stories ────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/files');
        const result = await res.json();
        if (!result.success) return;

        const paths: string[] = [];
        const scan = (nodes: any[]) => {
          nodes.forEach(node => {
            if (node.type === 'file' && (node.key?.endsWith('game_story.yaml') || node.key?.endsWith('game_story.yml')))
              paths.push(node.key);
            if (node.children) scan(node.children);
          });
        };
        result.data.forEach((n: any) => scan(n.children ?? [n]));

        const loaded = await Promise.all(paths.map(async path => {
          const base: StoryCard = { path, title: path, period: '', location: '', difficulty: 'medium', description: '', tags: [], turns: 15 };
          try {
            const r = await fetch(`/api/file/${path.replace(/^mods\//, '')}`);
            const d = await r.json();
            if (d.success && d.data?.content?.meta) {
              const m = d.data.content.meta;
              const g = d.data.content.game ?? {};
              const t2 = d.data.content.turns ?? {};
              const maxTurns = g.max_turns ?? t2.total ?? 15;
              return { ...base, title: m.name ?? base.title, period: m.period ?? '', location: m.location ?? '', difficulty: m.difficulty ?? 'medium', description: m.description ?? '', tags: m.tags ?? [], turns: maxTurns };
            }
          } catch {}
          return base;
        }));

        setStories(loaded.filter(s => s.title !== s.path));
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────────

  const allTags = useMemo(() => [...new Set(stories.flatMap(s => s.tags))], [stories]);

  const activeGroups = useMemo(() =>
    TAG_GROUPS
      .map(g => ({ ...g, available: g.candidates.filter(t => allTags.includes(t)) }))
      .filter(g => g.available.length > 0),
    [allTags]
  );

  const ungroupedTags = useMemo(() => {
    const knownSet = new Set(TAG_GROUPS.flatMap(g => g.candidates));
    return allTags.filter(t => !knownSet.has(t));
  }, [allTags]);

  const displayed = useMemo(() => {
    let list = [...stories];
    const activeFilters = Object.entries(tagFilter).filter(([, tags]) => tags.length > 0);
    if (activeFilters.length > 0)
      list = list.filter(s => activeFilters.every(([, tags]) => tags.some(t => s.tags.includes(t))));
    list.sort((a, b) => {
      if (sortBy === 'period')     return extractYear(a.period) - extractYear(b.period);
      if (sortBy === 'location')   return (a.location || '').localeCompare(b.location || '', 'zh');
      if (sortBy === 'difficulty') return (DIFF[a.difficulty]?.order ?? 1) - (DIFF[b.difficulty]?.order ?? 1);
      return 0;
    });
    return list;
  }, [stories, sortBy, tagFilter]);

  // ── Filter helpers ──────────────────────────────────────────────────────────

  const toggleTag = (groupKey: string, tag: string) => {
    const cur = tagFilter[groupKey] ?? [];
    setTagFilter({ ...tagFilter, [groupKey]: cur.includes(tag) ? cur.filter(tt => tt !== tag) : [...cur, tag] });
  };

  const clearGroup = (groupKey: string) => setTagFilter({ ...tagFilter, [groupKey]: [] });

  const hasAnyFilter = Object.values(tagFilter).some(v => v.length > 0);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: c.bg, color: c.text, overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
    }}>

      {/* ── Header ── */}
      <div style={{ height: 50, flexShrink: 0, background: c.panel, borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10 }}>
        <svg viewBox="0 0 44 28" width="40" height="26" fill="none">
          <path d="M2 14 Q7 2 12 14 Q17 26 22 14 Q27 2 32 14 Q37 26 42 14"
                stroke={c.primary} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ fontSize: 20, fontWeight: 700, color: c.text, fontFamily: 'Georgia, serif' }}>Life Matters</span>

        <div style={{ width: 1, height: 16, background: c.border, flexShrink: 0 }} />

        <button
          onClick={() => window.open('http://localhost:5173', '_blank')}
          style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '4px 11px', cursor: 'pointer', color: c.textSec, display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <RocketOutlined style={{  }} /> {t('app.simulator')}
        </button>

        <div style={{ flex: 1 }} />

        {/* Language selector */}
        <select
          value={language}
          onChange={e => setLanguage(e.target.value as Language)}
          style={{
            padding: '3px 6px', borderRadius: 6,
            border: `1px solid ${c.border}`,
            background: c.panel, color: c.textMute,
            cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="en">EN</option>
          <option value="zh-CN">CHS</option>
          <option value="zh-TW">CHT</option>
        </select>

        <button
          onClick={onToggleDark}
          style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '4px 9px', cursor: 'pointer', color: c.textSec, display: 'flex', alignItems: 'center' }}
        >
          {isDarkMode ? <MoonOutlined /> : <SunOutlined />}
        </button>
      </div>

      {/* ── Toolbar: view toggle + sort ── */}
      <div style={{ flexShrink: 0, background: c.toolbarBg, borderBottom: `1px solid ${c.border}`, padding: '7px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* View toggle */}
        <div style={{ display: 'flex', border: `1px solid ${c.border}`, borderRadius: 6, overflow: 'hidden' }}>
          {(['card', 'list'] as ViewMode[]).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{
              padding: '4px 10px', border: 'none', cursor: 'pointer',
              background: viewMode === mode ? c.primary : 'transparent',
              color: viewMode === mode ? '#fff' : c.textMute,
              transition: 'all 0.15s',
            }}>
              {mode === 'card' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 18, background: c.border }} />

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: c.textMute }}>{t('select.sort')}</span>
          {([['period', 'select.sort.time'], ['location', 'select.sort.region'], ['difficulty', 'select.sort.difficulty']] as [SortKey, string][]).map(([key, tkey]) => (
            <button key={key} onClick={() => setSortBy(key)} style={{
              padding: '3px 10px', borderRadius: 5,
              border: `1px solid ${sortBy === key ? c.activeSort : c.border}`,
              background: sortBy === key ? (isDarkMode ? 'rgba(82,196,26,0.15)' : '#e8f5e9') : 'transparent',
              color: sortBy === key ? c.activeSort : c.textMute,
              cursor: 'pointer', fontWeight: sortBy === key ? 600 : 400, transition: 'all 0.12s',
            }}>{t(tkey)}</button>
          ))}
        </div>
      </div>

      {/* ── Taobao-style tag filter rows ── */}
      {!loading && allTags.length > 0 && (
        <div style={{ flexShrink: 0, background: c.filterBg, borderBottom: `1px solid ${c.border}` }}>
          {[...activeGroups, ...(ungroupedTags.length > 0 ? [{ labelKey: 'select.tag.other', key: '_other', available: ungroupedTags }] : [])].map((group, gi, arr) => {
            const selected = tagFilter[group.key] ?? [];
            const isLast = gi === arr.length - 1;
            return (
              <div key={group.key} style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 3,
                padding: '5px 20px', minHeight: 34,
                borderBottom: isLast ? 'none' : `1px solid ${c.filterDivider}`,
              }}>
                <span style={{ color: c.textMute, width: 34, flexShrink: 0, fontWeight: 600 }}>{t(group.labelKey)}</span>

                <button
                  onClick={() => clearGroup(group.key)}
                  style={{
                    padding: '2px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', marginRight: 4,
                    background: selected.length === 0 ? c.primary : 'transparent',
                    color: selected.length === 0 ? '#fff' : c.textMute,
                    fontWeight: selected.length === 0 ? 600 : 400,
                  }}
                >{t('select.tag.all')}</button>

                {group.available.map(tag => {
                  const active = selected.includes(tag);
                  return (
                    <button key={tag} onClick={() => toggleTag(group.key, tag)} style={{
                      padding: '2px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', marginRight: 3,
                      background: active ? c.tagActiveBg : 'transparent',
                      color: active ? '#fff' : c.text,
                      fontWeight: active ? 600 : 400,
                      transition: 'background 0.12s, color 0.12s',
                    }}>{tag}</button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Count line ── */}
      <div style={{ flexShrink: 0, padding: '5px 20px 2px', color: c.textMute }}>
        {loading ? t('select.loading') : `${displayed.length} ${t('select.scenarios_unit')}${hasAnyFilter ? ' ' + t('select.filtered') : ''}`}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 32px' }}>

        {loading && (
          <div style={{ textAlign: 'center', paddingTop: 60, color: c.textMute }}>{t('select.loading_stories')}</div>
        )}

        {!loading && displayed.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 60, color: c.textMute, lineHeight: 1.7 }}>
            {hasAnyFilter ? t('select.empty_filter') : t('select.empty')}
          </div>
        )}

        {/* Card grid */}
        {!loading && viewMode === 'card' && displayed.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {displayed.map(s => <CardItem key={s.path} story={s} c={c} isDarkMode={isDarkMode} onSelect={() => onSelect(s.path)} turnsLabel={t('select.turns_unit')} />)}
          </div>
        )}

        {/* List */}
        {!loading && viewMode === 'list' && displayed.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {displayed.map(s => <ListItem key={s.path} story={s} c={c} isDarkMode={isDarkMode} onSelect={() => onSelect(s.path)} turnsLabel={t('select.turns_unit')} />)}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Card item ────────────────────────────────────────────────────────────────

function CardItem({ story, c, isDarkMode, onSelect, turnsLabel }: { story: StoryCard; c: any; isDarkMode: boolean; onSelect: () => void; turnsLabel: string }) {
  const [hov, setHov] = useState(false);
  const diff = DIFF[story.difficulty] ?? { label: story.difficulty, color: '#8c8c8c', order: 1 };

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? c.cardHover : c.panel,
        border: `1px solid ${hov ? c.primary : c.border}`,
        borderRadius: 10, padding: '16px 18px',
        cursor: 'pointer', transition: 'all 0.15s',
        transform: hov ? 'translateY(-2px)' : 'none',
        boxShadow: hov
          ? `0 6px 20px ${isDarkMode ? 'rgba(82,196,26,0.12)' : 'rgba(0,80,30,0.10)'}`
          : '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: c.text, lineHeight: 1.35, flex: 1, fontFamily: 'Georgia, serif' }}>
          {story.title}
        </div>
        <span style={{ padding: '2px 7px', borderRadius: 8, flexShrink: 0, marginLeft: 8, background: diff.color + '22', color: diff.color, fontWeight: 700 }}>
          {diff.label}
        </span>
      </div>

      {(story.period || story.location) && (
        <div style={{ color: c.textMute, marginBottom: 7, fontFamily: 'monospace' }}>
          {[story.period, story.location].filter(Boolean).join(' · ')}
        </div>
      )}

      <div style={{ color: c.textSec, lineHeight: 1.6, marginBottom: 10 }}>
        {story.description.length > 110 ? story.description.slice(0, 110) + '…' : story.description}
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {story.tags.slice(0, 4).map(tag => (
          <span key={tag} style={{ padding: '1px 7px', borderRadius: 8, border: `1px solid ${c.border}`, color: c.textMute }}>
            {tag}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', color: c.textMute, fontFamily: 'monospace' }}>
          {story.turns} {turnsLabel}
        </span>
      </div>
    </div>
  );
}

// ─── List item (single-row grid layout) ───────────────────────────────────────

function ListItem({ story, c, isDarkMode, onSelect, turnsLabel }: { story: StoryCard; c: any; isDarkMode: boolean; onSelect: () => void; turnsLabel: string }) {
  const [hov, setHov] = useState(false);
  const diff = DIFF[story.difficulty] ?? { label: story.difficulty, color: '#8c8c8c', order: 1 };

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? c.cardHover : c.panel,
        border: `1px solid ${hov ? c.primary : c.border}`,
        borderRadius: 7, padding: '7px 14px',
        cursor: 'pointer', transition: 'all 0.13s',
        display: 'grid',
        gridTemplateColumns: '190px 1fr auto auto',
        alignItems: 'center', gap: 16,
      }}
    >
      {/* Col 1: title + meta stacked */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: c.text, fontFamily: 'Georgia, serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {story.title}
        </div>
        {(story.period || story.location) && (
          <div style={{ color: c.textMute, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
            {[story.period, story.location].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      {/* Col 2: description — single line, truncated */}
      <div style={{ color: c.textSec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {story.description}
      </div>

      {/* Col 3: tags */}
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {story.tags.slice(0, 3).map(tag => (
          <span key={tag} style={{ padding: '1px 6px', borderRadius: 5, border: `1px solid ${c.border}`, color: c.textMute, whiteSpace: 'nowrap' }}>
            {tag}
          </span>
        ))}
      </div>

      {/* Col 4: difficulty + turns */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ padding: '1px 7px', borderRadius: 5, background: diff.color + '22', color: diff.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {diff.label}
        </span>
        <span style={{ color: c.textMute, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {story.turns} {turnsLabel}
        </span>
      </div>
    </div>
  );
}
