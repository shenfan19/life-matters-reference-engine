import { useState, useEffect } from 'react';
import { Card, Select, Button, Space, Typography, Progress, Alert, message, Tag } from 'antd';
const { Title, Text } = Typography;

const Converter = () => {
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [stories, setStories] = useState<any[]>([]);
    const [selectedStory, setSelectedStory] = useState<string | null>(null);
    const [result, setResult] = useState<any>(null);

    useEffect(() => {
        // Fetch stories from API
        fetch('/api/files')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const foundStories: any[] = [];
                    const scan = (items: any[]) => {
                        items.forEach(item => {
                            if (item.type === 'file' && item.key.includes('stories/')) {
                                foundStories.push({ label: item.title, value: item.key });
                            }
                            if (item.children) scan(item.children);
                        });
                    };
                    scan(data.data);
                    setStories(foundStories);
                }
            })
            .catch(err => console.error('Failed to load stories', err));
    }, []);

    const handleGenerate = async () => {
        if (!selectedStory) {
            message.warning('请选择一个 Story');
            return;
        }

        setGenerating(true);
        setProgress(0);
        setResult(null);

        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 90) {
                    clearInterval(interval);
                    return 90;
                }
                return prev + 10;
            });
        }, 100);

        try {
            const response = await fetch(`/api/plugins/story_converter/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputs: { story_path: selectedStory.replace(/^mods\//, '') } })
            });
            const data = await response.json();

            clearInterval(interval);
            setProgress(100);
            setGenerating(false);

            if (data.success) {
                setResult(data);
                message.success('转换成功！');
            } else {
                message.error('转换失败: ' + (data.error || '未知错误'));
            }
        } catch (err) {
            clearInterval(interval);
            setGenerating(false);
            message.error('网络错误');
        }
    };

    return (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
            <Title level={4}>Game Case Converter (Story → Game)</Title>
            <Text type="secondary">选取现有的 Story 配置来生成可交互的卡牌游戏关卡 (Game Case)。</Text>

            <Space direction="vertical" style={{ width: '100%', marginTop: 24 }} size="large">
                <Card title="1. 选择源故事 (Select Source Story)">
                    <Select
                        placeholder="请选择一个 Story..."
                        style={{ width: '100%' }}
                        options={stories}
                        onChange={(val) => setSelectedStory(val)}
                    />
                    <div style={{ marginTop: 12 }}>
                        <Tag color="processing">JSON/YAML Support</Tag>
                        <Tag color="warning">Architecture V3 Compatible</Tag>
                    </div>
                </Card>

                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <Button
                        type="primary"
                        size="large"
                        onClick={handleGenerate}
                        loading={generating}
                        disabled={!selectedStory}
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

                {result && (
                    <Alert
                        message="生成成功"
                        description={result.message}
                        type="success"
                        showIcon
                    />
                )}
            </Space>
        </div>
    );
};

export default Converter;
