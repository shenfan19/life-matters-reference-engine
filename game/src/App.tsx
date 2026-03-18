// game/src/App.tsx
import { useState } from 'react';
import { ConfigProvider, theme } from 'antd';
import StorySelect from './components/StorySelect';
import CardGame from './components/CardGame';

function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [view, setView] = useState<'select' | 'game'>('select');
  const [storyPath, setStoryPath] = useState<string | null>(null);

  const primary = isDarkMode ? '#52c41a' : '#007A33';

  const antTheme = {
    algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: primary,
      colorBgBase: isDarkMode ? '#0d1a10' : '#f5faf6',
      colorBgContainer: isDarkMode ? '#111f16' : '#ffffff',
      colorBorder: isDarkMode ? '#1e3824' : '#c8e6c9',
      borderRadius: 6,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif',
    },
  };

  return (
    <ConfigProvider theme={antTheme}>
      {view === 'select' ? (
        <StorySelect
          isDarkMode={isDarkMode}
          onToggleDark={() => setIsDarkMode(d => !d)}
          onSelect={path => { setStoryPath(path); setView('game'); }}
        />
      ) : (
        <CardGame
          storyPath={storyPath!}
          isDarkMode={isDarkMode}
          onBack={() => { setStoryPath(null); setView('select'); }}
        />
      )}
    </ConfigProvider>
  );
}

export default App;
