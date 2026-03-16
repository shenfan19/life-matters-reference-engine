import React from 'react';
import { Card, Row, Col, Button, Space, Avatar, Badge, Divider, Tag } from 'antd';
import { UserOutlined, RobotOutlined, ThunderboltOutlined, HeartOutlined } from '@ant-design/icons';

interface CardGameProps {
    isDarkMode: boolean;
}

const CardGame: React.FC<CardGameProps> = ({ isDarkMode }) => {
    const cardStyle: React.CSSProperties = {
        width: 80,
        height: 110,
        background: isDarkMode ? '#111f16' : '#ffffff',
        border: `2px solid ${isDarkMode ? '#1e3824' : '#c8e6c9'}`,
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s',
    };

    const renderCard = (name: string, cost: number, hp: number, atk: number) => (
        <div style={cardStyle} className="game-card">
            <Badge count={cost} color="blue" offset={[-10, 0]}>
                <div style={{ fontWeight: 600 }}>{name}</div>
            </Badge>
            <div style={{ marginTop: 'auto', width: '100%', display: 'flex', justifyContent: 'space-between', padding: '0 4px', fontSize: '10px' }}>
                <span style={{ color: '#ef4444' }}><HeartOutlined /> {hp}</span>
                <span style={{ color: '#f59e0b' }}><ThunderboltOutlined /> {atk}</span>
            </div>
        </div>
    );

    return (
        <div style={{ height: '100%', display: 'flex', gap: '20px' }}>
            {/* Game Board */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', background: isDarkMode ? '#0d1a10' : '#f0f7f1', borderRadius: 12, padding: '20px', border: `1px solid ${isDarkMode ? '#1e3824' : '#c8e6c9'}` }}>

                {/* Opponent Area */}
                <div style={{ textAlign: 'center' }}>
                    <Space direction="vertical" size="small">
                        <Avatar size={64} icon={<RobotOutlined />} style={{ background: '#ef4444' }} />
                        <Tag color="red">Enemy AI (HP: 30)</Tag>
                        <Space>
                            {[1, 2, 3].map(i => <div key={i} style={{ ...cardStyle, opacity: 0.6 }}>Card</div>)}
                        </Space>
                    </Space>
                </div>

                <Divider><span style={{ opacity: 0.5, fontSize: '12px' }}>Battlefield</span></Divider>

                {/* Battlefield Area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '20px' }}>
                    <Row justify="center" gutter={16}>
                        <Col>{renderCard("Skeleton", 2, 2, 3)}</Col>
                        <Col>{renderCard("Guard", 3, 5, 2)}</Col>
                    </Row>
                    <Row justify="center" gutter={16}>
                        <Col>{renderCard("Hero", 5, 6, 6)}</Col>
                    </Row>
                </div>

                <Divider><span style={{ opacity: 0.5, fontSize: '12px' }}>Your Hand</span></Divider>

                {/* Player Area */}
                <div style={{ textAlign: 'center' }}>
                    <Space direction="vertical" size="small">
                        <Space>
                            {renderCard("Mage", 4, 3, 5)}
                            {renderCard("Spell", 1, 0, 0)}
                            {renderCard("Wolf", 2, 2, 2)}
                        </Space>
                        <Badge count={25} color="green" offset={[10, 0]}>
                            <Avatar size={64} icon={<UserOutlined />} style={{ background: '#3b82f6' }} />
                        </Badge>
                        <Tag color="blue">Player (HP: 25)</Tag>
                    </Space>
                </div>
            </div>

            {/* Control Panel */}
            <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Card title="控制中心" size="small">
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <Button type="primary" block size="large" danger>结束回合</Button>
                        <Button block ghost type="primary">使用英雄技能</Button>
                        <Divider style={{ margin: '8px 0' }} />
                        <div style={{ fontSize: '12px' }}>水晶: 5 / 10</div>
                        <div style={{ height: 8, background: '#3b82f6', borderRadius: 4, width: '50%' }} />
                    </Space>
                </Card>

                <Card title="游戏日志" size="small" style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ height: '300px', overflowY: 'auto', fontSize: '11px', opacity: 0.7 }}>
                        <div>[回合 1] 抽了一张牌</div>
                        <div>[回合 1] 召唤了 Skeleton</div>
                        <div>[回合 2] 对方法术攻击 -3 HP</div>
                        <div>[回合 3] 当前处于优势状态</div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default CardGame;
