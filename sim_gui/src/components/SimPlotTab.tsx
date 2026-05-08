import React from 'react';
import { Button, Collapse, Empty } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ModelFile, SimulationDataPoint } from '../types';
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
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  t: (key: string) => string;
  fontSize: number;
}

const SimPlotTab: React.FC<SimPlotTabProps> = ({
  simulationData, dataPerRun, outputVars, outputWarnings,
  inputVars, selectedModel, selectedKey, isLocked, mode, status,
  isDarkMode, c, t, fontSize,
}) => {
  const hasSimData = simulationData.length > 0;

  const exportVarCSV = (varName: string) => {
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

  if (!hasSimData) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textMute, flexDirection: 'column', gap: 8 }}>
        {!selectedKey
          ? <><span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 1.2857)' }}>📂</span><span>{t('sim.scene.empty_hint')}</span></>
          : !isLocked
            ? <><span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 1.2857)' }}>🔒</span><span>{t('sim.scene.select_hint')}</span></>
            : mode === 'opt'
              ? <><span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 1.2857)' }}>▶</span><span>{t('sim.control.run')}</span></>
              : status === 'idle'
                ? <><span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 1.2857)' }}>▶</span><span>{t('sim.scene.click_to_start')}</span></>
                : <span>{t('sim.scene.calculating')}</span>
        }
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '4px 6px' }}>
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
              <SimChart varName={varName} unit={varInfo?.unit} data={simulationData}
                isDarkMode={isDarkMode} c={c} colorIndex={idx} hideTitleBar
                runsData={dataPerRun.length > 1 ? dataPerRun : undefined}
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
                  <SimChart varName={v.name} unit={v.unit} data={simulationData}
                    isDarkMode={isDarkMode} c={c} colorIndex={outputVars.length + idx} hideTitleBar
                    runsData={dataPerRun.length > 1 ? dataPerRun : undefined}
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
