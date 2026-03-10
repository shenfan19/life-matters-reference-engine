import React, { useState } from 'react';
import Game from './components/Game';
import StoryLoader from './components/StoryLoader';
import { useI18n } from './core/i18n';
import { Story } from './core/types';

function App() {
    const { t, language, setLanguage } = useI18n();
    const [view, setView] = useState<'stories' | 'game'>('stories');
    const [selectedStory, setSelectedStory] = useState<Story | null>(null);

    const goToSimulation = () => {
        window.location.href = 'http://localhost:5173';
    };

    const toggleLanguage = () => {
        const nextLang = language === 'zh-CN' ? 'zh-TW' : (language === 'zh-TW' ? 'en' : 'zh-CN');
        setLanguage(nextLang as any);
    };

    const renderHeader = (showBackToStories = false) => (
        <div style={{
            position: 'absolute',
            top: 20,
            right: 20,
            zIndex: 2000,
            display: 'flex',
            gap: '10px'
        }}>
            <button
                onClick={toggleLanguage}
                style={{
                    background: '#4b5563',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    borderRadius: '4px'
                }}
            >
                {language === 'en' ? '中文' : (language === 'zh-CN' ? '繁體' : 'English')}
            </button>
            {showBackToStories && (
                <button
                    onClick={() => setView('stories')}
                    style={{
                        background: '#b87333',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        cursor: 'pointer',
                        borderRadius: '4px'
                    }}
                >
                    {t('game.back_to_stories') || '返回故事列表'}
                </button>
            )}
            <button
                onClick={goToSimulation}
                style={{
                    background: '#2c3e50',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    borderRadius: '4px'
                }}
            >
                {t('game.go_sim') || '返回仿真'}
            </button>
        </div>
    );

    if (view === 'stories') {
        return (
            <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
                {renderHeader()}
                <StoryLoader
                    onSelect={(story) => {
                        setSelectedStory(story);
                        setView('game');
                    }}
                    onGoToSimulation={goToSimulation}
                />
            </div>
        );
    }

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#121212' }}>
            {renderHeader(true)}
            {selectedStory && <Game story={selectedStory} />}
        </div>
    );
}

export default App;

