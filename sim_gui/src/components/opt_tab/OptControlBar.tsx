// OptControlBar.tsx — optimization tab toolbar (run / cancel / warm-start + date/step/MC config)

import React from 'react';
import { Button, Input, InputNumber, Select, Tooltip } from 'antd';
import { DownloadOutlined, PlayCircleOutlined, ReloadOutlined, SaveOutlined, StopOutlined } from '@ant-design/icons';
import type { ModelFile, StepUnit } from '../../types';

interface OptControlBarProps {
  optRunning: boolean;
  optCurGen: number;
  optTotalGen: number;
  warmStartEnabled: boolean;
  warmStartDirty: boolean;
  hasExistingResults: boolean;
  currentFrontCount: number;
  optResult: any;
  storedOptResult: any;
  simStartDate: string;
  simEndDate: string;
  stepValue: number;
  stepUnit: StepUnit;
  simRuns: number;
  mcSeed: number | null;
  selectedModel: ModelFile | null;
  isOtherRunning: boolean;
  otherRunningTip: string;
  onStart: () => void;
  onCancel: () => void;
  onWarmStartChange: (enabled: boolean) => void;
  onSimStartDateChange: (v: string) => void;
  onSimEndDateChange: (v: string) => void;
  onStepValueChange: (v: number) => void;
  onStepUnitChange: (v: StepUnit) => void;
  onSimRunsChange: (v: number) => void;
  onMcSeedChange: (v: number | null) => void;
  onDownload: () => void;
  onReload: () => void;
  onSaveResults: () => void;
  scsMode: boolean;
  setOptResult: (v: any) => void;
  t: (key: string) => string;
  c: Record<string, string>;
}

