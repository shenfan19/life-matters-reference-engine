// game/src/components/StorySelect.tsx
import { useState, useEffect, useMemo } from 'react';
import { SunOutlined, MoonOutlined, AppstoreOutlined, UnorderedListOutlined, LinkOutlined, CheckOutlined, InfoCircleOutlined } from '@ant-design/icons';
import MusicBar from './MusicBar';
import AboutModal, { AUTHOR } from './AboutModal';
import { useI18n, type Language } from '../core/i18n';
import { fetchYaml } from '../core/fetchYaml';

// HeartPulseIcon: closed heart outline with QRS trace through the middle — sim identity
const HeartPulseIcon = ({ size = 16, color = 'currentColor' }: { size?: number | string, color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
    <path d="M12,21 C6,16 2,12 2,8 A6,6,0,0,1,12,5 A6,6,0,0,1,22,8 C22,12 18,16 12,21 Z"
          strokeWidth="1.8" />
    <path d="M2.5,10 L5.5,10 L6,12 L7,4 L8,14 L9,10 L11,10 L11.5,8 L12.5,10 L21.5,10"
          strokeWidth="1.6" />
  </svg>
);

// CardPulseIcon: card outline + heart suit + QRS trace — game identity
const CardPulseIcon = ({ size = 16, color = 'currentColor' }: { size?: number | string, color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
    <rect x="4" y="2" width="16" height="20" rx="2.5" strokeWidth="1.8" />
    <path d="M12,12.5 C9.5,10.5 7.5,9 7.5,7.5 A3,3 0,0,1 12,5 A3,3 0,0,1 16.5,7.5 C16.5,9 14.5,10.5 12,12.5 Z"
          strokeWidth="1.6" />
    <path d="M5.5,17 L8,17 L8.5,18.5 L9.5,13.5 L10.5,19.5 L11.5,17 L18.5,17"
          strokeWidth="1.8" />
  </svg>
);


// ─── Types ────────────────────────────────────────────────────────────────────

interface StoryCard {
  path: string;
  title: string;
  period: string;
  location: string;
  country: string;
  difficulty: string;
  description: string;
  tags: string[];
  turns: number;
  cardBackFate?: string;
  cardBackPlayer?: string;
}

type SortKey = 'period' | 'location' | 'difficulty';
type ViewMode = 'card' | 'list';

// ─── Tag group definitions ────────────────────────────────────────────────────
// All candidates are canonical English keys — display is handled by TAG_LABELS below.
// Tags only appear in filter UI when present in at least one loaded story.

const TAG_GROUPS: { labelKey: string; key: string; candidates: string[] }[] = [
  {
    labelKey: 'select.tag.era', key: 'era',
    candidates: ['Ancient', 'Medieval', 'Renaissance', '17th Century', '18th Century', '19th Century', 'Early 20th Century', '20th Century', 'WWII', 'Modern', 'Contemporary'],
  },
  {
    labelKey: 'select.tag.type', key: 'type',
    candidates: ['Science', 'Medicine', 'Women', 'Politics', 'War', 'History', 'Society', 'Sports', 'Economics', 'Culture', 'Exploration', 'Religion', 'Art', 'Lifestyle'],
  },
  {
    labelKey: 'select.tag.medical', key: 'medical',
    candidates: ['CKD', 'Kidney Disease', 'Endocrine', 'Protein', 'Muscle', 'Cardiovascular', 'Digestive', 'Infectious Disease', 'Epidemic', 'Public Health', 'Nutrition', 'Surgery', 'Psychiatry', 'Oncology', 'Pediatrics'],
  },
];

// ─── Tag display labels ───────────────────────────────────────────────────────
// Single source of truth for all tag/country translations.
// Fallback chain: requested lang → en → raw key.

const TAG_LABELS: Record<string, Record<string, string>> = {
  // Era
  'Ancient':           { en: 'Ancient',           'zh-CN': '古代',      'zh-TW': '古代'      },
  'Medieval':          { en: 'Medieval',           'zh-CN': '中世纪',    'zh-TW': '中世紀'    },
  'Renaissance':       { en: 'Renaissance',        'zh-CN': '文艺复兴',  'zh-TW': '文藝復興'  },
  '17th Century':      { en: '17th C.',            'zh-CN': '17世纪',    'zh-TW': '17世紀'    },
  '18th Century':      { en: '18th C.',            'zh-CN': '18世纪',    'zh-TW': '18世紀'    },
  '19th Century':      { en: '19th C.',            'zh-CN': '19世纪',    'zh-TW': '19世紀'    },
  'Early 20th Century':{ en: 'Early 20th C.',      'zh-CN': '20世纪初',  'zh-TW': '20世紀初'  },
  '20th Century':      { en: '20th C.',            'zh-CN': '20世纪',    'zh-TW': '20世紀'    },
  'WWII':              { en: 'WWII',               'zh-CN': '二战',      'zh-TW': '二戰'      },
  'Modern':            { en: 'Modern',             'zh-CN': '现代',      'zh-TW': '現代'      },
  'Contemporary':      { en: 'Contemporary',       'zh-CN': '当代',      'zh-TW': '當代'      },
  // Type
  'Science':           { en: 'Science',            'zh-CN': '科学',      'zh-TW': '科學'      },
  'Medicine':          { en: 'Medicine',           'zh-CN': '医学',      'zh-TW': '醫學'      },
  'Women':             { en: 'Women',              'zh-CN': '女性',      'zh-TW': '女性'      },
  'Politics':          { en: 'Politics',           'zh-CN': '政治',      'zh-TW': '政治'      },
  'War':               { en: 'War',                'zh-CN': '战争',      'zh-TW': '戰爭'      },
  'History':           { en: 'History',            'zh-CN': '历史',      'zh-TW': '歷史'      },
  'Society':           { en: 'Society',            'zh-CN': '社会',      'zh-TW': '社會'      },
  'Sports':            { en: 'Sports',             'zh-CN': '体育',      'zh-TW': '體育'      },
  'Economics':         { en: 'Economics',          'zh-CN': '经济',      'zh-TW': '經濟'      },
  'Culture':           { en: 'Culture',            'zh-CN': '文化',      'zh-TW': '文化'      },
  'Exploration':       { en: 'Exploration',        'zh-CN': '探险',      'zh-TW': '探險'      },
  'Religion':          { en: 'Religion',           'zh-CN': '宗教',      'zh-TW': '宗教'      },
  'Art':               { en: 'Art',                'zh-CN': '艺术',      'zh-TW': '藝術'      },
  'Lifestyle':         { en: 'Lifestyle',          'zh-CN': '生活',      'zh-TW': '生活'      },
  // Medical
  'CKD':               { en: 'CKD',               'zh-CN': 'CKD',       'zh-TW': 'CKD'       },
  'Kidney Disease':    { en: 'Kidney Disease',     'zh-CN': '肾病',      'zh-TW': '腎病'      },
  'Endocrine':         { en: 'Endocrine',          'zh-CN': '内分泌',    'zh-TW': '內分泌'    },
  'Protein':           { en: 'Protein',            'zh-CN': '蛋白质',    'zh-TW': '蛋白質'    },
  'Muscle':            { en: 'Muscle',             'zh-CN': '肌肉',      'zh-TW': '肌肉'      },
  'Cardiovascular':    { en: 'Cardiovascular',     'zh-CN': '心血管',    'zh-TW': '心血管'    },
  'Digestive':         { en: 'Digestive',          'zh-CN': '消化系统',  'zh-TW': '消化系統'  },
  'Infectious Disease':{ en: 'Infectious Disease', 'zh-CN': '传染病',    'zh-TW': '傳染病'    },
  'Epidemic':          { en: 'Epidemic',           'zh-CN': '流行病',    'zh-TW': '流行病'    },
  'Public Health':     { en: 'Public Health',      'zh-CN': '公共卫生',  'zh-TW': '公共衛生'  },
  'Nutrition':         { en: 'Nutrition',          'zh-CN': '营养',      'zh-TW': '營養'      },
  'Surgery':           { en: 'Surgery',            'zh-CN': '外科',      'zh-TW': '外科'      },
  'Psychiatry':        { en: 'Psychiatry',         'zh-CN': '精神科',    'zh-TW': '精神科'    },
  'Oncology':          { en: 'Oncology',           'zh-CN': '肿瘤',      'zh-TW': '腫瘤'      },
  'Pediatrics':        { en: 'Pediatrics',         'zh-CN': '儿科',      'zh-TW': '兒科'      },
  // Country
  'France':            { en: 'France',             'zh-CN': '法国',      'zh-TW': '法國'      },
  'UK':                { en: 'UK',                 'zh-CN': '英国',      'zh-TW': '英國'      },
  'US':                { en: 'US',                 'zh-CN': '美国',      'zh-TW': '美國'      },
  'Europe':            { en: 'Europe',             'zh-CN': '欧洲',      'zh-TW': '歐洲'      },
  'China':             { en: 'China',              'zh-CN': '中国',      'zh-TW': '中國'      },
};

function labelTag(key: string, lang: string): string {
  const entry = TAG_LABELS[key];
  return entry?.[lang] ?? entry?.['en'] ?? key;
}

// ─── Difficulty map ───────────────────────────────────────────────────────────

const DIFF: Record<string, { label: Record<string, string>; color: string; order: number }> = {
  easy:   { label: { en: 'Easy',   'zh-CN': '容易', 'zh-TW': '容易' }, color: '#52c41a', order: 0 },
  medium: { label: { en: 'Medium', 'zh-CN': '中等', 'zh-TW': '中等' }, color: '#faad14', order: 1 },
  hard:   { label: { en: 'Hard',   'zh-CN': '困难', 'zh-TW': '困難' }, color: '#f5222d', order: 2 },
};

// ─── Color scheme — mirrors sim_gui's C tokens exactly ────────────────────────

function getC(dark: boolean) {
  return dark ? {
    bg: '#111111', panel: '#1a1a1a', border: '#2a2a2a',
    text: 'rgba(255,255,255,0.92)', textSec: 'rgba(255,255,255,0.75)',
    textMute: 'rgba(255,255,255,0.52)', primary: '#52c41a',
    cardHover: 'rgba(82,196,26,0.08)',
    tagBg: 'rgba(82,196,26,0.12)', tagActiveBg: '#52c41a',
    toolbarBg: '#111111', activeSort: '#52c41a',
    filterBg: '#111111', filterDivider: '#2a2a2a',
  } : {
    bg: '#f5f5f5', panel: '#ffffff', border: '#e0e0e0',
    text: '#1a2e22', textSec: '#6b7280', textMute: 'rgba(0,0,0,0.55)',
    primary: '#007A33', cardHover: '#e8f5e9',
    tagBg: '#efefef', tagActiveBg: '#007A33',
    toolbarBg: '#efefef', activeSort: '#007A33',
    filterBg: '#f5f5f5', filterDivider: '#e0e0e0',
  };
}

// ─── Font scale — offset from base, so one number controls everything ─────────

function makeFontScale(base: number) {
  return {
    xs:   base - 5,   // tiny labels, metadata, mono counts
    sm:   base - 3,   // secondary text, buttons, tags
    md:   base,       // body
    lg:   base + 2,   // subheadings
    xl:   base + 4,   // page title
  };
}

function extractYear(period: string): number {
  const m = period?.match(/\d{3,4}/);
  return m ? parseInt(m[0]) : 9999;
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
  fontSize: number;
  onFontSize: (n: number) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StorySelect({
  isDarkMode, onToggleDark, onSelect,
  viewMode, setViewMode, sortBy, setSortBy, tagFilter, setTagFilter,
  fontSize, onFontSize,
}: Props) {
  const c = getC(isDarkMode);
  const fs = makeFontScale(fontSize);
  const { language, setLanguage, t } = useI18n();

  const [stories, setStories] = useState<StoryCard[]>([]);
  const [loading, setLoading]  = useState(true);
  const [aboutOpen, setAboutOpen] = useState(false);

  // ── Load stories ────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/stories/index.json');
        const cleanPaths: string[] = await res.json();

        const loaded = await Promise.all(cleanPaths.map(async cleanPath => {
          // storyPath keeps the mods/ prefix convention expected by CardGame
          const path = `mods/${cleanPath}`;
          const base: StoryCard = { path, title: path, period: '', location: '', country: '', difficulty: 'medium', description: '', tags: [], turns: 15 };
          try {
            const d = await fetchYaml(cleanPath);
            if (d?.meta) {
              const m = d.meta;
              const maxTurns = d.game?.max_turns ?? d.turns?.total ?? 15;
              const storyDir = cleanPath.includes('/') ? cleanPath.split('/').slice(0, -1).join('/') : cleanPath;
              const toAssetUrl = (rel?: string) => rel ? `/${storyDir}/${rel}` : undefined;
              const cardBackFate   = toAssetUrl(d.card_back_fate   ?? m.card_back_fate);
              const cardBackPlayer = toAssetUrl(d.card_back_player ?? m.card_back_player);
              return { ...base, title: m.name ?? base.title, period: m.period ?? '', location: m.location ?? '', country: m.country ?? '', difficulty: m.difficulty ?? 'medium', description: m.description ?? '', tags: m.tags ?? [], turns: maxTurns, cardBackFate, cardBackPlayer };
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
  const allCountries = useMemo(() => [...new Set(stories.map(s => s.country).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh')), [stories]);

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

  // ── Tag availability (count stories if this tag were selected, other filters fixed) ──
  const tagAvail = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};

    // Helper: filters from all groups EXCEPT excludeKey, skipping stale values
    const othersExcept = (excludeKey: string) =>
      Object.entries(tagFilter).filter(([k, tags]) => {
        if (k === excludeKey || tags.length === 0) return false;
        if (k === '_country') return tags.some(t => allCountries.includes(t));
        return tags.some(t => allTags.includes(t));
      });

    const matchOthers = (s: StoryCard, others: [string, string[]][]) =>
      others.every(([k, tags]) => k === '_country' ? tags.includes(s.country) : tags.some(t => s.tags.includes(t)));

    // Tag groups (active + ungrouped)
    const groups = [
      ...activeGroups,
      ...(ungroupedTags.length > 0 ? [{ key: '_other', available: ungroupedTags }] : []),
    ];
    for (const group of groups) {
      const others = othersExcept(group.key);
      result[group.key] = {};
      for (const tag of group.available) {
        result[group.key][tag] = stories.filter(s => s.tags.includes(tag) && matchOthers(s, others)).length;
      }
    }

    // Country group
    const othersForCountry = othersExcept('_country');
    result['_country'] = {};
    for (const country of allCountries) {
      result['_country'][country] = stories.filter(s => s.country === country && matchOthers(s, othersForCountry)).length;
    }

    return result;
  }, [stories, tagFilter, activeGroups, ungroupedTags, allCountries]);

  const displayed = useMemo(() => {
    let list = [...stories];
    const activeFilters = Object.entries(tagFilter).filter(([k, tags]) => {
      if (tags.length === 0) return false;
      if (k === '_country') return tags.some(t => allCountries.includes(t));
      return tags.some(t => allTags.includes(t)); // skip stale saved values
    });
    if (activeFilters.length > 0)
      list = list.filter(s => activeFilters.every(([key, tags]) =>
        key === '_country' ? tags.includes(s.country) : tags.some(t => s.tags.includes(t))
      ));
    list.sort((a, b) => {
      if (sortBy === 'period')     return extractYear(a.period) - extractYear(b.period);
      if (sortBy === 'location')   return (a.location || '').localeCompare(b.location || '', 'zh');
      if (sortBy === 'difficulty') return (DIFF[a.difficulty]?.order ?? 1) - (DIFF[b.difficulty]?.order ?? 1);
      return 0;
    });
    return list;
  }, [stories, sortBy, tagFilter, allTags, allCountries]);

  // ── Filter helpers ──────────────────────────────────────────────────────────

  const toggleTag = (groupKey: string, tag: string) => {
    const cur = tagFilter[groupKey] ?? [];
    // Single-select per row: selecting an already-active tag clears it, otherwise replace
    setTagFilter({ ...tagFilter, [groupKey]: cur.includes(tag) ? [] : [tag] });
  };

  const clearGroup = (groupKey: string) => setTagFilter({ ...tagFilter, [groupKey]: [] });

  const hasAnyFilter = Object.values(tagFilter).some(v => v.length > 0);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: c.bg, color: c.text, overflow: 'hidden',
      fontSize: fs.md,
    }}>

      {/* ── Header ── */}
      <div style={{ height: 50, flexShrink: 0, background: c.panel, borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10 }}>
        <CardPulseIcon size={32} color={c.primary} />
        <span style={{ fontSize: fs.xl, fontWeight: 700, color: c.text, fontFamily: 'Georgia, serif' }}>{t('app.title')}</span>
        <span style={{ color: c.textMute, fontSize: fs.sm }}>· {t('about.subtitle')}</span>

        <div style={{ width: 1, height: 16, background: c.border, flexShrink: 0 }} />

        <button
          onClick={() => window.open('http://localhost:5173', '_blank')}
          title={t('app.simulator.tip')}
          style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '4px 11px', cursor: 'pointer', color: c.textSec, fontSize: fs.sm, display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <HeartPulseIcon /> {t('app.simulator')}
        </button>

        <div style={{ flex: 1 }} />

        {/* Title music */}
        <MusicBar tracks={['/stories/title.mid']} c={c} fs={fs} />

        {/* Font size selector */}
        <FontSizer fontSize={fontSize} onFontSize={onFontSize} c={c} />

        {/* Language selector */}
        <select
          value={language}
          onChange={e => setLanguage(e.target.value as Language)}
          style={{
            padding: '3px 6px', borderRadius: 6,
            border: `1px solid ${c.border}`,
            background: c.panel, color: c.textMute,
            fontSize: fs.sm,
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
        <button
          onClick={() => setAboutOpen(true)}
          style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '4px 9px', cursor: 'pointer', color: c.textSec, display: 'flex', alignItems: 'center' }}
          title="About"
        >
          <InfoCircleOutlined />
        </button>
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} c={c} fs={fs} />

      {/* ── Tag filter rows ── */}
      {!loading && (allTags.length > 0 || allCountries.length > 0) && (
        <div style={{ flexShrink: 0, background: c.filterBg, borderBottom: `1px solid ${c.border}` }}>
          {/* Country filter row */}
          {allCountries.length > 0 && (() => {
            const selected = tagFilter['_country'] ?? [];
            const hasMore = allTags.length > 0 || ungroupedTags.length > 0;
            return (
              <div style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 3,
                padding: '5px 20px', minHeight: 34,
                borderBottom: hasMore || activeGroups.length > 0 ? `1px solid ${c.filterDivider}` : 'none',
                fontSize: fs.sm,
              }}>
                <span style={{ color: c.textMute, width: 34, flexShrink: 0, fontWeight: 600 }}>{t('select.tag.country')}</span>
                <button
                  onClick={() => clearGroup('_country')}
                  style={{
                    padding: '2px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', marginRight: 4, fontSize: 'inherit',
                    background: selected.length === 0 ? c.primary : 'transparent',
                    color: selected.length === 0 ? '#fff' : c.textMute,
                    fontWeight: selected.length === 0 ? 600 : 400,
                  }}
                >{t('select.tag.all')}</button>
                {allCountries.map(country => {
                  const active = selected.includes(country);
                  const zero = !active && (tagAvail['_country']?.[country] ?? 1) === 0;
                  return (
                    <button key={country} onClick={() => !zero && toggleTag('_country', country)} style={{
                      padding: '2px 10px', borderRadius: 4, border: 'none', marginRight: 3, fontSize: 'inherit',
                      cursor: zero ? 'default' : 'pointer',
                      background: active ? c.tagActiveBg : 'transparent',
                      color: active ? '#fff' : zero ? c.textMute : c.text,
                      fontWeight: active ? 600 : 400,
                      opacity: zero ? 0.38 : 1,
                      transition: 'background 0.12s, color 0.12s, opacity 0.12s',
                    }}>{labelTag(country, language)}</button>
                  );
                })}
              </div>
            );
          })()}
          {[...activeGroups, ...(ungroupedTags.length > 0 ? [{ labelKey: 'select.tag.other', key: '_other', available: ungroupedTags }] : [])].map((group, gi, arr) => {
            const selected = tagFilter[group.key] ?? [];
            const isLast = gi === arr.length - 1;
            return (
              <div key={group.key} style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 3,
                padding: '5px 20px', minHeight: 34,
                borderBottom: isLast ? 'none' : `1px solid ${c.filterDivider}`,
                fontSize: fs.sm,
              }}>
                <span style={{ color: c.textMute, width: 34, flexShrink: 0, fontWeight: 600 }}>{t(group.labelKey)}</span>
                <button
                  onClick={() => clearGroup(group.key)}
                  style={{
                    padding: '2px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', marginRight: 4, fontSize: 'inherit',
                    background: selected.length === 0 ? c.primary : 'transparent',
                    color: selected.length === 0 ? '#fff' : c.textMute,
                    fontWeight: selected.length === 0 ? 600 : 400,
                  }}
                >{t('select.tag.all')}</button>
                {group.available.map(tag => {
                  const active = selected.includes(tag);
                  const zero = !active && (tagAvail[group.key]?.[tag] ?? 1) === 0;
                  return (
                    <button key={tag} onClick={() => !zero && toggleTag(group.key, tag)} style={{
                      padding: '2px 10px', borderRadius: 4, border: 'none', marginRight: 3, fontSize: 'inherit',
                      cursor: zero ? 'default' : 'pointer',
                      background: active ? c.tagActiveBg : 'transparent',
                      color: active ? '#fff' : zero ? c.textMute : c.text,
                      fontWeight: active ? 600 : 400,
                      opacity: zero ? 0.38 : 1,
                      transition: 'background 0.12s, color 0.12s, opacity 0.12s',
                    }}>{labelTag(tag, language)}</button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Sort + view toggle + count (one bar, below filter) ── */}
      <div style={{ flexShrink: 0, background: c.toolbarBg, borderBottom: `1px solid ${c.border}`, padding: '5px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Sort */}
        <span style={{ color: c.textMute, fontSize: fs.sm, flexShrink: 0 }}>{t('select.sort')}</span>
        {([['period', 'select.sort.time'], ['location', 'select.sort.region'], ['difficulty', 'select.sort.difficulty']] as [SortKey, string][]).map(([key, tkey]) => (
          <button key={key} onClick={() => setSortBy(key)} style={{
            padding: '2px 9px', borderRadius: 5, fontSize: fs.sm,
            border: `1px solid ${sortBy === key ? c.activeSort : c.border}`,
            background: sortBy === key ? (isDarkMode ? 'rgba(82,196,26,0.15)' : '#e8f5e9') : 'transparent',
            color: sortBy === key ? c.activeSort : c.textMute,
            cursor: 'pointer', fontWeight: sortBy === key ? 600 : 400, transition: 'all 0.12s',
          }}>{t(tkey)}</button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Count */}
        <span style={{ color: c.textMute, fontSize: fs.sm }}>
          {loading ? t('select.loading') : `${displayed.length} ${t('select.scenarios_unit')}${hasAnyFilter ? ' ' + t('select.filtered') : ''}`}
        </span>

        <div style={{ width: 1, height: 16, background: c.border }} />

        {/* View toggle */}
        <div style={{ display: 'flex', border: `1px solid ${c.border}`, borderRadius: 6, overflow: 'hidden' }}>
          {(['card', 'list'] as ViewMode[]).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{
              padding: '3px 9px', border: 'none', cursor: 'pointer',
              background: viewMode === mode ? c.primary : 'transparent',
              color: viewMode === mode ? '#fff' : c.textMute,
              transition: 'all 0.15s',
            }}>
              {mode === 'card' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
            </button>
          ))}
        </div>
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
            {displayed.map(s => <CardItem key={s.path} story={s} c={c} isDarkMode={isDarkMode} fs={fs} onSelect={() => onSelect(s.path)} turnsLabel={t('select.turns_unit')} language={language} />)}
          </div>
        )}

        {/* List */}
        {!loading && viewMode === 'list' && displayed.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {displayed.map(s => <ListItem key={s.path} story={s} c={c} isDarkMode={isDarkMode} fs={fs} onSelect={() => onSelect(s.path)} turnsLabel={t('select.turns_unit')} language={language} />)}
          </div>
        )}

      </div>

      {/* ── Status bar ── */}
      <div style={{
        height: 28, flexShrink: 0,
        background: c.toolbarBg, borderTop: `1px solid ${c.border}`,
        display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 12, color: c.textMute,
        fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace',
        fontSize: fs.xs, userSelect: 'none',
      }}>
        <span>{displayed.length} {t('select.scenarios_unit')}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>MIT License</span>
          <span style={{ opacity: 0.2 }}>│</span>
          <span>{AUTHOR.version}</span>
        </span>
      </div>
    </div>
  );
}

// ─── Card item ────────────────────────────────────────────────────────────────

type FS = ReturnType<typeof makeFontScale>;

function shareStory(storyPath: string) {
  const clean = storyPath.replace(/^mods\//, '');
  const url = `${window.location.origin}${window.location.pathname}?story=${clean}`;
  navigator.clipboard.writeText(url).catch(() => {});
}

function CardItem({ story, c, isDarkMode, fs, onSelect, turnsLabel, language }: { story: StoryCard; c: any; isDarkMode: boolean; fs: FS; onSelect: () => void; turnsLabel: string; language: string }) {
  const [hov, setHov] = useState(false);
  const [copied, setCopied] = useState(false);
  const diff = DIFF[story.difficulty] ?? { label: { en: story.difficulty }, color: '#8c8c8c', order: 1 };

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? c.cardHover : c.panel,
        border: `1px solid ${hov ? c.primary : c.border}`,
        borderRadius: 10, overflow: 'hidden',
        cursor: 'pointer', transition: 'all 0.15s',
        transform: hov ? 'translateY(-2px)' : 'none',
        boxShadow: hov
          ? `0 6px 20px ${isDarkMode ? 'rgba(82,196,26,0.12)' : 'rgba(0,80,30,0.10)'}`
          : '0 1px 4px rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'row',
      }}
    >
      {/* Left: text content */}
      <div style={{ flex: 1, minWidth: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
          <div style={{ fontSize: fs.md, fontWeight: 700, color: c.text, lineHeight: 1.3, fontFamily: 'Georgia, serif', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {story.title}
          </div>
          <span style={{ padding: '2px 7px', borderRadius: 8, flexShrink: 0, marginLeft: 8, fontSize: fs.sm, background: diff.color + '22', color: diff.color, fontWeight: 700 }}>
            {diff.label[language] ?? diff.label['en']}
          </span>
        </div>

        {(story.period || story.location) && (
          <div style={{ color: c.textMute, marginBottom: 5, fontFamily: 'monospace', fontSize: fs.xs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[story.period, story.location].filter(Boolean).join(' · ')}
          </div>
        )}

        <div style={{ color: c.textSec, lineHeight: 1.5, marginBottom: 8, fontSize: fs.sm, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {story.description}
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', fontSize: fs.sm, marginTop: 'auto' }}>
          {story.tags.slice(0, 3).map(tag => (
            <span key={tag} style={{ padding: '1px 6px', borderRadius: 8, border: `1px solid ${c.border}`, color: c.textMute, fontSize: fs.xs }}>
              {labelTag(tag, language)}
            </span>
          ))}
          <span style={{ marginLeft: 'auto', color: c.textMute, fontFamily: 'monospace', fontSize: fs.xs }}>
            {story.turns} {turnsLabel}
          </span>
          <button
            onClick={e => { e.stopPropagation(); shareStory(story.path); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
            title="复制分享链接"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: copied ? c.primary : c.textMute, display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
          >
            {copied ? <CheckOutlined /> : <LinkOutlined />}
          </button>
        </div>
      </div>

      {/* Right: card back image (≈40% width) */}
      {(story.cardBackFate || story.cardBackPlayer) && (
        <div style={{ position: 'relative', width: '38%', flexShrink: 0, background: isDarkMode ? '#0a0a0a' : '#e0e0e0', overflow: 'hidden' }}>
          {story.cardBackPlayer && (
            <img src={story.cardBackPlayer} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: hov && story.cardBackFate ? 0 : 1, transition: 'opacity 0.3s ease' }} />
          )}
          {story.cardBackFate && (
            <img src={story.cardBackFate} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: hov ? 1 : 0, transition: 'opacity 0.3s ease' }} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── List item (single-row grid layout) ───────────────────────────────────────

function ListItem({ story, c, isDarkMode, fs, onSelect, turnsLabel, language }: { story: StoryCard; c: any; isDarkMode: boolean; fs: FS; onSelect: () => void; turnsLabel: string; language: string }) {
  const [hov, setHov] = useState(false);
  const [copied, setCopied] = useState(false);
  const diff = DIFF[story.difficulty] ?? { label: { en: story.difficulty }, color: '#8c8c8c', order: 1 };

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
        fontSize: fs.sm,
      }}
    >
      {/* Col 1: title + meta stacked */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: c.text, fontFamily: 'Georgia, serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: fs.md }}>
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
            {labelTag(tag, language)}
          </span>
        ))}
      </div>

      {/* Col 4: difficulty + turns + share */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ padding: '1px 7px', borderRadius: 5, background: diff.color + '22', color: diff.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {diff.label[language] ?? diff.label['en']}
        </span>
        <span style={{ color: c.textMute, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {story.turns} {turnsLabel}
        </span>
        <button
          onClick={e => { e.stopPropagation(); shareStory(story.path); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
          title="复制分享链接"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: copied ? c.primary : c.textMute, display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
        >
          {copied ? <CheckOutlined /> : <LinkOutlined />}
        </button>
      </div>
    </div>
  );
}
