import { useState, useEffect } from 'react';
import { ConfigProvider, App as AntdApp, theme } from 'antd';
import {
  SunOutlined, MoonOutlined,
  LoadingOutlined, ToolOutlined, SwapOutlined,
  GithubOutlined, MailOutlined, InfoCircleOutlined, HomeOutlined,
} from '@ant-design/icons';

// ─── Icons ────────────────────────────────────────────────────────────────────
// HeartPulseIcon: heart (left) + QRS trace (right) — sim identity
// CardPulseIcon:  card outline + heart suit + QRS trace — game identity

const HeartPulseIcon = ({ size = 16, color = 'currentColor' }: { size?: number | string, color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
    {/* Heart outline — tip at bottom, two lobes at top, QRS passes through middle */}
    <path d="M12,21 C6,16 2,12 2,8 A6,6,0,0,1,12,5 A6,6,0,0,1,22,8 C22,12 18,16 12,21 Z"
          strokeWidth="1.8" />
    {/* QRS trace through the heart's equator */}
    <path d="M2.5,10 L5.5,10 L6,12 L7,4 L8,14 L9,10 L11,10 L11.5,8 L12.5,10 L21.5,10"
          strokeWidth="1.6" />
  </svg>
);

const CardPulseIcon = ({ size = 16, color = 'currentColor' }: { size?: number | string, color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
    {/* Card outline */}
    <rect x="4" y="2" width="16" height="20" rx="2.5" strokeWidth="1.8" />
    {/* Heart suit — upper portion of card */}
    <path d="M12,12.5 C9.5,10.5 7.5,9 7.5,7.5 A3,3 0,0,1 12,5 A3,3 0,0,1 16.5,7.5 C16.5,9 14.5,10.5 12,12.5 Z"
          strokeWidth="1.6" />
    {/* QRS trace — lower portion of card */}
    <path d="M5.5,17 L8,17 L8.5,18.5 L9.5,13.5 L10.5,19.5 L11.5,17 L18.5,17"
          strokeWidth="1.8" />
  </svg>
);
import Simulator from './components/Simulator';
import ModsManager from './components/ModsManager';
import StoryEditor from './components/StoryEditor';
import StoryEngine from './components/StoryEngine';
import type { SimulationState, ModelFile, DataNode } from './types';
import { useI18n, type Language } from './core/i18n';

// ─── Color tokens ─────────────────────────────────────────────────────────────
const C = {
  light: {
    bg: '#f5f5f5', panel: '#ffffff', border: '#e0e0e0',
    primary: '#007A33', activeBg: '#e8f5e9', activeText: '#007A33',
    text: '#1a2e22', textSec: '#6b7280', textMute: 'rgba(0,0,0,0.55)',
    navHover: '#efefef', statusBar: '#efefef',
  },
  dark: {
    bg: '#111111', panel: '#1a1a1a', border: '#2a2a2a',
    primary: '#52c41a', activeBg: '#1a3a22', activeText: '#52c41a',
    text: 'rgba(255,255,255,0.92)', textSec: 'rgba(255,255,255,0.75)',
    textMute: 'rgba(255,255,255,0.52)', navHover: 'rgba(82,196,26,0.08)',
    statusBar: '#111111',
  },
};

// ─── Font size selector ───────────────────────────────────────────────────────

function FontSizer({ fontSize, onFontSize, c }: { fontSize: number; onFontSize: (n: number) => void; c: typeof C.light }) {
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

const initialSimulationState: SimulationState = {
  status: 'idle', progress: 0, currentStep: 0, totalSteps: 1440,
  simulationData: [], inputParams: {}, stateVariables: {}, sessionId: '',
  timeValue: 24, timeUnit: 'day', stepValue: 3600, stepUnit: 'second',
  batchSize: 10, updateInterval: 50,
};

// ─── Top title bar ────────────────────────────────────────────────────────────
function TitleBar({ page, simMode, onPage, isDarkMode, onToggleDark, language, onLanguage, c, t, fontSize, onFontSize, onAbout }: {
  page: string; simMode: 'sim' | 'opt'; onPage: (p: string) => void;
  isDarkMode: boolean; onToggleDark: () => void;
  language: string; onLanguage: (l: Language) => void;
  c: typeof C.light; t: (k: string) => string;
  fontSize: number; onFontSize: (n: number) => void;
  onAbout: () => void;
}) {
  const tabs = [
    { id: 'simulator', label: page === 'simulator' && simMode === 'opt' ? t('menu.simulator.opt') : t('menu.simulator'), icon: <HeartPulseIcon /> },
    { id: 'tools',     label: t('menu.tools'),     icon: <ToolOutlined /> },
    { id: 'story',     label: t('menu.story'),     icon: <SwapOutlined /> },
  ];

  const subtitle = t(simMode === 'opt' ? 'menu.sub.simulator.opt' : 'menu.sub.simulator.sim');

  return (
    <div style={{
      height: 44, flexShrink: 0,
      borderBottom: `1px solid ${c.border}`,
      background: c.panel,
      display: 'flex', alignItems: 'center',
      padding: '0 16px', gap: 0,
      userSelect: 'none',
    }}>
      {/* Logo wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 20, userSelect: 'none' }}>
        {/* Wave mark */}
        <HeartPulseIcon size={28} color={isDarkMode ? '#52c41a' : '#007A33'} />
        {/* Wordmark + inline subtitle */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontSize: 20, fontWeight: 700, letterSpacing: '0.04em',
            color: c.text,
            fontFamily: '"Georgia", "Times New Roman", serif',
          }}>
            {t('app.title')}
          </span>
          <span style={{ color: c.textMute, fontSize: 13 }}>
            · {subtitle}
          </span>
        </div>
      </div>

      {/* Nav tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {tabs.map(tab => {
          const active = page === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onPage(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 6,
                border: 'none', cursor: 'pointer',
                background: active ? c.activeBg : 'transparent',
                color: active ? c.activeText : c.textSec,
                fontWeight: active ? 600 : 400,
                transition: 'all 0.12s',
                outline: 'none',
              }}
            >
              <span style={{ opacity: active ? 1 : 0.6 }}>{tab.icon}</span>
              {tab.label}
              {active && (
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: c.primary, display: 'inline-block',
                }} />
              )}
            </button>
          );
        })}

        {/* Divider */}
        <div style={{ width: 1, height: 18, background: c.border, margin: '0 6px', flexShrink: 0 }} />

        {/* Game button */}
        <button
          onClick={() => window.open('http://localhost:5174', '_blank')}
          title={t('button.go_game.tip')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 6,
            border: 'none', cursor: 'pointer',
            background: 'transparent',
            color: c.textSec, fontWeight: 400,
            transition: 'all 0.12s', outline: 'none',
          }}
        >
          <span style={{ opacity: 0.6 }}><CardPulseIcon /></span>
          {t('button.go_game')}
        </button>
      </div>

      <div style={{ flex: 1 }} />{/* pushes right actions to edge */}

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Font size selector */}
        <FontSizer fontSize={fontSize} onFontSize={onFontSize} c={c} />

        {/* Language selector */}
        <select
          value={language}
          onChange={e => onLanguage(e.target.value as Language)}
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
          <option value="fr">FR</option>
        </select>

        {/* Dark mode toggle */}
        <button
          onClick={onToggleDark}
          style={{
            background: 'none', border: `1px solid ${c.border}`, borderRadius: 6,
            padding: '4px 9px', cursor: 'pointer', color: c.textSec, display: 'flex', alignItems: 'center',
          }}
        >
          {isDarkMode ? <MoonOutlined /> : <SunOutlined />}
        </button>

        {/* About */}
        <button
          onClick={onAbout}
          style={{
            background: 'none', border: `1px solid ${c.border}`, borderRadius: 6,
            padding: '4px 9px', cursor: 'pointer', color: c.textSec, display: 'flex', alignItems: 'center',
          }}
          title="About"
        >
          <InfoCircleOutlined />
        </button>
      </div>
    </div>
  );
}

