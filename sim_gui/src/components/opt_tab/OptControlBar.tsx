// OptControlBar.tsx — optimization tab toolbar (run / cancel / warm-start + date/step/MC config)

import React, { useRef, useState } from 'react';
import { Button, Checkbox, Input, InputNumber, Popover, Select, Tooltip } from 'antd';
import { DownloadOutlined, PlayCircleOutlined, ReloadOutlined, StopOutlined, UploadOutlined } from '@ant-design/icons';
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
  simRunning: boolean;
  onStart: () => void;
  onCancel: () => void;
  onWarmStartChange: (enabled: boolean) => void;
  onSimStartDateChange: (v: string) => void;
  onSimEndDateChange: (v: string) => void;
  onStepValueChange: (v: number) => void;
  onStepUnitChange: (v: StepUnit) => void;
  onSimRunsChange: (v: number) => void;
  onMcSeedChange: (v: number | null) => void;
  onDownload: (opts: { withResults: boolean; flattenImports: boolean }) => void;
  onExportCSV: () => void;
  onImportCSV: (csvText: string) => void;
  onReload: () => void;
  scsMode: boolean;
  setOptResult: (v: any) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  c: Record<string, string>;
}

export function OptControlBar({
  optRunning, optCurGen, optTotalGen,
  warmStartEnabled, warmStartDirty, hasExistingResults, currentFrontCount,
  optResult, storedOptResult,
  simStartDate, simEndDate, stepValue, stepUnit, simRuns, mcSeed,
  selectedModel, isOtherRunning, otherRunningTip, simRunning,
  onStart, onCancel, onWarmStartChange,
  onSimStartDateChange, onSimEndDateChange, onStepValueChange, onStepUnitChange,
  onSimRunsChange, onMcSeedChange,
  onDownload, onExportCSV, onImportCSV, onReload,
  scsMode,
  setOptResult,
  t, c,
}: OptControlBarProps) {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [withResults, setWithResults] = useState(true);
  const [flattenImports, setFlattenImports] = useState(true);
  const hasOptResult = !!optResult;
  const warmStartTooltip = warmStartDirty && warmStartEnabled
    ? t('sim.opt.warm_start_dirty_tooltip')
    : (warmStartEnabled && hasExistingResults)
      ? t('sim.opt.warm_start_active_tooltip', { n: currentFrontCount })
      : t('sim.opt.warm_start_suggestion', { n: currentFrontCount });
  const runTooltip = isOtherRunning ? otherRunningTip
    : (warmStartEnabled && hasExistingResults) ? warmStartTooltip
    : hasExistingResults ? t('sim.opt.cold_start_suggestion', { n: currentFrontCount })
    : t('sim.opt.run_hint');

  return (
    <div style={{ width: '100%', flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${c.border}`, background: c.panel }}>
      {/* Run / cancel */}
      <Tooltip title={runTooltip}>
        <span>
          <Button
            type="primary" size="small"
            icon={!isOtherRunning && optRunning ? <StopOutlined /> : <PlayCircleOutlined />}
            onClick={isOtherRunning ? undefined : (optRunning ? onCancel : onStart)}
            disabled={!selectedModel || isOtherRunning}
            style={{ whiteSpace: 'nowrap' }}
          >
            {!isOtherRunning && optRunning ? t('sim.opt.stop_opt') : t('sim.control.run')}
          </Button>
        </span>
      </Tooltip>

      {/* Warm-start checkbox — always visible; disabled when no results exist */}
      <Tooltip title={hasExistingResults ? warmStartTooltip : t('sim.opt.warm_start_disabled')}>
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
            {warmStartDirty && warmStartEnabled ? t('sim.opt.warm_start_dirty') : t('sim.opt.warm_start')}
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

      {/* File operations — order: 下载优化 | 上传优化 | 下载模型（Popover）| 重载 */}
      <div style={{ width: 1, height: 16, background: c.border, flexShrink: 0 }} />

      <Tooltip title={t('sim.opt.dl_opt_tip')}>
        <Button size="small" icon={<DownloadOutlined />}
          onClick={onExportCSV}
          disabled={!optResult || optRunning}
          style={{ whiteSpace: 'nowrap', color: optResult ? c.primary : c.textMute }}
        >{t('sim.opt.opt_label')}</Button>
      </Tooltip>

      <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = ev => {
            onImportCSV(ev.target?.result as string);
            e.target.value = '';
          };
          reader.readAsText(file);
        }} />
      <Tooltip title={t('sim.opt.ul_opt_tip')}>
        <Button size="small" icon={<UploadOutlined />}
          onClick={() => csvInputRef.current?.click()}
          disabled={optRunning || !selectedModel}
          style={{ whiteSpace: 'nowrap', color: c.textSec }}
        >{t('sim.opt.opt_label')}</Button>
      </Tooltip>

      <Popover
        open={downloadOpen}
        onOpenChange={open => { if (selectedModel && !optRunning) setDownloadOpen(open); }}
        trigger="click"
        content={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
            <Checkbox checked={withResults && hasOptResult} disabled={!hasOptResult}
              onChange={e => setWithResults(e.target.checked)}>
              {t('sim.ctrl.with_results')}
            </Checkbox>
            <Checkbox checked={flattenImports}
              onChange={e => setFlattenImports(e.target.checked)}>
              {t('sim.ctrl.flatten_imports')}
            </Checkbox>
            <Button size="small" type="primary" style={{ marginTop: 4 }}
              onClick={() => { onDownload({ withResults: withResults && hasOptResult, flattenImports }); setDownloadOpen(false); }}>
              {t('sim.ctrl.dl_btn')}
            </Button>
          </div>
        }
      >
        <Button size="small" icon={<DownloadOutlined />}
          disabled={!selectedModel || optRunning}
          style={{ whiteSpace: 'nowrap', color: c.textSec }}
        >{t('sim.ctrl.model_label')}</Button>
      </Popover>

      <Tooltip title={
        optRunning ? t('sim.ctrl.reload_tip_opt') :
        simRunning ? t('sim.ctrl.reload_tip_running') :
        t('sim.ctrl.reload_tip')
      }>
        <Button size="small" icon={<ReloadOutlined />}
          onClick={onReload}
          disabled={!selectedModel || optRunning || simRunning}
          style={{ whiteSpace: 'nowrap', color: c.textSec }}
        >{t('sim.ctrl.reload_label')}</Button>
      </Tooltip>
    </div>
  );
}
