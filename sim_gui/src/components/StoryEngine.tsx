import React, { useState, useEffect } from 'react';
import { Spin, message, Progress, Button, Tooltip } from 'antd';
import './StoryEngine.css';

interface CardData {
  name: string;
  type: string;
  tags: string[];
  cost: number;
  effects: Record<string, any>;
  description: string;
  icon: string;
  id: string; // Filename
}

interface StoryConfig {
  name: string;
  goal_value: number;
  initial_state: Record<string, number>;
  variable_labels: Record<string, string>;
  params: Record<string, number>;
  dynamics: any[];
  initial_deck: { Cards: { id: string; count: number }[] };
  hand_size: number;
  draw_per_turn: number;
  ap_per_turn: number;
  win_condition: Record<string, string>;
  loss_condition: Record<string, string>;
}

interface StoryEngineProps {
  storyId: string;
  onExit: () => void;
}

const StoryEngine: React.FC<StoryEngineProps> = ({ storyId, onExit }) => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<StoryConfig | null>(null);
  const [cards, setCards] = useState<Record<string, CardData>>({});
  const [state, setState] = useState<Record<string, number>>({});
  const [hand, setHand] = useState<CardData[]>([]);
  const [deck, setDeck] = useState<string[]>([]);
  const [playedCards, setPlayedCards] = useState<CardData[]>([]);
  const [stateSnapshot, setStateSnapshot] = useState<Record<string, number>>({});
  const [turn, setTurn] = useState(1);
  const [ap, setAp] = useState(3);
  const [logs, setLogs] = useState<{ text: string; type: 'positive' | 'negative' | 'neutral' }[]>([]);
  const [gameOver, setGameOver] = useState<'win' | 'loss' | null>(null);

  useEffect(() => {
    loadStory();
  }, [storyId]);

  const loadStory = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/story/${storyId}`);
      const result = await response.json();
      if (result.success) {
        const { config: storyConfig, cards: cardsData } = result.data;
        setConfig(storyConfig);
        
        // Process cards to include ID
        const processedCards: Record<string, CardData> = {};
        Object.entries(cardsData).forEach(([key, val]: [string, any]) => {
          const id = key.split('/').pop() || key;
          processedCards[id] = { ...val, id };
        });
        setCards(processedCards);
        
        // Initialize State
        setState(storyConfig.initial_state);
        setStateSnapshot(storyConfig.initial_state);
        setAp(storyConfig.ap_per_turn || 3);
        
        // Initialize Deck
        const initialDeck: string[] = [];
        storyConfig.initial_deck.Cards.forEach((item: any) => {
          for (let i = 0; i < item.count; i++) {
            initialDeck.push(item.id);
          }
        });
        // Shuffle deck
        const shuffled = [...initialDeck].sort(() => Math.random() - 0.5);
        
        // Draw initial hand
        const handSize = storyConfig.hand_size || 5;
        const initialHand = shuffled.slice(0, handSize).map(id => processedCards[id]);
        const remainingDeck = shuffled.slice(handSize);
        
        setHand(initialHand);
        setDeck(remainingDeck);
        
        setLogs([{ text: `欢迎来到故事：${storyConfig.name}`, type: 'neutral' }]);
      } else {
        message.error(`加载失败: ${result.error}`);
      }
    } catch (err: any) {
      message.error(`网络错误: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Apply a list of cards' effects onto a base state (pure, no side effects)
  const applyCardEffects = (base: Record<string, number>, cards: CardData[]): Record<string, number> => {
    const s = { ...base };
    for (const card of cards) {
      Object.entries(card.effects).forEach(([key, val]) => {
        let value = 0;
        if (typeof val === 'string' && val.startsWith('params.')) {
          value = config?.params[val.split('.')[1]] || 0;
        } else {
          value = Number(val);
        }
        const varName = key.startsWith('+') || key.startsWith('-') ? key.substring(1) : key;
        if (key.startsWith('-')) {
          s[varName] = (s[varName] || 0) - value;
        } else {
          s[varName] = (s[varName] || 0) + value;
        }
      });
    }
    return s;
  };

  // Computed preview state (snapshot + all played cards, not committed yet)
  const previewState = applyCardEffects(stateSnapshot, playedCards);

  const handlePlayCard = (card: CardData, index: number) => {
    if (ap < card.cost) {
      message.warning('行动点(AP)不足');
      return;
    }
    setAp(prev => prev - card.cost);
    setHand(prev => prev.filter((_, i) => i !== index));
    setPlayedCards(prev => [...prev, card]);
    setLogs(prev => [{ text: `打出 [${card.name}]，点击可撤回`, type: 'positive' }, ...prev]);
  };

  const handleRecallCard = (card: CardData, index: number) => {
    setPlayedCards(prev => prev.filter((_, i) => i !== index));
    setHand(prev => [...prev, card]);
    setAp(prev => prev + card.cost);
    setLogs(prev => [{ text: `撤回 [${card.name}]`, type: 'neutral' }, ...prev]);
  };

  const endTurn = () => {
    // 1. Lock in played cards
    let newState = applyCardEffects(stateSnapshot, playedCards);
    if (playedCards.length > 0) {
      setLogs(prev => [{ text: `结算 ${playedCards.length} 张打出的牌`, type: 'positive' }, ...prev]);
    }
    setPlayedCards([]);

    // 2. Environment Phase
    if (config?.dynamics) {
      config.dynamics.forEach(dyn => {
        // Simple condition check
        let shouldApply = false;
        if (!dyn.condition) {
          shouldApply = true;
        } else {
          // Eval condition (basic)
          const [v, op, threshold] = dyn.condition.split(' ');
          const currentVal = newState[v] || 0;
          const target = config.params[threshold.replace('params.', '')] || Number(threshold);
          if (op === '>=' && currentVal >= target) shouldApply = true;
          if (op === '>' && currentVal > target) shouldApply = true;
          if (op === '<=' && currentVal <= target) shouldApply = true;
          if (op === '<' && currentVal < target) shouldApply = true;
        }

        if (shouldApply) {
          if (dyn.effect) {
             const [targetVar, op, val] = dyn.effect.split(' ');
             const value = config.params[val.replace('params.', '')] || Number(val);
             if (op === '-=') newState[targetVar] -= value;
             if (op === '+=') newState[targetVar] += value;
          } else if (dyn.formula) {
             // Handle formula like "health -= radiation * params.chronic_damage_rate"
             if (dyn.id === 'chronic_damage') {
                const rate = config.params.chronic_damage_rate;
                newState.health -= newState.radiation * rate;
             }
          }
          setLogs(prev => [{ text: `环境事件: ${dyn.description}`, type: 'negative' }, ...prev]);
        }
      });
    }

    setState(newState);
    setStateSnapshot(newState);

    // 3. Settlement
    if (checkWinLoss(newState)) return;

    // 4. New Turn Start
    setTurn(prev => prev + 1);
    setAp(config?.ap_per_turn || 3);
    
    // Draw card
    if (deck.length > 0) {
      const nextId = deck[0];
      setHand(prev => [...prev, cards[nextId]]);
      setDeck(prev => prev.slice(1));
    }
    
    setLogs(prev => [{ text: `第 ${turn + 1} 回合开始`, type: 'neutral' }, ...prev]);
  };

  const checkWinLoss = (currentState: Record<string, number>) => {
    if (!config) return false;

    // Win check
    let win = false;
    Object.entries(config.win_condition).forEach(([key, condition]) => {
      const currentVal = currentState[key] || 0;
      const [op, threshold] = condition.split(' ');
      const target = Number(threshold);
      if (op === '>=' && currentVal >= target) win = true;
    });

    if (win) {
      setGameOver('win');
      return true;
    }

    // Loss check
    let loss = false;
    Object.entries(config.loss_condition).forEach(([key, condition]) => {
      const currentVal = currentState[key] || 0;
      const [op, threshold] = condition.split(' ');
      const target = Number(threshold);
      if (op === '<=' && currentVal <= target) loss = true;
    });

    if (loss) {
      setGameOver('loss');
      return true;
    }

    return false;
  };

  if (loading) return <div className="loading-screen"><Spin size="large" tip="加载故事中..." /></div>;
  if (!config) return <div>Failed to load story.</div>;

  return (
    <div className="story-engine-container">
      {/* Header / Stats Overlay */}
      <div className="story-header">
        <div className="story-title">{config.name}</div>
        <div className="turn-counter">Turn {turn}</div>
      </div>

      <main className="game-layout">
        <div className="center-column" style={{ flex: 1, display: 'grid', gridTemplateRows: '1fr 300px 300px', minHeight: 0, overflow: 'hidden' }}>
          <div className="battlefield">
            {/* Status Indicators */}
            <div className="status-grid">
              {Object.entries(previewState).map(([key, val]) => {
                const base = stateSnapshot[key] ?? 0;
                const delta = Math.round(val - base);
                return (
                  <div key={key} className="status-card">
                    <div className="status-label">{config.variable_labels[key] || key}</div>
                    <div className="status-value-row">
                      <span className="value-num">{Math.round(val)}</span>
                      {delta !== 0 && (
                        <span style={{ marginLeft: 4, color: delta > 0 ? '#52c41a' : '#ef4444', fontWeight: 600 }}>
                          {delta > 0 ? `+${delta}` : delta}
                        </span>
                      )}
                      <Progress
                        percent={key === 'health' ? Math.max(0, val) : Math.min(100, val / config.goal_value * 100)}
                        showInfo={false}
                        strokeColor={key === 'health' ? '#ef4444' : '#3b82f6'}
                        trailColor="rgba(255,255,255,0.1)"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="middle-section">
               <div className="ap-display">
                  AP: {Array.from({ length: config.ap_per_turn }).map((_, i) => (
                    <div key={i} className={`ap-dot ${i < ap ? 'active' : ''}`} />
                  ))}
               </div>
               <Button type="primary" danger size="large" onClick={endTurn} className="end-turn-btn">
                 结束回合
               </Button>
            </div>
          </div>

          {/* Played Zone */}
          <div className="played-zone" style={{ background: 'rgba(82,196,26,0.07)', borderTop: '1px solid rgba(82,196,26,0.3)', borderBottom: '1px solid rgba(82,196,26,0.3)', padding: '10px 20px', overflow: 'hidden' }}>
            <div className="played-zone-label">
              已打出 {playedCards.length > 0 ? `(${playedCards.length})` : ''} — 点击撤回
            </div>
            <div className="played-zone-cards">
              {playedCards.length === 0 ? (
                <div className="played-zone-empty">本回合尚未打出牌</div>
              ) : playedCards.map((card, i) => (
                <div
                  key={i}
                  className="played-card"
                  onClick={() => handleRecallCard(card, i)}
                  title="点击撤回此牌"
                >
                  <div className="played-card-cost">{card.cost}</div>
                  <div className="played-card-icon">{card.icon}</div>
                  <div className="played-card-name">{card.name}</div>
                  <div className="played-card-effects">
                    {Object.entries(card.effects).map(([k, v]) => (
                      <span key={k} className={k.startsWith('-') ? 'eff-neg' : 'eff-pos'}>
                        {k.startsWith('+') || k.startsWith('-') ? k.substring(1) : k} {k.startsWith('-') ? '-' : '+'}{v}
                      </span>
                    ))}
                  </div>
                  <div className="played-card-recall">↩</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hand Area (Hearthstone Overlap Style) */}
          <div className="hand-area">
            <div className="hand-wrapper">
              {hand.map((card, i) => (
                <div
                  key={i}
                  className="game-card-hs"
                  style={{
                    zIndex: i,
                    transform: `translateX(${i * -40}px)` // Overlap effect
                  }}
                  onClick={() => handlePlayCard(card, i)}
                >
                  {/* Hearthstone style corners */}
                  <div className="card-corner-top-left">
                    <BadgeHS color="blue">{card.cost}</BadgeHS>
                  </div>
                  <div className="card-corner-bottom-left">
                    <Tooltip title={card.type.toUpperCase()}>
                      <div className="type-icon">{card.icon}</div>
                    </Tooltip>
                  </div>

                  <div className="card-content">
                    <div className="card-name">{card.name}</div>
                    <div className="card-desc">{card.description}</div>
                    <div className="card-effects-short">
                      {Object.entries(card.effects).map(([k, v]) => (
                        <div key={k} className={k.startsWith('-') ? 'eff-neg' : 'eff-pos'}>
                          {k}: {v}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="game-sidebar">
          <div className="sidebar-section">
            <h3>历史日志</h3>
            <div className="log-list">
              {logs.map((log, i) => (
                <div key={i} className={`log-item log-${log.type}`}>{log.text}</div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {gameOver && (
        <div className="game-over-overlay">
          <div className="game-over-modal">
            <h2>{gameOver === 'win' ? '🎉 你改写了历史！' : '🥀 遗憾落幕...'}</h2>
            <p>{gameOver === 'win' ? '目标达成，你的事业将永垂青史。' : '精疲力竭，历史的车轮继续无情前进。'}</p>
            <Button type="primary" onClick={onExit}>返回关卡选择</Button>
          </div>
        </div>
      )}
    </div>
  );
};

// Internal mini-component for badges
const BadgeHS: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <div className={`badge-hs badge-${color}`}>
    {children}
  </div>
);

export default StoryEngine;
