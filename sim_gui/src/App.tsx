import { useState, useEffect } from 'react';
import { ConfigProvider, theme, Button, Space, Tooltip, Dropdown } from 'antd';
import { TranslationOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
import Loader from './components/Loader';
import Simulator from './components/Simulator';
import Optimizer from './components/Optimizer';
import PluginView from './components/PluginView';
import StoryEngine from './components/StoryEngine';
import type { SimulationState, OptimizerState, ModelFile, DataNode } from './types';
import { useI18n, type Language } from './core/i18n';

const initialSimulationState: SimulationState = {
  status: 'idle',
  progress: 0,
  currentStep: 0,
  totalSteps: 1440,
  simulationData: [],
  inputParams: {},
  stateVariables: {},
  sessionId: '',
  timeValue: 24,
  timeUnit: 'day',
  stepValue: 3600,
  stepUnit: 'second',
  batchSize: 10,
  updateInterval: 50
};

const initialOptimizerState: OptimizerState = {
  status: 'idle',
  progress: 0,
  currentStep: 0,
  totalSteps: 1440,
  optimizationData: [],
  inputParams: {},
  stateVariables: {},
  sessionId: '',
  timeValue: 30,
  timeUnit: 'day',
  stepValue: 3600,
  stepUnit: 'second',
  batchSize: 10,
  updateInterval: 100
};

function App() {
  const { t, language, setLanguage } = useI18n();
  const [currentPage, setCurrentPage] = useState('loader');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelFile | null>(null);
  const [confirmedModel, setConfirmedModel] = useState<ModelFile | null>(null);
  const [simState, setSimState] = useState<SimulationState>(initialSimulationState);
  const [optState, setOptState] = useState<OptimizerState>(initialOptimizerState);
  const [playingStoryId, setPlayingStoryId] = useState<string | null>(null);

  // --- Lifted Loader States ---
  const [modelTree, setModelTree] = useState<DataNode[]>([]);
  const [storyTree, setStoryTree] = useState<DataNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(['mods', 'models', 'scenarios']);
  const [modelViewMode, setModelViewMode] = useState<'tree' | 'list'>('tree');
  const [storyViewMode, setStoryViewMode] = useState<'tree' | 'list'>('tree');
  const [modelFilter, setModelFilter] = useState('');
  const [storyFilter, setStoryFilter] = useState('');
  const [modelSort, setModelSort] = useState<'name' | 'type'>('name');
  const [storySort, setStorySort] = useState<'name' | 'type'>('name');
  const [checkedModelKeys, setCheckedModelKeys] = useState<React.Key[]>([]);
  const [manualCheckedModelKeys, setManualCheckedModelKeys] = useState<React.Key[]>([]);
  const [checkedStoryKeys, setCheckedStoryKeys] = useState<React.Key[]>([]);
  const [loadedMods, setLoadedMods] = useState<Record<string, ModelFile>>({});

  const [isLocked, setIsLocked] = useState(false);
  const isSimulating = simState.status === 'running' || optState.status === 'running';

  const corePages = [
    { id: 'loader', name: t('menu.loader') },
    { id: 'simulator', name: t('menu.simulator') },
    { id: 'optimizer', name: t('menu.optimizer') }
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
            modelTree={modelTree}
            setModelTree={setModelTree}
            storyTree={storyTree}
            setStoryTree={setStoryTree}
            expandedKeys={expandedKeys}
            setExpandedKeys={setExpandedKeys}
            modelViewMode={modelViewMode}
            setModelViewMode={setModelViewMode}
            storyViewMode={storyViewMode}
            setStoryViewMode={setStoryViewMode}
            modelFilter={modelFilter}
            setModelFilter={setModelFilter}
            storyFilter={storyFilter}
            setStoryFilter={setStoryFilter}
            modelSort={modelSort}
            setModelSort={setModelSort}
            storySort={storySort}
            setStorySort={setStorySort}
            checkedModelKeys={checkedModelKeys}
            setCheckedModelKeys={setCheckedModelKeys}
            manualCheckedModelKeys={manualCheckedModelKeys}
            setManualCheckedModelKeys={setManualCheckedModelKeys}
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
          const pluginId = currentPage.replace('plugin:', '');
          return <PluginView pluginId={pluginId} isDarkMode={isDarkMode} />;
        }
        return <div>选择功能</div>;
    }
  };

  const academicTheme = {
    algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: '#52c41a',
      borderRadius: 2,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },
    components: {
      Button: { borderRadius: 4, controlHeight: 32 },
      Card: { borderRadiusLG: 4 },
      Menu: { darkItemSelectedBg: '#003a8c' },
      Layout: {
        bodyBg: isDarkMode ? '#141414' : '#ffffff',
        headerBg: isDarkMode ? '#1f1f1f' : '#ffffff'
      },
      Tabs: {
        itemActiveColor: '#52c41a',
        itemSelectedColor: '#52c41a',
        inkBarColor: '#52c41a',
        horizontalItemPadding: '12px 16px'
      },
      Divider: {
        colorSplit: isDarkMode ? '#334155' : '#e2e8f0'
      },
      Tag: {
        borderRadiusSM: 2
      }
    }
  };

  return (
    <ConfigProvider theme={academicTheme}>
      <div style={{
        display: 'flex',
        height: '100vh',
        backgroundColor: isDarkMode ? '#141414' : '#ffffff',
        color: isDarkMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.88)',
        transition: 'all 0.3s'
      }}>
        {/* Sidebar */}
        <div style={{
        width: 250,
        borderRight: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
        background: isDarkMode ? '#1e293b' : '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '2px 0 8px rgba(0,0,0,0.05)'
        }}>
          {/* Logo/Title */}
          <div style={{
            padding: '24px 20px',
            borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
          }}>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 800,
                  letterSpacing: '-0.025em',
                  color: isDarkMode ? 'rgba(255, 255, 255, 0.85)' : '#0f172a'
                }}>
                  {t('app.title')}
                </h2>
                <Space>
                  <Dropdown
                    menu={{
                      items: [
                        { key: 'zh-CN', label: '简体中文' },
                        { key: 'zh-TW', label: '繁体中文' },
                        { key: 'en', label: 'English' },
                        { key: 'fr', label: 'Français' },
                      ],
                      selectedKeys: [language],
                      onClick: (e) => setLanguage(e.key as Language)
                    }}
                    placement="bottomRight"
                  >
                    <Button
                      type="text"
                      icon={<TranslationOutlined />}
                      style={{ color: isDarkMode ? 'rgba(255, 255, 255, 0.85)' : '#0f172a' }}
                    >
                      {language.split('-')[0].toUpperCase()}
                    </Button>
                  </Dropdown>

                  <Tooltip title={isDarkMode ? t('common.dark_mode') : t('common.light_mode')}>
                    <Button
                      type="text"
                      icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      style={{ color: isDarkMode ? 'rgba(255, 255, 255, 0.85)' : '#0f172a' }}
                    />
                  </Tooltip>
                  </Space>
              </div>
            </Space>
          </div>

          {/* Navigation Items */}
          <div style={{ padding: '20px 12px', flex: 1, overflowY: 'auto' }}>
            {/* Removed t('menu.calculator') label */}
            {corePages.map(page => (
              <div
                key={page.id}
                onClick={() => setCurrentPage(page.id)}
                style={{
                  padding: '10px 12px',
                  marginBottom: 4,
                  cursor: 'pointer',
                  borderRadius: 4,
                   background: currentPage === page.id ? (isDarkMode ? '#52c41a' : '#f6ffed') : 'transparent',
                   color: currentPage === page.id ? (isDarkMode ? '#ffffff' : '#52c41a') : (isDarkMode ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.65)'),
                  fontWeight: currentPage === page.id ? 600 : 400,
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '13px'
                }}
              >
                {page.name}
              </div>
            ))}

            <div style={{ marginTop: 24 }}>
              {/* Removed t('menu.plugins') label */}
              <PluginList
                currentPage={currentPage}
                onSelectPlugin={(id) => setCurrentPage(`plugin:${id}`)}
                isDarkMode={isDarkMode}
              />
              <div style={{ marginTop: 24, padding: '0 12px' }}>
                <Button
                  type="primary"
                  block
                  onClick={() => window.open('http://localhost:5174', '_blank')}
                  style={{
                    background: 'linear-gradient(45deg, #003a8c, #1890ff)',
                    border: 'none',
                    height: '40px',
                    fontWeight: 'bold'
                  }}
                >
                  {t('button.go_game')}
                </Button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: 16,
            borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
            fontSize: 11,
            color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.45)',
            textAlign: 'center'
          }}>
            Academic Edition v0.3.5
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', height: '100%' }}>
            {renderContent()}
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}

