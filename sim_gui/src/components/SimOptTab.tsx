import React, { useEffect, useRef, useState } from 'react';
import { Button, Empty } from 'antd';
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
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(['front', 'live', 'process', 'log']));

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [optLogs.length]);

  const hasPareto = (optResult?.pareto_front?.length ?? 0) > 0;
  const latestHist = optHistory.length > 0 ? optHistory[optHistory.length - 1] : null;
  const liveResult = latestHist?.pareto_front?.length ? { ...optResult, pareto_front: latestHist.pareto_front, objectives } : optResult;
  useEffect(() => {
    if (hasPareto) setOpenSections(prev => new Set([...prev, 'data']));
  }, [hasPareto]);

  const toggleSection = (key: string) => setOpenSections(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const Section = ({ id, title, badge, children }: { id: string; title: string; badge?: string; children: React.ReactNode }) => {
    const open = openSections.has(id);
    return (
      <div style={{ borderRadius: 10, border: `1px solid ${c.border}`, boxShadow: isDarkMode ? '0 1px 5px rgba(0,0,0,0.35)' : '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden', background: c.panel, flexShrink: 0 }}>
        <div onClick={() => toggleSection(id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', cursor: 'pointer', background: c.sectionHd, userSelect: 'none' }}>
          <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', display: 'inline-block', transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
          <span style={{ flex: 1, fontWeight: 600, color: c.text, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{title}</span>
          {badge && <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>{badge}</span>}
        </div>
        {open && <div style={{ padding: '8px 12px 12px' }}>{children}</div>}
      </div>
    );
  };

  const resultRows = (optResult?.pareto_front || []).map((p: any, idx: number) => ({
    key: idx, rank: idx + 1,
    ...(p.x || []).reduce((acc: any, v: number, i: number) => ({ ...acc, [`x${i + 1}`]: v }), {}),
    ...(p.f || []).reduce((acc: any, v: number, i: number) => ({ ...acc, [`f${i + 1}`]: v }), {}),
  }));

  const objectiveDefs = (optResult?.objectives || objectives || []) as Array<{ direction?: string }>;
  const historyFronts = optHistory.filter(h => Array.isArray(h.pareto_front) && h.pareto_front.length > 0);
  const allObjectiveVectors = historyFronts.flatMap(h => h.pareto_front.map((p: any) => p.f || []));
  const dim = Math.max(0, objectiveDefs.length || allObjectiveVectors[0]?.length || 0);
  const signedBounds = Array.from({ length: dim }, (_, j) => {
    const values = allObjectiveVectors
      .map((f: any[]) => Number(f[j]))
      .filter(Number.isFinite)
      .map(v => objectiveDefs[j]?.direction === 'minimize' ? -v : v);
    return values.length
      ? { min: Math.min(...values), max: Math.max(...values) }
      : { min: 0, max: 1 };
  });
  const hypervolume = (points: number[][], d: number): number => {
    const valid = points
      .map(p => p.slice(0, d).map(v => Math.max(0, Math.min(1, v))))
      .filter(p => p.length === d && p.every(Number.isFinite));
    if (valid.length === 0 || d <= 0) return 0;
    if (d === 1) return Math.max(...valid.map(p => p[0]));
    const cuts = [...new Set(valid.map(p => p[d - 1]).filter(v => v > 0).sort((a, b) => a - b))];
    let total = 0;
    let prev = 0;
    for (const cut of cuts) {
      const active = valid.filter(p => p[d - 1] >= cut).map(p => p.slice(0, d - 1));
      total += (cut - prev) * hypervolume(active, d - 1);
      prev = cut;
    }
    return total;
  };
  const hvHistory = optHistory.map(h => {
    if (!Array.isArray(h.pareto_front) || dim === 0) return { ...h, hypervolume: 0 };
    const normalized = h.pareto_front.map((p: any) => (p.f || []).slice(0, dim).map((raw: number, j: number) => {
      const signed = objectiveDefs[j]?.direction === 'minimize' ? -Number(raw) : Number(raw);
      const { min, max } = signedBounds[j];
      const range = max - min;
      return range === 0 ? 1 : (signed - min) / range;
    }));
    return { ...h, hypervolume: hypervolume(normalized, dim) };
  });

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
          setCenterTab('simulation');
        }}
      >
        以此解运行仿真 →
      </Button>
    </div>
  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="完成后显示推荐解" />;

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: 8, gap: 8 }}>
      <div style={{ padding: '6px 4px' }}>{optSummary}</div>

      <Section id="front" title="Front" badge={`${optResult?.n_solutions ?? latestHist?.pareto_count ?? 0} 解`}>
        <div style={{ height: 340, overflow: 'hidden' }}>
          {liveResult?.pareto_front?.length
            ? <ParetoChart result={liveResult} isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
            : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={optRunning ? '等待第一代前沿点' : '运行后显示 Pareto 前沿'} />}
        </div>
      </Section>

      <Section id="live" title="Live" badge={optCurGen > 0 ? `Gen ${optCurGen}` : undefined}>
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
      </Section>

      <Section id="process" title="Process" badge={`${optHistory.length} 点`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
          <OptProgressChart history={hvHistory} metric="hypervolume" label="Hypervolume (normalized)" isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
          <OptProgressChart history={optHistory} metric="pareto_count" label="Pareto count" isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
          <OptProgressChart history={optHistory} metric="feasible_ratio" label="Feasible ratio" isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
          <OptProgressChart history={optHistory} metric="n_eval" label="Evaluations" isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
          <OptProgressChart history={optHistory} metric="mean_cv" label="Mean constraint violation" isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
        </div>
      </Section>

      <Section id="best" title="Best">
        {bestPanel}
      </Section>

      <Section id="data" title="Solutions" badge={hasPareto ? `${resultRows.length} 行` : undefined}>
        {hasPareto ? (
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
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="完成后显示解表" />}
      </Section>

      <Section id="log" title="Log" badge={`${optLogs.length} 条`}>
        {logPanel}
      </Section>
    </div>
  );
};

export default SimOptTab;
