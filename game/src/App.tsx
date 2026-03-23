// game/src/App.tsx
import { useState, useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import StorySelect from './components/StorySelect';
import CardGame from './components/CardGame';

type ViewMode = 'card' | 'list';
type SortKey = 'period' | 'location' | 'difficulty';

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [view, setView] = useState<'select' | 'game'>('select');
  const [storyPath, setStoryPath] = useState<string | null>(null);

  // Lifted select-screen state — persists when returning from game
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [sortBy, setSortBy] = useState<SortKey>('period');
  const [tagFilter, setTagFilter] = useState<Record<string, string[]>>({});

  // Keep body background in sync — antd dark-algorithm injects body styles that persist after unmount
  useEffect(() => {
    document.body.style.background = isDarkMode ? '#0d1a10' : '#f5faf6';
    document.body.style.margin = '0';
  }, [isDarkMode]);

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

  // ConfigProvider only wraps CardGame — prevents antd dark-algorithm CSS bleeding into StorySelect
  return (
    <>
      {view === 'select' ? (
        <StorySelect
          isDarkMode={isDarkMode}
          onToggleDark={() => setIsDarkMode(d => !d)}
          onSelect={path => { setStoryPath(path); setView('game'); }}
          viewMode={viewMode}
          setViewMode={setViewMode}
          sortBy={sortBy}
          setSortBy={setSortBy}
          tagFilter={tagFilter}
          setTagFilter={setTagFilter}
        />
      ) : (
        <ConfigProvider theme={antTheme}>
          <CardGame
            storyPath={storyPath!}
            isDarkMode={isDarkMode}
            onBack={() => { setStoryPath(null); setView('select'); }}
          />
        </ConfigProvider>
      )}
    </>
  );
}

export default App;