// ─── Tools page → Mods Manager ────────────────────────────────────────────────
function ToolsPage({ isDarkMode, c }: { isDarkMode: boolean; c: typeof C.light }) {
  return <ModsManager isDarkMode={isDarkMode} c={c} />;
}

// ─── Contact info ─────────────────────────────────────────────────────────────
const AUTHOR = {
  name: 'Fan Shen',
  email: 'shenfan@mail.sysu.edu.cn',
  github: 'https://github.com/shenfan19',
  homepage: 'https://shenfan19.github.io',
  version: 'v0.4.0',
};

// ─── Status bar ───────────────────────────────────────────────────────────────
function StatusBar({ backendStatus, model, isSimulating, simProgress, c, t }: {
  backendStatus: 'checking' | 'online' | 'offline';
  model: ModelFile | null;
  isSimulating: boolean; simProgress: number;
  c: typeof C.light;
  t: (k: string) => string;
}) {
  const dotColor = backendStatus === 'online' ? '#52c41a'
    : backendStatus === 'offline' ? '#f5222d' : '#faad14';

  return (
    <div style={{
      height: 28, flexShrink: 0,
      background: c.statusBar, borderTop: `1px solid ${c.border}`,
      display: 'flex', alignItems: 'center',
      padding: '0 14px', gap: 12, color: c.textMute,
      fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace',
      userSelect: 'none',
    }}>
      {/* Left: backend + model */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
          background: dotColor,
          boxShadow: backendStatus === 'online' ? `0 0 5px ${dotColor}` : 'none',
        }} />
        {backendStatus === 'online' ? t('statusBar.backend') : backendStatus === 'offline' ? t('statusBar.offline') : t('statusBar.connecting')}
      </span>
      <span style={{ opacity: 0.25 }}>│</span>
      <span style={{ color: model ? c.text : c.textMute, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {model ? model.title : t('statusBar.noModel')}
      </span>
      {isSimulating && (
        <>
          <span style={{ opacity: 0.25 }}>│</span>
          <span style={{ color: c.primary, display: 'flex', alignItems: 'center', gap: 4 }}>
            <LoadingOutlined spin />
            {t('common.loading')} {simProgress}%
          </span>
        </>
      )}

      {/* Center: Disclaimer */}
      <span style={{ flex: 1, textAlign: 'center', opacity: 0.8, fontSize: 11, fontStyle: 'italic' }}>
        {t('statusBar.disclaimer')}
      </span>

      {/* Right: license + version */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: c.textMute }}>{t('statusBar.license')}</span>
        <span style={{ opacity: 0.2 }}>│</span>
        <span style={{ color: c.textMute }}>{AUTHOR.version}</span>
      </span>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
const SIM_PREFS_KEY = 'sim_prefs';
const LM_FONT_KEY   = 'lm_font_size';   // shared with game
function readPrefs(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(SIM_PREFS_KEY) ?? '{}'); } catch { return {}; }
}

