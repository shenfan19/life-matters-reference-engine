import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { ConfigProvider, App as AntdApp, theme, Popover, Tooltip } from 'antd';
import {
  SunOutlined, MoonOutlined,
  LoadingOutlined,
  GithubOutlined, MailOutlined, InfoCircleOutlined, SettingOutlined,
  LeftOutlined, RightOutlined,
} from '@ant-design/icons';

// ─── Font size ────────────────────────────────────────────────────────────────
const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 20;

// ─── Icons ────────────────────────────────────────────────────────────────────
// HeartPulseIcon: heart split green/white left vs right — sim identity
// CardPulseIcon:  card outline + heart suit + QRS trace — game identity

const HeartPulseIcon = ({ size = 16 }: { size?: number | string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{ verticalAlign: 'middle' }}>
    {/* Heart split down the centerline, fore/background colors inverted left vs right */}
    <rect x="0" y="0" width="12" height="24" fill="#007A33" />
    <rect x="12" y="0" width="12" height="24" fill="#ffffff" />
    <path d="M12,19.51 C6.9,15.26 3.5,11.86 3.5,8.46 A5.1,5.1,0,0,1,12,5.91 Z" fill="#ffffff" />
    <path d="M12,5.91 A5.1,5.1,0,0,1,20.5,8.46 C20.5,11.86 17.1,15.26 12,19.51 Z" fill="#007A33" />
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
void CardPulseIcon; // not yet wired into any nav/branding element — kept for the LM Game identity use described above

import Simulator from './components/Simulator';
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
  simulationData: [], dataPerRun: [], inputParams: {}, stateVariables: {}, sessionId: '',
  simStartDate: '2026-01-01', simEndDate: '2026-12-31', stepValue: 1, stepUnit: 'hour',
  optStepValue: 1, optStepUnit: 'hour',
  batchSize: 10, updateInterval: 50, simRuns: 1, mcSeed: null, sessionSeed: 0,
  optMcRuns: 1, optMcSeed: null,
};

