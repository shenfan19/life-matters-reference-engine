import React, { useState, useEffect } from 'react';
import './MarieCurieGame.css';

interface GameCard {
    id: number;
    name: string;
    emoji: string;
    effect: string;
    cost: number;
    type: string;
    source: string;
}

const INITIAL_HAND: GameCard[] = [
    { id: 1, name: "实验室助手", emoji: "🧪", effect: "+5 金币, -1 HP", cost: 1, type: "WORK", source: "École Normale, 1900" },
    { id: 2, name: "矿石研究", emoji: "🪨", effect: "+10 研究进度, +2 辐射", cost: 2, type: "WORK", source: "Sorbonne Lab, 1898" },
    { id: 3, name: "争取经费", emoji: "💰", effect: "+20 金币", cost: 1, type: "SOCIAL", source: "Private Correspondence" },
    { id: 4, name: "发表论文", emoji: "📜", effect: "+30 研究进度, -5 HP", cost: 3, type: "WORK", source: "Nature Publication" },
    { id: 5, name: "公开演讲", emoji: "🎤", effect: "-5 辐射, +10 金币", cost: 2, type: "SOCIAL", source: "Public Lecture" },
];

const MarieCurieGame: React.FC = () => {
    const [hp, setHp] = useState(85);
    const [sp, setSp] = useState(45);
    const [gold, setGold] = useState(50);
    const [radiation, setRadiation] = useState(15);
    const [turn, setTurn] = useState(12);
    const [ap, setAp] = useState(3);
    const [hand, setHand] = useState(INITIAL_HAND);
    const [envCards, setEnvCards] = useState([
        { id: 101, name: "辐射累积", effect: "每回合 -2 HP" },
        { id: 102, name: "性别歧视", effect: "研究效率 -20%" }
    ]);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [logs, setLogs] = useState([
        { text: "[回合 11] 成功提炼镭元素，SP +15", type: "positive" },
        { text: "[回合 12] 实验室通风不畅，辐射 +5", type: "negative" },
        { text: "[环境阶段] 环境压力增大", type: "neutral" },
    ]);
    const [showSettlement, setShowSettlement] = useState(false);
    const [isPlayerTurn, setIsPlayerTurn] = useState(true);

    // Animation for cards in hand
    const getCardTransform = (index: number, total: number) => {
        const angleRange = 40; // Total arc angle
        const startAngle = -angleRange / 2;
        const step = total > 1 ? angleRange / (total - 1) : 0;
        const angle = startAngle + (index * step);

        // Vertical offset to create the arc (parabola: y = x^2)
        const normalizedX = (index / (total - 1 || 1)) * 2 - 1;
        const translateY = Math.pow(normalizedX, 2) * 20;

        return `rotate(${angle}deg) translateY(${translateY}px)`;
    };

    const handleCardClick = (card: GameCard) => {
        if (ap >= card.cost && isPlayerTurn) {
            setAp(prev => prev - card.cost);
            setHand(prev => prev.filter(c => c.id !== card.id));
            setLogs(prev => [{ text: `你使用了 [${card.name}]: ${card.effect}`, type: "positive" }, ...prev]);

            // Basic effect parsing logic (mock)
            if (card.name.includes("研究")) setSp(prev => Math.min(100, prev + 15));
            if (card.name.includes("金币")) setGold(prev => prev + 10);
            if (card.name.includes("HP")) setHp(prev => prev - 5);

            // Visual feedback via small floating text would go here
        }
    };

    const endTurn = () => {
        setIsPlayerTurn(false);
        setLogs(prev => [{ text: "环境正在向你施压...", type: "neutral" }, ...prev]);

        // Simulate environment phase
        setTimeout(() => {
            setHp(prev => Math.max(0, prev - 8));
            setTurn(prev => prev + 1);
            setAp(3);
            setIsPlayerTurn(true);
            if (hp <= 15) setShowSettlement(true);
        }, 1500);
    };

    return (
        <div className="marie-curie-container">
            {/* Sidebar Section */}
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
                            <h4 style={{ margin: '0 0 10px 0' }}>玛丽·居里</h4>
                            <p style={{ opacity: 0.8 }}>“在科学上，我们应该注意事，而不应该注意人。”</p>
                        </section>

                        <section className="game-logs">
                            {logs.map((log, i) => (
                                <div key={i} className={`log-entry log-${log.type}`}>
                                    {log.text}
                                </div>
                            ))}
                        </section>
                    </div>
                )}
            </aside>

            <main className="game-main">
                {/* Layer 1: Environment Area */}
                <section className="layer layer-environment">
                    <div className="channel-section">
                        <span style={{ color: 'var(--accent-red)' }}>医疗通道 - 社会通道</span>
                        <div className="card-slots">
                            {envCards.map(card => (
                                <div key={card.id} className="slot">
                                    <div className="threat-card">
                                        <div style={{ fontWeight: 'bold', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>{card.name}</div>
                                        <div style={{ marginTop: '5px' }}>{card.effect}</div>
                                    </div>
                                </div>
                            ))}
                            {[...Array(3 - envCards.length)].map((_, i) => <div key={i} className="slot" />)}
                        </div>
                    </div>

                    <div className="destiny-machine">
                        <div style={{ color: 'var(--copper-light)', marginBottom: '5px' }}>
                            {isPlayerTurn ? '你的回合' : '环境阶段'}
                        </div>
                        <div style={{ width: '90px', height: '120px', border: '1px solid var(--copper)', borderRadius: '4px', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ opacity: 0.3 }}>牌堆: 18</span>
                        </div>
                    </div>

                    <div className="channel-section" style={{ alignItems: 'flex-end' }}>
                        <span style={{ color: 'var(--copper-light)' }}>命运展示台</span>
                        <div className="card-slots" style={{ justifyContent: 'flex-end' }}>
                            <div className="slot"></div>
                        </div>
                    </div>
                </section>

                {/* Layer 2: Status Area */}
                <section className="layer layer-status">
                    <div className="status-item">
                        <div className="status-label">HP 生命</div>
                        <div className="progress-bar">
                            <div className={`progress-fill hp-fill ${hp < 25 ? 'hp-low' : ''}`} style={{ width: `${hp}%` }}></div>
                        </div>
                        <div className="resource-value">❤️ {hp}</div>
                    </div>

                    <div className="status-item">
                        <div className="status-label">SP 研究进度</div>
                        <div className="progress-bar">
                            <div className="progress-fill sp-fill" style={{ width: `${sp}%` }}></div>
                            <div style={{ position: 'absolute', left: '70%', top: 0, width: '1px', height: '100%', background: 'var(--copper-light)', opacity: 0.5 }}></div>
                        </div>
                        <div className="resource-value">🔬 {sp}/100</div>
                    </div>

                    <div className="status-item" style={{ minWidth: '60px' }}>
                        <div className="status-label">金币</div>
                        <div className="resource-value">💰 {gold}</div>
                    </div>

                    <div className="status-item" style={{ minWidth: '60px' }}>
                        <div className="status-label">辐射</div>
                        <div className={`resource-value ${radiation > 50 ? 'text-red' : ''}`} style={{ color: radiation > 50 ? 'var(--accent-red)' : 'var(--radiation-green)' }}>
                            ☢️ {radiation}
                        </div>
                    </div>

                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                        <div className="status-label">Turn {turn}/50</div>
                        <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                            {[...Array(3)].map((_, i) => (
                                <div key={i} style={{
                                    width: '12px', height: '12px', borderRadius: '50%',
                                    background: i < ap ? 'var(--accent-blue)' : '#444',
                                    boxShadow: i < ap ? '0 0 5px var(--accent-blue)' : 'none'
                                }}></div>
                            ))}
                        </div>
                        <button className="btn-classic" onClick={endTurn} style={{ marginTop: '10px', padding: '5px 15px' }}>
                            结束回合
                        </button>
                    </div>
                </section>

                {/* Layer 3: Hand Area */}
                <section className="layer layer-hand">
                    <div className="hand-container">
                        <div className="card-fan">
                            {hand.map((card, index) => (
                                <div
                                    key={card.id}
                                    className={`hand-card ${ap < card.cost ? 'card-disabled' : ''}`}
                                    style={{
                                        transform: getCardTransform(index, hand.length),
                                        zIndex: index + 1
                                    }}
                                    onClick={() => handleCardClick(card)}
                                >
                                    <div className="card-cost">⚡{card.cost}</div>
                                    <div className="card-title">{card.name}</div>
                                    <div className="card-emoji">{card.emoji}</div>
                                    <div className="card-effect">
                                        {card.effect.split(',').map((eff, i) => (
                                            <div key={i} style={{ color: eff.includes('-') ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                                                {eff.trim()}
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ fontWeight: 'bold', color: 'var(--copper-dark)', marginTop: '5px' }}>
                                        [{card.type}]
                                    </div>
                                    <div className="card-footer">{card.source}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            {/* Settlement Overlay */}
            {showSettlement && (
                <div className="settlement-overlay">
                    <div className="settlement-card">
                        <h1 style={{ fontFamily: 'Playfair Display', margin: 0 }}>研究成果鉴定</h1>
                        <div className="rank-text">A</div>
                        <p style={{ fontSize: '18px' }}>科学界的杰出贡献者</p>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', margin: '30px 0' }}>
                            <div><strong>HP:</strong> {hp}</div>
                            <div><strong>SP:</strong> {sp}</div>
                            <div><strong>辐射:</strong> {radiation}</div>
                        </div>

                        <div style={{ textAlign: 'left', padding: '20px', background: 'rgba(0,0,0,0.05)', fontStyle: 'italic', marginBottom: '20px' }}>
                            “如果历史真是如此走向，居里夫人不仅获得了两项诺贝尔奖，更在有生之年见证了放射性疗法对全世界癌症患者的拯救……”
                        </div>

                        <button className="btn-classic" onClick={() => window.location.reload()}>重玩游戏</button>
                        <button className="btn-classic">分享成果</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarieCurieGame;
