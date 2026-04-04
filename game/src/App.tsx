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
  const [fontSize,  setFontSize]    = useState<number>(saved.fontSize ?? 16);

  // Lifted select-screen state — persists when returning from game
  const [viewMode,   setViewMode]   = useState<ViewMode>(saved.viewMode ?? 'card');
  const [sortBy,     setSortBy]     = useState<SortKey>(saved.sortBy ?? 'period');
  const [tagFilter,  setTagFilter]  = useState<Record<string, string[]>>(saved.tagFilter ?? {});

  // Persist app-level state on every change
  useEffect(() => {
    try {
      const prev = readAppPersist();
      localStorage.setItem(APP_PERSIST_KEY, JSON.stringify({
        ...prev, isDarkMode, view, storyPath, viewMode, sortBy, tagFilter, fontSize,
      }));
    } catch {}
  }, [isDarkMode, view, storyPath, viewMode, sortBy, tagFilter, fontSize]);

  const primary = isDarkMode ? '#52c41a' : '#007A33';

  const antTheme = {
    algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: primary,
      colorBgBase: isDarkMode ? '#111111' : '#f5f5f5',
      colorBgContainer: isDarkMode ? '#1a1a1a' : '#ffffff',
      colorBorder: isDarkMode ? '#2a2a2a' : '#e0e0e0',
      borderRadius: 6,
      fontSize,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif',
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
          fontSize={fontSize}
          onFontSize={setFontSize}
        />
      ) : (
        <CardGame
          storyPath={storyPath!}
          isDarkMode={isDarkMode}
          onToggleDark={() => setIsDarkMode(d => !d)}
          onBack={() => { setStoryPath(null); setView('select'); }}
          fontSize={fontSize}
          onFontSize={setFontSize}
        />
      )}
    </ConfigProvider>
  );
}

export default App;
