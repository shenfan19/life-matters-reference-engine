import { useState, useEffect } from 'react';
import { ConfigProvider, theme, Button, Space, Tooltip } from 'antd';
import { TranslationOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
import Loader from './components/Loader';
import Simulator from './components/Simulator';
import Optimizer from './components/Optimizer';
import PluginView from './components/PluginView';
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

  const gamePages = [
    { id: 'cg_loader', name: t('menu.storyloader') }
  ];

  const renderContent = () => {
    switch (currentPage) {
      case 'loader':
      case 'cg_loader':
        return (
          <Loader
            subPage={currentPage === 'cg_loader' ? 'loader' : currentPage}
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
        // 如果是插件ID，显示插件视图
        if (currentPage.startsWith('plugin:')) {
          const pluginId = currentPage.replace('plugin:', '');
          return <PluginView pluginId={pluginId} />;
        }
        return <div>选择功能</div>;
    }
  };

  const academicTheme = {
    algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: isDarkMode ? '#177ddc' : '#0f172a', // 深色/冷淡的主色
      borderRadius: 2, // 更学术的小圆角
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },
    components: {
      Button: {
        borderRadius: 2,
        controlHeight: 32,
      },
      Card: {
        borderRadiusLG: 2,
      },
      Menu: {
        darkItemSelectedBg: '#334155',
      }
    }
  };

  return (
    <ConfigProvider theme={academicTheme}>
      <div style={{
        display: 'flex',
        height: '100vh',
        backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc',
        color: isDarkMode ? '#f8fafc' : '#0f172a',
        transition: 'all 0.3s'
      }}>
        {/* 左侧导航 */}
        <div style={{
          width: 250,
          borderRight: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
          background: isDarkMode ? '#1e293b' : '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '2px 0 8px rgba(0,0,0,0.05)'
        }}>
          {/* Logo/Title */}
          <div style={{
            padding: '24px 20px',
            borderBottom: `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}`,
          }}>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 800,
                  letterSpacing: '-0.025em',
                  color: isDarkMode ? '#f8fafc' : '#0f172a'
                }}>
                  {t('app.title')}
                </h2>
                <Space>
                  <Tooltip title={t('common.language')}>
                    <Button
                      type="text"
                      icon={<TranslationOutlined />}
                      onClick={() => {
                        const langs: Language[] = ['zh-CN', 'zh-TW', 'en', 'fr'];
                        const currentIndex = langs.indexOf(language);
                        const nextLang = langs[(currentIndex + 1) % langs.length];
                        setLanguage(nextLang);
                      }}
                      style={{ color: isDarkMode ? '#f8fafc' : '#475569' }}
                    />
                  </Tooltip>
                  <Tooltip title={isDarkMode ? t('common.dark_mode') : t('common.light_mode')}>
                    <Button
                      type="text"
                      icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      style={{ color: isDarkMode ? '#f8fafc' : '#475569' }}
                    />
                  </Tooltip>
                </Space>
              </div>
              <div style={{ fontSize: 11, color: isDarkMode ? '#94a3b8' : '#64748b', fontWeight: 500 }}>
                {t('app.subtitle')}
              </div>
            </Space>
          </div>

          {/* 核心功能组 */}
          <div style={{ padding: '20px 12px', flex: 1 }}>
            <div style={{
              fontSize: 11,
              color: isDarkMode ? '#475569' : '#94a3b8',
              marginBottom: 12,
              paddingLeft: 8,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              {t('menu.calculator')}
            </div>
            {corePages.map(page => (
              <div
                key={page.id}
                onClick={() => setCurrentPage(page.id)}
                style={{
                  padding: '10px 12px',
                  marginBottom: 4,
                  cursor: 'pointer',
                  borderRadius: 4,
                  background: currentPage === page.id
                    ? (isDarkMode ? '#334155' : '#f1f5f9')
                    : 'transparent',
                  color: currentPage === page.id
                    ? (isDarkMode ? '#f8fafc' : '#0f172a')
                    : (isDarkMode ? '#94a3b8' : '#64748b'),
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

            <div style={{
              fontSize: 11,
              color: isDarkMode ? '#475569' : '#94a3b8',
              marginTop: 24,
              marginBottom: 12,
              paddingLeft: 8,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              {t('menu.cardgame')}
            </div>
            {gamePages.map(page => (
              <div
                key={page.id}
                onClick={() => setCurrentPage(page.id)}
                style={{
                  padding: '10px 12px',
                  marginBottom: 4,
                  cursor: 'pointer',
                  borderRadius: 4,
                  background: currentPage === page.id
                    ? (isDarkMode ? '#334155' : '#f1f5f9')
                    : 'transparent',
                  color: currentPage === page.id
                    ? (isDarkMode ? '#f8fafc' : '#0f172a')
                    : (isDarkMode ? '#94a3b8' : '#64748b'),
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
              <div style={{
                fontSize: 11,
                color: isDarkMode ? '#475569' : '#94a3b8',
                marginBottom: 12,
                paddingLeft: 8,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                {t('menu.plugins')}
              </div>
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
                    background: 'linear-gradient(45deg, #b87333, #8b5a2b)',
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

          <div style={{
            padding: 16,
            borderTop: `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}`,
            fontSize: 11,
            color: isDarkMode ? '#475569' : '#94a3b8',
            textAlign: 'center'
          }}>
            Academic Edition v0.3.5
          </div>
        </div>

        {/* 右侧内容区 */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          background: isDarkMode ? '#0f172a' : '#f8fafc',
          padding: '24px'
        }}>
          <div style={{
            maxWidth: 1400,
            margin: '0 auto',
            height: '100%'
          }}>
            {renderContent()}
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}

// 插件列表组件
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
        setPlugins(data.plugins || []);
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
      {loading && (
        <div style={{ padding: 8, fontSize: 12, color: '#94a3b8' }}>
          Loading...
        </div>
      )}

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
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            ⚠️ Backend Disconnected
          </div>
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
              background: isActive
                ? (isDarkMode ? '#334155' : '#f1f5f9')
                : 'transparent',
              color: isActive
                ? (isDarkMode ? '#f8fafc' : '#0f172a')
                : (isDarkMode ? '#94a3b8' : '#64748b'),
              fontWeight: isActive ? 600 : 400,
              border: isActive ? `1px solid ${isDarkMode ? '#475569' : '#e2e8f0'}` : '1px solid transparent',
              transition: 'all 0.2s',
              fontSize: '13px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ lineHeight: 1 }}>{plugin.name}</div>
                <div style={{
                  fontSize: 10,
                  marginTop: 4,
                  opacity: 0.6,
                  fontWeight: 400
                }}>
                  {plugin.category}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default App;
