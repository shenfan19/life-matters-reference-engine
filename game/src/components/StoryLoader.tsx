import React, { useEffect, useState } from 'react';
import { Card, Card as AntCard, List, Typography, Button, Space, Tag, Spin } from 'antd';
import { RocketOutlined, ExperimentOutlined, UserOutlined } from '@ant-design/icons';
import { Story } from '../core/types';
import { AdaptiveConverter } from '../core/AdaptiveConverter';
import { useI18n } from '../core/i18n';

const { Title, Paragraph, Text } = Typography;

interface StoryLoaderProps {
  onSelect: (story: Story) => void;
  onGoToSimulation: () => void;
}

const StoryLoaderComponent: React.FC<StoryLoaderProps> = ({ onSelect, onGoToSimulation }) => {
  const { t } = useI18n();
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStories();
  }, []);

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
      case 'environmental': return <RocketOutlined />;
      case 'risk': return <RocketOutlined />;
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

  return (
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
      <Title level={1} style={{ marginBottom: '40px', textAlign: 'center' }}>
        { t('stories.title') || '选择你的生命轨迹' }
      </Title>
      
      <Spin spinning={loading}>
        <List
          grid={{ gutter: 24, column: 2 }}
          dataSource={stories}
          renderItem={(item) => (
            <List.Item>
              <AntCard
                hoverable
                style={{ 
                  borderRadius: '8px',
                  minHeight: '220px'
                }}
                styles={{ body: { padding: '24px' } }}
                onClick={() => handleSelect(item)}
              >
                <div style={{ display: 'flex', gap: '20px' }}>
                  <div style={{ 
                    fontSize: '48px', 
                    color: '#1890ff', 
                    display: 'flex', 
                    alignItems: 'center' 
                  }}>
                    {item.icon}
                  </div>
                  <div>
                    <Title level={3} style={{ marginTop: 0 }}>{item.name}</Title>
                    <Space style={{ marginBottom: '12px' }}>
                      <Tag color="processing">难度: {item.difficulty}</Tag>
                      {item.tags.map((tag: string) => <Tag key={tag} color="default">{tag}</Tag>)}
                    </Space>
                    <Paragraph type="secondary">{item.description}</Paragraph>
                  </div>
                </div>
              </AntCard>
            </List.Item>
          )}
        />
      </Spin>

      <div style={{ textAlign: 'center', marginTop: '40px' }}>
        <Paragraph type="secondary">
          * 每个故事都是一个独立的模块，拥有自己的卡牌、卡组和规则。
        </Paragraph>
        <Button 
          type="default" 
          size="large" 
          icon={<RocketOutlined />}
          onClick={onGoToSimulation}
        >
          返回 LifeMatters 研究平台
        </Button>
      </div>
    </div>
  );
};

export default StoryLoaderComponent;