function App() {
  const { t, language, setLanguage } = useI18n();
  const [page,     setPage]     = useState<'simulator' | 'tools' | 'story'>(() => readPrefs().page     ?? 'simulator');
  const [simMode,  setSimMode]  = useState<'sim' | 'opt'>(() => readPrefs().simMode  ?? 'sim');
  const [isDarkMode, setIsDarkMode] = useState(() => readPrefs().isDarkMode ?? true);
  const [aboutOpen,  setAboutOpen]  = useState(false);
  const [fontSize,   setFontSize]   = useState<number>(
    () => Number(localStorage.getItem(LM_FONT_KEY)) || readPrefs().fontSize || 16
  );
  const [selectedModel, setSelectedModel] = useState<ModelFile | null>(null);
  const [confirmedModel, setConfirmedModel] = useState<ModelFile | null>(null);
  const [simState, setSimState] = useState<SimulationState>(initialSimulationState);
  const [playingStoryId, setPlayingStoryId] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Loader states lifted so Simulator keeps them across re-renders
  const [storyTree, setStoryTree] = useState<DataNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(['mods', 'scenarios']);
  const [storyViewMode, setStoryViewMode] = useState<'tree' | 'list'>('tree');
  const [storyFilter, setStoryFilter] = useState('');
  const [loadedMods, setLoadedMods] = useState<Record<string, ModelFile>>({});
  const [isLocked, setIsLocked] = useState(false);

  const c = isDarkMode ? C.dark : C.light;
  const isSimulating = simState.status === 'running';

  // Persist prefs
  useEffect(() => {
    try {
      localStorage.setItem(SIM_PREFS_KEY, JSON.stringify({ isDarkMode, fontSize, page, simMode }));
      localStorage.setItem(LM_FONT_KEY, String(fontSize));
    } catch {}
  }, [isDarkMode, fontSize, page, simMode]);

  useEffect(() => {
    const check = () => {
      fetch(`/api/plugins?v=${Date.now()}`, { signal: AbortSignal.timeout(2500) })
        .then(() => setBackendStatus('online'))
        .catch(() => setBackendStatus('offline'));
    };
    check();
    const id = setInterval(check, 12000);
    return () => clearInterval(id);
  }, []);

  const antPrimary = c.primary;
  const academicTheme = {
    algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: antPrimary, colorLink: antPrimary, colorSuccess: '#52c41a',
      borderRadius: 6, fontSize,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif',
      colorBgBase: isDarkMode ? '#111111' : '#f5f5f5',
      colorBgContainer: isDarkMode ? '#111f16' : '#ffffff',
      colorBorder: isDarkMode ? '#2a2a2a' : '#e0e0e0',
      fontSizeSM: Math.max(11, fontSize - 3),
    },
    components: {
      Button: { borderRadius: 6, controlHeight: 32 },
      Card: { borderRadiusLG: 6 },
      Tabs: { itemActiveColor: antPrimary, itemSelectedColor: antPrimary, inkBarColor: antPrimary, horizontalItemPadding: '10px 14px' },
      Divider: { colorSplit: isDarkMode ? '#2a2a2a' : '#e0e0e0' },
      Tag: { borderRadiusSM: 4 },
      Input: { colorBgContainer: isDarkMode ? '#222222' : '#ffffff' },
      InputNumber: { colorBgContainer: isDarkMode ? '#222222' : '#ffffff' },
      Select: {
        colorBgContainer: isDarkMode ? '#222222' : '#ffffff',
        colorBgElevated: isDarkMode ? '#252525' : '#ffffff',
        optionSelectedBg: isDarkMode ? '#2a2a2a' : '#f0f0f0',
        optionSelectedColor: isDarkMode ? 'rgba(255,255,255,0.92)' : '#1a2e22',
      },
      Table: { colorBgContainer: isDarkMode ? '#1a1a1a' : '#ffffff', headerBg: isDarkMode ? '#222222' : '#f5f5f5' },
      Tree: {
        colorBgContainer: 'transparent',
        nodeSelectedBg: isDarkMode ? '#2a2a2a' : '#ebebeb',
        nodeHoverBg: isDarkMode ? '#222222' : '#f0f0f0',
        colorText: isDarkMode ? 'rgba(255,255,255,0.88)' : '#1a2e22',
      },
    },
  };

  // StoryEngine takes over the whole screen
  if (playingStoryId) {
    return (
      <ConfigProvider theme={academicTheme}>
        <StoryEngine storyId={playingStoryId} onExit={() => setPlayingStoryId(null)} />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider theme={academicTheme}>
    <AntdApp>
      <div style={{
        display: 'flex', flexDirection: 'column', height: '100vh',
        backgroundColor: c.bg, color: c.text,
        transition: 'background-color 0.25s ease, color 0.25s ease',
      }}>

        {/* ── Title bar ── */}
        <TitleBar
          page={page} simMode={simMode} onPage={p => setPage(p as any)}
          isDarkMode={isDarkMode} onToggleDark={() => setIsDarkMode((d: boolean) => !d)}
          language={language} onLanguage={setLanguage}
          c={c} t={t}
          fontSize={fontSize} onFontSize={setFontSize}
          onAbout={() => setAboutOpen(true)}
        />

        {/* ── Content (zoom wrapper scales all inline sizes) ── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', position: 'relative', background: c.bg }}>

          {/* Simulator: always mounted, shown/hidden via CSS */}
          <div style={{
            display: page === 'simulator' ? 'flex' : 'none',
            flexDirection: 'column', width: '100%', height: '100%',
          }}>
            <Simulator
              selectedModel={selectedModel} state={simState} setState={setSimState}
              isLocked={isLocked} setIsLocked={setIsLocked} isDarkMode={isDarkMode}
              storyTree={storyTree} setStoryTree={setStoryTree}
              expandedKeys={expandedKeys} setExpandedKeys={setExpandedKeys}
              storyViewMode={storyViewMode} setStoryViewMode={setStoryViewMode}
              storyFilter={storyFilter} setStoryFilter={setStoryFilter}
              loadedMods={loadedMods} setLoadedMods={setLoadedMods}
              setConfirmedModel={setConfirmedModel} onModelSelect={setSelectedModel}
              simMode={simMode} onSimModeChange={setSimMode}
            />
          </div>

          {/* Tools: always mounted, shown/hidden via CSS */}
          <div style={{ display: page === 'tools' ? 'flex' : 'none', width: '100%', height: '100%' }}>
            <ToolsPage isDarkMode={isDarkMode} c={c} />
          </div>

          {/* Story Editor: always mounted, shown/hidden via CSS */}
          <div style={{ display: page === 'story' ? 'flex' : 'none', width: '100%', height: '100%' }}>
            <StoryEditor isDarkMode={isDarkMode} c={c} />
          </div>
        </div>

        {/* ── Status bar ── */}
        <StatusBar
          backendStatus={backendStatus}
          model={confirmedModel}
          isSimulating={isSimulating} simProgress={Math.round(simState.progress)}
          c={c}
          t={t}
        />
      </div>

      {/* ── About modal ── */}
      {aboutOpen && (
        <div
          onClick={() => setAboutOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: c.panel,
              borderRadius: 14, padding: '32px 40px',
              maxWidth: 420, width: '90%', maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 32px 80px rgba(0,0,0,0.55)',
              textAlign: 'center',
            }}
          >
            {/* App title */}
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Georgia, serif', color: c.text, marginBottom: 6 }}>
              {t('about.name')}
            </div>

            {/* Subtitles */}
            <div style={{ color: c.textMute, fontSize: 13, lineHeight: 1.6 }}>
              {t('about.subtitle')}
            </div>
            <div style={{ color: c.textMute, fontSize: 13, lineHeight: 1.6 }}>
              {t('about.subtitle2')}
            </div>

            {/* Version + license */}
            <div style={{ color: c.textMute, fontFamily: 'monospace', fontSize: 11, marginTop: 8, marginBottom: 24 }}>
              {AUTHOR.version} · MIT License
            </div>

            {/* Author block */}
            <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 20, marginBottom: 20 }}>
              <div style={{ color: c.text, fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{AUTHOR.name}</div>
              <div style={{ color: c.textMute, fontSize: 13, marginBottom: 16 }}>{t('about.affiliation')}</div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: c.textSec, fontSize: 13 }}>
                <a href={`mailto:${AUTHOR.email}`} style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MailOutlined /> {AUTHOR.email}
                </a>
                <a href={AUTHOR.github} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <GithubOutlined /> github.com/shenfan19
                </a>
                {AUTHOR.homepage ? (
                  <a href={AUTHOR.homepage} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <HomeOutlined /> {AUTHOR.homepage}
                  </a>
                ) : (
                  <span style={{ color: c.textMute, opacity: 0.3, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <HomeOutlined /> {t('about.homepage')} —
                  </span>
                )}
              </div>
            </div>

            {/* Disclaimer block */}
            <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 20, textAlign: 'left' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: c.textSec, marginBottom: 12 }}>
                {t('disclaimer.title')}
              </div>
              <div style={{ fontSize: 13, color: c.textSec, lineHeight: 1.65, marginBottom: 12 }}>
                {t('disclaimer.intro')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.isArray(t('disclaimer.points')) && (t('disclaimer.points') as string[]).map((p, i) => (
                  <div key={i} style={{ fontSize: 13, color: c.textSec, display: 'flex', gap: 10, lineHeight: 1.5 }}>
                    <span style={{ color: c.primary, flexShrink: 0, marginTop: 1 }}>·</span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setAboutOpen(false)}
              style={{
                marginTop: 28, padding: '7px 28px', borderRadius: 8,
                border: `1px solid ${c.border}`, background: 'none',
                color: c.textMute, cursor: 'pointer', fontSize: 13,
              }}
            >
              {t('about.close')}
            </button>
          </div>
        </div>
      )}
    </AntdApp>
    </ConfigProvider>
  );
}

export default App;
