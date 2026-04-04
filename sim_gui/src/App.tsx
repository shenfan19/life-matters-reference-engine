import { useState, useEffect } from 'react';
import { ConfigProvider, App as AntdApp, theme } from 'antd';
import {
  SunOutlined, MoonOutlined,
  LoadingOutlined, ExperimentOutlined, ToolOutlined, SwapOutlined,
  GithubOutlined, MailOutlined,
} from '@ant-design/icons';
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

const initialSimulationState: SimulationState = {
  status: 'idle', progress: 0, currentStep: 0, totalSteps: 1440,
  simulationData: [], inputParams: {}, stateVariables: {}, sessionId: '',
  timeValue: 24, timeUnit: 'day', stepValue: 3600, stepUnit: 'second',
  batchSize: 10, updateInterval: 50,
};

// ─── Top title bar ────────────────────────────────────────────────────────────
function TitleBar({ page, onPage, isDarkMode, onToggleDark, language, onLanguage, c, t }: {
  page: string; onPage: (p: string) => void;
  isDarkMode: boolean; onToggleDark: () => void;
  language: string; onLanguage: (l: Language) => void;
  c: typeof C.light; t: (k: string) => string;
}) {
  const tabs = [
    { id: 'simulator', label: t('menu.simulator'), icon: <ExperimentOutlined /> },
    { id: 'tools',     label: 'Mods',              icon: <ToolOutlined /> },
    { id: 'story',     label: '转换器',             icon: <SwapOutlined /> },
  ];

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
        <svg viewBox="0 0 44 28" width="44" height="28" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 14 Q7 2 12 14 Q17 26 22 14 Q27 2 32 14 Q37 26 42 14"
                stroke={isDarkMode ? '#52c41a' : '#007A33'} strokeWidth="2.4"
                strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontSize: 20, fontWeight: 700, letterSpacing: '0.04em',
            color: c.text,
            fontFamily: '"Georgia", "Times New Roman", serif',
          }}>
            Life Matters
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

        {/* Play button */}
        <button
          onClick={() => window.open('http://localhost:5174', '_blank')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 12px', borderRadius: 6,
            border: `1px solid ${isDarkMode ? '#b45309' : '#d97706'}`,
            background: isDarkMode ? 'rgba(180,83,9,0.15)' : 'rgba(217,119,6,0.08)',
            color: isDarkMode ? '#fbbf24' : '#b45309', fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.12s', outline: 'none',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = isDarkMode ? 'rgba(180,83,9,0.28)' : 'rgba(217,119,6,0.16)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = isDarkMode ? 'rgba(180,83,9,0.15)' : 'rgba(217,119,6,0.08)';
          }}
        >
          <span style={{  }}>🎮</span>
          {t('button.go_game')}
        </button>
      </div>

      <div style={{ flex: 1 }} />

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
  affiliation: 'Sun Yat-Sen University',
  email: 'shenfan@mail.sysu.edu.cn',
  homepage: 'https://github.com/shenfan19',
  version: 'v0.4.0',
};

// ─── Status bar ───────────────────────────────────────────────────────────────
function StatusBar({ backendStatus, model, isSimulating, simProgress, c }: {
  backendStatus: 'checking' | 'online' | 'offline';
  model: ModelFile | null;
  isSimulating: boolean; simProgress: number;
  c: typeof C.light;
}) {
  const dotColor = backendStatus === 'online' ? '#52c41a'
    : backendStatus === 'offline' ? '#f5222d' : '#faad14';

  const linkStyle: React.CSSProperties = {
    color: c.textMute, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3,
    transition: 'color 0.15s',
  };

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
        {backendStatus === 'online' ? 'Backend' : backendStatus === 'offline' ? 'Offline' : 'Connecting…'}
      </span>
      <span style={{ opacity: 0.25 }}>│</span>
      <span style={{ color: model ? c.text : c.textMute, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {model ? model.title : '— no model —'}
      </span>
      {isSimulating && (
        <>
          <span style={{ opacity: 0.25 }}>│</span>
          <span style={{ color: c.primary, display: 'flex', alignItems: 'center', gap: 4 }}>
            <LoadingOutlined style={{  }} spin />
            Simulating {simProgress}%
          </span>
        </>
      )}

      {/* Right: author + links + license + version */}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: c.textMute }}>
          {AUTHOR.name} @ {AUTHOR.affiliation}
        </span>
        <span style={{ opacity: 0.2 }}>│</span>
        <a href={`mailto:${AUTHOR.email}`} style={linkStyle} title={AUTHOR.email}>
          <MailOutlined style={{  }} />
        </a>
        <a href={AUTHOR.homepage} target="_blank" rel="noreferrer" style={linkStyle} title="Homepage">
          <GithubOutlined style={{  }} />
        </a>
        <span style={{ opacity: 0.2 }}>│</span>
        <span style={{ color: c.textMute }}>MIT License</span>
        <span style={{ opacity: 0.2 }}>│</span>
        <span style={{ color: c.textMute }}>{AUTHOR.version}</span>
      </span>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const { t, language, setLanguage } = useI18n();
  const [page, setPage] = useState<'simulator' | 'tools' | 'story'>('simulator');
  const [isDarkMode, setIsDarkMode] = useState(true);
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
      borderRadius: 6, fontSize: 16,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif',
      colorBgBase: isDarkMode ? '#111111' : '#f5f5f5',
      colorBgContainer: isDarkMode ? '#111f16' : '#ffffff',
      colorBorder: isDarkMode ? '#2a2a2a' : '#e0e0e0',
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
          page={page} onPage={p => setPage(p as any)}
          isDarkMode={isDarkMode} onToggleDark={() => setIsDarkMode(d => !d)}
          language={language} onLanguage={setLanguage}
          c={c} t={t}
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
        />
      </div>
    </AntdApp>
    </ConfigProvider>
  );
}

export default App;
