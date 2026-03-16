import React, { useState } from 'react';
import Game from './components/Game';
import StoryLoader from './components/StoryLoader';
import { useI18n, type Language } from './core/i18n';
import { ConfigProvider, theme, Button, Space, Dropdown, MenuProps } from 'antd';
import { TranslationOutlined, SunOutlined, MoonOutlined, RocketOutlined, LeftOutlined } from '@ant-design/icons';
import { Story } from './core/types';

function App() {
    const { t, language, setLanguage } = useI18n();
    const [view, setView] = useState<'stories' | 'game'>('stories');
    const [selectedStory, setSelectedStory] = useState<Story | null>(null);
    const [isDarkMode, setIsDarkMode] = useState(true);

    const goToSimulation = () => {
        window.location.href = 'http://localhost:5173';
    };

    const gameTheme = {
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
            colorPrimary: isDarkMode ? '#52c41a' : '#007A33',
            colorBgBase: isDarkMode ? '#0d1a10' : '#d4edda',
            colorBgContainer: isDarkMode ? '#1a2e1e' : '#ffffff',
            colorTextBase: isDarkMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.88)',
            borderRadius: 6,
        }
    };

    const languageItems: MenuProps['items'] = [
        { key: 'zh-CN', label: '简体中文' },
        { key: 'zh-TW', label: '繁體中文' },
        { key: 'en', label: 'English' },
    ];

    const renderHeader = (showBackToStories = false) => (
        <div style={{
            position: 'absolute',
            top: 20,
            right: 20,
            zIndex: 2000,
            display: 'flex',
            gap: '12px',
            alignItems: 'center'
        }}>
            <Space>
                <Dropdown
                    menu={{
                        items: languageItems,
                        selectedKeys: [language],
                        onClick: (e) => setLanguage(e.key as Language)
                    }}
                >
                    <Button icon={<TranslationOutlined />}>
                        {language.toUpperCase()}
                    </Button>
                </Dropdown>
                
                <Button
                    icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
                    onClick={() => setIsDarkMode(!isDarkMode)}
                />

                {showBackToStories && (
                    <Button
                        type="primary"
                        icon={<LeftOutlined />}
                        onClick={() => setView('stories')}
                    >
                        {t('game.back_to_stories') || '返回'}
                    </Button>
                )}

                <Button 
                    icon={<RocketOutlined />}
                    onClick={goToSimulation}
                >
                    {t('game.go_sim') || '仿真'}
                </Button>
            </Space>
        </div>
    );

    return (
        <ConfigProvider theme={gameTheme}>
            <div style={{ 
                height: '100vh', 
                display: 'flex', 
                flexDirection: 'column',
                backgroundColor: isDarkMode ? '#0d1a10' : '#d4edda',
                color: isDarkMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.88)',
                overflow: 'hidden'
            }}>
                {renderHeader(view === 'game')}
                {view === 'stories' ? (
                    <StoryLoader
                        onSelect={(story) => {
                            setSelectedStory(story);
                            setView('game');
                        }}
                        onGoToSimulation={goToSimulation}
                        isDarkMode={isDarkMode}
                    />
                ) : (
                    selectedStory && <Game story={selectedStory} />
                )}
            </div>
        </ConfigProvider>
    );
}

export default App;

