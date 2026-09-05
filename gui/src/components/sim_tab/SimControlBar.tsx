// SimControlBar.tsx — simulation tab toolbar (play / pause / step / reset + date/step/MC config)

import React, { useRef } from 'react';
import { Button, Input, InputNumber, Select, Tooltip } from 'antd';
import { DownloadOutlined, PauseOutlined, PlayCircleOutlined, StopOutlined, UploadOutlined } from '@ant-design/icons';
import type { ModelFile, SimPlan, StepUnit } from '../../types';

interface SimControlBarProps {
  status: string;
  sessionSeed: number;
  plans: SimPlan[];
  simStartDate: string;
  simEndDate: string;
  stepValue: number;
  stepUnit: StepUnit;
  simRuns: number;
  mcSeed: number | null;
  selectedModel: ModelFile | null;
  hasSimData: boolean;
  isOtherRunning: boolean;
  otherRunningTip: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onRunAllPlans: () => void;
  onExportCSV: () => void;
  onImportCSV: (csvText: string, fileName: string) => void;
  reportButton?: React.ReactNode;
  onSimStartDateChange: (v: string) => void;
  onSimEndDateChange: (v: string) => void;
  onStepValueChange: (v: number) => void;
  onStepUnitChange: (v: StepUnit) => void;
  onSimRunsChange: (v: number) => void;
  onMcSeedChange: (v: number | null) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  c: Record<string, string>;
}

export function SimControlBar({
  status, sessionSeed, plans,
  simStartDate, simEndDate, stepValue, stepUnit, simRuns, mcSeed,
  selectedModel, hasSimData, isOtherRunning, otherRunningTip,
  onStart, onPause, onResume, onReset, onRunAllPlans,
  onExportCSV, onImportCSV, reportButton,
  onSimStartDateChange, onSimEndDateChange, onStepValueChange, onStepUnitChange,
  onSimRunsChange, onMcSeedChange,
  t, c,
}: SimControlBarProps) {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const multiPlan = plans.length > 1;

  const handleMainClick = isOtherRunning ? undefined
    : isRunning ? onPause
    : isPaused ? onResume
    : multiPlan ? onRunAllPlans
    : onStart;

  const mainLabel = !isOtherRunning && isRunning ? t('sim.control.pause')
    : !isOtherRunning && isPaused ? t('sim.control.continue')
    : !isOtherRunning && multiPlan ? `${t('sim.plan.run_all_pre')} ${plans.length} ${t('sim.plan.run_all_suf')}`
    : t('sim.control.run');

  return (
    <>
      {/* Run controls */}
      <Tooltip title={otherRunningTip}>
        <span>
          <Button
            type="primary" size="small"
            icon={!isOtherRunning && isRunning ? <PauseOutlined /> : <PlayCircleOutlined />}
            onClick={handleMainClick}
            disabled={!selectedModel || isOtherRunning}
            style={{ whiteSpace: 'nowrap' }}
            data-testid="sim-run-button"
          >
            {mainLabel}
          </Button>
        </span>
      </Tooltip>

      <Button size="small" icon={<StopOutlined />}
        onClick={onReset}
        disabled={!isRunning && !isPaused}
        style={{ whiteSpace: 'nowrap' }}
      >{t('sim.control.reset')}</Button>

      <div style={{ width: 1, height: 16, background: c.border }} />

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
            { label: t('sim.step.minute'), value: 'minute' },
            { label: t('sim.step.hour'),   value: 'hour'   },
            { label: t('sim.step.day'),    value: 'day'    },
          ]} />
      </div>

      {/* MC config */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <Tooltip title={simRuns > 1 ? t('sim.ctrl.mc_tooltip_active', { n: simRuns, seed: sessionSeed || '-' }) : t('sim.ctrl.mc_tooltip')}>
          <span style={{ color: c.textSec, whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>MC×</span>
        </Tooltip>
        <InputNumber size="small" min={1} max={50} value={simRuns}
          onChange={v => onSimRunsChange(Math.max(1, Math.min(50, v || 1)))}
          style={{ width: 52 }}
          disabled={isRunning}
        />
        <Tooltip title={t('sim.mc.seed_tooltip')}>
          <span style={{ color: c.textSec, whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{t('sim.mc.seed_label')}</span>
        </Tooltip>
        <InputNumber
          size="small" value={mcSeed ?? undefined} placeholder={t('sim.mc.seed_placeholder')}
          onChange={v => onMcSeedChange(v != null ? Math.max(0, Math.floor(v)) : null)}
          style={{ width: '7ch', minWidth: '7ch', fontFamily: 'monospace' }}
          min={0} max={2147483647} controls={false}
          disabled={isRunning}
        />
      </div>

      {/* File operations — order: download simulation | upload simulation */}
      <div style={{ width: 1, height: 16, background: c.border }} />

      <Tooltip title={t('sim.ctrl.dl_sim_tip')}>
        <Button size="small" icon={<DownloadOutlined />}
          onClick={onExportCSV}
          disabled={!selectedModel || !hasSimData}
          style={{ whiteSpace: 'nowrap', color: c.textSec }}
        >{t('sim.ctrl.sim_label')}</Button>
      </Tooltip>

      <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = ev => {
            onImportCSV(ev.target?.result as string, file.name);
            e.target.value = '';
          };
          reader.readAsText(file);
        }} />
      <Tooltip title={t('sim.ctrl.ul_sim_tip')}>
        <Button size="small" icon={<UploadOutlined />}
          onClick={() => csvInputRef.current?.click()}
          disabled={!selectedModel}
          style={{ whiteSpace: 'nowrap', color: c.textSec }}
        >{t('sim.ctrl.sim_label')}</Button>
      </Tooltip>

      {reportButton && <><div style={{ width: 1, height: 16, background: c.border }} />{reportButton}</>}
    </>
  );
}
