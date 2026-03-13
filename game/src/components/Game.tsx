import React, { useState, useEffect, useMemo } from 'react';
import './MarieCurieGame.css';
import { Story, Card as GameCard, GameState } from '../core/types';
import { Engine } from '../core/Engine';
import { StoryLoader } from '../core/StoryLoader';
import { chronic_damage_dynamics } from '../core/dynamics/chronic_damage';

interface GameProps {
  story: Story;
}

const Game: React.FC<GameProps> = ({ story }) => {
  const loader = useMemo(() => {
    const sl = new StoryLoader();
    // Initialize loader with story data so resolveValue works
    // (We'll use a hack to set the internal story since it's already parsed)
    return sl;
  }, []);

  // Hack to set currentStory in loader since we already have the parsed object
  useEffect(() => {
    if (loader) {
      (loader as any).currentStory = story;
    }
  }, [story, loader]);
  
  // Initialize Engine
  const engine = useMemo(() => {
    const eng = new Engine(story, loader);
    eng.registerDynamicEffect('chronic_damage_dynamics', chronic_damage_dynamics);
    return eng;
  }, [story, loader]);

  const [state, setState] = useState<GameState>(engine.getState());
  const [ap, setAp] = useState(3);
  const [turn, setTurn] = useState(1);
  const [hand, setHand] = useState<GameCard[]>([]);
  const [logs, setLogs] = useState<{ text: string, type: 'positive' | 'negative' | 'neutral' }[]>([]);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [showSettlement, setShowSettlement] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Initialize hand only when STORY changes
  useEffect(() => {
    const initialDeck = story.decks.find(d => d.id === 'player_initial');
    if (initialDeck) {
      const newHand: GameCard[] = [];
      initialDeck.cards.forEach(cardRef => {
        const card = story.cards[cardRef.id];
        if (card) {
          for (let i = 0; i < cardRef.count; i++) {
            newHand.push({ ...card, id: `${card.id}-${i}-${Date.now()}` });
          }
        }
      });
      setHand(newHand);
    }
  }, [story]);

  const handleCardClick = (card: GameCard) => {
    if (ap >= (card.cost || 0) && isPlayerTurn) {
      setAp(prev => prev - (card.cost || 0));
      setHand(prev => prev.filter(c => c.id !== card.id));
      
      engine.applyCard(card);
      setState({ ...engine.getState() });

      const effectText = card.effects?.map(e => {
          const label = story.meta.variable_labels?.[e.variable] || e.variable;
          const cleanLabel = label.split(' ').pop() || label; // Remove emoji for text
          return `${e.op}${loader.resolveValue(e.value)} ${cleanLabel}`;
      }).join(', ') || '';
      setLogs(prev => [{ text: `你使用了 [${card.name}]: ${effectText}`, type: "positive" }, ...prev]);

      if (engine.checkVictory() !== 'ongoing') {
          setShowSettlement(true);
      }
    }
  };

  const endTurn = () => {
    setIsPlayerTurn(false);
    setLogs(prev => [{ text: "环境正在向你施压...", type: "neutral" }, ...prev]);

    // Environment Phase
    setTimeout(() => {
      // 1. Process story-wide passive effects
      engine.processPassiveEffects();

      // 2. Draw 1-2 environment cards from the deck (non-passive ones)
      const envDeck = story.decks.find(d => d.id === 'environment_initial');
      if (envDeck) {
          // Filter out passive cards as they are processed above
          const activePool = envDeck.cards.filter(c => !story.cards[c.id].is_passive);
          if (activePool.length > 0) {
              const randomRef = activePool[Math.floor(Math.random() * activePool.length)];
              const card = story.cards[randomRef.id];
              if (card) {
                  const shouldTrigger = !card.condition || engine.checkCondition(card.condition);
                  if (shouldTrigger && (card.probability === undefined || Math.random() <= card.probability)) {
                      engine.applyCard(card);
                      setLogs(prev => [{ text: `[环境] ${card.name} 触发了!`, type: "negative" }, ...prev]);
                  }
              }
          }
      }

      setState({ ...engine.getState() });
      setTurn(prev => {
          const nextTurn = prev + 1;
          if (engine.checkVictory() !== 'ongoing' || nextTurn >= 50) {
              setShowSettlement(true);
          }
          return nextTurn;
      });
      setAp(3);
      setIsPlayerTurn(true);
    }, 1200);
  };




  return (
    <div className="marie-curie-container">
      <aside className={`sidebar ${!sidebarOpen ? 'sidebar-collapsed' : ''}`}>
        <div className="sidebar-header">
          {sidebarOpen && <span style={{ color: 'var(--copper-light)', fontWeight: 'bold' }}>实验室记录</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', color: 'var(--copper)', cursor: 'pointer' }}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>
        {sidebarOpen && (
          <div className="sidebar-content">
            <section className="character-bio" style={{ marginBottom: '20px', borderBottom: '1px solid rgba(184,115,51,0.2)', paddingBottom: '10px' }}>
              <h4 style={{ margin: '0 0 10px 0' }}>{story.meta.name}</h4>
              <p style={{ fontSize: '11px', opacity: 0.8 }}>{story.meta.description}</p>
            </section>
            <section className="game-logs">
              {logs.map((log, i) => (
                <div key={i} className={`log-entry log-${log.type}`}>{log.text}</div>
              ))}
            </section>
          </div>
        )}
      </aside>

      <main className="game-main">
        <section className="layer layer-environment">
            <div className="channel-section" style={{ flex: 1 }}>
                <div className="card-slots">
                    {/* Placeholder for active threats */}
                    <div className="slot">
                        <div className="threat-card" style={{ opacity: 0.5 }}>
                            <div style={{ fontSize: '10px' }}>环境监控中...</div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="destiny-machine">
                <div style={{ fontSize: '10px', color: 'var(--copper-light)', marginBottom: '5px' }}>
                    {isPlayerTurn ? '你的回合' : '环境阶段'}
                </div>
                <div style={{ width: '90px', height: '120px', border: '1px solid var(--copper)', borderRadius: '4px', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                    <div style={{ fontSize: '24px' }}>📦</div>
                    <div style={{ fontSize: '10px', opacity: 0.5 }}>牌堆</div>
                </div>
            </div>
        </section>

        <section className="layer layer-status">
            <div className="status-item">
                <div className="status-label">{story.meta.variable_labels?.['health'] || 'HP 生命'}</div>
                <div className="progress-bar">
                    <div className={`progress-fill hp-fill ${state.health < 25 ? 'hp-low' : ''}`} style={{ width: `${Math.max(0, state.health)}%` }}></div>
                </div>
                <div className="resource-value">{Math.round(state.health)}</div>
            </div>

            <div className="status-item">
                <div className="status-label">{story.meta.variable_labels?.[story.meta.goal_variable] || story.meta.goal_variable.toUpperCase()}</div>
                <div className="progress-bar">
                    <div className="progress-fill sp-fill" style={{ width: `${(state[story.meta.goal_variable] / story.meta.goal_value) * 100}%` }}></div>
                </div>
                <div className="resource-value">{Math.round(state[story.meta.goal_variable])}/{story.meta.goal_value}</div>
            </div>

            {/* Render other variables dynamically */}
            {Object.keys(state).filter(k => k !== 'health' && k !== story.meta.goal_variable).map(key => (
                 <div key={key} className="status-item" style={{ minWidth: '60px' }}>
                    <div className="status-label">{story.meta.variable_labels?.[key] || key}</div>
                    <div className="resource-value">{Math.round(state[key])}</div>
                </div>
            ))}

            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div className="status-label">回合 {turn}/50</div>
                <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                    {[...Array(3)].map((_, i) => (
                        <div key={i} style={{
                            width: '12px', height: '12px', borderRadius: '50%',
                            background: i < ap ? 'var(--accent-blue)' : '#444',
                            boxShadow: i < ap ? '0 0 5px var(--accent-blue)' : 'none'
                        }}></div>
                    ))}
                </div>
                <button className="btn-classic" onClick={endTurn} disabled={!isPlayerTurn} style={{ marginTop: '10px', padding: '5px 15px', fontSize: '12px' }}>
                    结束回合
                </button>
            </div>
        </section>

        <section className="layer layer-hand">
          <div className="hand-container">
              {hand.map((card, index) => (
                <div 
                  key={card.id} 
                  className={`hand-card ${ap < (card.cost || 0) ? 'card-disabled' : ''}`} 
                  style={{ zIndex: index + 1 }} 
                  onClick={() => handleCardClick(card)}
                >
                  <div className="card-top-left">
                    {card.cost || 0}
                  </div>
                  <div className="card-title">{card.name}</div>
                  <div className="card-emoji">{card.type === 'work' ? '🛠️' : (card.type === 'goal' ? '🔬' : '💊')}</div>
                  <div className="card-effect">
                    {card.effects?.map((eff, i) => {
                      const label = story.meta.variable_labels?.[eff.variable] || eff.variable;
                      const cleanLabel = label.split(' ').pop() || label;
                      return (
                        <div key={i} style={{ color: eff.op === '-' ? 'var(--accent-red)' : 'var(--accent-blue)' }}>
                          {cleanLabel} {eff.op}{loader.resolveValue(eff.value)}
                        </div>
                      );
                    })}
                  </div>
                  <div className="card-bottom-left">
                    [{card.type.toUpperCase()}]
                  </div>
                  {card.reference && <div className="card-footer" style={{ fontSize: '8px', opacity: 0.6 }}>{card.reference}</div>}
                </div>
              ))}
          </div>
        </section>

      </main>

      {showSettlement && (
        <div className="settlement-overlay">
          <div className="settlement-card">
            <h1>结算报告</h1>
            <div className="rank-text">{engine.checkVictory() === 'win' ? 'S' : 'F'}</div>
            <p style={{ fontSize: '18px' }}>{engine.checkVictory() === 'win' ? '你书写了辉煌的生命轨迹' : '生命在重压下戛然而止'}</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', margin: '30px 0' }}>
              <div><strong>HP:</strong> {Math.round(state.health)}</div>
              <div><strong>SP:</strong> {Math.round(state[story.meta.goal_variable])}</div>
            </div>
            <button className="btn-classic" onClick={() => window.location.reload()}>返回主菜单</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Game;