function PluginList({ currentPage, onSelectPlugin, isDarkMode }: {
  currentPage: string,
  onSelectPlugin: (id: string) => void,
  isDarkMode: boolean
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
        const order = ['model_checker', 'mod_merger', 'story_converter'];
        const sortedPlugins = (data.plugins || []).sort((a: any, b: any) => {
          const indexA = order.indexOf(a.id);
          const indexB = order.indexOf(b.id);
          if (indexA === -1 && indexB === -1) return 0;
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });
        setPlugins(sortedPlugins);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load plugins:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div>
      {loading && <div style={{ padding: 8, fontSize: 12, color: '#94a3b8' }}>Loading...</div>}
      {error && (
        <div style={{
          padding: 10,
          fontSize: 11,
          color: '#ef4444',
          background: isDarkMode ? '#450a0a' : '#fef2f2',
          borderRadius: 2,
          border: `1px solid ${isDarkMode ? '#7f1d1d' : '#fee2e2'}`,
          marginBottom: 8
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Backend Disconnected</div>
          <div style={{ opacity: 0.8 }}>Run: python api_server.py</div>
        </div>
      )}
      {plugins.map(plugin => {
        const isActive = currentPage === `plugin:${plugin.id}`;
        return (
          <div
            key={plugin.id}
            onClick={() => onSelectPlugin(plugin.id)}
            style={{
              padding: '10px 12px',
              marginBottom: 4,
              cursor: 'pointer',
               borderRadius: 4,
              background: isActive ? (isDarkMode ? '#003a8c' : '#e6f7ff') : 'transparent',
              color: isActive ? (isDarkMode ? '#ffffff' : '#52c41a') : (isDarkMode ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.65)'),
              fontWeight: isActive ? 600 : 400,
              border: isActive ? `1px solid ${isDarkMode ? '#003a8c' : '#91d5ff'}` : '1px solid transparent',
              transition: 'all 0.2s',
              fontSize: '13px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ lineHeight: 1 }}>{plugin.name}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default App;
