import React, { useEffect, useState } from 'react';
import { Card, Card as AntCard, List, Typography, Button, Space, Tag } from 'antd';
import { RocketOutlined, ExperimentOutlined, UserOutlined } from '@ant-design/icons';
import { StoryLoader as CoreStoryLoader } from '../core/StoryLoader';
import { Story } from '../core/types';

const { Title, Paragraph, Text } = Typography;

interface StoryLoaderProps {
  onSelect: (story: Story) => void;
  onGoToSimulation: () => void;
}

// Embedded Story Data (Since we don't have a backend to scan directories)
const STORIES_INDEX = [
  {
    id: 'marie_curie',
    name: '居里夫人：发现镭之路',
    description: '通过提炼成吨的矿渣，发现极微量的放射性元素镭。',
    icon: <ExperimentOutlined />,
    difficulty: '高',
    tags: ['科学', '历史', '1900s'],
    storyYaml: `
story_meta:
  name: "居里夫人：发现镭之路"
  id: "marie_curie"
  description: "体验玛丽·居里在极度艰苦的条件下，通过数千次的实验，最终提炼出镭的过程。"
  goal_value: 100
  goal_variable: "research_progress"
  variable_labels:
    health: "❤️ 生命"
    money: "💰 金币"
    research_progress: "🔬 研究进度"
    radiation: "☢️ 辐射值"


initial_state:
  health: 100
  money: 20
  radiation: 0
  research_progress: 0
  status: 1

params:
  teaching_income: 5
  research_cost: 10
  radiation_increment: 5
  chronic_damage_rate: 0.1
  recovery_amount: 8
  rest_cost: 5

decks:
  - id: "player_initial"
    name: "初始手牌"
    cards:
      - id: "teaching"
        count: 2
      - id: "research"
        count: 2
      - id: "rest"
        count: 1
  - id: "environment_initial"
    name: "环境牌堆"
    cards:
      - id: "chronic_damage"
        count: 99
      - id: "radiation_sickness"
        count: 5
`,
    cardsYaml: `
id: "teaching"
name: "授课"
type: "work"
description: "在巴黎大学兼职授课，获取微薄的薪水。"
cost: 0
effects:
  - variable: "money"
    value: "params.teaching_income"
    op: "+"
  - variable: "health"
    value: 1
    op: "-"
reference: "Curie taught at École Normale Supérieure (1900-1906)"
---
id: "research"
name: "镭提纯研究"
type: "goal"
description: "在高辐射的环境下进行镭的提纯实验。"
cost: 0
effects:
  - variable: "research_progress"
    value: 10
    op: "+"
  - variable: "money"
    value: "params.research_cost"
    op: "-"
  - variable: "radiation"
    value: "params.radiation_increment"
    op: "+"
reference: "Isolated radium in 1902, exposed to massive radiation"
---
id: "rest"
name: "休息"
type: "health"
description: "短暂的休息以恢复体力。"
cost: 0
effects:
  - variable: "health"
    value: "params.recovery_amount"
    op: "+"
  - variable: "money"
    value: "params.rest_cost"
    op: "-"
---
id: "chronic_damage"
name: "慢性辐射损伤"
type: "environment"
description: "由于长期暴露在放射性环境中，身体受到持续损伤。"
is_passive: true
dynamic_effect: "chronic_damage_dynamics"
---
id: "radiation_sickness"
name: "急性辐射病"
type: "environment"
description: "高剂量辐射引发的急性症状。"
condition: "radiation > 50"
probability: 0.3
effects:
  - variable: "health"
    value: 30
    op: "-"
`
  }
];

const StoryLoaderComponent: React.FC<StoryLoaderProps> = ({ onSelect, onGoToSimulation }) => {
  const loader = new CoreStoryLoader();

  const handleSelect = async (storyInfo: any) => {
    const story = await loader.loadStory(storyInfo.storyYaml, storyInfo.cardsYaml);
    onSelect(story);
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto', color: '#e0e0e0' }}>
      <Title level={1} style={{ color: '#fff', marginBottom: '40px', textAlign: 'center' }}>
        选择你的生命轨迹 (Stories)
      </Title>
      
      <List
        grid={{ gutter: 24, column: 2 }}
        dataSource={STORIES_INDEX}
        renderItem={(item) => (
          <List.Item>
            <AntCard
              hoverable
              style={{ 
                background: '#1f1f1f', 
                border: '1px solid #333',
                minHeight: '220px'
              }}
              styles={{ body: { padding: '24px' } }}
              onClick={() => handleSelect(item)}
            >
              <div style={{ display: 'flex', gap: '20px' }}>
                <div style={{ 
                  fontSize: '48px', 
                  color: '#b87333', 
                  display: 'flex', 
                  alignItems: 'center' 
                }}>
                  {item.icon}
                </div>
                <div>
                  <Title level={3} style={{ color: '#fff', marginTop: 0 }}>{item.name}</Title>
                  <Space style={{ marginBottom: '12px' }}>
                    <Tag color="orange">难度: {item.difficulty}</Tag>
                    {item.tags.map(tag => <Tag key={tag} color="blue">{tag}</Tag>)}
                  </Space>
                  <Paragraph style={{ color: '#aaa' }}>{item.description}</Paragraph>
                </div>
              </div>
            </AntCard>
          </List.Item>
        )}
      />

      <div style={{ textAlign: 'center', marginTop: '40px' }}>
        <Paragraph style={{ color: '#666' }}>
          * 每个故事都是一个独立的模块，拥有自己的卡牌、卡组和规则。
        </Paragraph>
        <Button 
          type="primary" 
          size="large" 
          icon={<RocketOutlined />}
          onClick={onGoToSimulation}
          style={{ background: '#2c3e50', borderColor: '#2c3e50' }}
        >
          返回 LifeMatters 研究平台
        </Button>
      </div>
    </div>
  );
};

export default StoryLoaderComponent;
