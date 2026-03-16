import { useState, useEffect } from 'react';
import { ConfigProvider, theme, Button, Space, Tooltip, Dropdown, Divider } from 'antd';
import {
  TranslationOutlined, SunOutlined, MoonOutlined,
  DatabaseOutlined, ExperimentOutlined, FunctionOutlined,
  AppstoreOutlined, RocketOutlined
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
  label, icon, active, onClick, c
}: {
  label: string; icon: React.ReactNode;
  active: boolean; onClick: () => void; c: typeof C.light;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px 9px 9px',
        marginBottom: 3,
        cursor: 'pointer',
        borderRadius: 6,
        borderLeft: `3px solid ${active ? c.primary : 'transparent'}`,
        background: active ? c.activeBg : hovered ? c.navHover : 'transparent',
        color: active ? c.activeText : c.textSec,
        fontWeight: active ? 600 : 400,
        fontSize: 13,
        transition: 'all 0.18s ease',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 15, lineHeight: 1, opacity: active ? 1 : 0.65 }}>
        {icon}
      </span>
      {label}
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ text, c }: { text: string; c: typeof C.light }) {
  return (
    <div style={{
      padding: '4px 12px',
      marginTop: 16,
      marginBottom: 6,
      fontSize: 10.5,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      color: c.textMute,
    }}>
      {text}
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
  const isSimulating = simState.status === 'running' || optState.status === 'running';

  const corePages = [
    { id: 'loader',    name: t('menu.loader'),    icon: <DatabaseOutlined /> },
    { id: 'simulator', name: t('menu.simulator'), icon: <ExperimentOutlined /> },
    { id: 'optimizer', name: t('menu.optimizer'), icon: <FunctionOutlined /> },
  ];

  const renderContent = () => {
    switch (currentPage) {
      case 'loader':
        if (playingStoryId) {
          return <StoryEngine storyId={playingStoryId} onExit={() => setPlayingStoryId(null)} />;
        }
        return (
          <Loader
            subPage="loader"
            onModelSelect={setSelectedModel}
            confirmedModel={confirmedModel}
            setConfirmedModel={setConfirmedModel}
            storyTree={storyTree}
            setStoryTree={setStoryTree}
            expandedKeys={expandedKeys}
            setExpandedKeys={setExpandedKeys}
            storyViewMode={storyViewMode}
            setStoryViewMode={setStoryViewMode}
            storyFilter={storyFilter}
            setStoryFilter={setStoryFilter}
            storySort={storySort}
            setStorySort={setStorySort}
            checkedStoryKeys={checkedStoryKeys}
            setCheckedStoryKeys={setCheckedStoryKeys}
            loadedMods={loadedMods}
            setLoadedMods={setLoadedMods}
            isSimulating={isSimulating}
            isLocked={isLocked}
            setIsLocked={setIsLocked}
            isDarkMode={isDarkMode}
            onPlayStory={setPlayingStoryId}
          />
        );
      case 'simulator':
        return (
          <Simulator
            selectedModel={selectedModel}
            state={simState}
            setState={setSimState}
            isLocked={isLocked}
            isDarkMode={isDarkMode}
          />
        );
      case 'optimizer':
        return (
          <Optimizer
            selectedModel={confirmedModel}
            state={optState}
            setState={setOptState}
            isLocked={isLocked}
            isDarkMode={isDarkMode}
          />
        );
      default:
        if (currentPage.startsWith('plugin:')) {
          return <PluginView pluginId={currentPage.replace('plugin:', '')} isDarkMode={isDarkMode} />;
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
      Menu: {
        darkItemSelectedBg: '#1a3a22',
        darkItemSelectedColor: '#52c41a',
      },
      Layout: {
        bodyBg: isDarkMode ? '#0d1a10' : '#f5faf6',
        headerBg: isDarkMode ? '#111f16' : '#ffffff',
      },
      Tabs: {
        itemActiveColor: antPrimary,
        itemSelectedColor: antPrimary,
        inkBarColor: antPrimary,
        horizontalItemPadding: '12px 16px',
      },
      Divider: { colorSplit: isDarkMode ? '#1e3824' : '#c8e6c9' },
      Tag: { borderRadiusSM: 4 },
      Input: {
        colorBgContainer: isDarkMode ? '#162a1b' : '#ffffff',
      },
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
        display: 'flex',
        height: '100vh',
        backgroundColor: c.bg,
        color: c.text,
        transition: 'background-color 0.25s ease, color 0.25s ease',
      }}>

        {/* ── Sidebar ── */}
        <div style={{
          width: 240,
          flexShrink: 0,
          borderRight: `1px solid ${c.border}`,
          background: c.sidebar,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: isDarkMode
            ? '2px 0 12px rgba(0,0,0,0.4)'
            : '2px 0 12px rgba(0, 80, 30, 0.06)',
        }}>

          {/* ── Logo / Title ── */}
          <div style={{
            padding: '18px 20px 16px',
            borderBottom: `1px solid ${c.border}`,
            background: isDarkMode
              ? 'rgba(0,0,0,0.15)'
              : 'linear-gradient(135deg, rgba(0,122,51,0.04) 0%, transparent 100%)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              {/* Brand mark + title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: isDarkMode
                    ? 'linear-gradient(135deg, #52c41a, #007A33)'
                    : 'linear-gradient(135deg, #007A33, #005824)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#ffffff',
                  flexShrink: 0,
                  boxShadow: isDarkMode
                    ? '0 2px 8px rgba(82,196,26,0.35)'
                    : '0 2px 8px rgba(0,122,51,0.30)',
                }}>
                  中
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: c.text,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {t('app.title')}
                  </div>
                  <div style={{
                    fontSize: 10.5,
                    color: c.textMute,
                    marginTop: 2,
                    letterSpacing: '0.02em',
                  }}>
                    中山大学 · Academic
                  </div>
                </div>
              </div>

              {/* Controls */}
              <Space size={2} style={{ flexShrink: 0, marginLeft: 4 }}>
                <Dropdown
                  menu={{
                    items: [
                      { key: 'zh-CN', label: '简体中文' },
                      { key: 'zh-TW', label: '繁體中文' },
                      { key: 'en',    label: 'English' },
                      { key: 'fr',    label: 'Français' },
                    ],
                    selectedKeys: [language],
                    onClick: (e) => setLanguage(e.key as Language),
                  }}
                  placement="bottomRight"
                >
                  <Tooltip title={t('common.language') || 'Language'}>
                    <Button
                      type="text"
                      size="small"
                      icon={<TranslationOutlined />}
                      style={{ color: c.textSec, padding: '0 4px' }}
                    />
                  </Tooltip>
                </Dropdown>

                <Tooltip title={isDarkMode ? t('common.light_mode') : t('common.dark_mode')}>
                  <Button
                    type="text"
                    size="small"
                    icon={isDarkMode ? <MoonOutlined /> : <SunOutlined />}
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    style={{ color: c.textSec, padding: '0 4px' }}
                  />
                </Tooltip>
              </Space>
            </div>
          </div>

          {/* ── Navigation ── */}
          <div style={{ padding: '14px 10px', flex: 1, overflowY: 'auto' }}>
            <SectionLabel text={t('menu.calculator') || 'Workspace'} c={c} />

            {corePages.map(page => (
              <NavItem
                key={page.id}
                label={page.name}
                icon={page.icon}
                active={currentPage === page.id}
                onClick={() => setCurrentPage(page.id)}
                c={c}
              />
            ))}

            <Divider style={{ margin: '14px 0 4px', borderColor: c.border }} />
            <SectionLabel text={t('menu.plugins') || 'Tools'} c={c} />

            <PluginList
              currentPage={currentPage}
              onSelectPlugin={(id) => setCurrentPage(`plugin:${id}`)}
              isDarkMode={isDarkMode}
              c={c}
            />
          </div>

          {/* ── Footer / Go to Game ── */}
          <div style={{
            padding: '12px 14px 16px',
            borderTop: `1px solid ${c.border}`,
          }}>
            <Button
              type="primary"
              block
              icon={<RocketOutlined />}
              onClick={() => window.open('http://localhost:5174', '_blank')}
              style={{
                background: isDarkMode
                  ? 'linear-gradient(135deg, #2d7a1f, #52c41a)'
                  : 'linear-gradient(135deg, #005824, #007A33)',
                border: 'none',
                height: 38,
                fontWeight: 600,
                borderRadius: 6,
                fontSize: 13,
                boxShadow: isDarkMode
                  ? '0 3px 12px rgba(82,196,26,0.30)'
                  : '0 3px 12px rgba(0,122,51,0.25)',
              }}
            >
              {t('button.go_game')}
            </Button>

            <div style={{
              marginTop: 10,
              fontSize: 10.5,
              color: c.textMute,
              textAlign: 'center',
              letterSpacing: '0.02em',
            }}>
              v0.3.5
            </div>
          </div>
        </div>

        {/* ── Content Area ── */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px',
          background: c.bg,
        }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', height: '100%' }}>
            {renderContent()}
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}

// ─── Plugin list ──────────────────────────────────────────────────────────────
function PluginList({
  currentPage, onSelectPlugin, isDarkMode, c
}: {
  currentPage: string;
  onSelectPlugin: (id: string) => void;
  isDarkMode: boolean;
  c: typeof C.light;
}) {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/plugins?v=${Date.now()}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        const order = ['model_builder', 'scenario_builder', 'story_converter'];
        const sorted = (data.plugins || []).sort((a: any, b: any) => {
          const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
          if (ia === -1 && ib === -1) return 0;
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        });
        setPlugins(sorted);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '8px 12px', fontSize: 12, color: c.textMute }}>
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        margin: '4px 2px',
        padding: '10px 12px',
        fontSize: 11.5,
        color: '#ef4444',
        background: isDarkMode ? 'rgba(127,29,29,0.25)' : '#fef2f2',
        borderRadius: 6,
        border: `1px solid ${isDarkMode ? '#7f1d1d' : '#fee2e2'}`,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 3 }}>Backend offline</div>
        <div style={{ opacity: 0.8 }}>python api_server.py</div>
      </div>
    );
  }

  return (
    <>
      {plugins.map(plugin => {
        const isActive = currentPage === `plugin:${plugin.id}`;
        return (
          <NavItem
            key={plugin.id}
            label={plugin.name}
            icon={<AppstoreOutlined />}
            active={isActive}
            onClick={() => onSelectPlugin(plugin.id)}
            c={c}
          />
        );
      })}
    </>
  );
}

export default App;
