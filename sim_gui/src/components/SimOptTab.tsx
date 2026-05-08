import React, { useEffect, useRef } from 'react';
import { Button, Collapse, Empty } from 'antd';
import { getC } from '../core/theme';
import type { InputEvent } from '../types';
import ParetoChart from './ParetoChart';
import OptProgressChart from './OptProgressChart';

interface SimOptTabProps {
  optResult: any;
  optRunning: boolean;
  optHistory: any[];
  optCurGen: number;
  optTotalGen: number;
  optElapsed: number;
  optMethod: string;
  optLogs: Array<{ t: number; msg: string }>;
  objectives: Array<{ variable: string; direction: 'minimize' | 'maximize' }>;
  constraints: Array<{ variable: string; op: '≤' | '≥'; value: number }>;
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  t: (key: string) => string;
  fontSize: number;
  setInputEvents: React.Dispatch<React.SetStateAction<InputEvent[]>>;
  setMode: (m: 'sim' | 'opt') => void;
  setCenterTab: (tab: string) => void;
}

const SimOptTab: React.FC<SimOptTabProps> = ({
  optResult, optRunning, optHistory, optCurGen, optTotalGen, optElapsed, optMethod,
  optLogs, objectives, constraints, isDarkMode, c, t, fontSize,
  setInputEvents, setMode, setCenterTab,
}) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [optLogs.length]);

  const hasPareto = (optResult?.pareto_front?.length ?? 0) > 0;
  const latestHist = optHistory.length > 0 ? optHistory[optHistory.length - 1] : null;
  const liveResult = latestHist?.pareto_front?.length ? { ...optResult, pareto_front: latestHist.pareto_front, objectives } : optResult;

  const resultRows = (optResult?.pareto_front || []).map((p: any, idx: number) => ({
    key: idx, rank: idx + 1,
    ...(p.x || []).reduce((acc: any, v: number, i: number) => ({ ...acc, [`x${i + 1}`]: v }), {}),
    ...(p.f || []).reduce((acc: any, v: number, i: number) => ({ ...acc, [`f${i + 1}`]: v }), {}),
  }));

  const metric = (label: string, value: any, tone = c.text) => (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 5, padding: '7px 8px', background: c.panel, minWidth: 110 }}>
      <div style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ color: tone, fontWeight: 700, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 1.0714)' }}>{value ?? '-'}</div>
    </div>
  );

  const logPanel = (
    <div style={{ maxHeight: 220, overflowY: 'auto', fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', color: c.text }}>
      {optLogs.length === 0 && <span style={{ color: c.textMute }}>暂无日志</span>}
      {optLogs.map((l, i) => {
        const d = new Date(l.t * 1000);
        const ts = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
        return <div key={i} style={{ lineHeight: 1.5 }}><span style={{ color: c.textMute }}>{ts}</span> {l.msg}</div>;
      })}
      <div ref={logEndRef} />
    </div>
  );

  const optSummary = (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <span style={{ fontWeight: 600, color: c.text }}>{hasPareto ? 'Pareto 前沿' : latestHist ? '当前前沿预览' : 'Optimization'}</span>
      {((optResult?.objectives || objectives) || []).map((o: any, i: number) => (
        <span key={i} style={{ padding: '1px 6px', borderRadius: 3, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', fontFamily: 'monospace', color: c.primary, background: isDarkMode ? '#1e3824' : '#f0f7f0', border: `1px solid ${c.border}` }}>
          {o.direction === 'maximize' ? '↑' : '↓'} {o.variable}
          {o.metric && o.metric !== 'final' ? ` (${o.metric})` : ''}
        </span>
      ))}
      <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>
        {(optResult?.n_solutions ?? latestHist?.pareto_count ?? 0)} 解 · {(optResult?.method || optMethod || 'nsga2')}
        {optElapsed > 0 ? ` · ${optElapsed.toFixed(1)}s` : ''}
      </span>
    </div>
  );

  const bestPanel = optResult?.best_x != null ? (
    <div style={{ padding: '2px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>
        {(optResult.regimen_event_labels || (optResult.best_x || []).map((_: any, i: number) => `x${i}`))
          .map((label: string, i: number) => (
            <div key={i}>
              <span style={{ color: c.textMute }}>{label}: </span>
              <span style={{ color: c.primary, fontWeight: 600 }}>{optResult.best_x?.[i]?.toFixed(3)}</span>
            </div>
          ))}
        {(optResult.objectives || []).map((o: any, i: number) => (
          <div key={`obj-${i}`}>
            <span style={{ color: c.textMute }}>{o.variable}: </span>
            <span style={{ color: c.text }}>{optResult.best_f?.[i]?.toFixed(4)}</span>
          </div>
        ))}
      </div>
      <Button size="small" type="primary" style={{ marginTop: 8, background: c.primary, borderColor: c.primary }}
        onClick={() => {
          if (!optResult?.best_x?.length) return;
          const regVar: string | undefined = optResult.regimen_variable;
          const bestX: number[] = optResult.best_x;
          let xIdx = 0;
          setInputEvents(prev => prev.map(ev => {
            if (regVar && ev.variable === regVar && ev.optimizeValue) {
              const val = bestX[xIdx++];
              return val != null ? { ...ev, value: Number(val.toFixed(4)) } : ev;
            }
            return ev;
          }));
          setMode('sim');
          setCenterTab('setup');
        }}
      >
        以此解运行仿真 →
      </Button>
    </div>
  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="完成后显示推荐解" />;

  if (!hasPareto && !latestHist && !optLogs.length) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        <div style={{ textAlign: 'center', color: c.textMute, padding: 40, fontSize: 'calc(var(--lm-font-size, 14px) * 0.9286)' }}>
          {optRunning ? '优化运行中，第一代完成后会显示过程图...' : '运行优化后在此查看 Pareto 结果'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
      <div style={{ marginBottom: 8 }}>{optSummary}</div>
      <Collapse size="small"
        defaultActiveKey={['front', 'live', 'process', 'log', ...(hasPareto ? ['data'] : [])]}
        items={[
          {
            key: 'front', label: 'Front',
            children: (
              <div style={{ height: 340, border: `1px solid ${c.border}`, borderRadius: 6, overflow: 'hidden' }}>
                {liveResult?.pareto_front?.length
                  ? <ParetoChart result={liveResult} isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
                  : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无前沿点" />}
              </div>
            ),
          },
          {
            key: 'live', label: 'Live',
            children: (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {metric('Gen', optCurGen > 0 ? `${optCurGen}/${optTotalGen || '-'}` : '-')}
                {metric('Eval', latestHist?.n_eval ?? '-')}
                {metric('Front', latestHist?.pareto_count ?? optResult?.n_solutions ?? '-')}
                {metric('Feasible', latestHist?.feasible_ratio != null ? `${(latestHist.feasible_ratio * 100).toFixed(0)}%` : '-', latestHist?.feasible_ratio === 0 ? '#ff7875' : c.primary)}
                {metric('Mean CV', latestHist?.mean_cv?.toFixed?.(4) ?? '-')}
                {metric('Elapsed', optElapsed > 0 ? `${optElapsed.toFixed(1)}s` : '-')}
                {latestHist?.objective_ranges?.length > 0 && (
                  <div style={{ width: '100%', marginTop: 4 }}>
                    {latestHist.objective_ranges.map((r: any, i: number) => {
                      const obj = objectives[i] || optResult?.objectives?.[i];
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', color: c.textSec, borderTop: `1px solid ${c.border}`, paddingTop: 4 }}>
                          <span>{obj?.variable || `f${i + 1}`}</span>
                          <span>{r.min?.toFixed?.(4)} .. {r.max?.toFixed?.(4)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'process', label: 'Process',
            children: (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                <OptProgressChart history={optHistory} metric="pareto_count" label="Pareto count" isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
                <OptProgressChart history={optHistory} metric="feasible_ratio" label="Feasible ratio" isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
                <OptProgressChart history={optHistory} metric="n_eval" label="Evaluations" isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
                <OptProgressChart history={optHistory} metric="mean_cv" label="Mean constraint violation" isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
              </div>
            ),
          },
          { key: 'best', label: 'Best', children: bestPanel },
          {
            key: 'data', label: 'Solutions',
            children: hasPareto ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>
                  <thead>
                    <tr style={{ color: c.textMute, borderBottom: `1px solid ${c.border}` }}>
                      <th style={{ textAlign: 'left', padding: 4 }}>#</th>
                      {(optResult.regimen_event_labels || (optResult.best_x || []).map((_: any, i: number) => `x${i + 1}`)).map((name: string, i: number) => (
                        <th key={`x-${i}`} style={{ textAlign: 'right', padding: 4 }}>{name}</th>
                      ))}
                      {(optResult.objectives || []).map((o: any, i: number) => (
                        <th key={`f-${i}`} style={{ textAlign: 'right', padding: 4 }}>{o.variable}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resultRows.slice(0, 80).map((row: any, rIdx: number) => (
                      <tr key={row.key} style={{ borderBottom: `1px solid ${c.border}` }}>
                        <td style={{ padding: 4, color: c.textMute }}>{row.rank}</td>
                        {(optResult.best_x || []).map((_: any, i: number) => (
                          <td key={`xv-${i}`} style={{ textAlign: 'right', padding: 4, fontFamily: 'monospace' }}>{row[`x${i + 1}`]?.toFixed?.(4) ?? '-'}</td>
                        ))}
                        {(optResult.objectives || []).map((_: any, i: number) => (
                          <td key={`fv-${i}`} style={{ textAlign: 'right', padding: 4, fontFamily: 'monospace', color: rIdx === 0 ? c.primary : c.text }}>{row[`f${i + 1}`]?.toFixed?.(4) ?? '-'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="完成后显示解表" />,
          },
          { key: 'log', label: 'Log', children: logPanel },
        ]}
      />
    </div>
  );
};

export default SimOptTab;
