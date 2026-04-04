// game/src/App.tsx
import { useState, useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import StorySelect from './components/StorySelect';
import CardGame from './components/CardGame';

type ViewMode = 'card' | 'list';
type SortKey = 'period' | 'location' | 'difficulty';

const APP_PERSIST_KEY = 'game_persist';

function readAppPersist(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(APP_PERSIST_KEY) ?? '{}'); }
  catch { return {}; }
}

function App() {
  const saved = readAppPersist();

  const [isDarkMode, setIsDarkMode] = useState<boolean>(saved.isDarkMode ?? true);
  const [view, setView]             = useState<'select' | 'game'>(saved.view ?? 'select');
  const [storyPath, setStoryPath]   = useState<string | null>(saved.storyPath ?? null);

  // Lifted select-screen state — persists when returning from game
  const [viewMode,   setViewMode]   = useState<ViewMode>(saved.viewMode ?? 'card');
  const [sortBy,     setSortBy]     = useState<SortKey>(saved.sortBy ?? 'period');
  const [tagFilter,  setTagFilter]  = useState<Record<string, string[]>>(saved.tagFilter ?? {});

  // Persist app-level state on every change
  useEffect(() => {
    try {
      const prev = readAppPersist();
      localStorage.setItem(APP_PERSIST_KEY, JSON.stringify({
        ...prev, isDarkMode, view, storyPath, viewMode, sortBy, tagFilter,
      }));
    } catch {}
  }, [isDarkMode, view, storyPath, viewMode, sortBy, tagFilter]);

  const primary = isDarkMode ? '#52c41a' : '#007A33';

  const antTheme = {
    algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: primary,
      colorBgBase: isDarkMode ? '#0d1a10' : '#f6ffed',
      colorBgContainer: isDarkMode ? '#111f16' : '#ffffff',
      colorBorder: isDarkMode ? '#1e3824' : '#c8e6c9',
      borderRadius: 6,
      fontSize: 16,
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
          viewMode={viewMode}
          setViewMode={setViewMode}
          sortBy={sortBy}
          setSortBy={setSortBy}
          tagFilter={tagFilter}
          setTagFilter={setTagFilter}
        />
      ) : (
        <CardGame
          storyPath={storyPath!}
          isDarkMode={isDarkMode}
          onToggleDark={() => setIsDarkMode(d => !d)}
          onBack={() => { setStoryPath(null); setView('select'); }}
        />
      )}
    </ConfigProvider>
  );
}

export default App;
