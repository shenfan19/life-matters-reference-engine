import React, { useState } from 'react';
import { Card, Select, Button, Space, List, Tag, Typography, Progress, Alert } from 'antd';
import { FileSearchOutlined, RocketOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const Converter: React.FC = () => {
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState(0);

    const mockStories = [
        { id: '1', name: 'Basic Nutrition Story', type: 'story' },
        { id: '2', name: 'Digestive Path Story', type: 'story' },
        { id: '3', name: 'Metabolism Case', type: 'story' },
    ];

    const handleGenerate = () => {
        setGenerating(true);
        setProgress(0);
        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    setGenerating(false);
                    return 100;
                }
                return prev + 10;
            });
        }, 200);
    };

    return (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <Title level={4}>Game Case Converter (Story → Game)</Title>
            <Text type="secondary">选取现有的 Story 配置来生成可交互的卡牌游戏关卡 (Game Case)。</Text>

            <Space direction="vertical" style={{ width: '100%', marginTop: 24 }} size="large">
                <Card title="1. 选择源故事 (Select Source Story)">
                    <Select
                        placeholder="请选择一个 Story..."
                        style={{ width: '100%' }}
                        suffixIcon={<FileSearchOutlined />}
                        options={mockStories.map(s => ({ label: s.name, value: s.id }))}
                    />
                    <div style={{ marginTop: 12 }}>
                        <Tag color="processing">JSON/YAML Support</Tag>
                        <Tag color="warning">Architecture V3 Compatible</Tag>
                    </div>
                </Card>

                <Card title="2. 生成配置 (Generation Options)">
                    <List size="small">
                        <List.Item actions={[<Button type="link">配置</Button>]}>
                            <List.Item.Meta title="难度等级" description="调整卡牌属性倍率" />
                        </List.Item>
                        <List.Item actions={[<Button type="link">配置</Button>]}>
                            <List.Item.Meta title="奖励池" description="生成后的掉落配置" />
                        </List.Item>
                    </List>
                </Card>

                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <Button
                        type="primary"
                        size="large"
                        icon={<RocketOutlined />}
                        onClick={handleGenerate}
                        loading={generating}
                    >
                        开始转换 (Generate Game Case)
                    </Button>
                    {generating && (
                        <div style={{ marginTop: 20 }}>
                            <Progress percent={progress} status="active" />
                            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>解析结构并生成卡牌数据...</div>
                        </div>
                    )}
                </div>

                {progress === 100 && (
                    <Alert
                        message="生成成功"
                        description="Game Case 已保存至 /mods/games/basic_nutrition_game.yaml"
                        type="success"
                        showIcon
                        action={<Button size="small" type="primary">查看文件</Button>}
                    />
                )}
            </Space>
        </div>
    );
};

export default Converter;
