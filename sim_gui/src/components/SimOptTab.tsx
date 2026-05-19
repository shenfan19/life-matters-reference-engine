import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dropdown, Empty, Tooltip } from 'antd';
import { DownloadOutlined, ExportOutlined } from '@ant-design/icons';
import { getC } from '../core/theme';
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
  onDownloadModel: (flattenImports: boolean) => void;
  hasExistingResults: boolean;
  onSendToSim?: (rows: Array<{ x: number[]; f: number[]; rank: number }>) => void;
}

const SimOptTab: React.FC<SimOptTabProps> = ({
  optResult, optRunning, optHistory, optCurGen, optTotalGen, optElapsed, optMethod,
  optLogs, objectives, constraints, isDarkMode, c, t, fontSize,
  onDownloadModel, hasExistingResults, onSendToSim,
}) => {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(['front', 'process', 'solutions', 'log']));
  const [checkedIdx, setCheckedIdx] = useState<Set<number>>(new Set());

  useEffect(() => {
    const el = logContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [optLogs.length]);

  // Client-side stopwatch
  const [displaySecs, setDisplaySecs] = useState(0);
  const startTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!optRunning) {
      if (optElapsed > 0) setDisplaySecs(Math.round(optElapsed));
      return;
    }
    // Sync start with server offset in case component mounted mid-run
    const startTs = Date.now() - optElapsed * 1000;
    startTsRef.current = startTs;
    const timer = setInterval(() => {
      setDisplaySecs(Math.floor((Date.now() - startTs) / 1000));
    }, 100);
    return () => clearInterval(timer);
  }, [optRunning]);

  const formatHMS = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(sec).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  const hasPareto = (optResult?.pareto_front?.length ?? 0) > 0;
  const latestHist = optHistory.length > 0 ? optHistory[optHistory.length - 1] : null;
  const liveResult = latestHist?.pareto_front?.length ? { ...optResult, pareto_front: latestHist.pareto_front, objectives } : optResult;
  useEffect(() => {
    if (hasPareto) setOpenSections(prev => new Set([...prev, 'solutions']));
  }, [hasPareto]);

  const refRowIdx = useMemo(() => {
    if (!optResult?.best_x || !optResult?.pareto_front?.length) return -1;
    const bx: number[] = optResult.best_x;
    return (optResult.pareto_front as any[]).findIndex((pt: any) => {
      const px: number[] = pt.x || [];
      return px.length === bx.length && px.every((v: number, i: number) => Math.abs(v - bx[i]) < 1e-6);
    });
  }, [optResult]);

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
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 5, padding: '4px 8px', background: c.panel, minWidth: 80 }}>
      <div style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.6786)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ color: tone, fontWeight: 700, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.9286)' }}>{value ?? '-'}</div>
    </div>
  );

  const logPanel = (
    <div ref={logContainerRef} style={{ maxHeight: 220, overflowY: 'auto', fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', color: c.text }}>
      {optLogs.length === 0 && <span style={{ color: c.textMute }}>暂无日志</span>}
      {optLogs.map((l, i) => {
        const d = new Date(l.t * 1000);
        const ts = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
        return <div key={i} style={{ lineHeight: 1.5 }}><span style={{ color: c.textMute }}>{ts}</span> {l.msg}</div>;
      })}
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
        {displaySecs > 0 ? ` · ${formatHMS(displaySecs)}` : ''}
      </span>
    </div>
  );


  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: 8, gap: 8 }}>
      <div style={{ padding: '6px 4px' }}>{optSummary}</div>

      {/* Front — Pareto chart, reduced height */}
      <Section id="front" title="Front" badge={`${optResult?.n_solutions ?? latestHist?.pareto_count ?? 0} 解`}>
        <div style={{ height: 240, overflow: 'hidden' }}>
          {liveResult?.pareto_front?.length
            ? <ParetoChart result={liveResult} isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
            : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={optRunning ? '等待第一代前沿点' : '运行后显示 Pareto 前沿'} />}
        </div>
      </Section>

      {/* Process — live metric cards + progress charts (merged from Live) */}
      <Section id="process" title="Process" badge={optCurGen > 0 ? `Gen ${optCurGen}/${optTotalGen || '-'}` : `${optHistory.length} 点`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {metric('Gen', optCurGen > 0 ? `${optCurGen}/${optTotalGen || '-'}` : '-')}
          {metric('Eval', latestHist?.n_eval ?? '-')}
          {metric('Front', latestHist?.pareto_count ?? optResult?.n_solutions ?? '-')}
          {metric('Feasible', latestHist?.feasible_ratio != null ? `${(latestHist.feasible_ratio * 100).toFixed(0)}%` : '-', latestHist?.feasible_ratio === 0 ? '#ff7875' : c.primary)}
          {metric('Mean CV', latestHist?.mean_cv?.toFixed?.(4) ?? '-')}
          {metric('Elapsed', displaySecs > 0 ? formatHMS(displaySecs) : '-')}
        </div>
        {latestHist?.objective_ranges?.length > 0 && (
          <div style={{ marginBottom: 8 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
          <OptProgressChart history={hvHistory} metric="hypervolume" label="Hypervolume" isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
          <OptProgressChart history={optHistory} metric="pareto_count" label="Pareto count" isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
          <OptProgressChart history={optHistory} metric="feasible_ratio" label="Feasible ratio" isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
          <OptProgressChart history={optHistory} metric="n_eval" label="Evaluations" isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
          <OptProgressChart history={optHistory} metric="mean_cv" label="Mean CV" isDarkMode={isDarkMode} c={c} fontSize={fontSize} />
        </div>
      </Section>

      {/* Solutions — action bar + Pareto table with reference row highlighted (merged from Best) */}
      <Section id="solutions" title="Solutions" badge={hasPareto ? `${resultRows.length} 行` : undefined}>
        {/* Action bar — always visible when results exist */}
        {(hasPareto || optResult?.best_x != null) && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {onSendToSim && (
              <Tooltip title={checkedIdx.size > 0 ? '将选中的 Pareto 解添加为仿真方案' : '请先在表格中勾选解'}>
                <Button size="small" type="primary" icon={<ExportOutlined />}
                  disabled={checkedIdx.size === 0}
                  style={checkedIdx.size > 0 ? { background: c.primary, borderColor: c.primary } : {}}
                  onClick={() => {
                    const rows = [...checkedIdx].map(idx => ({
                      x: optResult.pareto_front[idx]?.x || [],
                      f: optResult.pareto_front[idx]?.f || [],
                      rank: idx + 1,
                    }));
                    onSendToSim!(rows);
                    setCheckedIdx(new Set());
                  }}
                >{checkedIdx.size > 0 ? `选中 ${checkedIdx.size} 项→仿真` : '选中→仿真'}</Button>
              </Tooltip>
            )}
            {checkedIdx.size > 0 && (
              <Button size="small" onClick={() => setCheckedIdx(new Set())}>清除</Button>
            )}
            <div style={{ flex: 1 }} />
            <Dropdown placement="bottomRight" menu={{ items: [
              { key: 'ref', label: '引用 imports（简练）', onClick: () => onDownloadModel(false) },
              { key: 'flat', label: '合并 imports（可独立迁移）', onClick: () => onDownloadModel(true) },
            ]}}>
              <Tooltip title="下载含 Pareto 前沿的模型 YAML">
                <Button size="small" icon={<DownloadOutlined />}>下载</Button>
              </Tooltip>
            </Dropdown>
          </div>
        )}
        {hasPareto ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>
              <thead>
                <tr style={{ color: c.textMute, borderBottom: `1px solid ${c.border}` }}>
                  {onSendToSim && <th style={{ padding: 4, width: 24 }}>
                    <input type="checkbox"
                      checked={checkedIdx.size === Math.min(resultRows.length, 80) && resultRows.length > 0}
                      onChange={e => {
                        if (e.target.checked) setCheckedIdx(new Set(resultRows.slice(0, 80).map((_: any, i: number) => i)));
                        else setCheckedIdx(new Set());
                      }}
                    />
                  </th>}
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
                {resultRows.slice(0, 80).map((row: any, rIdx: number) => {
                  const isRef = rIdx === refRowIdx;
                  return (
                    <tr key={row.key} style={{ borderBottom: `1px solid ${c.border}`, background: isRef ? (isDarkMode ? '#1a3a22' : '#f0faf0') : undefined }}>
                      {onSendToSim && <td style={{ padding: 4 }}>
                        <input type="checkbox"
                          checked={checkedIdx.has(rIdx)}
                          onChange={e => {
                            const next = new Set(checkedIdx);
                            if (e.target.checked) next.add(rIdx); else next.delete(rIdx);
                            setCheckedIdx(next);
                          }}
                        />
                      </td>}
                      <td style={{ padding: 4, color: isRef ? c.primary : c.textMute, fontWeight: isRef ? 700 : 400 }}>
                        {isRef ? '★' : row.rank}
                      </td>
                      {(optResult.best_x || []).map((_: any, i: number) => (
                        <td key={`xv-${i}`} style={{ textAlign: 'right', padding: 4, fontFamily: 'monospace', color: isRef ? c.primary : undefined }}>{row[`x${i + 1}`]?.toFixed?.(4) ?? '-'}</td>
                      ))}
                      {(optResult.objectives || []).map((_: any, i: number) => (
                        <td key={`fv-${i}`} style={{ textAlign: 'right', padding: 4, fontFamily: 'monospace', color: isRef ? c.primary : c.text }}>{row[`f${i + 1}`]?.toFixed?.(4) ?? '-'}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={optResult?.best_x ? '无 Pareto 表（单目标）' : '完成后显示解表'} />}
      </Section>

      <Section id="log" title="Log" badge={`${optLogs.length} 条`}>
        {logPanel}
      </Section>
    </div>
  );
};

export default SimOptTab;