export function OptControlBar({
  optRunning, optCurGen, optTotalGen,
  warmStartEnabled, warmStartDirty, hasExistingResults, currentFrontCount,
  optResult, storedOptResult,
  simStartDate, simEndDate, stepValue, stepUnit, simRuns, mcSeed,
  selectedModel, isOtherRunning, otherRunningTip,
  onStart, onCancel, onWarmStartChange,
  onSimStartDateChange, onSimEndDateChange, onStepValueChange, onStepUnitChange,
  onSimRunsChange, onMcSeedChange,
  onDownload, onReload, onSaveResults,
  scsMode,
  setOptResult,
  t, c,
}: OptControlBarProps) {
  const warmStartTooltip = warmStartDirty && warmStartEnabled
    ? '⚠ 目标、约束或决策变量已修改，热启动将沿用上次前沿，可能匹配度下降'
    : (warmStartEnabled && hasExistingResults)
      ? `热启动：将基于 ${currentFrontCount} 个现有解继续搜索`
      : `已有 ${currentFrontCount} 个解，勾选"继续计算"可热启动，否则冷启动`;
  const runTooltip = isOtherRunning ? otherRunningTip
    : (warmStartEnabled && hasExistingResults) ? warmStartTooltip
    : hasExistingResults ? `已有 ${currentFrontCount} 个解，勾选"继续计算"可热启动，否则点击运行将冷启动`
    : '设置目标、约束和决策变量范围后运行优化';

  return (
    <div style={{ width: '100%', flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${c.border}`, background: c.panel }}>
      <Tooltip title={runTooltip}>
        <span>
          <Button
            type="primary" size="small"
            icon={!isOtherRunning && optRunning ? <StopOutlined /> : <PlayCircleOutlined />}
            onClick={isOtherRunning ? undefined : (optRunning ? onCancel : onStart)}
            disabled={!selectedModel || isOtherRunning}
            style={{ whiteSpace: 'nowrap' }}
          >
            {!isOtherRunning && optRunning ? '停止优化' : t('sim.control.run')}
          </Button>
        </span>
      </Tooltip>

      {/* Warm-start checkbox — always visible; disabled when no results exist */}
      <Tooltip title={hasExistingResults ? warmStartTooltip : '无已有结果，无法热启动'}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: hasExistingResults ? 'pointer' : 'not-allowed', userSelect: 'none', flexShrink: 0, opacity: hasExistingResults ? 1 : 0.4 }}>
          <input type="checkbox" checked={warmStartEnabled}
            disabled={!hasExistingResults}
            onChange={e => {
              const v = e.target.checked;
              onWarmStartChange(v);
              if (!optRunning) setOptResult(v ? storedOptResult : null);
            }}
            style={{ accentColor: warmStartDirty && warmStartEnabled ? '#faad14' : c.primary }} />
          <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', color: !hasExistingResults ? c.textMute : (warmStartDirty && warmStartEnabled ? '#faad14' : warmStartEnabled ? c.primary : c.textSec) }}>
            {warmStartDirty && warmStartEnabled ? '⚠ 继续计算' : '继续计算'}
          </span>
        </label>
      </Tooltip>

      {/* Generation counter */}
      {optRunning && (
        <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>
          Gen {optCurGen}/{optTotalGen || '-'}
        </span>
      )}

      <div style={{ width: 1, height: 16, background: c.border, flexShrink: 0 }} />

      {/* Date range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ color: c.textSec, whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{t('sim.duration.label')}</span>
        <Input size="small" value={simStartDate} placeholder="YYYY-MM-DD"
          onChange={e => onSimStartDateChange(e.target.value)}
          style={{ width: '12ch', minWidth: '12ch', fontFamily: 'monospace' }} />
        <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>~</span>
        <Input size="small" value={simEndDate} placeholder="YYYY-MM-DD"
          onChange={e => onSimEndDateChange(e.target.value)}
          style={{ width: '12ch', minWidth: '12ch', fontFamily: 'monospace' }} />
      </div>

      {/* Step size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: c.textSec, whiteSpace: 'nowrap' }}>{t('sim.step.label')}</span>
        <InputNumber size="small" value={stepValue} onChange={v => onStepValueChange(v || 1)} style={{ width: '7ch', minWidth: '7ch' }} min={1} />
        <Select size="small" value={stepUnit} onChange={onStepUnitChange} style={{ minWidth: '9ch', width: 'max-content' }}
          options={[
            { label: t('sim.step.second'), value: 'second' },
            { label: t('sim.step.minute'), value: 'minute' },
            { label: t('sim.step.hour'),   value: 'hour'   },
            { label: t('sim.step.day'),    value: 'day'    },
          ]} />
      </div>

      {/* MC config */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <Tooltip title={`Monte Carlo: ${simRuns} ${t('sim.mc.runs_per_plan')}`}>
          <span style={{ color: c.textSec, whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>MC×</span>
        </Tooltip>
        <InputNumber size="small" min={1} max={50} value={simRuns}
          onChange={v => onSimRunsChange(Math.max(1, Math.min(50, v || 1)))}
          style={{ width: 52 }} disabled={optRunning} />
        <Tooltip title={t('sim.mc.seed_tooltip')}>
          <span style={{ color: c.textSec, whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{t('sim.mc.seed_label')}</span>
        </Tooltip>
        <InputNumber
          size="small" value={mcSeed ?? undefined} placeholder={t('sim.mc.seed_placeholder')}
          onChange={v => onMcSeedChange(v != null ? Math.max(0, Math.floor(v)) : null)}
          style={{ width: '7ch', minWidth: '7ch', fontFamily: 'monospace' }}
          min={0} max={2147483647} controls={false}
          disabled={optRunning}
        />
      </div>

      {/* Session controls */}
      <div style={{ width: 1, height: 16, background: c.border, flexShrink: 0 }} />

      <Tooltip title={optResult ? '保存结果到 Session' : '运行优化后可保存结果'}>
        <Button size="small" icon={<SaveOutlined />}
          onClick={onSaveResults}
          disabled={!optResult || optRunning}
          style={{ whiteSpace: 'nowrap', color: optResult ? c.primary : c.textMute }}
        >保存结果</Button>
      </Tooltip>

      <Tooltip title={scsMode ? '从 YAML 重新加载（清除 session）' : '从 YAML 重新加载（清除 session，恢复模型默认值）'}>
        <Button size="small" icon={<ReloadOutlined />}
          onClick={onReload}
          disabled={!selectedModel || optRunning}
          style={{ whiteSpace: 'nowrap', color: c.textSec }}
        />
      </Tooltip>

      <div style={{ width: 1, height: 16, background: c.border, flexShrink: 0 }} />

      <Tooltip title={optResult ? t('sim.opt.download_with_results') : t('sim.control.download_model')}>
        <Button size="small" icon={<DownloadOutlined />}
          onClick={onDownload}
          disabled={!selectedModel}
          style={{ whiteSpace: 'nowrap', color: c.textSec }}
        >YAML</Button>
      </Tooltip>
    </div>
  );
}
