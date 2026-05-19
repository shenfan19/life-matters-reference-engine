import React, { useState, useEffect } from 'react';
import { Button, Collapse, Empty } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ModelFile, SimulationDataPoint, PlanResult } from '../types';
import { getC } from '../core/theme';
import SimChart, { VAR_COLORS } from './SimChart';

interface SimPlotTabProps {
  simulationData: SimulationDataPoint[];
  dataPerRun: SimulationDataPoint[][];
  outputVars: string[];
  outputWarnings: string[];
  inputVars: Array<{ name: string; [k: string]: any }>;
  selectedModel: ModelFile | null;
  selectedKey: string | null;
  isLocked: boolean;
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
  t: (key: string) => string;
  fontSize: number;
  comparedPlans?: PlanResult[];
}

const SimPlotTab: React.FC<SimPlotTabProps> = ({
  simulationData, dataPerRun, outputVars, outputWarnings,
  inputVars, selectedModel, selectedKey, isLocked, mode, status,
  simStartDate, simEndDate, stepValue, stepUnit, simRuns, sessionSeed,
  isDarkMode, c, t, fontSize, comparedPlans,
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
    : !isLocked
      ? t('sim.scene.select_hint')
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
        <label key={plan.id} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', userSelect: 'none' }}>
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
      ))}
    </div>
  ) : null;

  const summaryBar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '6px 8px', marginBottom: 6, borderBottom: `1px solid ${c.border}`, background: c.sectionHd }}>
      {summaryItems.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 5, alignItems: 'baseline', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>
          <span style={{ color: c.textMute, fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>
          <span style={{ color: c.text, fontFamily: label === 'Model' ? undefined : 'monospace' }}>{value}</span>
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
              <Button size="small" type="text" icon={<DownloadOutlined />}
                onClick={e => { e.stopPropagation(); exportVarCSV(varName); }}
                style={{ color: c.textMute, padding: '0 2px', height: 'auto', lineHeight: 1 }} />
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
                  <Button size="small" type="text" icon={<DownloadOutlined />}
                    onClick={e => { e.stopPropagation(); exportVarCSV(v.name); }}
                    style={{ color: c.textMute, padding: '0 2px', height: 'auto', lineHeight: 1 }} />
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
    </div>
  );
};

export default SimPlotTab;
