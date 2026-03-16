import React, { useEffect, useState } from 'react';
import { List, Typography, Button, Space, Tag, Spin } from 'antd';
import { RocketOutlined, ExperimentOutlined, UserOutlined } from '@ant-design/icons';
import { Story } from '../core/types';
import { AdaptiveConverter } from '../core/AdaptiveConverter';
import { useI18n } from '../core/i18n';

const { Title, Paragraph } = Typography;

interface StoryLoaderProps {
  onSelect: (story: Story) => void;
  onGoToSimulation: () => void;
  isDarkMode: boolean;
}

const StoryLoaderComponent: React.FC<StoryLoaderProps> = ({ onSelect, onGoToSimulation, isDarkMode }) => {
  const { t } = useI18n();
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStories(); }, []);

  const fetchStories = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/files');
      const result = await response.json();
      if (result.success) {
        const models: any[] = [];
        const scan = (node: any) => {
          if (node.type === 'file' && node.key.startsWith('models/')) {
            models.push({
              id: node.key,
              name: (node.content?.metadata?.name || node.title).replace('.yaml', ''),
              description: node.description || '自适应动力学场景',
              category: node.category || 'physiological',
              icon: getIconForCategory(node.category),
              difficulty: node.difficulty || '中',
              tags: [node.category || 'dynamics'],
              filePath: node.key,
            });
          }
          if (node.children) node.children.forEach(scan);
        };
        result.data.forEach(scan);
        setStories(models);
      }
    } catch (error) {
      console.error('Failed to fetch stories:', error);
    } finally {
      setLoading(false);
    }
  };

  const getIconForCategory = (category: string) => {
    switch (category) {
      case 'physiological': return <ExperimentOutlined />;
      case 'socio_economic': return <UserOutlined />;
      default: return <ExperimentOutlined />;
    }
  };

  const handleSelect = async (storyInfo: any) => {
    try {
      const response = await fetch(`/api/file/${storyInfo.filePath}`);
      const result = await response.json();
      if (result.success) {
        const story = AdaptiveConverter.convertModelToStory(result.data.content);
        onSelect(story);
      }
    } catch (error) {
      console.error('Error loading story:', error);
    }
  };

  // Light: white cards on light-green bg / Dark: dark-gray cards on dark-green bg
  const cardBg     = isDarkMode ? '#1a2e1e' : '#ffffff';
  const cardText   = isDarkMode ? 'rgba(255,255,255,0.88)' : '#1a2e22';
  const cardBorder = isDarkMode ? '#1e3824' : '#c8e6c9';
  const accentIcon = isDarkMode ? '#52c41a' : '#007A33';
  const tagStyle: React.CSSProperties = isDarkMode
    ? { background: 'rgba(82,196,26,0.15)', border: '1px solid rgba(82,196,26,0.35)', color: '#86efac', fontSize: 11 }
    : { background: '#e8f5e9', border: '1px solid #c8e6c9', color: '#007A33', fontSize: 11 };

  return (
    <div style={{ padding: '40px 32px 32px', maxWidth: '880px', margin: '0 auto', width: '100%', overflowY: 'auto', flex: 1 }}>
      <Title level={2} style={{ marginBottom: 6, textAlign: 'center', color: isDarkMode ? 'rgba(255,255,255,0.88)' : '#1a2e22' }}>
        {t('stories.title') || '选择你的生命轨迹'}
      </Title>
      <Paragraph style={{ textAlign: 'center', marginBottom: 28, color: isDarkMode ? 'rgba(255,255,255,0.45)' : '#5a7a63' }}>
        每个故事都是一个独立的模块，拥有自己的卡牌、卡组和规则。
      </Paragraph>

      <Spin spinning={loading}>
        <List
          grid={{ gutter: 14, column: 2 }}
          dataSource={stories}
          renderItem={(item) => (
            <List.Item style={{ marginBottom: 0 }}>
              <div
                onClick={() => handleSelect(item)}
                style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                  borderRadius: 8,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  color: cardText,
                  minHeight: 96,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  boxShadow: isDarkMode
                    ? '0 1px 6px rgba(0,0,0,0.3)'
                    : '0 1px 6px rgba(0,80,30,0.10)',
                  transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = 'translateY(-2px)';
                  el.style.boxShadow = isDarkMode
                    ? '0 6px 18px rgba(82,196,26,0.18)'
                    : '0 6px 18px rgba(0,80,30,0.18)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = 'translateY(0)';
                  el.style.boxShadow = isDarkMode
                    ? '0 1px 6px rgba(0,0,0,0.3)'
                    : '0 1px 6px rgba(0,80,30,0.10)';
                }}
              >
                {/* Icon + name row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22, color: accentIcon, lineHeight: 1, flexShrink: 0 }}>
                    {item.icon}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
                    {item.name}
                  </span>
                </div>

                {/* Tags */}
                <Space size={4} wrap>
                  <Tag style={tagStyle}>难度: {item.difficulty}</Tag>
                  {item.tags.map((tag: string) => (
                    <Tag key={tag} style={tagStyle}>{tag}</Tag>
                  ))}
                </Space>

                {/* Description */}
                <div style={{ fontSize: 12, color: isDarkMode ? 'rgba(255,255,255,0.55)' : '#5a7a63', lineHeight: 1.45 }}>
                  {item.description}
                </div>
              </div>
            </List.Item>
          )}
        />
      </Spin>

      <div style={{ textAlign: 'center', marginTop: 28 }}>
        <Button
          size="large"
          icon={<RocketOutlined />}
          onClick={onGoToSimulation}
          style={{ borderColor: isDarkMode ? '#1e3824' : '#007A33', color: isDarkMode ? 'rgba(255,255,255,0.65)' : '#007A33' }}
        >
          返回 LifeMatters 研究平台
        </Button>
      </div>
    </div>
  );
};

export default StoryLoaderComponent;
