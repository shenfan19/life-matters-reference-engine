import React, { useState, useEffect, useRef } from 'react';
import { Button, Collapse, Tooltip, message } from 'antd';
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import type { ModelFile, SimulationDataPoint, PlanResult } from '../../types';
import { getC } from '../../core/theme';
import { useI18n } from '../../core/i18n';
import JSZip from 'jszip';
import SimChart, { VAR_COLORS, varToDataUrl } from './SimChart';

interface SimPlotTabProps {
  simulationData: SimulationDataPoint[];
  dataPerRun: SimulationDataPoint[][];
  outputVars: string[];
  outputWarnings: string[];
  inputVars: Array<{ name: string; [k: string]: any }>;
  selectedModel: ModelFile | null;
  selectedKey: string | null;
  mode: 'sim' | 'opt';
  status: 'idle' | 'running' | 'paused' | 'completed';
  simStartDate: string;
  simEndDate: string;
  stepValue: number;
  stepUnit: string;
  simRuns: number;
  sessionSeed: number;
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  t: (key: string, params?: Record<string, string | number>) => string;
  fontSize: number;
  comparedPlans?: PlanResult[];
  onRemovePlan?: (id: string) => void;
  simLogs?: Array<{ t: number; msg: string }>;
}

const SimPlotTab: React.FC<SimPlotTabProps> = ({
  simulationData, dataPerRun, outputVars, outputWarnings,
  inputVars, selectedModel, selectedKey, mode, status,
  simStartDate, simEndDate, stepValue, stepUnit, simRuns, sessionSeed,
  isDarkMode, c, t, fontSize, comparedPlans, onRemovePlan, simLogs = [],
}) => {
  const hasSimData = simulationData.length > 0;
  const isMultiPlan = (comparedPlans ?? []).some(p => p.data.length > 0 || p.running);
  const modelVariables = (selectedModel?.content?.variables || {}) as Record<string, any>;

  // Which plan curves are currently visible in the chart
  const [visiblePlanIds, setVisiblePlanIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    // Auto-show all plans whenever the plan list changes (new plans added)
    if (comparedPlans && comparedPlans.length > 0)
      setVisiblePlanIds(new Set(comparedPlans.map(p => p.id)));
  }, [comparedPlans?.map(p => p.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const visiblePlans = isMultiPlan
    ? (comparedPlans ?? []).filter(p => visiblePlanIds.has(p.id))
    : undefined;
  const placeholderOutputVars = (outputVars.length > 0
    ? outputVars
    : Object.entries(modelVariables)
      .filter(([, info]) => info?.type !== 'parameter')
      .map(([name]) => name)
      .slice(0, 4));
  const plotSlots = placeholderOutputVars.length > 0 ? placeholderOutputVars : ['output'];
  const emptyStateText = !selectedKey
    ? t('sim.scene.empty_hint')
    : mode === 'opt'
      ? t('sim.plot.opt_mode_hint')
      : status === 'idle'
        ? t('sim.scene.click_to_start')
        : t('sim.scene.calculating');

  const summaryItems = [
    ['Model', selectedModel?.title || '-'],
    ['Points', String(simulationData.length)],
    ['Outputs', String(outputVars.length)],
    ['MC', `x${simRuns}${sessionSeed ? ` seed ${sessionSeed}` : ''}`],
    ['Range', `${simStartDate} ~ ${simEndDate}`],
    ['Step', `${stepValue} ${stepUnit}`],
  ];

  // Plan visibility toggle row — shown above charts when multi-plan results exist
  const planToggleBar = isMultiPlan && comparedPlans && comparedPlans.length > 0 ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: `1px solid ${c.border}`, background: c.sectionHd, flexShrink: 0 }}>
      <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.75)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('sim.plot.show')}</span>
      {comparedPlans.map(plan => (
        <div key={plan.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox"
              checked={visiblePlanIds.has(plan.id)}
              onChange={e => {
                const next = new Set(visiblePlanIds);
                if (e.target.checked) next.add(plan.id); else next.delete(plan.id);
                setVisiblePlanIds(next);
              }}
              style={{ accentColor: plan.color }}
            />
            <span style={{ color: plan.running ? c.textMute : plan.color, fontSize: 'calc(var(--lm-font-size, 14px) * 0.82)', fontWeight: 600 }}>
              {plan.label}{plan.running ? ' …' : ''}
            </span>
          </label>
          {onRemovePlan && plan.id !== 'current-sim' && !plan.running && (
            <Tooltip title={t('sim.plot.remove_curve')}>
              <button
                onClick={() => onRemovePlan(plan.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.textMute, fontSize: 12, padding: '0 2px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
              >×</button>
            </Tooltip>
          )}
        </div>
      ))}
    </div>
  ) : null;

  const summaryBar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '6px 8px', marginBottom: 6, borderBottom: `1px solid ${c.border}`, background: c.sectionHd, alignItems: 'center' }}>
      {summaryItems.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 5, alignItems: 'baseline', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>
          <span style={{ color: c.textMute, fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>
          <span
            data-testid={label === 'Points' ? 'sim-points-value' : undefined}
            style={{ color: c.text, fontFamily: label === 'Model' ? undefined : 'monospace' }}
          >{value}</span>
        </div>
      ))}
    </div>
  );

  const PlaceholderChart = ({ name, colorIndex, unit }: { name: string; colorIndex: number; unit?: string }) => {
    const lineColor = VAR_COLORS[colorIndex % VAR_COLORS.length];
    return (
      <div style={{
        height: 220,
        borderTop: `1px solid ${c.border}`,
        background: isDarkMode ? '#111' : '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          inset: '22px 16px 30px 42px',
          backgroundImage: `linear-gradient(${isDarkMode ? '#252525' : '#eee'} 1px, transparent 1px)`,
          backgroundSize: '100% 25%',
          borderLeft: `1px solid ${c.border}`,
          borderBottom: `1px solid ${c.border}`,
        }} />
        <div style={{ position: 'absolute', left: 12, top: 8, display: 'flex', alignItems: 'center', gap: 6, color: c.text, fontWeight: 600 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: lineColor, display: 'inline-block' }} />
          <span>{name}</span>
          {unit && <span style={{ color: c.textMute, fontWeight: 400 }}>({unit})</span>}
        </div>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>
          {emptyStateText}
        </div>
      </div>
    );
  };

  const exportVarCSV = (varName: string) => {
    if (isMultiPlan && comparedPlans && comparedPlans.some(p => p.data.length > 0)) {
      const plansWithData = comparedPlans.filter(p => p.data.length > 0);
      const anyMC = plansWithData.some(p => (p.runsData?.length ?? 0) > 1);
      const headerParts = ['time_s', 'time_h'];
      for (const plan of plansWithData) {
        const hasPlanMC = (plan.runsData?.length ?? 0) > 1;
        headerParts.push(anyMC ? `${plan.label}_mean` : plan.label);
        if (hasPlanMC) plan.runsData!.forEach((_, ri) => headerParts.push(`${plan.label}_run${ri}`));
      }
      const refData = plansWithData[0].data;
      const dataRows = refData.map((d, idx) => {
        const t = d.time ?? 0;
        const parts = [String(t), (t / 3600).toFixed(4)];
        for (const plan of plansWithData) {
          parts.push(String((plan.data[idx]?.[varName] as number) ?? ''));
          if ((plan.runsData?.length ?? 0) > 1)
            plan.runsData!.forEach(rd => parts.push(String((rd[idx]?.[varName] as number) ?? '')));
        }
        return parts.join(',');
      });
      const blob = new Blob([[headerParts.join(','), ...dataRows].join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${varName}_plans.csv`; a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const hasMC = dataPerRun.length > 1;
    const runCols = hasMC ? dataPerRun.map((_, i) => `${varName}_run${i}`).join(',') : '';
    const header = hasMC ? `time_s,time_h,${varName}_mean,${runCols}` : `time_s,time_h,${varName}`;
    const rows = [header,
      ...simulationData.map((d, idx) => {
        const base = `${d.time},${((d.time ?? 0) / 3600).toFixed(4)},${(d[varName] as number) ?? 0}`;
        if (!hasMC) return base;
        const runVals = dataPerRun.map(rd => (rd[idx]?.[varName] as number) ?? '').join(',');
        return `${base},${runVals}`;
      })];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = hasMC ? `${varName}_mc.csv` : `${varName}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportVarPNG = async (varName: string, colorIndex: number) => {
    const plansWithData = isMultiPlan ? (visiblePlans ?? []).filter(p => p.data.length > 0) : [];
    if (plansWithData.length > 0) {
      const zip = new JSZip();
      for (const plan of plansWithData) {
        const dataUrl = varToDataUrl(varName, colorIndex, plan.data, fontSize, [plan]);
        if (dataUrl) {
          const safeName = plan.label.replace(/[^a-zA-Z0-9_.-]/g, '_');
          zip.file(`${varName}_${safeName}.png`, dataUrl.split(',')[1], { base64: true });
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${varName}_charts.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } else {
      const dataUrl = varToDataUrl(varName, colorIndex, simulationData, fontSize);
      if (!dataUrl) return;
      const a = document.createElement('a');
      a.href = dataUrl; a.download = `${varName}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  };

  if (!hasSimData && !isMultiPlan) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '4px 6px' }}>
        {summaryBar}
        <div style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', margin: '2px 2px 6px', padding: '2px 6px' }}>
          {emptyStateText}
        </div>
        <Collapse defaultActiveKey={plotSlots} size="small"
          items={plotSlots.map((varName, idx) => {
            const varInfo = modelVariables[varName];
            const lineColor = VAR_COLORS[idx % VAR_COLORS.length];
            return {
              key: varName,
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: lineColor, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600 }}>{varName}</span>
                  {varInfo?.description && <span style={{ color: c.textMute, fontWeight: 400, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>{varInfo.description}</span>}
                  {varInfo?.unit && <span style={{ color: c.textMute, fontWeight: 400 }}>({varInfo.unit})</span>}
                </span>
              ),
              children: <PlaceholderChart name={varName} unit={varInfo?.unit} colorIndex={idx} />,
              styles: { header: { padding: '4px 8px' }, body: { padding: 0 } },
            };
          })}
        />
        {inputVars.length > 0 && (
          <>
            <div style={{ margin: '6px 0 2px', padding: '2px 8px', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', color: c.textMute, letterSpacing: '0.05em', borderLeft: `2px solid ${c.border}` }}>
              {t('sim.tabs.inputs')}
            </div>
            <Collapse defaultActiveKey={inputVars.map(v => v.name)} size="small"
              items={inputVars.map((v, idx) => {
                const inputVarInfo = modelVariables[v.name];
                const lineColor = VAR_COLORS[(plotSlots.length + idx) % VAR_COLORS.length];
                return {
                  key: v.name,
                  label: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: lineColor, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600 }}>{v.name}</span>
                      {inputVarInfo?.description && <span style={{ color: c.textMute, fontWeight: 400, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>{inputVarInfo.description}</span>}
                      {v.unit && <span style={{ color: c.textMute, fontWeight: 400 }}>({v.unit})</span>}
                    </span>
                  ),
                  children: <PlaceholderChart name={v.name} unit={v.unit} colorIndex={plotSlots.length + idx} />,
                  styles: { header: { padding: '4px 8px' }, body: { padding: 0 } },
                };
              })}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '4px 6px' }}>
      {planToggleBar}
      {summaryBar}
      {outputWarnings.length > 0 && (
        <div style={{ color: isDarkMode ? '#fbbf24' : '#b45309', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', margin: '2px 2px 6px' }}>
          {outputWarnings.join('；')}
        </div>
      )}
      <Collapse defaultActiveKey={outputVars} size="small"
        items={outputVars.map((varName, idx) => {
          const varInfo = selectedModel?.content?.variables?.[varName];
          const lineColor = VAR_COLORS[idx % VAR_COLORS.length];
          return {
            key: varName,
            label: (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: lineColor, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{varName}</span>
                {varInfo?.description && <span style={{ color: c.textMute, fontWeight: 400, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>{varInfo.description}</span>}
                {varInfo?.unit && <span style={{ color: c.textMute, fontWeight: 400 }}>({varInfo.unit})</span>}
              </span>
            ),
            extra: (
              <div style={{ display: 'flex', gap: 0 }} onClick={e => e.stopPropagation()}>
                <Button size="small" type="text" icon={<DownloadOutlined />}
                  onClick={() => exportVarPNG(varName, idx)}
                  style={{ color: c.textMute, padding: '0 2px', height: 'auto', lineHeight: 1 }}>PNG</Button>
                <Button size="small" type="text" icon={<DownloadOutlined />}
                  onClick={() => exportVarCSV(varName)}
                  style={{ color: c.textMute, padding: '0 2px', height: 'auto', lineHeight: 1 }}>CSV</Button>
              </div>
            ),
            children: (
              <SimChart varName={varName} unit={varInfo?.unit}
                data={isMultiPlan ? [] : simulationData}
                runsData={isMultiPlan ? undefined : (dataPerRun.length > 1 ? dataPerRun : undefined)}
                planDatasets={isMultiPlan ? visiblePlans : undefined}
                isDarkMode={isDarkMode} c={c} colorIndex={idx} hideTitleBar
                fontSize={fontSize} />
            ),
            styles: { header: { padding: '4px 8px' }, body: { padding: 0 } },
          };
        })}
      />
      {inputVars.length > 0 && (
        <>
          <div style={{ margin: '6px 0 2px', padding: '2px 8px', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', color: c.textMute, letterSpacing: '0.05em', borderLeft: `2px solid ${c.border}` }}>
            {t('sim.tabs.inputs')}
          </div>
          <Collapse defaultActiveKey={inputVars.map(v => v.name)} size="small"
            items={inputVars.map((v, idx) => {
              const lineColor = VAR_COLORS[(outputVars.length + idx) % VAR_COLORS.length];
              const inputVarInfo = selectedModel?.content?.variables?.[v.name];
              return {
                key: v.name,
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: lineColor, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600 }}>{v.name}</span>
                    {inputVarInfo?.description && <span style={{ color: c.textMute, fontWeight: 400, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>{inputVarInfo.description}</span>}
                    {v.unit && <span style={{ color: c.textMute, fontWeight: 400 }}>({v.unit})</span>}
                  </span>
                ),
                extra: (
                  <div style={{ display: 'flex', gap: 0 }} onClick={e => e.stopPropagation()}>
                    <Button size="small" type="text" icon={<DownloadOutlined />}
                      onClick={() => exportVarPNG(v.name, outputVars.length + idx)}
                      style={{ color: c.textMute, padding: '0 2px', height: 'auto', lineHeight: 1 }}>PNG</Button>
                    <Button size="small" type="text" icon={<DownloadOutlined />}
                      onClick={() => exportVarCSV(v.name)}
                      style={{ color: c.textMute, padding: '0 2px', height: 'auto', lineHeight: 1 }}>CSV</Button>
                  </div>
                ),
                children: (
                  <SimChart varName={v.name} unit={v.unit}
                    data={isMultiPlan ? [] : simulationData}
                    runsData={isMultiPlan ? undefined : (dataPerRun.length > 1 ? dataPerRun : undefined)}
                    planDatasets={isMultiPlan ? visiblePlans : undefined}
                    isDarkMode={isDarkMode} c={c} colorIndex={outputVars.length + idx} hideTitleBar
                    fontSize={fontSize} />
                ),
                styles: { header: { padding: '4px 8px' }, body: { padding: 0 } },
              };
            })}
          />
        </>
      )}

      {simLogs.length > 0 && <SimLogPanel logs={simLogs} c={c} />}
    </div>
  );
};

const SimLogPanel: React.FC<{ logs: Array<{ t: number; msg: string }>; c: ReturnType<typeof getC> }> = ({ logs, c }) => {
  const { t } = useI18n();
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  const logText = logs.map(l => {
    const d = new Date(l.t * 1000);
    const ts = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
    return `${ts} ${l.msg}`;
  }).join('\n');

  return (
    <Collapse size="small" style={{ marginTop: 6 }}
      items={[{
        key: 'log',
        label: <span style={{ fontWeight: 600, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>Log</span>,
        extra: (
          <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
            <Tooltip title="Copy log">
              <Button size="small" icon={<CopyOutlined />}
                onClick={() => navigator.clipboard.writeText(logText)
                  .then(() => message.success(t('sim.msg.copied')))
                  .catch(() => message.error(t('sim.msg.copy_failed')))} />
            </Tooltip>
            <Tooltip title="Download .txt">
              <Button size="small" icon={<DownloadOutlined />}
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(new Blob([logText], { type: 'text/plain' }));
                  a.download = `sim_log_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
                  a.click();
                }} />
            </Tooltip>
          </div>
        ),
        children: (
          <div ref={logRef} style={{ maxHeight: 200, overflowY: 'auto', fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', color: c.text, padding: '4px 0' }}>
            {logs.map((l, i) => {
              const d = new Date(l.t * 1000);
              const ts = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
              return (
                <div key={i} style={{ lineHeight: 1.5 }}>
                  <span style={{ color: c.textMute }}>{ts}</span>{' '}{l.msg}
                </div>
              );
            })}
          </div>
        ),
      }]}
    />
  );
};

export default SimPlotTab;
