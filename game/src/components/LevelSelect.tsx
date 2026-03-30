import React from 'react';

interface Story {
    key: string;
    title: string;
    description?: string;
    difficulty?: string;
    category?: string;
    levels?: any[];
}

interface Level {
    id: number;
    title: string;
    description: string;
    difficulty: string;
    period: string;
}

const DEFAULT_LEVELS: Level[] = [
    { id: 1, title: "1898: 镭的发现", description: "在简陋的棚屋实验室中提炼矿石，面对极高的辐射风险。", difficulty: "容易", period: "Sorbonne" },
    { id: 2, title: "1903: 诺贝尔荣誉", description: "在学术界的歧视与家庭压力中寻找平衡，争取研究经费。", difficulty: "中等", period: "Paris" },
    { id: 3, title: "1914: 战地X光机", description: "在一战战场建立流动医疗队，将科学转化为救人技术。", difficulty: "困难", period: "Mobile Labs" },
];

interface LevelSelectProps {
    story: Story | null;
    onSelect: (level: any) => void;
    onGoToSimulation: () => void;
}

const LevelSelect: React.FC<LevelSelectProps> = ({ story, onSelect, onGoToSimulation }) => {
    const displayLevels = story?.levels && story.levels.length > 0
        ? story.levels.map(l => ({
            id: l.id,
            title: l.title,
            description: l.description || "探索这一历史阶段的挑战与机遇。",
            difficulty: l.difficulty || story.difficulty || "中等",
            period: l.period || story.title
        }))
        : DEFAULT_LEVELS;

    return (
        <div style={{
            height: '100vh',
            backgroundColor: '#2b231d',
            backgroundImage: 'linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url("https://www.transparenttextures.com/patterns/dark-leather.png")',
            color: '#dcc8a4',
            fontFamily: '"Crimson Pro", serif',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '40px'
        }}>
            <h1 style={{ fontSize: '48px', marginBottom: '10px', fontFamily: '"Playfair Display", serif' }}>
                {story?.title || "生命·玛丽·居里"}
            </h1>
            <p style={{ fontSize: '18px', opacity: 0.8, marginBottom: '60px' }}>
                {story?.description || "选择一个历史阶段开始你的研究之旅"}
            </p>

            <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {displayLevels.map(level => (
                    <div
                        key={level.id}
                        onClick={() => onSelect(level)}
                        style={{
                            width: '280px',
                            height: '400px',
                            background: '#dcc8a4',
                            color: '#2c2c2c',
                            border: '4px double #8b5a2b',
                            padding: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            cursor: 'pointer',
                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                            backgroundImage: 'url("https://www.transparenttextures.com/patterns/old-wall.png")',
                            position: 'relative'
                        }}
                        className="level-card"
                    >
                        <div style={{ color: '#8b0000', fontWeight: 'bold', marginBottom: '10px' }}>{level.period}</div>
                        <h2 style={{ fontSize: '24px', margin: '0 0 15px 0' }}>{level.title}</h2>
                        <p style={{ fontSize: '14px', flex: 1, lineHeight: '1.6' }}>{level.description}</p>
                        <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: '15px', color: '#8b5a2b' }}>
                            难度: {level.difficulty}
                        </div>

                        <style>{`.level-card:hover { transform: translateY(-10px); box-shadow: 0 20px 40px rgba(0,0,0,0.6); }`}</style>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '60px' }}>
                <button
                    onClick={onGoToSimulation}
                    style={{
                        background: 'none',
                        border: '1px solid #b87333',
                        color: '#b87333',
                        padding: '12px 24px',
                        fontSize: '16px',
                        cursor: 'pointer',
                        transition: 'background 0.3s'
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(184,115,51,0.1)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
                >
                    返回仿真平台 Simulation Platform
                </button>
            </div>
        </div>
    );
};

export default LevelSelect;
