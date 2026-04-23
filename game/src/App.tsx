// game/src/App.tsx
import { useState, useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import StorySelect from './components/StorySelect';
import CardGame from './components/CardGame';
import { useI18n } from './core/i18n';

type ViewMode = 'card' | 'list';
type SortKey = 'period' | 'created' | 'difficulty';

const APP_PERSIST_KEY  = 'game_persist';
const LM_FONT_KEY      = 'lm_font_size';   // shared with sim
const DISC_ACCEPT_KEY  = 'game_disclaimer_accepted';

function readAppPersist(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(APP_PERSIST_KEY) ?? '{}'); }
  catch { return {}; }
}

// Read ?story= URL param (cleanPath without models/ prefix)
function readStoryParam(): string | null {
  const p = new URLSearchParams(window.location.search).get('story');
  return p ? `models/${p}` : null;
}

function App() {
  const saved = readAppPersist();

  const [isDarkMode, setIsDarkMode] = useState<boolean>(saved.isDarkMode ?? true);

  // If URL has ?story=, open game directly — overrides saved view
  const urlStory = readStoryParam();
  const [view, setView]           = useState<'select' | 'game'>(urlStory ? 'game' : (saved.view ?? 'select'));
  const [storyPath, setStoryPath] = useState<string | null>(urlStory ?? saved.storyPath ?? null);
  const [fontSize,  setFontSize]    = useState<number>(
    Number(localStorage.getItem(LM_FONT_KEY)) || saved.fontSize || 16
  );
  const [disclaimerAccepted, setDisclaimerAccepted] = useState<boolean>(
    localStorage.getItem(DISC_ACCEPT_KEY) === 'true'
  );

  const { t, isLoaded } = useI18n();

  // Lifted select-screen state — persists when returning from game
  const [viewMode,   setViewMode]   = useState<ViewMode>(saved.viewMode ?? 'card');
  const [sortBy,     setSortBy]     = useState<SortKey>(saved.sortBy ?? 'period');
  const [tagFilter,  setTagFilter]  = useState<Record<string, string[]>>(saved.tagFilter ?? {});

  // Sync view state with browser back/forward navigation
  useEffect(() => {
    const handlePop = () => {
      const p = new URLSearchParams(window.location.search).get('story');
      if (p) {
        setStoryPath(`models/${p}`);
        setView('game');
      } else {
        setStoryPath(null);
        setView('select');
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Persist app-level state on every change
  useEffect(() => {
    try {
      const prev = readAppPersist();
      localStorage.setItem(APP_PERSIST_KEY, JSON.stringify({
        ...prev, isDarkMode, view, storyPath, viewMode, sortBy, tagFilter, fontSize,
      }));
      localStorage.setItem(LM_FONT_KEY, String(fontSize));
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

  const fs = {
    xs: Math.round(fontSize * 0.75),
    sm: Math.round(fontSize * 0.875),
    md: fontSize,
    lg: Math.round(fontSize * 1.125),
    xl: Math.round(fontSize * 1.25),
  };

  const c = isDarkMode ? {
    bg: '#111111', panel: '#1a1a1a', border: '#2a2a2a',
    text: '#ffffff', textSec: '#b0b0b0', textMute: '#666666',
    primary: '#52c41a',
  } : {
    bg: '#f5f5f5', panel: '#ffffff', border: '#e0e0e0',
    text: '#000000', textSec: '#444444', textMute: '#888888',
    primary: '#007A33',
  };

  return (
    <ConfigProvider theme={antTheme}>
      {isLoaded && !disclaimerAccepted && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20
        }}>
          <div style={{
            background: c.panel, borderRadius: 14,
            maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto',
            padding: '40px 48px', boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ fontSize: fs.lg, fontWeight: 700, color: c.text, textAlign: 'center', marginBottom: 16, fontFamily: 'Georgia, serif' }}>
              {t('disclaimer.title')}
            </div>

            <div style={{ color: c.textSec, lineHeight: 1.7, marginBottom: 20, fontSize: fs.md }}>
              {t('disclaimer.intro')}
            </div>

            <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 20, marginBottom: 28 }}>
              {Array.isArray(t('disclaimer.points')) && (t('disclaimer.points') as string[]).map((point, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14, color: c.textSec, fontSize: fs.sm, lineHeight: 1.6 }}>
                  <span style={{ color: c.primary, flexShrink: 0, marginTop: 2 }}>·</span>
                  <span>{point}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                localStorage.setItem(DISC_ACCEPT_KEY, 'true');
                setDisclaimerAccepted(true);
              }}
              style={{
                alignSelf: 'center', padding: '10px 32px', borderRadius: 8,
                background: c.primary, color: '#fff', border: 'none',
                fontSize: fs.md, fontWeight: 700, cursor: 'pointer',
                boxShadow: `0 4px 14px ${c.primary}44`,
                transition: 'transform 0.2s'
              }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {t('disclaimer.confirm')}
            </button>
          </div>
        </div>
      )}

      {view === 'select' ? (
        <StorySelect
          isDarkMode={isDarkMode}
          onToggleDark={() => setIsDarkMode(d => !d)}
          onSelect={path => {
            setStoryPath(path);
            setView('game');
            const clean = path.replace(/^mods\//, '');
            history.pushState({}, '', `?story=${clean}`);
          }}
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
          onBack={() => {
            setStoryPath(null);
            setView('select');
            history.replaceState({}, '', window.location.pathname);
          }}
          fontSize={fontSize}
          onFontSize={setFontSize}
        />
      )}
    </ConfigProvider>
  );
}

export default App;
