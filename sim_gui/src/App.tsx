import { useState, useEffect } from 'react';
import { ConfigProvider, theme, Button, Dropdown, Select } from 'antd';
import {
  TranslationOutlined, SunOutlined, MoonOutlined,
  AppstoreOutlined, RocketOutlined,
  LoadingOutlined, ApiOutlined, ExperimentOutlined, ToolOutlined,
  GithubOutlined, MailOutlined, GlobalOutlined,
} from '@ant-design/icons';
import Simulator from './components/Simulator';
import PluginView from './components/PluginView';
import StoryEngine from './components/StoryEngine';
import type { SimulationState, ModelFile, DataNode } from './types';
import { useI18n, type Language } from './core/i18n';

// ─── Color tokens ─────────────────────────────────────────────────────────────
const C = {
  light: {
    bg: '#f5faf6', panel: '#ffffff', border: '#c8e6c9',
    primary: '#007A33', activeBg: '#e8f5e9', activeText: '#007A33',
    text: '#1a2e22', textSec: '#3d5c47', textMute: 'rgba(0,0,0,0.55)',
    navHover: '#f0faf2', statusBar: '#edf7f0',
  },
  dark: {
    bg: '#0d1a10', panel: '#111f16', border: '#1e3824',
    primary: '#52c41a', activeBg: '#1a3a22', activeText: '#52c41a',
    text: 'rgba(255,255,255,0.92)', textSec: 'rgba(255,255,255,0.75)',
    textMute: 'rgba(255,255,255,0.52)', navHover: 'rgba(82,196,26,0.08)',
    statusBar: '#0a1409',
  },
};

const initialSimulationState: SimulationState = {
  status: 'idle', progress: 0, currentStep: 0, totalSteps: 1440,
  simulationData: [], inputParams: {}, stateVariables: {}, sessionId: '',
  timeValue: 24, timeUnit: 'day', stepValue: 3600, stepUnit: 'second',
  batchSize: 10, updateInterval: 50,
};

// ─── Top title bar ────────────────────────────────────────────────────────────
const FONT_SIZES = [13, 14, 15, 16, 17, 18];

function TitleBar({ page, onPage, isDarkMode, onToggleDark, language, onLanguage, fontSize, onFontSize, c, t }: {
  page: string; onPage: (p: string) => void;
  isDarkMode: boolean; onToggleDark: () => void;
  language: string; onLanguage: (l: Language) => void;
  fontSize: number; onFontSize: (n: number) => void;
  c: typeof C.light; t: (k: string) => string;
}) {
  const tabs = [
    { id: 'simulator', label: t('menu.simulator'), icon: <ExperimentOutlined /> },
    { id: 'tools',     label: 'Tools',             icon: <ToolOutlined /> },
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
            fontSize: 15, fontWeight: 700, letterSpacing: '0.04em',
            color: c.text,
            fontFamily: '"Georgia", "Times New Roman", serif',
          }}>
            Life Matters
          </span>
          <span style={{
            fontSize: 9.5, fontWeight: 400, letterSpacing: '0.18em',
            color: c.textMute, textTransform: 'uppercase',
            fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace',
          }}>
            Simulation Platform
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
                fontWeight: active ? 600 : 400, fontSize: 13,
                transition: 'all 0.12s',
                outline: 'none',
              }}
            >
              <span style={{ fontSize: 13, opacity: active ? 1 : 0.6 }}>{tab.icon}</span>
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
      </div>

      <div style={{ flex: 1 }} />

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Font size selector */}
        <Select
          size="small"
          value={fontSize}
          onChange={onFontSize}
          options={FONT_SIZES.map(n => ({ label: `${n}px`, value: n }))}
          style={{ width: 72 }}
          suffixIcon={<span style={{ fontSize: 11, color: c.textMute }}>A</span>}
        />

        <Button
          type="primary" size="small" icon={<RocketOutlined />}
          onClick={() => window.open('http://localhost:5174', '_blank')}
          style={{
            background: isDarkMode
              ? 'linear-gradient(135deg, #2d7a1f, #52c41a)'
              : 'linear-gradient(135deg, #005824, #007A33)',
            border: 'none', fontWeight: 600, fontSize: 12,
            boxShadow: isDarkMode ? '0 1px 6px rgba(82,196,26,0.25)' : '0 1px 6px rgba(0,122,51,0.2)',
          }}
        >
          {t('button.go_game')} ↗
        </Button>

        <Button type="text" size="small"
          icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
          onClick={onToggleDark}
          style={{ color: c.textSec }}
        />

        <Dropdown
          menu={{
            items: [
              { key: 'zh-CN', label: '简体中文' }, { key: 'zh-TW', label: '繁體中文' },
              { key: 'en', label: 'English' }, { key: 'fr', label: 'Français' },
            ],
            selectedKeys: [language],
            onClick: (e) => onLanguage(e.key as Language),
          }}
          placement="bottomRight"
        >
          <Button type="text" size="small" icon={<TranslationOutlined />} style={{ color: c.textSec }} />
        </Dropdown>
      </div>
    </div>
  );
}

