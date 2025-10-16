// frontend/src/components/ModManager.tsx

import React, { useState } from 'react';
import { Tree, Card, Tabs, message } from 'antd';
import { CheckboxChangeEvent } from 'antd/es/checkbox';

const treeData = [
  {
    title: '核心 MOD 包',
    key: '0-0',
    children: [
      { title: '结构分析 MOD', key: '0-0-0' },
      { title: '热力学 MOD', key: '0-0-1' },
      { title: '非线性材料库 MOD', key: '0-0-2', isLeaf: true },
    ],
  },
  {
    title: '用户自定义 MOD',
    key: '0-1',
    children: [
      { title: '我的自定义公式', key: '0-1-0' },
      { title: '旧版本 MOD', key: '0-1-1' },
    ],
  },
];

const ModManager: React.FC = () => {
  const [checkedKeys, setCheckedKeys] = useState<React.Key[]>(['0-0-0', '0-1-0']);
  const [selectedMod, setSelectedMod] = useState<string>('0-0-0'); // 当前查看的 MOD

  // 模拟 MOD 详情数据
  const getModDetail = (key: string) => {
    switch(key) {
      case '0-0-0':
        return {
          yaml: 'name: StructureMod\nversion: 1.2\nparameters: [L, E]',
          formula: 'Stiffness = E * I / L^3',
          text: '此模块用于线弹性结构分析。',
        };
      default:
        return { yaml: '未选中或无详细信息', formula: '-', text: '请从左侧树状图选择模块查看详情。' };
    }
  };

  const detail = getModDetail(selectedMod);

  return (
    <Card title="MOD 模块管理">
      <Tabs defaultActiveKey="manager" items={[
          { key: 'manager', label: '模块选择与配置', children: (
            <Row gutter={16}>
              <Col span={8}>
                <Card title="可用模块 (多选框)">
                  <Tree
                    checkable
                    checkedKeys={checkedKeys}
                    onCheck={(checkedKeys) => setCheckedKeys(checkedKeys as React.Key[])}
                    onSelect={(selectedKeys) => setSelectedMod(selectedKeys[0] as string || selectedMod)}
                    treeData={treeData}
                  />
                </Card>
              </Col>
              <Col span={16}>
                <Card title={`模块详情: ${selectedMod}`}>
                  <Tabs defaultActiveKey="yaml" items={[
                    { key: 'yaml', label: 'YAML 内部数据', children: <pre style={{ backgroundColor: '#f5f5f5', padding: 10 }}>{detail.yaml}</pre> },
                    { key: 'formula', label: '核心公式', children: <div>{detail.formula}</div> },
                    { key: 'text', label: '说明文本', children: <div>{detail.text}</div> },
                  ]} />
                </Card>
              </Col>
            </Row>
          )},
          { key: 'mod-onoff', label: '一键启用/禁用', children: <div>可在此处批量管理 MOD 状态</div> }
        ]}
      />
    </Card>
  );
};

export default ModManager;