// ─── Top title bar ────────────────────────────────────────────────────────────
function TitleBar({ isDarkMode, onToggleDark, language, onLanguage, fontSize, onFontSize, c, t, onAbout }: {
  isDarkMode: boolean; onToggleDark: () => void;
  language: string; onLanguage: (l: Language) => void;
  fontSize: number; onFontSize: (n: number) => void;
  c: typeof C.light; t: (k: string) => string;
  onAbout: () => void;
}) {
  const engineLabel = t('app.engine_subtitle');
  const engineTooltip = t('about.subtitle_tooltip');

  return (
    <div style={{
      minHeight: 44, flexShrink: 0,
      borderBottom: `1px solid ${c.border}`,
      background: c.panel,
      display: 'flex', alignItems: 'center',
      padding: '6px 16px', gap: 0,
      userSelect: 'none',
    }}>
      {/* Logo wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 20, marginTop: 2, marginBottom: 2, userSelect: 'none' }}>
        <HeartPulseIcon size={28} />
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontSize: 'calc(var(--lm-font-size, 14px) * 1.2857)', fontWeight: 700, letterSpacing: '0.02em',
            color: c.text,
            fontFamily: '"Georgia", "Times New Roman", serif',
          }}>
            {t('app.title')}
          </span>
          <Tooltip title={engineTooltip}>
            <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.9286)', cursor: 'default' }}>
              · {engineLabel}
            </span>
          </Tooltip>
        </div>
      </div>

      <div style={{ flex: 1 }} />{/* pushes right actions to edge */}

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Settings gear */}
        <Popover
          trigger="click"
          placement="bottomRight"
          content={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 160 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: c.textMute, fontSize: 12, width: 32 }}>{t('settings.font_size')}</span>
                <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${c.border}`, borderRadius: 6, overflow: 'hidden' }}>
                  <button
                    onClick={() => onFontSize(Math.max(FONT_SIZE_MIN, fontSize - 2))}
                    disabled={fontSize <= FONT_SIZE_MIN}
                    style={{
                      padding: '3px 7px', border: 'none', cursor: fontSize <= FONT_SIZE_MIN ? 'default' : 'pointer',
                      background: 'transparent', color: fontSize <= FONT_SIZE_MIN ? c.border : c.textMute,
                      display: 'flex', alignItems: 'center', lineHeight: 1, fontSize: 11,
                    }}
                  >
                    <LeftOutlined />
                  </button>
                  <span style={{ minWidth: '2.5ch', textAlign: 'center', color: c.text, fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>
                    {fontSize}
                  </span>
                  <button
                    onClick={() => onFontSize(Math.min(FONT_SIZE_MAX, fontSize + 2))}
                    disabled={fontSize >= FONT_SIZE_MAX}
                    style={{
                      padding: '3px 7px', border: 'none', cursor: fontSize >= FONT_SIZE_MAX ? 'default' : 'pointer',
                      background: 'transparent', color: fontSize >= FONT_SIZE_MAX ? c.border : c.textMute,
                      display: 'flex', alignItems: 'center', lineHeight: 1, fontSize: 11,
                    }}
                  >
                    <RightOutlined />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: c.textMute, fontSize: 12, width: 32 }}>{t('settings.language')}</span>
                <select value={language} onChange={e => onLanguage(e.target.value as Language)} style={{
                  flex: 1, padding: '3px 6px', borderRadius: 6,
                  border: `1px solid ${c.border}`, background: c.panel, color: c.textSec,
                  cursor: 'pointer', outline: 'none', fontSize: 12,
                }}>
                  <option value="en">English</option>
                  <option value="zh-CN">简体中文</option>
                  <option value="zh-TW">繁體中文</option>
                  <option value="fr">Français</option>
                </select>
              </div>
            </div>
          }
        >
          <button style={{
            background: 'none', border: `1px solid ${c.border}`, borderRadius: 6,
            padding: '4px 9px', cursor: 'pointer', color: c.textSec, display: 'flex', alignItems: 'center',
          }}>
            <SettingOutlined />
          </button>
        </Popover>

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

// ─── Contact info ─────────────────────────────────────────────────────────────
const AUTHOR = {
  name: 'Fan Shen',
  email: 'shenfan@mail.sysu.edu.cn',
  repo: 'https://github.com/shenfan19/life-matters',
  version: 'v1.0',
};

// ─── Status bar ───────────────────────────────────────────────────────────────
function StatusBar({ backendStatus, model, isSimulating, simProgress, c, t }: {
  backendStatus: 'checking' | 'online' | 'offline';
  model: ModelFile | null;
  isSimulating: boolean; simProgress: number;
  c: typeof C.light;
  t: (k: string) => string;
}) {
  const dotColor = isSimulating ? '#faad14'
    : backendStatus === 'online' ? '#52c41a'
    : backendStatus === 'offline' ? '#f5222d' : '#faad14';

  const statusLabel = isSimulating ? 'running'
    : backendStatus === 'online' ? t('statusBar.backend')
    : backendStatus === 'offline' ? t('statusBar.offline')
    : t('statusBar.connecting');

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
          boxShadow: (backendStatus === 'online' || isSimulating) ? `0 0 5px ${dotColor}` : 'none',
        }} />
        {statusLabel}
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
      <span style={{ flex: 1, textAlign: 'center', opacity: 0.8, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', fontStyle: 'italic' }}>
        {t('statusBar.disclaimer')}
      </span>

      {/* Right: version */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
  const [simMode,  setSimMode]  = useState<'sim' | 'opt'>(() => readPrefs().simMode  ?? 'sim');
  const [isDarkMode, setIsDarkMode] = useState(() => readPrefs().isDarkMode ?? true);
  const [aboutOpen,  setAboutOpen]  = useState(false);
  const [fontSize,   setFontSize]   = useState<number>(
    () => Number(localStorage.getItem(LM_FONT_KEY)) || readPrefs().fontSize || 16
  );
  const [selectedModel, setSelectedModel] = useState<ModelFile | null>(null);
  const [confirmedModel, setConfirmedModel] = useState<ModelFile | null>(null);
  const [simState, setSimState] = useState<SimulationState>(initialSimulationState);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Loader states lifted so Simulator keeps them across re-renders
  const [storyTree, setStoryTree] = useState<DataNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(() => readPrefs().expandedKeys || ['models', 'scenarios']);
  const [storyViewMode, setStoryViewMode] = useState<'tree' | 'list'>('tree');
  const [storyFilter, setStoryFilter] = useState('');
  const [loadedModels, setLoadedModels] = useState<Record<string, ModelFile>>({});
  const c = isDarkMode ? C.dark : C.light;
  const isSimulating = simState.status === 'running';

  // Persist prefs
  useEffect(() => {
    try {
      const current = readPrefs();
      localStorage.setItem(SIM_PREFS_KEY, JSON.stringify({ ...current, isDarkMode, fontSize, page: 'simulator', simMode, expandedKeys }));
      localStorage.setItem(LM_FONT_KEY, String(fontSize));
    } catch {}
  }, [isDarkMode, fontSize, simMode, expandedKeys]);

  const simStateRef = useRef(simState);
  simStateRef.current = simState;

  useEffect(() => {
    const check = () => {
      if (simStateRef.current.status === 'running') return; // skip while sim/opt active
      fetch(`/api/health?v=${Date.now()}`, { signal: AbortSignal.timeout(5000) })
        .then(() => setBackendStatus('online'))
        .catch(() => setBackendStatus('offline'));
    };
    check();
    const id = setInterval(check, 12000);
    return () => clearInterval(id);
  }, []);

  // Anonymous visit counter (no IP/cookie/identity recorded), see reference_engine/src/routes/visits.py
  useEffect(() => {
    fetch('/api/visit', { method: 'POST' }).catch(() => {});
  }, []);

  const antPrimary = c.primary;
  const academicTheme = {
    algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: antPrimary, colorLink: antPrimary, colorSuccess: '#52c41a',
      borderRadius: 6, fontSize,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif',
      colorBgBase: c.bg,
      colorBgContainer: isDarkMode ? '#111f16' : '#ffffff',
      colorBorder: c.border,
      fontSizeSM: Math.max(11, fontSize - 3),
    },
    components: {
      Button: { borderRadius: 6, controlHeight: 32 },
      Card: { borderRadiusLG: 6 },
      Tabs: { itemActiveColor: antPrimary, itemSelectedColor: antPrimary, inkBarColor: antPrimary, horizontalItemPadding: '10px 14px' },
      Divider: { colorSplit: c.border },
      Tag: { borderRadiusSM: 4 },
      Input: { colorBgContainer: isDarkMode ? '#222222' : '#ffffff' },
      InputNumber: { colorBgContainer: isDarkMode ? '#222222' : '#ffffff' },
      Select: {
        colorBgContainer: isDarkMode ? '#222222' : '#ffffff',
        colorBgElevated: isDarkMode ? '#252525' : '#ffffff',
        optionSelectedBg: isDarkMode ? '#2a2a2a' : '#f0f0f0',
        optionSelectedColor: c.text,
      },
      Table: { colorBgContainer: isDarkMode ? '#1a1a1a' : '#ffffff', headerBg: isDarkMode ? '#222222' : '#f5f5f5' },
      Tree: {
        colorBgContainer: 'transparent',
        nodeSelectedBg: c.activeBg,
        nodeHoverBg: isDarkMode ? 'rgba(82,196,26,0.08)' : 'rgba(0,122,51,0.06)',
        colorText: isDarkMode ? 'rgba(255,255,255,0.88)' : '#1a2e22',
        indentSize: 12,
      },
      Segmented: {
        itemSelectedBg: c.activeBg,
        itemSelectedColor: antPrimary,
        trackBg: isDarkMode ? '#1a1a1a' : '#f0f0f0',
      },
    },
  };

  return (
    <ConfigProvider theme={academicTheme}>
    <AntdApp>
      <div style={{
        display: 'flex', flexDirection: 'column', height: '100vh',
        backgroundColor: c.bg, color: c.text,
        transition: 'background-color 0.25s ease, color 0.25s ease',
        fontSize,
        '--lm-font-size': `${fontSize}px`,
      } as CSSProperties & Record<'--lm-font-size', string>}>

        {/* ── Title bar ── */}
        <TitleBar
          isDarkMode={isDarkMode} onToggleDark={() => setIsDarkMode((d: boolean) => !d)}
          language={language} onLanguage={setLanguage}
          fontSize={fontSize} onFontSize={setFontSize}
          c={c} t={t}
          onAbout={() => setAboutOpen(true)}
        />

        {/* ── Content ── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', position: 'relative', background: c.bg }}>
          <Simulator
            selectedModel={selectedModel} state={simState} setState={setSimState}
            isDarkMode={isDarkMode}
            storyTree={storyTree} setStoryTree={setStoryTree}
            expandedKeys={expandedKeys} setExpandedKeys={setExpandedKeys}
            storyViewMode={storyViewMode} setStoryViewMode={setStoryViewMode}
            storyFilter={storyFilter} setStoryFilter={setStoryFilter}
            loadedModels={loadedModels} setLoadedModels={setLoadedModels}
            setConfirmedModel={setConfirmedModel} onModelSelect={setSelectedModel}
            simMode={simMode} onSimModeChange={setSimMode}
            fontSize={fontSize}
          />
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
            <div style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 1.4286)', fontWeight: 700, fontFamily: 'Georgia, serif', color: c.text, marginBottom: 6, lineHeight: 1.3 }}>
              {t('about.name')}
            </div>

            {/* Subtitle */}
            <div style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.9286)', lineHeight: 1.6 }}>
              {t('about.subtitle')}
            </div>

            {/* Version + repo */}
            <div style={{ color: c.textMute, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', marginTop: 8, marginBottom: 12 }}>
              {AUTHOR.version}
            </div>
            <a href={AUTHOR.repo} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', marginBottom: 24 }}>
              <GithubOutlined /> github.com/shenfan19/life-matters
            </a>

            {/* Author block */}
            <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 20, marginBottom: 20 }}>
              <div style={{ color: c.text, fontWeight: 600, fontSize: 'calc(var(--lm-font-size, 14px) * 1.0714)', marginBottom: 4 }}>{AUTHOR.name}</div>
              <div style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.9286)', marginBottom: 12 }}>{t('about.affiliation')}</div>
              <a href={`mailto:${AUTHOR.email}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.9286)' }}>
                <MailOutlined /> {AUTHOR.email}
              </a>
            </div>

            {/* Disclaimer block */}
            <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 20, textAlign: 'left' }}>
              <div style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 1.0714)', fontWeight: 700, color: c.textSec, marginBottom: 12 }}>
                {t('disclaimer.title')}
              </div>
              <div style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.9286)', color: c.textSec, lineHeight: 1.65, marginBottom: 12 }}>
                {t('disclaimer.intro')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.isArray(t('disclaimer.points')) && (t('disclaimer.points') as string[]).map((p, i) => (
                  <div key={i} style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.9286)', color: c.textSec, display: 'flex', gap: 10, lineHeight: 1.5 }}>
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
                color: c.textMute, cursor: 'pointer', fontSize: 'calc(var(--lm-font-size, 14px) * 0.9286)',
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