// ─── Tools page (internal sidebar + plugin content) ───────────────────────────
function ToolsPage({ isDarkMode, c }: { isDarkMode: boolean; c: typeof C.light }) {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/plugins?v=${Date.now()}`)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => {
        const order = ['model_builder', 'scenario_builder', 'story_converter'];
        const sorted = (data.plugins || []).sort((a: any, b: any) => {
          const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
          if (ia === -1 && ib === -1) return 0;
          if (ia === -1) return 1; if (ib === -1) return -1;
          return ia - ib;
        });
        setPlugins(sorted);
        if (sorted.length > 0 && !selectedPlugin) setSelectedPlugin(sorted[0].id);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (error) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        padding: '16px 20px', borderRadius: 8, fontSize: 12,
        color: '#ef4444',
        background: isDarkMode ? 'rgba(127,29,29,0.2)' : '#fef2f2',
        border: `1px solid ${isDarkMode ? '#7f1d1d' : '#fee2e2'}`,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          <ApiOutlined /> Backend offline
        </div>
        <div style={{ opacity: 0.75, fontFamily: 'monospace', fontSize: 11 }}>python api_server.py</div>
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Internal sidebar */}
      <div style={{
        width: 188, flexShrink: 0,
        borderRight: `1px solid ${c.border}`,
        background: c.panel,
        display: 'flex', flexDirection: 'column',
        padding: '10px 8px',
        overflowY: 'auto',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.12em', color: c.textMute,
          padding: '2px 8px 8px',
        }}>
          Plugins
        </div>

        {loading ? (
          <div style={{ padding: '8px 10px', fontSize: 11, color: c.textMute, display: 'flex', alignItems: 'center', gap: 6 }}>
            <LoadingOutlined style={{ fontSize: 11 }} spin /> Loading…
          </div>
        ) : (
          plugins.map(plugin => {
            const active = selectedPlugin === plugin.id;
            return (
              <button
                key={plugin.id}
                onClick={() => setSelectedPlugin(plugin.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', marginBottom: 2,
                  borderRadius: 6, border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
                  borderLeft: `3px solid ${active ? c.primary : 'transparent'}`,
                  background: active ? c.activeBg : 'transparent',
                  color: active ? c.activeText : c.textSec,
                  fontWeight: active ? 600 : 400, fontSize: 13,
                  transition: 'all 0.12s', outline: 'none',
                }}
              >
                <AppstoreOutlined style={{ fontSize: 13, opacity: active ? 1 : 0.55 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {plugin.name}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Plugin content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', background: c.bg }}>
        {selectedPlugin ? (
          <PluginView pluginId={selectedPlugin} isDarkMode={isDarkMode} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: c.textMute, fontSize: 13 }}>
            从左侧选择一个工具
          </div>
        )}
      </div>
    </div>
  );
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
      padding: '0 14px', gap: 12,
      fontSize: 11, color: c.textMute,
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
            <LoadingOutlined style={{ fontSize: 11 }} spin />
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
          <MailOutlined style={{ fontSize: 11 }} />
        </a>
        <a href={AUTHOR.homepage} target="_blank" rel="noreferrer" style={linkStyle} title="Homepage">
          <GithubOutlined style={{ fontSize: 11 }} />
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
  const [page, setPage] = useState<'simulator' | 'tools'>('simulator');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [fontSize, setFontSize] = useState(15);
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
      borderRadius: 6, fontSize,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif',
      colorBgBase: isDarkMode ? '#0d1a10' : '#f5faf6',
      colorBgContainer: isDarkMode ? '#111f16' : '#ffffff',
      colorBorder: isDarkMode ? '#1e3824' : '#c8e6c9',
    },
    components: {
      Button: { borderRadius: 6, controlHeight: 32 },
      Card: { borderRadiusLG: 6 },
      Tabs: { itemActiveColor: antPrimary, itemSelectedColor: antPrimary, inkBarColor: antPrimary, horizontalItemPadding: '10px 14px' },
      Divider: { colorSplit: isDarkMode ? '#1e3824' : '#c8e6c9' },
      Tag: { borderRadiusSM: 4 },
      Input: { colorBgContainer: isDarkMode ? '#162a1b' : '#ffffff' },
      Select: { colorBgContainer: isDarkMode ? '#162a1b' : '#ffffff', colorBgElevated: isDarkMode ? '#1a3a22' : '#ffffff' },
      Table: { colorBgContainer: isDarkMode ? '#111f16' : '#ffffff', headerBg: isDarkMode ? '#162a1b' : '#f0f7f1' },
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
          fontSize={fontSize} onFontSize={setFontSize}
          c={c} t={t}
        />

        {/* ── Content (zoom wrapper scales all inline sizes) ── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', position: 'relative', background: c.bg, zoom: fontSize / 15 }}>

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

          {/* Tools: rendered when active */}
          {page === 'tools' && (
            <ToolsPage isDarkMode={isDarkMode} c={c} />
          )}
        </div>

        {/* ── Status bar ── */}
        <StatusBar
          backendStatus={backendStatus}
          model={confirmedModel}
          isSimulating={isSimulating} simProgress={Math.round(simState.progress)}
          c={c}
        />
      </div>
    </ConfigProvider>
  );
}

export default App;
