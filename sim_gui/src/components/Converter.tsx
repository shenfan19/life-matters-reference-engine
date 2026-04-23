import { useState, useEffect } from 'react';
import { Card, Select, Button, Space, Typography, Progress, Alert, message, Tag, Switch, InputNumber, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
const { Title, Text } = Typography;

// ── System card definitions (mirrors backend _SYSTEM_CARD_LIBRARY) ────────────
const SYSTEM_CARDS = [
  {
    id: 'sys_extra_ap',
    name: '紧急集中',
    emoji: '⚡',
    category: '资源 · 临时透支',
    desc: '本回合 +1 行动点',
    defaultCopies: 2,
  },
  {
    id: 'sys_extra_draw',
    name: '快速回顾',
    emoji: '🃏',
    category: '资源 · 临时透支',
    desc: '本回合多摸 1 张牌',
    defaultCopies: 1,
  },
  {
    id: 'sys_routine',
    name: '建立规律',
    emoji: '📅',
    category: '资源 · 长线投资',
    desc: '接下来 3 回合 +1 行动点（需 ≥10 回合场景）',
    defaultCopies: 1,
  },
  {
    id: 'sys_amplify',
    name: '全力以赴',
    emoji: '🔥',
    category: '效果 · 翻倍',
    desc: '本回合所有内容牌效果 ×1.5（需 ≥3 变量）',
    defaultCopies: 1,
  },
  {
    id: 'sys_shield',
    name: '保护屏障',
    emoji: '🛡️',
    category: '效果 · 屏蔽',
    desc: '本回合抵消所有负面环境效果（需 ≥3 负面环境牌）',
    defaultCopies: 1,
  },
  {
    id: 'sys_avoid',
    name: '暂时回避',
    emoji: '🌫️',
    category: '效果 · 逃避',
    desc: '本回合所有变量冻结（好坏均不变）',
    defaultCopies: 1,
  },
] as const;

type SysCardId = typeof SYSTEM_CARDS[number]['id'];

interface SysCardCfg { enabled: boolean; copies: number }

const defaultSysConfig = (): Record<SysCardId, SysCardCfg> =>
  Object.fromEntries(
    SYSTEM_CARDS.map(c => [c.id, { enabled: true, copies: c.defaultCopies }])
  ) as Record<SysCardId, SysCardCfg>;

// ── Component ─────────────────────────────────────────────────────────────────

const Converter = () => {
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [stories, setStories] = useState<any[]>([]);
    const [selectedStory, setSelectedStory] = useState<string | null>(null);
    const [result, setResult] = useState<any>(null);
    const [sysConfig, setSysConfig] = useState<Record<SysCardId, SysCardCfg>>(defaultSysConfig);

    useEffect(() => {
        fetch('/api/files')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const found: any[] = [];
                    const scan = (items: any[]) => {
                        items.forEach(item => {
                            if (item.type === 'file' && item.key.includes('scenarios/')) {
                                found.push({ label: item.title, value: item.key });
                            }
                            if (item.children) scan(item.children);
                        });
                    };
                    scan(data.data);
                    setStories(found);
                }
            })
            .catch(err => console.error('Failed to load scenarios', err));
    }, []);

    const toggleCard = (id: SysCardId, enabled: boolean) =>
        setSysConfig(prev => ({ ...prev, [id]: { ...prev[id], enabled } }));

    const setCopies = (id: SysCardId, copies: number) =>
        setSysConfig(prev => ({ ...prev, [id]: { ...prev[id], copies } }));

    const handleGenerate = async () => {
        if (!selectedStory) { message.warning('请选择一个 Scenario'); return; }

        setGenerating(true); setProgress(0); setResult(null);

        const interval = setInterval(() => {
            setProgress(prev => { if (prev >= 90) { clearInterval(interval); return 90; } return prev + 10; });
        }, 100);

        // Build system_cards_config payload (only send overrides)
        const system_cards_config: Record<string, SysCardCfg> = {};
        for (const c of SYSTEM_CARDS) {
            const cfg = sysConfig[c.id];
            if (!cfg.enabled || cfg.copies !== c.defaultCopies) {
                system_cards_config[c.id] = cfg;
            }
        }

        try {
            const response = await fetch('/api/plugins/story_converter/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    inputs: {
                        model_path: selectedStory.replace(/^mods\//, ''),
                        system_cards_config,
                    },
                }),
            });
            const data = await response.json();
            clearInterval(interval);
            setProgress(100);
            setGenerating(false);
            if (data.success) { setResult(data); message.success('转换成功！'); }
            else message.error('转换失败: ' + (data.error || '未知错误'));
        } catch {
            clearInterval(interval);
            setGenerating(false);
            message.error('网络错误');
        }
    };

    return (
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px' }}>
            <Title level={4}>Scenario → Game Converter</Title>
            <Text type="secondary">选取 Scenario 模型，自动生成可交互卡牌游戏关卡。</Text>

            <Space direction="vertical" style={{ width: '100%', marginTop: 24 }} size="large">

                {/* Step 1: Source */}
                <Card title="1. 选择 Scenario 模型">
                    <Select
                        placeholder="请选择一个 Scenario..."
                        style={{ width: '100%' }}
                        options={stories}
                        onChange={val => setSelectedStory(val)}
                        showSearch
                        filterOption={(input, opt) =>
                            String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                    />
                    <div style={{ marginTop: 10 }}>
                        <Tag color="processing">models/scenarios/</Tag>
                        <Tag color="default">输出 → models/stories/to_game/</Tag>
                    </div>
                </Card>

                {/* Step 2: System cards */}
                <Card
                    title={
                        <span>
                            2. 功能牌配置&nbsp;
                            <Tooltip title="系统功能牌影响游戏机制（行动点、摸牌、效果修正），由 converter 根据 scenario 参数自动估算副本数，可手动覆盖">
                                <InfoCircleOutlined style={{ color: '#aaa', fontSize: 13 }} />
                            </Tooltip>
                        </span>
                    }
                >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
                        {SYSTEM_CARDS.map(c => {
                            const cfg = sysConfig[c.id];
                            return (
                                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Switch
                                        size="small"
                                        checked={cfg.enabled}
                                        onChange={v => toggleCard(c.id, v)}
                                    />
                                    <span style={{ fontSize: 16 }}>{c.emoji}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</div>
                                        <div style={{ fontSize: 11, color: '#999', lineHeight: 1.3 }}>
                                            {c.category} · {c.desc}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                        <Text type="secondary" style={{ fontSize: 11 }}>×</Text>
                                        <InputNumber
                                            min={0} max={4} size="small"
                                            style={{ width: 48 }}
                                            value={cfg.copies}
                                            disabled={!cfg.enabled}
                                            onChange={v => setCopies(c.id, v ?? 0)}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: '#bbb' }}>
                        副本数由 scenario 参数自动估算；可手动调整。⚠️ 部分功能牌需 game 层支持方可执行。
                    </div>
                </Card>

                {/* Generate button */}
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <Button
                        type="primary" size="large"
                        onClick={handleGenerate}
                        loading={generating}
                        disabled={!selectedStory}
                    >
                        开始转换
                    </Button>
                    {generating && (
                        <div style={{ marginTop: 16 }}>
                            <Progress percent={progress} status="active" />
                            <div style={{ marginTop: 8, opacity: 0.6, fontSize: 12 }}>解析结构并生成卡牌数据...</div>
                        </div>
                    )}
                </div>

                {result && (
                    <Alert
                        message="生成成功"
                        description={
                            <div>
                                <div>{result.message}</div>
                                {result.converter_notes?.length > 0 && (
                                    <ul style={{ marginTop: 8, fontSize: 12 }}>
                                        {result.converter_notes.map((n: string, i: number) => (
                                            <li key={i}>{n}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        }
                        type="success" showIcon
                    />
                )}
            </Space>
        </div>
    );
};

export default Converter;
