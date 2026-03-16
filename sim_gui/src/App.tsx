import { useState, useEffect } from 'react';
import { ConfigProvider, theme, Button, Space, Tooltip, Dropdown, Divider } from 'antd';
import {
  TranslationOutlined, SunOutlined, MoonOutlined,
  DatabaseOutlined, ExperimentOutlined, FunctionOutlined,
  AppstoreOutlined, RocketOutlined, CheckCircleFilled,
  LoadingOutlined, ClockCircleOutlined, ApiOutlined
} from '@ant-design/icons';
import Loader from './components/Loader';
import Simulator from './components/Simulator';
import Optimizer from './components/Optimizer';
import PluginView from './components/PluginView';
import StoryEngine from './components/StoryEngine';
import type { SimulationState, OptimizerState, ModelFile, DataNode } from './types';
import { useI18n, type Language } from './core/i18n';

// ─── SYSU color tokens ────────────────────────────────────────────────────────
const C = {
  light: {
    bg:         '#f5faf6',
    sidebar:    '#ffffff',
    border:     '#c8e6c9',
    primary:    '#007A33',
    activeBg:   '#e8f5e9',
    activeText: '#007A33',
    text:       '#1a2e22',
    textSec:    '#5a7a63',
    textMute:   'rgba(0, 0, 0, 0.38)',
    navHover:   '#f0faf2',
    statusBar:  '#edf7f0',
    logoText:   '#ffffff',
  },
  dark: {
    bg:         '#0d1a10',
    sidebar:    '#111f16',
    border:     '#1e3824',
    primary:    '#52c41a',
    activeBg:   '#1a3a22',
    activeText: '#52c41a',
    text:       'rgba(255, 255, 255, 0.88)',
    textSec:    'rgba(255, 255, 255, 0.55)',
    textMute:   'rgba(255, 255, 255, 0.35)',
    navHover:   'rgba(82, 196, 26, 0.08)',
    statusBar:  '#0a1409',
    logoText:   '#ffffff',
  }
};

// ─── Default states ───────────────────────────────────────────────────────────
const initialSimulationState: SimulationState = {
  status: 'idle', progress: 0, currentStep: 0, totalSteps: 1440,
  simulationData: [], inputParams: {}, stateVariables: {}, sessionId: '',
  timeValue: 24, timeUnit: 'day', stepValue: 3600, stepUnit: 'second',
  batchSize: 10, updateInterval: 50
};

const initialOptimizerState: OptimizerState = {
  status: 'idle', progress: 0, currentStep: 0, totalSteps: 1440,
  optimizationData: [], inputParams: {}, stateVariables: {}, sessionId: '',
  timeValue: 30, timeUnit: 'day', stepValue: 3600, stepUnit: 'second',
  batchSize: 10, updateInterval: 100
};

// ─── Nav item ─────────────────────────────────────────────────────────────────
function NavItem({
  label, icon, active, done, onClick, c
}: {
  label: string; icon: React.ReactNode; active: boolean;
  done?: boolean; onClick: () => void; c: typeof C.light;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '8px 12px 8px 9px', marginBottom: 2,
        cursor: 'pointer', borderRadius: 6,
        borderLeft: `3px solid ${active ? c.primary : 'transparent'}`,
        background: active ? c.activeBg : hovered ? c.navHover : 'transparent',
        color: active ? c.activeText : c.textSec,
        fontWeight: active ? 600 : 400, fontSize: 13,
        transition: 'all 0.15s ease', userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1, opacity: active ? 1 : 0.6 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {done && (
        <CheckCircleFilled style={{ fontSize: 11, color: c.primary, opacity: 0.8 }} />
      )}
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ text, c }: { text: string; c: typeof C.light }) {
  return (
    <div style={{
      padding: '3px 12px', marginTop: 14, marginBottom: 5,
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.12em', color: c.textMute,
    }}>
      {text}
    </div>
  );
}

