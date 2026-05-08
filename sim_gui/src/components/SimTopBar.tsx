import React from 'react';
import { Button, Input, InputNumber, Select, Segmented, Tooltip } from 'antd';
import { PlayCircleOutlined, PauseOutlined, StopOutlined, StepForwardOutlined } from '@ant-design/icons';
import type { SimulationState, StepUnit } from '../types';
import { getC } from '../core/theme';

interface SimTopBarProps {
  mode: 'sim' | 'opt';
  setMode: (m: 'sim' | 'opt') => void;
  status: SimulationState['status'];
  progress: number;
  currentStep: number;
  optRunning: boolean;
  isLocked: boolean;
  sessionId: string;
  simStartDate: string;
  simEndDate: string;
  stepValue: number;
  stepUnit: StepUnit;
  simRuns: number;
  sessionSeed: number;
  onSimStartDateChange: (v: string) => void;
  onSimEndDateChange: (v: string) => void;
  onStepValueChange: (v: number) => void;
  onStepUnitChange: (v: StepUnit) => void;
  onSimRunsChange: (v: number) => void;
  startSimulation: () => void;
  pauseSimulation: () => void;
  resumeSimulation: () => void;
  runSingleStep: () => void;
  resetSimulation: () => void;
  startOptimization: () => void;
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  t: (key: string) => string;
}

const SimTopBar: React.FC<SimTopBarProps> = ({
  mode, setMode, status, progress, currentStep,
  optRunning, isLocked, sessionId,
  simStartDate, simEndDate, stepValue, stepUnit, simRuns, sessionSeed,
  onSimStartDateChange, onSimEndDateChange, onStepValueChange, onStepUnitChange, onSimRunsChange,
  startSimulation, pauseSimulation, resumeSimulation, runSingleStep, resetSimulation, startOptimization,
  isDarkMode, c, t,
}) => (
  <div style={{
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
    padding: '5px 12px', flexShrink: 0,
    borderBottom: `1px solid ${c.border}`, background: c.panel,
  }}>
    <Segmented
      size="small" value={mode}
      onChange={v => setMode(v as 'sim' | 'opt')}
      options={[{ label: t('sim.mode.simulation'), value: 'sim' }, { label: t('sim.mode.optimization'), value: 'opt' }]}
      disabled={status === 'running' || status === 'paused' || status === 'completed'}
      style={{ flexShrink: 0 }}
    />
    <div style={{ width: 1, height: 16, background: c.border, flexShrink: 0 }} />
    <Button
      type="primary" size="small"
      icon={(status === 'running' || optRunning) ? <PauseOutlined /> : <PlayCircleOutlined />}
      onClick={
        mode === 'opt'
          ? (optRunning ? undefined : startOptimization)
          : status === 'running' ? pauseSimulation : status === 'paused' ? resumeSimulation : startSimulation
      }
      loading={optRunning}
      disabled={!isLocked || (mode === 'opt' ? optRunning : status === 'completed')}
      style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
    >
      {mode === 'opt'
        ? (optRunning ? '优化中...' : t('sim.control.run'))
        : status === 'running' ? t('sim.control.pause')
        : status === 'paused' ? t('sim.control.continue')
        : t('sim.control.run')}
    </Button>
    <Button size="small" icon={<StepForwardOutlined />}
      onClick={runSingleStep}
      disabled={mode === 'opt' || !isLocked || !sessionId || status === 'running' || status === 'completed'}
      style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
    >{t('sim.control.step')}</Button>
    <Button size="small" icon={<StopOutlined />}
      onClick={resetSimulation}
      disabled={status === 'idle'}
      style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
    >{t('sim.control.reset')}</Button>
    <div style={{ width: 1, height: 16, background: c.border, flexShrink: 0 }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      <span style={{ color: c.textSec, whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{t('sim.duration.label')}</span>
      <Input size="small" value={simStartDate} placeholder="YYYY-MM-DD"
        onChange={e => onSimStartDateChange(e.target.value)}
        style={{ width: '12ch', minWidth: '12ch', fontFamily: 'monospace' }} />
      <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>~</span>
      <Input size="small" value={simEndDate} placeholder="YYYY-MM-DD"
        onChange={e => onSimEndDateChange(e.target.value)}
        style={{ width: '12ch', minWidth: '12ch', fontFamily: 'monospace' }} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <span style={{ color: c.textSec, whiteSpace: 'nowrap' }}>{t('sim.step.label')}</span>
      <InputNumber size="small" value={stepValue} onChange={v => onStepValueChange(v || 1)} style={{ width: '7ch', minWidth: '7ch' }} min={1} />
      <Select size="small" value={stepUnit} onChange={v => onStepUnitChange(v)} style={{ minWidth: '9ch', width: 'max-content', flexShrink: 0 }}
        options={[{ label: t('sim.step.second'), value: 'second' }, { label: t('sim.step.minute'), value: 'minute' }, { label: t('sim.step.hour'), value: 'hour' }, { label: t('sim.step.day'), value: 'day' }]} />
    </div>
    <Tooltip title={simRuns > 1 ? `Monte Carlo: ${simRuns} 条，seed ${sessionSeed || '–'}` : 'Monte Carlo 运行条数（1=单条）'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
        <span style={{ color: c.textSec, whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>MC×</span>
        <InputNumber
          size="small" min={1} max={50} value={simRuns}
          onChange={v => onSimRunsChange(Math.max(1, Math.min(50, v || 1)))}
          style={{ width: 46 }}
          disabled={status === 'running'}
        />
      </div>
    </Tooltip>
    {progress > 0 && (
      <>
        <div style={{ flex: 1, minWidth: 60, maxWidth: 160 }}>
          <div style={{ height: 5, background: isDarkMode ? '#2a2a2a' : '#e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: c.primary, transition: 'width 0.3s', borderRadius: 3 }} />
          </div>
        </div>
        <span style={{ color: c.textMute, fontFamily: 'monospace', flexShrink: 0 }}>{Math.round(progress)}%</span>
      </>
    )}
    <span style={{ color: c.textMute, fontFamily: 'monospace', flexShrink: 0, whiteSpace: 'nowrap' }}>
      step {currentStep}
    </span>
  </div>
);

export default SimTopBar;
