import React, { useState } from 'react';
import MarieCurieGame from './components/MarieCurieGame';
import LevelSelect from './components/LevelSelect';

function App() {
    const [view, setView] = useState<'levels' | 'game'>('levels');
    const [selectedLevel, setSelectedLevel] = useState<any>(null);

    const goToSimulation = () => {
        window.location.href = 'http://localhost:5173';
    };

    if (view === 'levels') {
        return (
            <LevelSelect
                onSelect={(level) => {
                    setSelectedLevel(level);
                    setView('game');
                }}
                onGoToSimulation={goToSimulation}
            />
        );
    }

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{
                position: 'absolute',
                top: 20,
                right: 20,
                zIndex: 2000,
                display: 'flex',
                gap: '10px'
            }}>
                <button
                    onClick={() => setView('levels')}
                    style={{
                        background: '#b87333',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        cursor: 'pointer',
                        borderRadius: '4px'
                    }}
                >
                    返回关卡
                </button>
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
                    去仿真器
                </button>
            </div>
            <MarieCurieGame />
        </div>
    );
}

export default App;