// ─── Workflow pipeline steps ──────────────────────────────────────────────────
function PipelineSteps({
  isModelLoaded, isLocked, simDone, optDone, c
}: {
  isModelLoaded: boolean; isLocked: boolean;
  simDone: boolean; optDone: boolean; c: typeof C.light;
}) {
  const steps = [
    { label: 'Load',     done: isModelLoaded, active: !isModelLoaded },
    { label: 'Validate', done: isLocked,       active: isModelLoaded && !isLocked },
    { label: 'Simulate', done: simDone,         active: isLocked && !simDone },
    { label: 'Optimize', done: optDone,         active: simDone && !optDone },
  ];
  return (
    <div style={{ padding: '6px 14px 2px' }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          {/* Connector line */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14 }}>
            <div style={{
              width: 13, height: 13, borderRadius: '50%', flexShrink: 0,
              background: step.done ? c.primary : 'transparent',
              border: `1.5px solid ${step.done ? c.primary : step.active ? c.primary : c.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, color: '#fff', fontWeight: 700,
              boxShadow: step.active ? `0 0 0 2px ${c.activeBg}` : 'none',
            }}>
              {step.done ? '✓' : ''}
            </div>
            {i < steps.length - 1 && (
              <div style={{
                width: 1.5, height: 10, marginTop: 1,
                background: step.done ? c.primary : c.border,
                opacity: 0.6,
              }} />
            )}
          </div>
          <span style={{
            fontSize: 11.5,
            color: step.done ? c.text : step.active ? c.primary : c.textMute,
            fontWeight: step.active ? 600 : 400,
            lineHeight: '13px',
          }}>
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Active model badge ───────────────────────────────────────────────────────
function ModelBadge({ model, isLocked, c, isDarkMode }: {
  model: ModelFile | null; isLocked: boolean;
  c: typeof C.light; isDarkMode: boolean;
}) {
  if (!model) return null;
  return (
    <div style={{
      margin: '8px 10px 4px',
      padding: '7px 10px',
      borderRadius: 6,
      background: isDarkMode ? 'rgba(82,196,26,0.08)' : 'rgba(0,122,51,0.06)',
      border: `1px solid ${isDarkMode ? 'rgba(82,196,26,0.2)' : 'rgba(0,122,51,0.15)'}`,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: c.primary, marginBottom: 3,
      }}>
        {isLocked ? '🔒 Active Model' : '📄 Loaded Model'}
      </div>
      <div style={{
        fontSize: 11.5, color: c.text, fontWeight: 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace',
      }}>
        {model.title}
      </div>
      {model.type && (
        <div style={{ fontSize: 10, color: c.textMute, marginTop: 2 }}>
          {model.type} · {model.category || 'scenario'}
        </div>
      )}
    </div>
  );
}

// ─── Status bar ───────────────────────────────────────────────────────────────
function StatusBar({ backendStatus, model, isSimulating, simProgress, isOptimizing, optProgress, c, isDarkMode }: {
  backendStatus: 'checking' | 'online' | 'offline';
  model: ModelFile | null;
  isSimulating: boolean; simProgress: number;
  isOptimizing: boolean; optProgress: number;
  c: typeof C.light; isDarkMode: boolean;
}) {
  const dotColor = backendStatus === 'online' ? '#52c41a'
    : backendStatus === 'offline' ? '#f5222d' : '#faad14';

  return (
    <div style={{
      height: 26,
      background: c.statusBar,
      borderTop: `1px solid ${c.border}`,
      display: 'flex', alignItems: 'center',
      padding: '0 14px', gap: 14,
      fontSize: 11,
      color: c.textMute,
      fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace',
      flexShrink: 0,
      userSelect: 'none',
    }}>
      {/* Backend status */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
          background: dotColor,
          boxShadow: backendStatus === 'online' ? `0 0 5px ${dotColor}` : 'none',
        }} />
        {backendStatus === 'online' ? 'Backend' : backendStatus === 'offline' ? 'Offline' : 'Connecting…'}
      </span>

      <span style={{ opacity: 0.25 }}>│</span>

      {/* Model context */}
      <span style={{ color: model ? c.text : c.textMute, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {model ? `${model.title}` : '— no model —'}
      </span>

      {/* Running state */}
      {(isSimulating || isOptimizing) && (
        <>
          <span style={{ opacity: 0.25 }}>│</span>
          <span style={{ color: c.primary, display: 'flex', alignItems: 'center', gap: 4 }}>
            <LoadingOutlined style={{ fontSize: 10 }} spin />
            {isSimulating ? `Simulating ${simProgress}%` : `Optimizing ${optProgress}%`}
          </span>
        </>
      )}

      {/* Right side */}
      <span style={{ marginLeft: 'auto', opacity: 0.5 }}>
        SYSU Life Matters · v0.3.5
      </span>
    </div>
  );
}

// ─── Page header ─────────────────────────────────────────────────────────────
function PageHeader({ title, subtitle, icon, c }: {
  title: string; subtitle?: string; icon: React.ReactNode; c: typeof C.light;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      marginBottom: 16, paddingBottom: 12,
      borderBottom: `1px solid ${c.border}`,
    }}>
      <span style={{ fontSize: 18, color: c.primary }}>{icon}</span>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text, lineHeight: 1.2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: c.textMute, marginTop: 2 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const { t, language, setLanguage } = useI18n();
  const [currentPage, setCurrentPage] = useState('loader');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelFile | null>(null);
  const [confirmedModel, setConfirmedModel] = useState<ModelFile | null>(null);
  const [simState, setSimState] = useState<SimulationState>(initialSimulationState);
  const [optState, setOptState] = useState<OptimizerState>(initialOptimizerState);
  const [playingStoryId, setPlayingStoryId] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Lifted Loader states
  const [storyTree, setStoryTree] = useState<DataNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(['mods', 'scenarios']);
  const [storyViewMode, setStoryViewMode] = useState<'tree' | 'list'>('tree');
  const [storyFilter, setStoryFilter] = useState('');
  const [storySort, setStorySort] = useState<'name' | 'type'>('name');
  const [checkedStoryKeys, setCheckedStoryKeys] = useState<React.Key[]>([]);
  const [loadedMods, setLoadedMods] = useState<Record<string, ModelFile>>({});
  const [isLocked, setIsLocked] = useState(false);

  const c = isDarkMode ? C.dark : C.light;
  const isSimulating = simState.status === 'running';
  const isOptimizing = optState.status === 'running';
  const simDone = simState.simulationData.length > 0;
  const optDone = optState.optimizationData.length > 0;

  // Backend health check
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

  const corePages = [
    { id: 'loader',    name: t('menu.loader'),    icon: <DatabaseOutlined />,    done: !!confirmedModel },
    { id: 'simulator', name: t('menu.simulator'), icon: <ExperimentOutlined />,  done: simDone },
    { id: 'optimizer', name: t('menu.optimizer'), icon: <FunctionOutlined />,    done: optDone },
  ];

  const pageHeaders: Record<string, { title: string; icon: React.ReactNode; subtitle?: string }> = {
    loader:    { title: t('menu.loader'),    icon: <DatabaseOutlined />,   subtitle: 'Load and validate simulation scenarios' },
    simulator: { title: t('menu.simulator'), icon: <ExperimentOutlined />, subtitle: confirmedModel ? `Model: ${confirmedModel.title}` : 'Select a model first' },
    optimizer: { title: t('menu.optimizer'), icon: <FunctionOutlined />,   subtitle: confirmedModel ? `Model: ${confirmedModel.title}` : 'Select a model first' },
  };

  const renderContent = () => {
    const header = pageHeaders[currentPage];

    const wrap = (child: React.ReactNode) => (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {header && !playingStoryId && (
          <PageHeader title={header.title} icon={header.icon} c={c} />
        )}
        {child}
      </div>
    );

    switch (currentPage) {
      case 'loader':
        if (playingStoryId) {
          return <StoryEngine storyId={playingStoryId} onExit={() => setPlayingStoryId(null)} />;
        }
        return wrap(
          <Loader
            subPage="loader" onModelSelect={setSelectedModel}
            confirmedModel={confirmedModel} setConfirmedModel={setConfirmedModel}
            storyTree={storyTree} setStoryTree={setStoryTree}
            expandedKeys={expandedKeys} setExpandedKeys={setExpandedKeys}
            storyViewMode={storyViewMode} setStoryViewMode={setStoryViewMode}
            storyFilter={storyFilter} setStoryFilter={setStoryFilter}
            storySort={storySort} setStorySort={setStorySort}
            checkedStoryKeys={checkedStoryKeys} setCheckedStoryKeys={setCheckedStoryKeys}
            loadedMods={loadedMods} setLoadedMods={setLoadedMods}
            isSimulating={isSimulating || isOptimizing}
            isLocked={isLocked} setIsLocked={setIsLocked}
            isDarkMode={isDarkMode} onPlayStory={setPlayingStoryId}
          />
        );
      case 'simulator':
        return wrap(
          <Simulator
            selectedModel={selectedModel} state={simState} setState={setSimState}
            isLocked={isLocked} isDarkMode={isDarkMode}
          />
        );
      case 'optimizer':
        return wrap(
          <Optimizer
            selectedModel={confirmedModel} state={optState} setState={setOptState}
            isLocked={isLocked} isDarkMode={isDarkMode}
          />
        );
      default:
        if (currentPage.startsWith('plugin:')) {
          const pluginId = currentPage.replace('plugin:', '');
          return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <PageHeader title={pluginId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} icon={<AppstoreOutlined />} subtitle="Plugin workspace" c={c} />
              <PluginView pluginId={pluginId} isDarkMode={isDarkMode} />
            </div>
          );
        }
        return <div>选择功能</div>;
    }
  };

  // ── Ant Design theme ─────────────────────────────────────────────────────
  const antPrimary = c.primary;
  const academicTheme = {
    algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: antPrimary,
      colorLink: antPrimary,
      colorSuccess: '#52c41a',
      borderRadius: 6,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif',
      colorBgBase: isDarkMode ? '#0d1a10' : '#f5faf6',
      colorBgContainer: isDarkMode ? '#111f16' : '#ffffff',
      colorBorder: isDarkMode ? '#1e3824' : '#c8e6c9',
    },
    components: {
      Button: { borderRadius: 6, controlHeight: 32 },
      Card: { borderRadiusLG: 6 },
      Menu: { darkItemSelectedBg: '#1a3a22', darkItemSelectedColor: '#52c41a' },
      Layout: {
        bodyBg: isDarkMode ? '#0d1a10' : '#f5faf6',
        headerBg: isDarkMode ? '#111f16' : '#ffffff',
      },
      Tabs: {
        itemActiveColor: antPrimary, itemSelectedColor: antPrimary,
        inkBarColor: antPrimary, horizontalItemPadding: '10px 14px',
      },
      Divider: { colorSplit: isDarkMode ? '#1e3824' : '#c8e6c9' },
      Tag: { borderRadiusSM: 4 },
      Input: { colorBgContainer: isDarkMode ? '#162a1b' : '#ffffff' },
      Select: {
        colorBgContainer: isDarkMode ? '#162a1b' : '#ffffff',
        colorBgElevated: isDarkMode ? '#1a3a22' : '#ffffff',
      },
      Table: {
        colorBgContainer: isDarkMode ? '#111f16' : '#ffffff',
        headerBg: isDarkMode ? '#162a1b' : '#f0f7f1',
      },
    }
  };

  return (
    <ConfigProvider theme={academicTheme}>
      <div style={{
        display: 'flex', flexDirection: 'column',
        height: '100vh',
        backgroundColor: c.bg,
        color: c.text,
        transition: 'background-color 0.25s ease, color 0.25s ease',
      }}>
        {/* ── Main row ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ── Sidebar ── */}
          <div style={{
            width: 228, flexShrink: 0,
            borderRight: `1px solid ${c.border}`,
            background: c.sidebar,
            display: 'flex', flexDirection: 'column',
            boxShadow: isDarkMode ? '2px 0 12px rgba(0,0,0,0.4)' : '2px 0 8px rgba(0,80,30,0.05)',
          }}>

            {/* ── Logo ── */}
            <div style={{
              padding: '16px 18px 14px',
              borderBottom: `1px solid ${c.border}`,
              background: isDarkMode ? 'rgba(0,0,0,0.12)' : 'linear-gradient(135deg, rgba(0,122,51,0.05) 0%, transparent 100%)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 7,
                    background: isDarkMode ? 'linear-gradient(135deg, #52c41a, #007A33)' : 'linear-gradient(135deg, #007A33, #005824)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0,
                    boxShadow: isDarkMode ? '0 2px 8px rgba(82,196,26,0.3)' : '0 2px 8px rgba(0,122,51,0.25)',
                  }}>中</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: c.text, letterSpacing: '-0.01em', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t('app.title')}
                    </div>
                    <div style={{ fontSize: 10, color: c.textMute, marginTop: 1.5, letterSpacing: '0.02em' }}>
                      SYSU · Life Matters
                    </div>
                  </div>
                </div>
                <Space size={2} style={{ flexShrink: 0, marginLeft: 2 }}>
                  <Dropdown
                    menu={{
                      items: [
                        { key: 'zh-CN', label: '简体中文' }, { key: 'zh-TW', label: '繁體中文' },
                        { key: 'en', label: 'English' }, { key: 'fr', label: 'Français' },
                      ],
                      selectedKeys: [language],
                      onClick: (e) => setLanguage(e.key as Language),
                    }}
                    placement="bottomRight"
                  >
                    <Tooltip title="Language">
                      <Button type="text" size="small" icon={<TranslationOutlined />}
                        style={{ color: c.textSec, padding: '0 3px' }} />
                    </Tooltip>
                  </Dropdown>
                  <Tooltip title={isDarkMode ? 'Switch to Light' : 'Switch to Dark'}>
                    <Button type="text" size="small"
                      icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      style={{ color: c.textSec, padding: '0 3px' }} />
                  </Tooltip>
                </Space>
              </div>
            </div>

            {/* ── Nav ── */}
            <div style={{ padding: '10px 8px 0', overflowY: 'auto', flex: 1 }}>
              <SectionLabel text="Workspace" c={c} />
              {corePages.map(page => (
                <NavItem
                  key={page.id} label={page.name} icon={page.icon}
                  active={currentPage === page.id} done={page.done}
                  onClick={() => setCurrentPage(page.id)} c={c}
                />
              ))}

              <Divider style={{ margin: '12px 0 2px', borderColor: c.border }} />
              <SectionLabel text="Tools" c={c} />
              <PluginList
                currentPage={currentPage}
                onSelectPlugin={(id) => setCurrentPage(`plugin:${id}`)}
                isDarkMode={isDarkMode} c={c}
              />
            </div>

            {/* ── Footer ── */}
            <div style={{ borderTop: `1px solid ${c.border}`, padding: '8px 0 12px' }}>
              {/* Active model badge */}
              <ModelBadge model={confirmedModel} isLocked={isLocked} c={c} isDarkMode={isDarkMode} />

              <div style={{ padding: '6px 10px 0' }}>
                <Button
                  type="primary" block icon={<RocketOutlined />}
                  onClick={() => window.open('http://localhost:5174', '_blank')}
                  style={{
                    background: isDarkMode ? 'linear-gradient(135deg, #2d7a1f, #52c41a)' : 'linear-gradient(135deg, #005824, #007A33)',
                    border: 'none', height: 36, fontWeight: 600, borderRadius: 6, fontSize: 13,
                    boxShadow: isDarkMode ? '0 2px 10px rgba(82,196,26,0.25)' : '0 2px 10px rgba(0,122,51,0.2)',
                  }}
                >
                  {t('button.go_game')}
                </Button>
              </div>
            </div>
          </div>

          {/* ── Content Area ── */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', background: c.bg }}>
            <div style={{ maxWidth: 1400, margin: '0 auto', height: '100%' }}>
              {renderContent()}
            </div>
          </div>
        </div>

        {/* ── Status Bar ── */}
        <StatusBar
          backendStatus={backendStatus}
          model={confirmedModel}
          isSimulating={isSimulating} simProgress={Math.round(simState.progress)}
          isOptimizing={isOptimizing} optProgress={Math.round(optState.progress)}
          c={c} isDarkMode={isDarkMode}
        />
      </div>
    </ConfigProvider>
  );
}

// ─── Plugin list ──────────────────────────────────────────────────────────────
function PluginList({
  currentPage, onSelectPlugin, isDarkMode, c
}: {
  currentPage: string; onSelectPlugin: (id: string) => void;
  isDarkMode: boolean; c: typeof C.light;
}) {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/plugins?v=${Date.now()}`)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => {
        const order = ['model_builder', 'scenario_builder', 'story_converter'];
        const sorted = (data.plugins || []).sort((a: any, b: any) => {
          const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
          if (ia === -1 && ib === -1) return 0; if (ia === -1) return 1;
          if (ib === -1) return -1; return ia - ib;
        });
        setPlugins(sorted); setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) return <div style={{ padding: '6px 12px', fontSize: 11, color: c.textMute }}>Loading…</div>;

  if (error) return (
    <div style={{
      margin: '4px 2px', padding: '8px 10px', fontSize: 11,
      color: '#ef4444',
      background: isDarkMode ? 'rgba(127,29,29,0.2)' : '#fef2f2',
      borderRadius: 6, border: `1px solid ${isDarkMode ? '#7f1d1d' : '#fee2e2'}`,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>
        <ApiOutlined /> Backend offline
      </div>
      <div style={{ opacity: 0.75, fontFamily: 'monospace', fontSize: 10.5 }}>python api_server.py</div>
    </div>
  );

  return (
    <>
      {plugins.map(plugin => (
        <NavItem
          key={plugin.id} label={plugin.name} icon={<AppstoreOutlined />}
          active={currentPage === `plugin:${plugin.id}`}
          onClick={() => onSelectPlugin(plugin.id)} c={c}
        />
      ))}
    </>
  );
}

export default App;
