// sim_gui/src/components/Simulator.tsx
// Integrated Loader + 2-column Simulator layout (left tree+tabs / center stacked charts)

import React, { useState, useEffect, useRef } from 'react';

function useResize(initial: number, min = 150, max = 700, direction: 'right' | 'left' = 'right') {
  const [width, setWidth] = useState(initial);
  const wRef = useRef(width);
  wRef.current = width;
  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = wRef.current;
    const onMove = (ev: MouseEvent) => {
      const delta = direction === 'right' ? ev.clientX - startX : startX - ev.clientX;
      setWidth(Math.max(min, Math.min(max, startW + delta)));
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
  return { width, startDrag };
}


import {
  Button, Select, InputNumber, Tooltip, Tag, Switch,
  message, Spin, Alert, Empty, Input, Tree,
  Segmented, Collapse, Popover,
} from 'antd';
import {
  PlayCircleOutlined, PauseOutlined, StopOutlined, StepForwardOutlined,
  DownloadOutlined,
  LockOutlined, UnlockOutlined,
  BookOutlined, CheckCircleOutlined,
  PlusOutlined, MinusCircleOutlined,
  FileOutlined, FolderOutlined, FilterOutlined,
  UnorderedListOutlined, ClusterOutlined,
  LoadingOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type { SimulatorProps, SimulationDataPoint, SimulationState, StepUnit, DataNode, ModelFile } from '../types';
import { validateModFile } from '../core/validate';
import { useI18n } from '../core/i18n';

const API_BASE = '/api';

// Legacy flat entry — kept only for localStorage migration
interface InputEntry {
  id: string;
  variable: string;
  value: number;
  time: string;
}

// Regimen K×4: one scheduled behaviour (one model input variable)
interface RegimenEvent {
  id: string;
  time: string;   // 'HH:mm'
  value: number;
}

interface Regimen {
  id: string;
  variable: string;
  // valid_range: off = 永久有效
  validRangeEnabled: boolean;
  validStart: string;   // 'YYYY-MM-DD'
  validEnd: string;
  // events: (time, value) pairs
  events: RegimenEvent[];
  // days: off = 每天; on = custom weekdays
  daysEnabled: boolean;
  days: boolean[];      // [Mon,Tue,Wed,Thu,Fri,Sat,Sun]
}

// Per-regimen opt config (lock vs optimize per dimension)
interface RegimenOpt {
  timeLocked: boolean;
  timeMin: string;
  timeMax: string;
  valueLocked: boolean;
  valueMin: number;
  valueMax: number;
  daysLocked: boolean;
  daysMin: number;
}

function getC(dark: boolean) {
  return dark ? {
    bg: '#111111', panel: '#1a1a1a', border: '#2a2a2a',
    primary: '#52c41a', text: 'rgba(255,255,255,0.92)',
    textSec: 'rgba(255,255,255,0.75)', textMute: 'rgba(255,255,255,0.52)',
    inputBg: '#222222', sectionHd: '#111111', rowHover: 'rgba(82,196,26,0.1)',
  } : {
    bg: '#f5f5f5', panel: '#ffffff', border: '#e0e0e0',
    primary: '#007A33', text: '#1a2e22',
    textSec: '#6b7280', textMute: 'rgba(0,0,0,0.55)',
    inputBg: '#ffffff', sectionHd: '#efefef', rowHover: 'rgba(0,122,51,0.07)',
  };
}

// ─── Nice tick step helper ────────────────────────────────────────────────────
function niceTickStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / mag;
  let nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * mag;
}

function drawChartOnCtx(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  varName: string, data: SimulationDataPoint[], isDark: boolean, lineColor: string,
  runsData?: SimulationDataPoint[][]   // optional: per-run data for MC fan
) {
  ctx.clearRect(0, 0, W, H);
  const PAD = { l: 58, r: 12, t: 8, b: 28 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  if (data.length === 0) return;

  // Compute y-range across all runs (so fan fits the axis)
  let allValues = data.map(d => (d[varName] as number) ?? 0);
  if (runsData && runsData.length > 1) {
    for (const rd of runsData) {
      for (const d of rd) allValues.push((d[varName] as number) ?? 0);
    }
  }
  let minV = Math.min(...allValues); let maxV = Math.max(...allValues);
  if (minV === maxV) { minV -= 1; maxV += 1; }
  const step = niceTickStep(maxV - minV, 5);
  const yMin = Math.floor(minV / step) * step;
  const yMax = yMin + step * Math.ceil((maxV - yMin) / step || 1);
  const yActualRange = yMax - yMin || 1;
  const tMin = data[0].time ?? 0;
  const tMax = data[data.length - 1].time ?? 0;
  const tRange = tMax - tMin || 1;
  const toX = (t: number) => PAD.l + ((t - tMin) / tRange) * plotW;
  const toY = (v: number) => PAD.t + plotH - ((v - yMin) / yActualRange) * plotH;

  ctx.lineWidth = 1;
  const tickCount = Math.round((yMax - yMin) / step);
  for (let i = 0; i <= tickCount; i++) {
    const val = yMin + i * step;
    const y = toY(val);
    if (y < PAD.t - 1 || y > PAD.t + plotH + 1) continue;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)';
    ctx.font = '9px system-ui'; ctx.textAlign = 'right';
    const lbl = Math.abs(val) >= 1000 ? val.toExponential(1) : val % 1 === 0 ? String(val) : val.toFixed(2);
    ctx.fillText(lbl, PAD.l - 4, y + 3);
  }
  for (let i = 0; i <= 6; i++) {
    const x = PAD.l + (plotW / 6) * i;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + plotH); ctx.stroke();
    const t = tMin + (tRange / 6) * i;
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)';
    ctx.font = '9px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`${(t / 3600).toFixed(0)}h`, x, H - 6);
  }

  // Draw semi-transparent individual run lines (MC fan) — each run gets a distinct hue
  if (runsData && runsData.length > 1) {
    const runAlpha = Math.max(0.25, Math.min(0.6, 3.0 / runsData.length));
    ctx.save();
    ctx.lineWidth = 1.2;
    runsData.forEach((rd, runIdx) => {
      if (rd.length === 0) return;
      const hue = (runIdx * 360 / runsData.length + 30) % 360;
      ctx.strokeStyle = `hsla(${hue}, 75%, ${isDark ? 65 : 45}%, ${runAlpha})`;
      ctx.beginPath();
      rd.forEach((d, i) => {
        const x = toX(d.time ?? 0);
        const v = Math.max(yMin, Math.min(yMax, (d[varName] as number) ?? 0));
        const y = toY(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.restore();
  }

  // Draw mean (or single) line on top
  ctx.strokeStyle = lineColor; ctx.lineWidth = runsData && runsData.length > 1 ? 2 : 1.5;
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = toX(d.time ?? 0); const y = toY((d[varName] as number) ?? 0);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

// ─── SimChart component ───────────────────────────────────────────────────────
const VAR_COLORS = ['#007A33', '#52c41a', '#00897B', '#2E7D32', '#43A047', '#1565C0'];

const SimChart: React.FC<{
  varName: string;
  unit?: string;
  data: SimulationDataPoint[];
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  colorIndex?: number;
  hideTitleBar?: boolean;
  runsData?: SimulationDataPoint[][];
}> = ({ varName, unit, data, isDarkMode, c, colorIndex = 0, hideTitleBar = false, runsData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; time: number; value: number } | null>(null);

  const lineColor = VAR_COLORS[colorIndex % VAR_COLORS.length];

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
      drawChartOnCtx(ctx, canvas.offsetWidth, canvas.offsetHeight, varName, data, isDarkMode, lineColor,
        runsData && runsData.length > 1 ? runsData : undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [data, runsData, varName, isDarkMode, lineColor]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || data.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const PAD = { l: 58, r: 12, t: 8, b: 28 };
    const plotW = rect.width - PAD.l - PAD.r;
    const mouseX = e.clientX - rect.left;
    if (mouseX < PAD.l || mouseX > rect.width - PAD.r) { setHover(null); return; }

    const tMin = data[0].time ?? 0;
    const tMax = data[data.length - 1].time ?? 0;
    const tRange = tMax - tMin || 1;
    const frac = (mouseX - PAD.l) / plotW;
    const tTarget = tMin + frac * tRange;

    // Find nearest data point
    let nearest = data[0];
    let minDist = Math.abs((data[0].time ?? 0) - tTarget);
    for (const d of data) {
      const dist = Math.abs((d.time ?? 0) - tTarget);
      if (dist < minDist) { minDist = dist; nearest = d; }
    }

    setHover({ x: mouseX, time: nearest.time ?? 0, value: (nearest[varName] as number) ?? 0 });
  };

  const exportCSV = () => {
    const hasMC = runsData && runsData.length > 1;
    const runCols = hasMC ? runsData!.map((_, i) => `${varName}_run${i}`).join(',') : '';
    const header = hasMC ? `time_s,time_h,${varName}_mean,${runCols}` : `time_s,time_h,${varName}`;
    const rows = [header,
      ...data.map((d, idx) => {
        const base = `${d.time},${((d.time ?? 0) / 3600).toFixed(4)},${(d[varName] as number) ?? 0}`;
        if (!hasMC) return base;
        const runVals = runsData!.map(rd => (rd[idx]?.[varName] as number) ?? '').join(',');
        return `${base},${runVals}`;
      })];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = hasMC ? `${varName}_mc.csv` : `${varName}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const CANVAS_H = 160;

  return (
    <div
      ref={containerRef}
      style={{ marginBottom: 8, flexShrink: 0, position: 'relative', background: isDarkMode ? '#111111' : '#fafafa', border: `1px solid ${c.border}`, borderRadius: 6, overflow: 'hidden' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
    >
      {/* Title bar */}
      {!hideTitleBar && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '3px 10px', borderBottom: `1px solid ${c.border}`,
          background: isDarkMode ? '#1a1a1a' : '#f0f0f0',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: lineColor, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: c.text, fontSize: 12 }}>{varName}</span>
            {unit && <span style={{ color: c.textMute, fontSize: 11 }}>({unit})</span>}
          </div>
          <Button
            size="small" type="text" icon={<DownloadOutlined />}
            onClick={exportCSV}
            style={{ color: c.textMute, padding: '0 4px', fontSize: 11 }}
          >
            CSV
          </Button>
        </div>
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: CANVAS_H, display: 'block' }}
      />

      {/* Hover crosshair + tooltip */}
      {hover && (
        <>
          {/* Vertical line */}
          <div style={{
            position: 'absolute',
            left: hover.x,
            top: 28 + 8, // title bar height + canvas pad top
            bottom: 28,  // canvas pad bottom
            width: 1,
            background: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)',
            pointerEvents: 'none',
          }} />
          {/* Tooltip */}
          <div style={{
            position: 'absolute',
            left: hover.x + 8,
            top: 36,
            background: isDarkMode ? '#222' : '#fff',
            border: `1px solid ${c.border}`,
            borderRadius: 4,
            padding: '3px 7px',
            fontSize: 11,
            color: c.text,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          }}>
            <div style={{ color: c.textMute }}>{(hover.time / 3600).toFixed(2)} h</div>
            <div style={{ fontWeight: 600, color: lineColor }}>{hover.value.toFixed(4)}</div>
          </div>
        </>
      )}
    </div>
  );
};

// ─── ParetoChart component ────────────────────────────────────────────────────
const ParetoChart: React.FC<{
  result: any;
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
}> = ({ result, isDarkMode, c }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; pt: any } | null>(null);

  const PAD = { l: 52, r: 16, t: 16, b: 44 };
  const pts: Array<{x: number; y: number}> = (result.pareto_front || []).map((p: any) => ({
    x: p.f[0], y: p.f.length > 1 ? p.f[1] : 0,
  }));

  const obj0 = result.objectives?.[0];
  const obj1 = result.objectives?.[1];
  const labelX = obj0 ? `${obj0.variable} (${obj0.direction === 'maximize' ? 'max' : 'min'})` : 'Obj 1';
  const labelY = obj1 ? `${obj1.variable} (${obj1.direction === 'maximize' ? 'max' : 'min'})` : 'Obj 2';

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas || pts.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = isDarkMode ? '#111' : '#fff';
    ctx.fillRect(0, 0, W, H);

    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = xMax - xMin || 1, yRange = yMax - yMin || 1;
    const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
    const toCanvasX = (v: number) => PAD.l + ((v - xMin) / xRange) * plotW;
    const toCanvasY = (v: number) => PAD.t + plotH - ((v - yMin) / yRange) * plotH;

    // grid
    ctx.strokeStyle = isDarkMode ? '#222' : '#eee';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const x = PAD.l + (plotW / 4) * i;
      ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + plotH); ctx.stroke();
      const y = PAD.t + (plotH / 4) * i;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + plotW, y); ctx.stroke();
    }

    // axes labels
    ctx.fillStyle = isDarkMode ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
    ctx.font = '10px monospace'; ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const v = xMin + (xRange / 4) * i;
      ctx.fillText(v.toFixed(2), PAD.l + (plotW / 4) * i, H - 4);
    }
    ctx.save(); ctx.translate(10, PAD.t + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const v = yMin + (yRange / 4) * i;
      ctx.fillText(v.toFixed(2), -(plotH / 4) * i + plotH / 2, 8);
    }
    ctx.restore();

    // axis names
    ctx.fillStyle = isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(labelX, PAD.l + plotW / 2, H - 28);
    ctx.save(); ctx.translate(12, PAD.t + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(labelY, 0, 0); ctx.restore();

    // Pareto front line
    const sorted = [...pts].sort((a, b) => a.x - b.x);
    ctx.strokeStyle = isDarkMode ? '#52c41a' : '#007A33';
    ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath();
    sorted.forEach((p, i) => {
      const cx = toCanvasX(p.x), cy = toCanvasY(p.y);
      if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
    });
    ctx.stroke(); ctx.setLineDash([]);

    // points
    pts.forEach((p, i) => {
      const cx = toCanvasX(p.x), cy = toCanvasY(p.y);
      ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = isDarkMode ? '#52c41a' : '#007A33';
      ctx.fill();
      ctx.strokeStyle = isDarkMode ? '#111' : '#fff';
      ctx.lineWidth = 1.5; ctx.stroke();
    });
  };

  useEffect(() => { draw(); }, [result, isDarkMode]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || pts.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = xMax - xMin || 1, yRange = yMax - yMin || 1;
    const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
    const toCanvasX = (v: number) => PAD.l + ((v - xMin) / xRange) * plotW;
    const toCanvasY = (v: number) => PAD.t + plotH - ((v - yMin) / yRange) * plotH;
    let best: any = null, bestD = 15;
    (result.pareto_front || []).forEach((p: any) => {
      const cx = toCanvasX(p.f[0]), cy = toCanvasY(p.f.length > 1 ? p.f[1] : 0);
      const d = Math.hypot(mx - cx, my - cy);
      if (d < bestD) { bestD = d; best = { x: mx, y: my, pt: p }; }
    });
    setHover(best);
  };

  if (pts.length === 0) return null;

  return (
    <div style={{ position: 'relative', width: '100%', height: 280 }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)} />
      {hover && (
        <div style={{
          position: 'absolute', left: hover.x + 10, top: Math.max(0, hover.y - 10),
          background: isDarkMode ? '#1a1a1a' : '#fff',
          border: `1px solid ${c.border}`, borderRadius: 4, padding: '4px 8px',
          fontSize: 11, color: c.text, pointerEvents: 'none', whiteSpace: 'pre',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 10,
        }}>
          {(result.objectives || []).map((o: any, i: number) => (
            `${o.variable}: ${hover.pt.f[i]?.toFixed(4) ?? '-'}`
          )).join('\n')}
        </div>
      )}
    </div>
  );
};

// ─── localStorage persistence helpers ────────────────────────────────────────
const SIM_PERSIST_KEY = 'sim_persist';
const readSP = (): any => { try { return JSON.parse(localStorage.getItem(SIM_PERSIST_KEY) || 'null'); } catch { return null; } };
const writeSP = (data: object): void => { try { localStorage.setItem(SIM_PERSIST_KEY, JSON.stringify(data)); } catch {} };

// ─── Main component ───────────────────────────────────────────────────────────
const Simulator: React.FC<SimulatorProps> = ({
  selectedModel, state, setState,
  isLocked, setIsLocked, isDarkMode,
  storyTree, setStoryTree,
  expandedKeys, setExpandedKeys,
  storyViewMode, setStoryViewMode,
  storyFilter, setStoryFilter,
  loadedMods, setLoadedMods,
  setConfirmedModel, onModelSelect,
  simMode: mode, onSimModeChange: setMode,
}) => {
  const { t } = useI18n();
  const c = getC(isDarkMode);
  const { width: leftW, startDrag: startLeftDrag } = useResize(280, 160, 400);

  const {
    status, progress, currentStep, simulationData, dataPerRun,
    inputParams, stateVariables, sessionId,
    simStartDate, simEndDate, stepValue, stepUnit, batchSize, updateInterval,
    simRuns, sessionSeed,
  } = state;

  // ── loader state ─────────────────────────────────────────────────────────────
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => readSP()?.selectedKey || null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const selectedStory = selectedKey ? loadedMods[selectedKey] ?? null : null;

  // ── center tab ───────────────────────────────────────────────────────────────
  const [centerTab, setCenterTab] = useState<'setup' | 'plot' | 'report'>('setup');

  // ── report tab ───────────────────────────────────────────────────────────────
  const ALL_REPORT_SECTIONS = [
    { key: 'intro',      label: '简介',       desc: '模型背景与适用场景说明' },
    { key: 'overview',   label: '模型概览',   desc: '名称、描述、标签、变量总数' },
    { key: 'formulas',   label: '方程列表',   desc: '所有方程含义及激活条件' },
    { key: 'variables',  label: '变量汇总',   desc: '所有变量类型、含义及最终值' },
    { key: 'simcfg',     label: '仿真配置',   desc: '时间范围、步长、输入参数值' },
    { key: 'plots',      label: 'Plot 曲线',  desc: '各输出变量仿真轨迹图' },
    { key: 'opt',        label: '优化结果',   desc: '目标函数、约束条件及结果' },
    { key: 'refs',       label: '参考文献',   desc: 'IEEE 编号格式引用列表' },
  ] as const;
  type ReportSection = typeof ALL_REPORT_SECTIONS[number]['key'];
  const [reportSections, setReportSections] = useState<Set<ReportSection>>(
    new Set(['intro', 'overview', 'formulas', 'variables', 'simcfg', 'plots', 'refs'])
  );
  const [openReportPreviews, setOpenReportPreviews] = useState<Set<ReportSection>>(
    new Set(['intro', 'overview', 'formulas', 'variables', 'simcfg'])
  );
  const [reportGenerating, setReportGenerating] = useState(false);

  // ── left panel sections ───────────────────────────────────────────────────────
  const SECTION_H = 26; // header height px
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(readSP()?.openSections || ['scene', 'inputs']));
  const [sectionWeights, setSectionWeights] = useState<Record<string, number>>(() => readSP()?.sectionWeights || { scene: 2, inputs: 1, vars: 1, formulas: 1, opt: 1 });
  const leftPanelRef = useRef<HTMLDivElement>(null);

  // ── opt mode state ───────────────────────────────────────────────────────────
  const [optRanges, setOptRanges] = useState<Record<string, { min: number; max: number; locked: boolean }>>({});
  const [objectives, setObjectives] = useState<Array<{ variable: string; direction: 'minimize' | 'maximize' }>>([]);
  const [constraints, setConstraints] = useState<Array<{ variable: string; op: '≤' | '≥'; value: number }>>([]);
  const [optAlgo, setOptAlgo] = useState<'NSGA-II' | 'MOEA/D' | 'l-bfgs-b' | 'nelder-mead'>('NSGA-II');
  const [optPop, setOptPop] = useState(100);
  const [optGen, setOptGen] = useState(200);
  const [optResult, setOptResult] = useState<any>(null);
  const [optRunning, setOptRunning] = useState(false);

  // ── regimen K×4 state ───────────────────────────────────────────────────────
  const [regimens, setRegimens] = useState<Regimen[]>(() => {
    const saved = readSP();
    // migrate legacy inputEntries if present
    if (saved?.regimens) return saved.regimens;
    if (saved?.inputEntries?.length) {
      return (saved.inputEntries as InputEntry[]).map(e => ({
        id: e.id, variable: e.variable,
        validRangeEnabled: false, validStart: '', validEnd: '',
        events: [{ id: `${e.id}-ev`, time: e.time, value: e.value }],
        daysEnabled: false, days: [true, true, true, true, true, true, true],
      }));
    }
    return [];
  });
  const [regimenOpts, setRegimenOpts] = useState<Record<string, RegimenOpt>>({});

  const isRunningRef = useRef(false);
  // refs for restore flow
  const pendingRestoreKey = useRef<string | null>(readSP()?.selectedKey || null);
  const skipInputInitRef = useRef<boolean>(!!(readSP()?.inputEntries?.length));
  const isInitialMount = useRef(true);

  const STEP_UNITS: Record<StepUnit, number> = { day: 86400, hour: 3600, minute: 60, second: 1 };

  const dateToHours = (start: string, end: string) =>
    Math.max(0, (new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 3_600_000);

  const totalSecondsToEndDate = (startDate: string, totalSec: number): string => {
    const d = new Date(startDate + 'T00:00:00');
    d.setSeconds(d.getSeconds() + Math.round(totalSec));
    return d.toISOString().slice(0, 10);
  };

  // ── helpers ──────────────────────────────────────────────────────────────────
  const set = <K extends keyof SimulationState>(key: K, val: SimulationState[K]) =>
    setState(prev => ({ ...prev, [key]: val }));
  const setSimData = (val: SimulationDataPoint[] | ((p: SimulationDataPoint[]) => SimulationDataPoint[])) =>
    setState(prev => ({ ...prev, simulationData: typeof val === 'function' ? val(prev.simulationData) : val }));

  // ── init on model load ───────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedModel?.content?.variables) {
      const inputs: Record<string, number> = {};
      const states: Record<string, number> = {};
      const newRegimens: Regimen[] = [];
      const newRegimenOpts: Record<string, RegimenOpt> = {};
      const schedData: Record<string, any> = selectedModel.content?.simulation?.schedules ?? {};

      const secsToHHMM = (sec: number): string => {
        const s = sec % 86400;
        const hh = String(Math.floor(s / 3600)).padStart(2, '0');
        const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
        return `${hh}:${mm}`;
      };

      Object.entries(selectedModel.content.variables).forEach(([name, data]: [string, any]) => {
        if (data.type === 'input') {
          inputs[name] = data.value;
          const sched = schedData[name];
          let events: RegimenEvent[];
          if (sched?.points?.length) {
            const seen = new Set<string>();
            events = (sched.points as any[])
              .map((pt, i) => ({ id: `${name}-ev${i}`, time: secsToHHMM(pt.time ?? 0), value: pt.value ?? 0 }))
              .filter(ev => { if (seen.has(ev.time)) return false; seen.add(ev.time); return true; });
          } else {
            events = [{ id: `${name}-ev0`, time: '08:00', value: data.value ?? 0 }];
          }
          newRegimens.push({
            id: `${name}-0`,
            variable: name,
            validRangeEnabled: false,
            validStart: '',
            validEnd: '',
            events,
            daysEnabled: false,
            days: [true, true, true, true, true, true, true],
          });
          const v = data.value as number;
          newRegimenOpts[`${name}-0`] = {
            timeLocked: true, timeMin: '06:00', timeMax: '22:00',
            valueLocked: true, valueMin: 0, valueMax: v * 2 || 1,
            daysLocked: true, daysMin: 3,
          };
        } else if (data.type === 'state') states[name] = data.value;
      });
      set('inputParams', inputs);
      set('stateVariables', states);
      if (skipInputInitRef.current) {
        skipInputInitRef.current = false;
      } else {
        setRegimens(newRegimens);
        setRegimenOpts(newRegimenOpts);
      }
      const ranges: typeof optRanges = {};
      Object.entries(inputs).forEach(([name, val]) => {
        ranges[name] = { min: 0, max: (val as number) * 2 || 1, locked: true };
      });
      setOptRanges(ranges);
    }
    const sim = selectedModel?.content?.simulation ?? selectedModel?.content?.simulator;
    const DEFAULT_START = '2026-01-01';
    const DEFAULT_END   = '2026-12-31';
    const toStepUnit = (u: string): StepUnit => {
      if (u === 'day') return 'day';
      if (u === 'hour') return 'hour';
      if (u === 'minute') return 'minute';
      if (u === 'second') return 'second';
      return 'day';   // week/month/year → show as day in UI
    };
    if (sim) {
      // ── new format: start_date / end_date; step from metadata.step_size ──
      if (sim.start_date && sim.end_date) {
        set('simStartDate', String(sim.start_date));
        set('simEndDate',   String(sim.end_date));
        // metadata.step_size 优先；向后兼容 simulation.step / step_unit
        const metaStep = selectedModel?.content?.metadata?.step_size;
        if (metaStep?.unit) {
          set('stepValue', metaStep.value ?? 1);
          set('stepUnit',  toStepUnit(String(metaStep.unit)));
        } else {
          set('stepValue', sim.step ?? 1);
          set('stepUnit',  toStepUnit(String(sim.step_unit || 'minute')));
        }
      } else {
        // ── legacy fallback: step_size / time_unit / total_time ──
        const UNIT_SEC: Record<string, number> = {
          second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000,
        };
        const timeUnit  = String(sim.time_unit || 'hour').toLowerCase();
        const rawStep   = sim.step_size ?? 1;
        const totalSec  = (sim.total_time ?? 365) * rawStep * (UNIT_SEC[timeUnit] ?? 3600);
        set('stepValue', rawStep);
        set('stepUnit', toStepUnit(timeUnit));
        set('simStartDate', DEFAULT_START);
        set('simEndDate', totalSecondsToEndDate(DEFAULT_START, totalSec));
      }
    } else {
      set('stepValue', 1);
      set('stepUnit', 'hour');
      set('simStartDate', DEFAULT_START);
      set('simEndDate', DEFAULT_END);
    }

    // ── 读取 optimizer 块，预填 objectives / constraints / algorithm ──────────
    const optBlock: any = selectedModel?.content?.optimizer;
    if (optBlock && optBlock.enabled !== false) {
      // 解析 objectives（支持单目标 objective:{} 和多目标 objectives:[]）
      const parseDir = (d: string): 'minimize' | 'maximize' =>
        d === 'maximize' ? 'maximize' : 'minimize';

      const rawObjs: Array<{ variable: string; direction: 'minimize' | 'maximize' }> = [];
      if (optBlock.objective) {
        rawObjs.push({ variable: optBlock.objective.variable || '', direction: parseDir(optBlock.objective.direction || 'minimize') });
      }
      if (Array.isArray(optBlock.objectives)) {
        optBlock.objectives.forEach((o: any) => {
          rawObjs.push({ variable: o.variable || '', direction: parseDir(o.direction || 'minimize') });
        });
      }
      if (rawObjs.length > 0) setObjectives(rawObjs);

      // 解析 constraints（condition: "<= 160" → op + value）
      const parseCondition = (cond: string): { op: '≤' | '≥'; value: number } | null => {
        const m = cond.trim().match(/^([<>]=?)\s*(-?\d+(?:\.\d+)?)/);
        if (!m) return null;
        return { op: m[1] === '>=' || m[1] === '>' ? '≥' : '≤', value: parseFloat(m[2]) };
      };
      if (Array.isArray(optBlock.constraints)) {
        const parsedCons: Array<{ variable: string; op: '≤' | '≥'; value: number }> = [];
        optBlock.constraints.forEach((con: any) => {
          const parsed = parseCondition(String(con.condition || ''));
          if (parsed && con.variable) parsedCons.push({ variable: con.variable, ...parsed });
        });
        if (parsedCons.length > 0) setConstraints(parsedCons);
      }

      // 解析算法参数
      const methodMap: Record<string, string> = {
        'nsga2': 'NSGA-II', 'nsga-2': 'NSGA-II', 'nsga_2': 'NSGA-II',
        'moead': 'MOEA/D', 'moea/d': 'MOEA/D',
        'l-bfgs-b': 'l-bfgs-b', 'lbfgsb': 'l-bfgs-b',
        'nelder-mead': 'nelder-mead', 'nelder_mead': 'nelder-mead',
      };
      const rawMethod = String(optBlock.method || '').toLowerCase();
      const mappedMethod = methodMap[rawMethod];
      if (mappedMethod) setOptAlgo(mappedMethod as any);

      const algoBlock = optBlock.algorithm || {};
      if (algoBlock.population_size) setOptPop(Number(algoBlock.population_size));
      if (algoBlock.n_generations)   setOptGen(Number(algoBlock.n_generations));

      // MC 运行次数
      if (optBlock.mc?.enabled && optBlock.mc?.sim_runs) {
        set('simRuns', Math.max(1, Math.min(50, Number(optBlock.mc.sim_runs))));
      }
    }
  }, [selectedModel]);

  // ── sync regimens → inputParams ─────────────────────────────────────────────
  // Simple aggregation: sum all event values per variable (backend gets totals per step)
  useEffect(() => {
    const params: Record<string, number> = {};
    regimens.forEach(r => {
      const total = r.events.reduce((s, e) => s + e.value, 0);
      params[r.variable] = (params[r.variable] ?? 0) + total;
    });
    set('inputParams', params);
  }, [regimens]);

  // ── load tree on mount + restore selected model ──────────────────────────────
  useEffect(() => {
    if (storyTree.length === 0) loadFileTree();
  }, []);

  useEffect(() => {
    const key = pendingRestoreKey.current;
    if (!key || storyTree.length === 0) return;
    pendingRestoreKey.current = null;
    if (loadedMods[key]) {
      setConfirmedModel(loadedMods[key]);
      onModelSelect(loadedMods[key]);
    } else {
      loadFileContent(key);
    }
  }, [storyTree]);

  // ── restore SimulationState from localStorage on mount ───────────────────────
  useEffect(() => {
    const saved = readSP();
    if (!saved) return;
    setState(prev => ({
      ...prev,
      simulationData: saved.simulationData || [],
      status: saved.status === 'paused' ? 'completed' : (saved.status || 'idle'),
      currentStep: saved.currentStep ?? 0,
      progress: saved.progress ?? 0,
      // restore dates — skip legacy '2000-01-01' default so new default kicks in
      ...(saved.simStartDate && saved.simStartDate !== '2000-01-01' && { simStartDate: saved.simStartDate }),
      ...(saved.simEndDate && saved.simEndDate !== '2001-01-01' && { simEndDate: saved.simEndDate }),
      ...(saved.stepValue != null && { stepValue: saved.stepValue }),
      ...(saved.stepUnit && { stepUnit: saved.stepUnit }),
    }));
    if (saved.isLocked) setIsLocked(true);
  }, []);

  // ── reset validation on selection change (skip on initial mount) ──────────────
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    setValidationResult(null);
    setIsLocked(false);
  }, [selectedKey]);

  // ── persist config to localStorage ───────────────────────────────────────────
  useEffect(() => {
    const current = readSP() || {};
    writeSP({ ...current, selectedKey, mode, regimens, regimenOpts, isLocked, openSections: [...openSections], sectionWeights, simStartDate, simEndDate, stepValue, stepUnit });
  }, [selectedKey, mode, regimens, regimenOpts, isLocked, openSections, sectionWeights, simStartDate, simEndDate, stepValue, stepUnit]);

  // ── persist simulation results on status settle ───────────────────────────────
  useEffect(() => {
    if (status === 'running') return; // skip during active run to avoid constant writes
    const current = readSP() || {};
    writeSP({ ...current, simulationData, status, currentStep, progress });
  }, [status]); // captures simulationData snapshot at the moment status changes

  // ── auto-switch center tab to plot when sim is running/completed ──────────────
  useEffect(() => {
    if (status === 'running' || status === 'completed') setCenterTab('plot');
  }, [status]);

  // ── loader helpers ────────────────────────────────────────────────────────────
  const loadFileTree = async () => {
    setTreeLoading(true);
    try {
      const result = await fetch(`${API_BASE}/files`).then(r => r.json());
      if (result.success) {
        const convert = (items: any[]): DataNode[] => items.map(item => {
          const titleStr = item.type === 'file' ? item.title.replace(/\.ya?ml$/, '') : item.title;
          if (item.type === 'folder' && item.children?.length === 1) {
            const child = item.children[0];
            if (child.type === 'file' && (child.title === 'mod.yaml' || child.title === 'mod.yml')) {
              return {
                key: child.key, isLeaf: true, ...child,
                icon: <FolderOutlined style={{ color: c.primary }} />,
                title: <span>{item.title} <Tag color="blue" style={{}}>pkg</Tag></span>,
                titleStr: item.title, mod_type: 'story',
              };
            }
          }
          const isModel = item.key?.startsWith('models/');
          return {
            title: item.type === 'file'
              ? <span>{titleStr}{item.mod_type && <Tag color={isModel ? 'purple' : 'blue'} style={{ marginLeft: 6 }}>{item.mod_type}</Tag>}</span>
              : item.title,
            key: item.key,
            icon: item.type === 'folder' ? <FolderOutlined /> : <FileOutlined />,
            isLeaf: item.type === 'file',
            children: item.children ? convert(item.children) : undefined,
            titleStr, mod_type: item.mod_type,
          };
        });
        const modsNode = result.data.find((n: any) => n.key === 'models');
        if (modsNode?.children) {
          const sNode = modsNode.children.find((n: any) => n.key === 'scenarios');
          const mNode = modsNode.children.find((n: any) => n.key === 'components');
          const scenarioItems: DataNode[] = sNode ? convert(sNode.children || []) : [];
          const modelItems: DataNode[] = mNode ? convert(mNode.children || []) : [];
          const combined: DataNode[] = [
            ...(scenarioItems.length ? [{
              key: '__group_scenarios',
              title: <span style={{ fontWeight: 600, fontSize: 11, opacity: 0.6, letterSpacing: 1 }}>SCENARIOS</span>,
              isLeaf: false, selectable: false, icon: null, children: scenarioItems,
            } as DataNode] : []),
            ...(modelItems.length ? [{
              key: '__group_models',
              title: <span style={{ fontWeight: 600, fontSize: 11, opacity: 0.6, letterSpacing: 1 }}>MODELS</span>,
              isLeaf: false, selectable: false, icon: null, children: modelItems,
            } as DataNode] : []),
          ];
          setStoryTree(combined);
        }
      }
    } catch (e: any) {
      message.error(`${t('sim.msg.load_failed')}: ${e.message}`);
    } finally {
      setTreeLoading(false);
    }
  };

  const loadFileContent = async (filePath: string) => {
    setTreeLoading(true);
    try {
      const cleanPath = filePath.replace(/^mods\//, '');
      const fileResult = await fetch(`${API_BASE}/file/${cleanPath}`).then(r => r.json());
      if (!fileResult.success) { message.error(`${t('sim.msg.read_failed')}: ${fileResult.error}`); return; }
      const { content, path } = fileResult.data;
      const model: ModelFile = {
        key: filePath, title: content.metadata?.name || path.split('/').pop()?.replace('.yaml', '') || 'unknown',
        path: filePath, type: content.type, category: content.category,
        content, metadata: content.metadata, variables: content.variables,
        formulas: content.formulas, simulator: content.simulator,
        optimizer: content.optimizer, imports: content.imports,
        // Use full directory path so the loader can find the file regardless of metadata.name
        folder: path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : undefined,
        validated: undefined, validationErrors: [],
      };
      setLoadedMods(prev => ({ ...prev, [filePath]: model }));
      setConfirmedModel(model);
      onModelSelect(model);
    } catch (e: any) {
      message.error(`${t('sim.msg.load_failed')}: ${e.message}`);
    } finally {
      setTreeLoading(false);
    }
  };

  const handleSelect = (keys: React.Key[]) => {
    if (!keys.length) return;
    const key = keys[0] as string;
    if (!key.endsWith('.yaml') && !key.endsWith('.yml')) return;
    setSelectedKey(key);
    setValidationResult(null);
    if (!loadedMods[key]) loadFileContent(key);
    else {
      setConfirmedModel(loadedMods[key]);
      onModelSelect(loadedMods[key]);
    }
  };

  const handleValidateAndLock = async () => {
    if (!selectedKey) return;
    setValidating(true);
    setValidationResult(null);
    const result = await validateModFile(selectedKey);
    if (result.valid) {
      setValidationResult(null);
      setIsLocked(true);
      const isComponent = selectedModel?.content?.metadata?.standalone === false;
      if (isComponent) {
        message.warning(t('sim.msg.validation_ok') + ' — ' + t('sim.msg.component_model_hint'));
      } else {
        message.success(t('sim.msg.validation_ok'));
      }
    } else {
      setValidationResult(result);
      setIsLocked(false);
    }
    setValidating(false);
  };

  // ── derived data ──────────────────────────────────────────────────────────────
  const latestData = simulationData[simulationData.length - 1] || { step: 0, time: 0 };
  const inputVars = selectedModel?.content?.variables
    ? Object.entries(selectedModel.content.variables)
        .filter(([, d]: [string, any]) => d.type === 'input')
        .map(([name, d]: [string, any]) => ({ name, ...d }))
    : [];
  const stateVars = selectedModel?.content?.variables
    ? Object.entries(selectedModel.content.variables)
        .filter(([, d]: [string, any]) => d.type === 'state')
        .map(([name, d]: [string, any]) => ({ name, ...d }))
    : [];
  const DIST_RE = /^\s*(normal|uniform|lognormal)\s*\(/;
  const probConsts = selectedModel?.content?.variables
    ? Object.entries(selectedModel.content.variables)
        .filter(([, d]: [string, any]) =>
          d.type === 'probability_constant' ||
          d.type === 'probability' ||
          (d.type === 'parameter' && typeof d.value === 'string' && DIST_RE.test(d.value))
        )
        .map(([name, d]: [string, any]) => ({ name, ...d }))
    : [];
  const formulas: Record<string, any> = selectedModel?.content?.formulas || {};
  const outputVars: string[] = selectedModel?.content?.simulator?.output_variables
    || selectedModel?.content?.simulation?.output_variables
    || Object.keys(stateVariables).slice(0, 5);
  const allVarNames = [...inputVars.map(v => v.name), ...stateVars.map(v => v.name)];

  // flatten tree for list view
  const flattenTree = (nodes: DataNode[]): any[] => {
    let flat: any[] = [];
    nodes.forEach(n => {
      if (n.isLeaf) flat.push({ ...n, displayTitle: (n as any).titleStr || (typeof n.title === 'string' ? n.title : '') });
      if (n.children?.length) flat = [...flat, ...flattenTree(n.children)];
    });
    return flat;
  };
  const storyList = flattenTree(storyTree)
    .filter(n => !storyFilter || n.titleStr?.toLowerCase().includes(storyFilter.toLowerCase()));

  // ── sim control ───────────────────────────────────────────────────────────────
  const startSimulation = async () => {
    if (!selectedModel) return;
    try {
      set('status', 'running'); set('progress', 0); set('currentStep', 0);
      setSimData([]);
      setState(prev => ({ ...prev, dataPerRun: [], sessionSeed: 0 }));
      isRunningRef.current = true;
      const resp = await fetch(`${API_BASE}/simulation/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: selectedModel.key.split('/').pop()?.replace(/\.ya?ml$/i, '') || selectedModel.content!.metadata.name,
          folder: selectedModel.folder,
          time_hours: dateToHours(simStartDate, simEndDate),
          step_size: stepValue * STEP_UNITS[stepUnit],
          input_params: inputParams,
          regimens: regimens.map(r => ({
            variable: r.variable,
            events: r.events,
            days_enabled: r.daysEnabled,
            days: r.days,
            valid_range_enabled: r.validRangeEnabled,
            valid_start: r.validStart,
            valid_end: r.validEnd,
          })),
          sim_runs: simRuns,
        }),
      });
      const result = await resp.json();
      if (result.success && result.data) {
        set('sessionId', result.data.session_id);
        set('totalSteps', result.data.total_steps);
        if (result.data.session_seed) set('sessionSeed', result.data.session_seed);
        runBatch(result.data.session_id);
      } else {
        message.error(result.error || t('sim.msg.start_failed'));
        set('status', 'idle'); isRunningRef.current = false;
      }
    } catch (e: any) { message.error(e.message); set('status', 'idle'); isRunningRef.current = false; }
  };

  const runBatch = async (sid: string) => {
    const loop = async () => {
      if (!isRunningRef.current) return;
      try {
        const r = await fetch(`${API_BASE}/simulation/batch`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sid, steps: batchSize, input_changes: inputParams }),
        });
        const res = await r.json();
        if (res.success && res.data) {
          set('currentStep', res.data.current_step);
          set('progress', res.data.progress);
          setSimData(prev => [...prev, ...res.data.outputs]);

          // Accumulate per-run data for MC fan display
          if (res.data.outputs_per_run && res.data.sim_runs > 1) {
            setState(prev => {
              const incoming: SimulationDataPoint[][] = res.data.outputs_per_run;
              const existing = prev.dataPerRun.length > 0 ? prev.dataPerRun : Array.from({ length: incoming.length }, () => []);
              const merged = existing.map((runArr, i) => [
                ...runArr,
                ...(incoming[i] || []),
              ]);
              return { ...prev, dataPerRun: merged };
            });
          }

          if (res.data.completed) {
            set('status', 'completed'); isRunningRef.current = false;
            message.success(t('sim.msg.sim_complete'));
          } else setTimeout(loop, updateInterval);
        } else {
          message.error(res.error || t('sim.msg.start_failed'));
          set('status', 'idle'); isRunningRef.current = false;
        }
      } catch { set('status', 'idle'); isRunningRef.current = false; }
    };
    loop();
  };

  const runSingleStep = async () => {
    if (!sessionId) return;
    try {
      const r = await fetch(`${API_BASE}/simulation/batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, steps: 1, input_changes: inputParams }),
      });
      const res = await r.json();
      if (res.success && res.data) {
        set('currentStep', res.data.current_step);
        set('progress', res.data.progress);
        setSimData(prev => [...prev, ...res.data.outputs]);
        set('status', res.data.completed ? 'completed' : 'paused');
        if (res.data.completed) message.success(t('sim.msg.sim_complete'));
      }
    } catch (e: any) { message.error(e.message); }
  };

  const pauseSimulation = () => { isRunningRef.current = false; set('status', 'paused'); };
  const resumeSimulation = () => { if (!sessionId) return; isRunningRef.current = true; set('status', 'running'); runBatch(sessionId); };
  const resetSimulation = () => {
    isRunningRef.current = false;
    set('status', 'idle'); set('progress', 0); set('currentStep', 0); setSimData([]);
    setState(prev => ({ ...prev, dataPerRun: [], sessionSeed: 0 }));
    setOptResult(null);
  };

  const startOptimization = async () => {
    if (!selectedModel) return;
    const modelKey = selectedModel.key.split('/').pop()?.replace(/\.ya?ml$/i, '') || selectedModel.content!.metadata.name;
    try {
      setOptRunning(true); setOptResult(null);
      set('status', 'running'); set('progress', 0);
      const resp = await fetch(`${API_BASE}/optimizer/run_yaml`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: modelKey, folder: selectedModel.folder }),
      });
      const result = await resp.json();
      if (resp.ok && result.success) {
        setOptResult(result);
        set('status', 'completed'); set('progress', 100);
        message.success(`优化完成，${result.n_solutions} 个 Pareto 解`);
      } else {
        message.error(result.detail || result.error || '优化失败');
        set('status', 'idle');
      }
    } catch (e: any) {
      message.error(e.message);
      set('status', 'idle');
    } finally {
      setOptRunning(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // LEFT PANEL TAB CONTENT RENDERERS
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Regimen helpers ───────────────────────────────────────────────────────────
  const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

  const updateRegimen = (id: string, patch: Partial<Regimen>) =>
    setRegimens(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const addNewRegimen = () => {
    const firstVar = inputVars[0];
    if (!firstVar) return;
    const id = `reg-${Date.now()}`;
    setRegimens(prev => [...prev, {
      id, variable: firstVar.name,
      validRangeEnabled: false, validStart: '', validEnd: '',
      events: [{ id: `${id}-ev0`, time: '08:00', value: firstVar.value ?? 0 }],
      daysEnabled: false, days: [true, true, true, true, true, true, true],
    }]);
    setRegimenOpts(prev => ({
      ...prev,
      [id]: { timeLocked: true, timeMin: '06:00', timeMax: '22:00', valueLocked: true, valueMin: 0, valueMax: (firstVar.value ?? 0) * 2 || 1, daysLocked: true, daysMin: 3 },
    }));
  };

  const removeRegimen = (id: string) => {
    setRegimens(prev => prev.filter(r => r.id !== id));
    setRegimenOpts(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const addEvent = (regimenId: string) =>
    setRegimens(prev => prev.map(r => {
      if (r.id !== regimenId || r.events.length >= 6) return r;
      const times = ['08:00', '12:00', '18:00', '20:00', '22:00', '06:00'];
      const varDef = inputVars.find(v => v.name === r.variable);
      return { ...r, events: [...r.events, { id: `${regimenId}-ev${Date.now()}`, time: times[r.events.length % times.length], value: varDef?.value ?? 0 }] };
    }));

  const updateEvent = (regimenId: string, evId: string, patch: Partial<RegimenEvent>) =>
    setRegimens(prev => prev.map(r => r.id !== regimenId ? r : {
      ...r, events: r.events.map(e => e.id === evId ? { ...e, ...patch } : e),
    }));

  const removeEvent = (regimenId: string, evId: string) =>
    setRegimens(prev => prev.map(r => r.id !== regimenId ? r : {
      ...r, events: r.events.filter(e => e.id !== evId),
    }));

  const updateRegimenOpt = (id: string, patch: Partial<RegimenOpt>) =>
    setRegimenOpts(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));

  const renderInputsContent = () => {
    if (inputVars.length === 0)
      return <div style={{ padding: '8px 0' }}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('sim.inputs.empty')} /></div>;

    const isOpt = mode === 'opt';
    const blockBase: React.CSSProperties = {
      flex: '3 1 150px', minWidth: 130,
      border: `1px solid ${c.border}`, borderRadius: 6,
      padding: '6px 8px', background: c.sectionHd,
    };
    const blockLabel: React.CSSProperties = { color: c.textMute, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 };

    return (
      <div style={{ padding: '4px 0' }}>

        {/* ── Add new Regimen ── */}
        {inputVars.length > 0 && (
          <Button size="small" icon={<PlusOutlined />} block type="dashed"
            onClick={addNewRegimen}
            style={{ borderColor: c.primary, color: c.primary, marginBottom: 10 }}>
            新增摄入计划
          </Button>
        )}

        {/* ── Regimen cards ── */}
        {regimens.map(r => {
          const varDef = inputVars.find(v => v.name === r.variable);
          const opt: RegimenOpt = regimenOpts[r.id] || { timeLocked: true, timeMin: '06:00', timeMax: '22:00', valueLocked: true, valueMin: 0, valueMax: 1, daysLocked: true, daysMin: 3 };
          const unit = varDef?.unit ?? '';

          return (
            <div key={r.id} style={{ border: `1px solid ${c.border}`, borderRadius: 8, marginBottom: 10, background: c.inputBg, overflow: 'hidden' }}>

              {/* ── Header: variable selector ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: c.sectionHd, borderBottom: `1px solid ${c.border}` }}>
                <Select
                  size="small" value={r.variable} style={{ flex: 1 }}
                  options={inputVars.map(v => ({ label: `${v.name}${v.unit ? ` (${v.unit})` : ''}`, value: v.name }))}
                  onChange={val => {
                    const vd = inputVars.find(v => v.name === val);
                    updateRegimen(r.id, { variable: val, events: [{ id: `${r.id}-ev${Date.now()}`, time: '08:00', value: vd?.value ?? 0 }] });
                  }}
                />
                <Button size="small" type="text" danger icon={<MinusCircleOutlined />}
                  onClick={() => removeRegimen(r.id)} style={{ padding: '0 4px', flexShrink: 0 }} />
              </div>

              {/* ── Body: 3 blocks in a flex-wrap row ── */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px' }}>

                {/* Block 1: 时刻 / 摄入量 */}
                <div style={blockBase}>
                  <div style={{ ...blockLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>时刻 → 摄入量{unit ? ` (${unit})` : ''}</span>
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                      {isOpt && (
                        <Tag style={{ cursor: 'pointer', userSelect: 'none', fontSize: 10, margin: 0 }}
                          color={opt.valueLocked ? undefined : 'processing'}
                          onClick={() => updateRegimenOpt(r.id, { valueLocked: !opt.valueLocked })}>
                          {opt.valueLocked ? '🔒' : '🔀'}
                        </Tag>
                      )}
                      {r.events.length < 6 && (
                        <Button size="small" type="text" icon={<PlusOutlined />}
                          onClick={() => addEvent(r.id)}
                          style={{ color: c.primary, padding: '0 2px', height: 16, lineHeight: '16px' }} />
                      )}
                    </div>
                  </div>
                  {r.events.map(ev => (
                    <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 4 }}>
                      <Input size="small" value={ev.time} placeholder="08:00"
                        onChange={e => updateEvent(r.id, ev.id, { time: e.target.value })}
                        style={{ width: 62, fontFamily: 'monospace' }} />
                      <span style={{ color: c.textMute, fontSize: 11 }}>→</span>
                      {isOpt && !opt.valueLocked ? (
                        <>
                          <InputNumber size="small" value={opt.valueMin} placeholder="min"
                            onChange={v => updateRegimenOpt(r.id, { valueMin: v ?? 0 })}
                            min={varDef?.bounds?.[0] ?? 0} style={{ width: 52 }} />
                          <span style={{ color: c.textMute, fontSize: 10 }}>~</span>
                          <InputNumber size="small" value={opt.valueMax} placeholder="max"
                            onChange={v => updateRegimenOpt(r.id, { valueMax: v ?? 1 })}
                            max={varDef?.bounds?.[1]} style={{ width: 52 }} />
                        </>
                      ) : (
                        <InputNumber size="small" value={ev.value}
                          onChange={v => updateEvent(r.id, ev.id, { value: v ?? 0 })}
                          min={varDef?.bounds?.[0] ?? 0} max={varDef?.bounds?.[1]}
                          style={{ flex: 1, minWidth: 60 }} />
                      )}
                      {r.events.length > 1 && (
                        <Button size="small" type="text" danger icon={<MinusCircleOutlined />}
                          onClick={() => removeEvent(r.id, ev.id)}
                          style={{ padding: '0 1px', flexShrink: 0 }} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Block 2: days 执行日（靠左，tag compact） */}
                <div style={{ ...blockBase, flex: '3 1 130px', minWidth: 120 }}>
                  <div style={{ ...blockLabel, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>执行日</span>
                    <Switch size="small" checked={r.daysEnabled}
                      onChange={v => updateRegimen(r.id, { daysEnabled: v })} />
                  </div>
                  {r.daysEnabled ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                      {DAY_LABELS.map((label, i) => (
                        <Tag key={i}
                          style={{ cursor: 'pointer', userSelect: 'none', margin: 0, padding: '1px 5px', fontSize: 11 }}
                          color={r.days[i] ? 'success' : undefined}
                          onClick={() => {
                            const nd = [...r.days]; nd[i] = !nd[i];
                            updateRegimen(r.id, { days: nd });
                          }}>
                          {label}
                        </Tag>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: c.textMute, fontSize: 11 }}>每天</span>
                  )}
                </div>

                {/* Block 3: valid_range 有效期（日期框常显，switch 控制启用） */}
                <div style={{ ...blockBase, flex: '4 1 180px', minWidth: 160 }}>
                  <div style={{ ...blockLabel, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>有效期</span>
                    <Switch size="small" checked={r.validRangeEnabled}
                      onChange={v => updateRegimen(r.id, { validRangeEnabled: v })} />
                    {!r.validRangeEnabled && <span style={{ color: c.textMute, fontSize: 10 }}>永久有效</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Input size="small" value={r.validStart} placeholder="YYYY-MM-DD"
                      disabled={!r.validRangeEnabled}
                      onChange={e => updateRegimen(r.id, { validStart: e.target.value })}
                      style={{ flex: 1, minWidth: 80, opacity: r.validRangeEnabled ? 1 : 0.45 }} />
                    <span style={{ color: c.textMute, fontSize: 10, flexShrink: 0 }}>~</span>
                    <Input size="small" value={r.validEnd} placeholder="YYYY-MM-DD"
                      disabled={!r.validRangeEnabled}
                      onChange={e => updateRegimen(r.id, { validEnd: e.target.value })}
                      style={{ flex: 1, minWidth: 80, opacity: r.validRangeEnabled ? 1 : 0.45 }} />
                  </div>
                </div>

              </div>
            </div>
          );
        })}

      </div>
    );
  };

  const renderVarsContent = () => (
    <div style={{ padding: '8px 0' }}>
      {stateVars.length === 0 && probConsts.length === 0
        ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('sim.vars.empty')} style={{ marginTop: 20 }} />
        : <>
            {stateVars.length > 0 && (
              <>
                <div style={{ fontWeight: 700, color: c.textMute, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{t('sim.vars.state_header')}</div>
                {stateVars.map(v => (
                  <Tooltip key={v.name} title={v.description || undefined} placement="top">
                    <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: c.textSec, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace', color: c.primary, flexShrink: 0 }}>
                        {(latestData[v.name] ?? v.value ?? 0).toFixed(4)}
                      </span>
                      {v.unit && <span style={{ color: c.textMute, flexShrink: 0 }}>{v.unit}</span>}
                    </div>
                  </Tooltip>
                ))}
              </>
            )}
            {probConsts.length > 0 && (
              <>
                <div style={{ fontWeight: 700, color: c.textMute, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '12px 0 6px' }}>{t('sim.vars.params_header')}</div>
                {probConsts.map(v => (
                  <Tooltip key={v.name} title={v.description || undefined} placement="top">
                    <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: c.textSec, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                      <span style={{ fontFamily: 'monospace', color: c.textSec, flexShrink: 0 }}>{v.value}</span>
                      {v.unit && <span style={{ color: c.textMute, flexShrink: 0 }}>{v.unit}</span>}
                      <LockOutlined style={{ color: c.textMute, flexShrink: 0 }} />
                    </div>
                  </Tooltip>
                ))}
              </>
            )}
          </>
      }
    </div>
  );

  const renderFormulasContent = () => {
    const entries = Object.entries(formulas);
    if (entries.length === 0) return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('sim.formulas.empty')} style={{ marginTop: 20 }} />
    );
    return (
      <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.map(([name, detail]: [string, any]) => (
          <div key={name} style={{
            border: `1px solid ${c.border}`, borderRadius: 4, padding: '6px 8px',
            background: c.sectionHd,
          }}>
            <div style={{ marginBottom: 4 }}>
              <Tooltip title={detail.condition != null && detail.condition !== true ? `${t('sim.formulas.condition')}: ${String(detail.condition)}` : undefined}>
                <strong style={{ color: c.text, cursor: detail.condition != null && detail.condition !== true ? 'help' : 'default' }}>
                  {name}{detail.condition != null && detail.condition !== true ? ' *' : ''}
                </strong>
              </Tooltip>
            </div>
            <code style={{ whiteSpace: 'pre-wrap', display: 'block', color: isDarkMode ? '#86efac' : '#007A33', lineHeight: 1.6 }}>
              {typeof detail.dynamics === 'object' && detail.dynamics
                ? Object.entries(detail.dynamics).map(([v2, e]) => `${v2} = ${e}`).join('\n')
                : String(detail.dynamics ?? '')}
            </code>
          </div>
        ))}
      </div>
    );
  };


  const renderOptContent = () => {
    const hasModelOpt = !!(selectedModel?.content?.optimizer?.enabled !== false && selectedModel?.content?.optimizer);
    return (
    <div style={{ padding: '8px 0' }}>
      {/* 模型内置 optimizer 提示 */}
      {hasModelOpt && (
        <div style={{ background: c.sectionHd, border: `1px solid ${c.border}`, borderRadius: 4, padding: '4px 8px', marginBottom: 10, fontSize: 11, color: c.textSec }}>
          已从模型 <code style={{ fontFamily: 'monospace' }}>optimizer:</code> 块读取配置，可在下方修改
        </div>
      )}
      {/* Objectives */}
      <div style={{ fontWeight: 700, color: c.textMute, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{t('sim.opt.objectives')}</div>
      {objectives.map((obj, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
          <span style={{ color: c.textMute, width: 14 }}>{i + 1}.</span>
          <Select size="small" value={obj.variable} style={{ flex: 1 }}
            options={allVarNames.map(n => ({ label: n, value: n }))}
            onChange={v => setObjectives(p => p.map((o, j) => j === i ? { ...o, variable: v } : o))} />
          <Select size="small" value={obj.direction} style={{ width: 80 }}
            options={[{ label: t('sim.opt.minimize'), value: 'minimize' }, { label: t('sim.opt.maximize'), value: 'maximize' }]}
            onChange={v => setObjectives(p => p.map((o, j) => j === i ? { ...o, direction: v } : o))} />
          <Button size="small" danger icon={<MinusCircleOutlined />}
            onClick={() => setObjectives(p => p.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="small" icon={<PlusOutlined />} block
        onClick={() => setObjectives(p => [...p, { variable: allVarNames[0] || '', direction: 'minimize' }])}
        style={{ borderColor: c.border, color: c.textSec, marginBottom: 14 }}>
        {t('sim.opt.add_objective')}
      </Button>

      {/* Constraints */}
      <div style={{ fontWeight: 700, color: c.textMute, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{t('sim.opt.constraints')}</div>
      {constraints.map((con, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
          <Select size="small" value={con.variable} style={{ flex: 1 }}
            options={allVarNames.map(n => ({ label: n, value: n }))}
            onChange={v => setConstraints(p => p.map((c2, j) => j === i ? { ...c2, variable: v } : c2))} />
          <Select size="small" value={con.op} style={{ width: 48 }}
            options={[{ label: '≤', value: '≤' }, { label: '≥', value: '≥' }]}
            onChange={v => setConstraints(p => p.map((c2, j) => j === i ? { ...c2, op: v } : c2))} />
          <InputNumber size="small" value={con.value} style={{ width: 64 }}
            onChange={v => setConstraints(p => p.map((c2, j) => j === i ? { ...c2, value: v || 0 } : c2))} />
          <Button size="small" danger icon={<MinusCircleOutlined />}
            onClick={() => setConstraints(p => p.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="small" icon={<PlusOutlined />} block
        onClick={() => setConstraints(p => [...p, { variable: allVarNames[0] || '', op: '≤', value: 100 }])}
        style={{ borderColor: c.border, color: c.textSec, marginBottom: 14 }}>
        {t('sim.opt.add_constraint')}
      </Button>

      {/* Algorithm */}
      <div style={{ fontWeight: 700, color: c.textMute, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{t('sim.opt.algorithm')}</div>
      <Select size="small" value={optAlgo}
        options={[
          { label: 'NSGA-II（多目标 Pareto）', value: 'NSGA-II' },
          { label: 'MOEA/D（多目标分解）',     value: 'MOEA/D' },
          { label: 'L-BFGS-B（单目标梯度）',   value: 'l-bfgs-b' },
          { label: 'Nelder-Mead（单目标无梯度）', value: 'nelder-mead' },
        ]}
        onChange={v => setOptAlgo(v as any)} style={{ width: '100%', marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: c.textMute, marginBottom: 3 }}>{t('sim.opt.population')}</div>
          <InputNumber size="small" value={optPop} onChange={v => setOptPop(v || 100)} style={{ width: '100%' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: c.textMute, marginBottom: 3 }}>{t('sim.opt.generations')}</div>
          <InputNumber size="small" value={optGen} onChange={v => setOptGen(v || 200)} style={{ width: '100%' }} />
        </div>
      </div>
    </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // LEFT PANEL SECTION RESIZE
  // ─────────────────────────────────────────────────────────────────────────────
  const startSectionResize = (keyA: string, keyB: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const container = leftPanelRef.current;
    if (!container) return;
    const allKeys = ['inputs', 'vars', 'formulas', ...(mode === 'opt' ? ['opt'] : [])];
    const availableH = container.clientHeight - SECTION_H * allKeys.length;
    const openArr = allKeys.filter(k => openSections.has(k));
    const totalW = openArr.reduce((s, k) => s + (sectionWeights[k] || 1), 0);
    const pxPerW = availableH / totalW;
    const wA = sectionWeights[keyA] || 1;
    const wB = sectionWeights[keyB] || 1;
    const combined = wA + wB;
    const onMove = (ev: MouseEvent) => {
      const dw = (ev.clientY - startY) / pxPerW;
      const nA = Math.max(0.15, wA + dw);
      const nB = Math.max(0.15, combined - nA);
      setSectionWeights(p => ({ ...p, [keyA]: nA, [keyB]: nB }));
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // CENTER PANEL
  // ─────────────────────────────────────────────────────────────────────────────
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

  const renderCenterPanel = () => {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {simulationData.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: c.textMute, flexDirection: 'column', gap: 8,
          }}>
            {!selectedKey
              ? <><span style={{ fontSize: 18 }}>📂</span><span>{t('sim.scene.empty_hint')}</span></>
              : !isLocked
                ? <><span style={{ fontSize: 18 }}>🔒</span><span>{t('sim.scene.select_hint')}</span></>
                : status === 'idle'
                  ? <><span style={{ fontSize: 18 }}>▶</span><span>{t('sim.scene.click_to_start')}</span></>
                  : <span>{t('sim.scene.calculating')}</span>
            }
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
            <Collapse
              defaultActiveKey={outputVars}
              size="small"
              items={outputVars.map((varName, idx) => {
                const varInfo = selectedModel?.content?.variables?.[varName];
                const lineColor = VAR_COLORS[idx % VAR_COLORS.length];
                return {
                  key: varName,
                  label: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: lineColor, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600 }}>{varName}</span>
                      {varInfo?.description && <span style={{ color: c.textMute, fontWeight: 400, fontSize: 11 }}>{varInfo.description}</span>}
                      {varInfo?.unit && <span style={{ color: c.textMute, fontWeight: 400 }}>({varInfo.unit})</span>}
                    </span>
                  ),
                  extra: (
                    <Button
                      size="small" type="text" icon={<DownloadOutlined />}
                      onClick={e => { e.stopPropagation(); exportVarCSV(varName); }}
                      style={{ color: c.textMute, padding: '0 2px', height: 'auto', lineHeight: 1 }}
                    />
                  ),
                  children: (
                    <SimChart
                      varName={varName}
                      unit={varInfo?.unit}
                      data={simulationData}
                      isDarkMode={isDarkMode}
                      c={c}
                      colorIndex={idx}
                      hideTitleBar
                      runsData={dataPerRun.length > 1 ? dataPerRun : undefined}
                    />
                  ),
                  styles: { header: { padding: '4px 8px' }, body: { padding: 0 } },
                };
              })}
            />
            {inputVars.length > 0 && (
              <>
                <div style={{
                  margin: '6px 0 2px', padding: '2px 8px',
                  fontSize: 11, color: c.textMute, letterSpacing: '0.05em',
                  borderLeft: `2px solid ${c.border}`,
                }}>
                  {t('sim.tabs.inputs')}
                </div>
                <Collapse
                  defaultActiveKey={inputVars.map(v => v.name)}
                  size="small"
                  items={inputVars.map((v, idx) => {
                    const lineColor = VAR_COLORS[(outputVars.length + idx) % VAR_COLORS.length];
                    return {
                      key: v.name,
                      label: (() => {
                        const inputVarInfo = selectedModel?.content?.variables?.[v.name];
                        return (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: lineColor, display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontWeight: 600 }}>{v.name}</span>
                            {inputVarInfo?.description && <span style={{ color: c.textMute, fontWeight: 400, fontSize: 11 }}>{inputVarInfo.description}</span>}
                            {v.unit && <span style={{ color: c.textMute, fontWeight: 400 }}>({v.unit})</span>}
                          </span>
                        );
                      })(),
                      extra: (
                        <Button
                          size="small" type="text" icon={<DownloadOutlined />}
                          onClick={e => { e.stopPropagation(); exportVarCSV(v.name); }}
                          style={{ color: c.textMute, padding: '0 2px', height: 'auto', lineHeight: 1 }}
                        />
                      ),
                      children: (
                        <SimChart
                          varName={v.name}
                          unit={v.unit}
                          data={simulationData}
                          isDarkMode={isDarkMode}
                          c={c}
                          colorIndex={outputVars.length + idx}
                          hideTitleBar
                          runsData={dataPerRun.length > 1 ? dataPerRun : undefined}
                        />
                      ),
                      styles: { header: { padding: '4px 8px' }, body: { padding: 0 } },
                    };
                  })}
                />
              </>
            )}
            {mode === 'opt' && (
              <div style={{ marginTop: 8 }}>
                {optRunning && (
                  <div style={{ textAlign: 'center', padding: 24 }}>
                    <Spin indicator={<LoadingOutlined style={{ fontSize: 28 }} spin />} />
                    <div style={{ marginTop: 8, color: c.textMute, fontSize: 12 }}>优化运行中...</div>
                  </div>
                )}
                {!optRunning && optResult && optResult.pareto_front?.length > 0 && (
                  <div style={{ border: `1px solid ${c.border}`, borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{
                      padding: '4px 10px', background: c.sectionHd,
                      borderBottom: `1px solid ${c.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: c.text }}>
                        Pareto 前沿 — {optResult.n_solutions} 个解
                      </span>
                      <span style={{ fontSize: 11, color: c.textMute, fontFamily: 'monospace' }}>
                        {optResult.method}
                      </span>
                    </div>
                    <div style={{ padding: 8 }}>
                      <ParetoChart result={optResult} isDarkMode={isDarkMode} c={c} />
                    </div>
                    {optResult.pareto_front.length === 1 && (
                      <div style={{ padding: '4px 10px 8px', fontSize: 12, color: c.textSec }}>
                        最优解：{(optResult.objectives || []).map((o: any, i: number) =>
                          `${o.variable} = ${optResult.best_f?.[i]?.toFixed(4)}`
                        ).join(', ')}
                      </div>
                    )}
                  </div>
                )}
                {!optRunning && !optResult && (
                  <div style={{
                    padding: 12, border: `1px dashed ${c.border}`, borderRadius: 6,
                    textAlign: 'center', color: c.textMute,
                  }}>
                    {t('sim.opt.pareto')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  const countLeaves = (nodes: DataNode[]): number => {
    let n = 0;
    nodes.forEach(node => { if (node.isLeaf) n++; else if (node.children) n += countLeaves(node.children); });
    return n;
  };
  const total = countLeaves(storyTree);

  const inputsVarCount = regimens.length;
  const leftTabs = [
    { key: 'inputs',   label: `${t('sim.tabs.inputs')}${inputsVarCount > 0 ? ` (${inputsVarCount})` : ''}`,                    content: renderInputsContent() },
    { key: 'vars',     label: `${t('sim.tabs.variables')}${stateVars.length > 0 ? ` (${stateVars.length})` : ''}`,              content: renderVarsContent() },
    { key: 'formulas', label: `${t('sim.tabs.formulas')}${Object.keys(formulas).length > 0 ? ` (${Object.keys(formulas).length})` : ''}`, content: renderFormulasContent() },
    ...(mode === 'opt' ? [{ key: 'opt', label: t('sim.tabs.optimizer'), content: renderOptContent() }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Top bar — controls + time settings（flexWrap 自动换行） ── */}
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
          disabled={!isLocked || (mode === 'sim' && status === 'completed') || (mode === 'opt' && (optRunning || status === 'completed'))}
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

        {/* Date range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <span style={{ color: c.textSec, whiteSpace: 'nowrap', fontSize: 12 }}>{t('sim.duration.label')}</span>
          <Input size="small" value={simStartDate} placeholder="YYYY-MM-DD"
            onChange={e => set('simStartDate', e.target.value)}
            style={{ width: 100, fontFamily: 'monospace' }} />
          <span style={{ color: c.textMute, fontSize: 11 }}>~</span>
          <Input size="small" value={simEndDate} placeholder="YYYY-MM-DD"
            onChange={e => set('simEndDate', e.target.value)}
            style={{ width: 100, fontFamily: 'monospace' }} />
        </div>

        {/* Step size */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span style={{ color: c.textSec, whiteSpace: 'nowrap' }}>{t('sim.step.label')}</span>
          <InputNumber size="small" value={stepValue} onChange={v => set('stepValue', v || 1)} style={{ width: 58 }} min={1} />
          <Select size="small" value={stepUnit} onChange={v => set('stepUnit', v)} style={{ width: 62, flexShrink: 0 }}
            options={[{ label: t('sim.step.second'), value: 'second' }, { label: t('sim.step.minute'), value: 'minute' }, { label: t('sim.step.hour'), value: 'hour' }, { label: t('sim.step.day'), value: 'day' }]} />
        </div>

        {/* MC runs */}
        <Tooltip title={simRuns > 1 ? `Monte Carlo: ${simRuns} 条，seed ${sessionSeed || '–'}` : 'Monte Carlo 运行条数（1=单条）'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <span style={{ color: c.textSec, whiteSpace: 'nowrap', fontSize: 12 }}>MC×</span>
            <InputNumber
              size="small" min={1} max={50} value={simRuns}
              onChange={v => set('simRuns', Math.max(1, Math.min(50, v || 1)))}
              style={{ width: 46 }}
              disabled={status === 'running'}
            />
          </div>
        </Tooltip>

        {/* Progress — only flexible element */}
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

      {/* ── Two-column body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT PANEL — Scene only ── */}
        <div style={{
          width: leftW, flexShrink: 0,
          background: c.panel,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          borderRight: `1px solid ${c.border}`,
        }}>
          {/* Scene header */}
          <div style={{
            height: SECTION_H, flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 10px',
            background: c.sectionHd,
            borderBottom: `1px solid ${c.border}`,
          }}>
            <span style={{ flex: 1, fontWeight: 600, color: c.text }}>{t('sim.scene.header')} ({total})</span>
            {selectedKey && (
              <Popover
                open={validationResult !== null && !validationResult.valid}
                placement="rightTop"
                onOpenChange={open => { if (!open) setValidationResult(null); }}
                content={
                  <div style={{ maxWidth: 300, maxHeight: 200, overflow: 'auto' }}>
                    <div style={{ fontWeight: 600, color: '#ff4d4f', marginBottom: 6 }}>{t('sim.msg.validation_fail')}</div>
                    {validationResult?.errors.map((err, i) => (
                      <div key={i} style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 3 }}>• {err}</div>
                    ))}
                  </div>
                }
              >
                <Button
                  size="small"
                  type={isLocked ? 'default' : 'dashed'}
                  icon={isLocked ? <LockOutlined /> : <UnlockOutlined />}
                  loading={validating}
                  style={isLocked
                    ? { color: '#52c41a', borderColor: '#52c41a' }
                    : { color: '#faad14', borderColor: '#faad14' }}
                  onClick={e => {
                    e.stopPropagation();
                    if (isLocked) {
                      // unlock = reset，清除仿真结果，准备下次直接运行
                      setIsLocked(false);
                      setValidationResult(null);
                      isRunningRef.current = false;
                      set('status', 'idle');
                      set('progress', 0);
                      set('currentStep', 0);
                      setSimData([]);
                      setState(prev => ({ ...prev, dataPerRun: [], sessionSeed: 0 }));
                    } else {
                      handleValidateAndLock();
                    }
                  }}
                >
                  {isLocked ? t('sim.scene.locked') : t('sim.control.pending')}
                </Button>
              </Popover>
            )}
          </div>

          {/* Scene content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <Input size="small" placeholder={t('sim.scene.search')} value={storyFilter}
                onChange={e => setStoryFilter(e.target.value)}
                prefix={<FilterOutlined style={{ color: c.textMute }} />}
                style={{ flex: 1 }} disabled={isLocked} />
              <Tooltip title={storyViewMode === 'tree' ? t('sim.scene.toggle_list') : t('sim.scene.toggle_tree')}>
                <Button size="small" type="text"
                  icon={storyViewMode === 'tree' ? <UnorderedListOutlined /> : <ClusterOutlined />}
                  onClick={() => setStoryViewMode(storyViewMode === 'tree' ? 'list' : 'tree')}
                  style={{ color: c.textMute, padding: '0 3px' }} disabled={isLocked} />
              </Tooltip>
            </div>
            <div style={{ opacity: isLocked ? 0.4 : 1, pointerEvents: isLocked ? 'none' : 'auto' }}>
              <Spin spinning={treeLoading} indicator={<LoadingOutlined />}>
                {storyViewMode === 'tree' ? (
                  <Tree showIcon expandedKeys={expandedKeys} onExpand={setExpandedKeys}
                    selectedKeys={selectedKey ? [selectedKey] : []} onSelect={handleSelect} treeData={storyTree} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {storyList.length === 0
                      ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('sim.scene.no_scenarios')} style={{ marginTop: 16 }} />
                      : storyList.map((mod: any) => (
                          <div key={mod.key} onClick={() => handleSelect([mod.key])}
                            style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', background: selectedKey === mod.key ? c.rowHover : 'transparent', color: c.text }}>
                            <BookOutlined style={{ marginRight: 6, color: c.textMute }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mod.displayTitle}</span>
                          </div>
                        ))
                    }
                  </div>
                )}
              </Spin>
            </div>
          </div>
        </div>

        {/* LEFT-CENTER resize handle */}
        <div
          onMouseDown={startLeftDrag}
          style={{
            width: 4, flexShrink: 0, cursor: 'col-resize', background: 'transparent',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `${c.primary}55`; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        />

        {/* CENTER — dual-tab: Setup | Plot ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Tab bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0,
            borderBottom: `1px solid ${c.border}`, background: c.panel,
            flexShrink: 0, paddingLeft: 8,
          }}>
            {([
              { key: 'setup',  label: t('sim.tab.setup')   || '⚙ 配置' },
              { key: 'plot',   label: t('sim.tab.plot')    || '📈 图表' },
              { key: 'report', label: t('sim.tab.report')  || '📄 报告' },
            ] as { key: 'setup' | 'plot' | 'report'; label: string }[]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setCenterTab(tab.key)}
                style={{
                  padding: '6px 16px', border: 'none', cursor: 'pointer',
                  background: 'transparent',
                  color: centerTab === tab.key ? c.primary : c.textMute,
                  fontWeight: centerTab === tab.key ? 600 : 400,
                  borderBottom: centerTab === tab.key ? `2px solid ${c.primary}` : '2px solid transparent',
                  marginBottom: -1,
                  outline: 'none',
                  transition: 'all 0.12s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Setup tab content */}
          {centerTab === 'setup' && (
            <div ref={leftPanelRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {leftTabs.map((tab, idx) => {
                const isOpen = openSections.has(tab.key);
                const openArr = leftTabs.filter(t => openSections.has(t.key));
                const nextOpenTab = leftTabs.slice(idx + 1).find(t => openSections.has(t.key));
                const showDragHandle = isOpen && !!nextOpenTab;
                return (
                  <React.Fragment key={tab.key}>
                    <div style={{
                      flex: isOpen ? String(sectionWeights[tab.key] || 1) : '0 0 auto',
                      minHeight: SECTION_H,
                      display: 'flex', flexDirection: 'column', overflow: 'hidden',
                      borderBottom: `1px solid ${c.border}`,
                    }}>
                      <div
                        onClick={() => setOpenSections(prev => { const n = new Set(prev); if (n.has(tab.key)) n.delete(tab.key); else n.add(tab.key); return n; })}
                        style={{
                          height: SECTION_H, flexShrink: 0,
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '0 12px', cursor: 'pointer',
                          background: c.sectionHd, userSelect: 'none',
                        }}
                      >
                        <span style={{ color: c.textMute, fontSize: 9, transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
                        <span style={{ flex: 1, fontWeight: 600, color: c.text }}>{tab.label}</span>
                      </div>
                      {isOpen && (
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                          {tab.content}
                        </div>
                      )}
                    </div>
                    {showDragHandle && (
                      <div
                        onMouseDown={startSectionResize(tab.key, nextOpenTab!.key)}
                        style={{ height: 4, flexShrink: 0, cursor: 'row-resize', background: 'transparent', transition: 'background 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = `${c.primary}55`; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* Plot tab content */}
          {centerTab === 'plot' && renderCenterPanel()}

          {/* Report tab content */}
          {centerTab === 'report' && (() => {
            const meta = selectedModel?.content?.metadata ?? selectedModel?.content?.meta ?? {};
            const latestStep = simulationData[simulationData.length - 1];
            const hasData = simulationData.length > 0;
            const allV: Record<string, any> = selectedModel?.content?.variables || {};

            // ── reference collector ────────────────────────────────────────
            const allRefs: string[] = [];
            const refIdx = new Map<string, number>();
            function collectRefs(val: unknown): number[] {
              if (!val) return [];
              const arr = (Array.isArray(val) ? val : [val]) as string[];
              return arr.filter(Boolean).map(r => {
                if (refIdx.has(r)) return refIdx.get(r)!;
                allRefs.push(r); refIdx.set(r, allRefs.length); return allRefs.length;
              });
            }
            function citeStr(val: unknown): string {
              const nums = collectRefs(val);
              return nums.length ? ' ' + nums.map(n => `[${n}]`).join('') : '';
            }
            // Collect eagerly in display order: meta → variables → formulas
            collectRefs((meta as any).references ?? (meta as any).reference);
            Object.values(allV).forEach((d: any) => collectRefs(d.reference));
            Object.values(formulas).forEach((fd: any) => collectRefs(fd.reference));

            // ── section summary badges ─────────────────────────────────────
            function sectionBadge(key: ReportSection): string {
              if (key === 'intro')    return meta.description ? '有描述' : '无描述';
              if (key === 'overview') return `${stateVars.length + inputVars.length} 个变量`;
              if (key === 'formulas') return `${Object.keys(formulas).length} 个`;
              if (key === 'variables') return `${Object.keys(allV).length} 个`;
              if (key === 'simcfg')   return `${Object.keys(inputParams).length} 项输入`;
              if (key === 'plots')    return hasData ? `${outputVars.length} 条曲线` : '需先仿真';
              if (key === 'opt')      return `${objectives.length} 目标`;
              if (key === 'refs')     return allRefs.length > 0 ? `${allRefs.length} 条` : '无';
              return '';
            }

            // ── section JSX preview ────────────────────────────────────────
            const TH = ({ children }: { children: React.ReactNode }) => (
              <th style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, color: c.textMute,
                textAlign: 'left', borderBottom: `1px solid ${c.border}`, background: c.sectionHd }}>{children}</th>
            );
            const TD = ({ children, mono }: { children: React.ReactNode; mono?: boolean }) => (
              <td style={{ padding: '4px 8px', fontSize: 11, color: c.text,
                fontFamily: mono ? 'monospace' : 'inherit', borderBottom: `1px solid ${c.border}` }}>{children}</td>
            );

            function renderSectionContent(key: ReportSection): React.ReactNode {
              if (key === 'intro') return (
                <div style={{ fontSize: 12, color: c.text, lineHeight: 1.8 }}>
                  {meta.description
                    ? <p style={{ margin: 0 }}>{meta.description}</p>
                    : <span style={{ color: c.textMute }}>暂无简介（可在 YAML metadata.description 中填写）</span>
                  }
                  {meta.tags?.length ? <div style={{ marginTop: 8, color: c.textMute, fontSize: 11 }}>标签：{meta.tags.join('  ·  ')}</div> : null}
                </div>
              );
              if (key === 'overview') return (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                  <tr><TD>名称</TD><TD mono>{meta.name || selectedModel?.label || '—'}</TD></tr>
                  <tr><TD>描述</TD><TD>{(meta.description || '—').slice(0, 120)}</TD></tr>
                  {meta.tags?.length ? <tr><TD>标签</TD><TD>{meta.tags.join(', ')}</TD></tr> : null}
                  <tr><TD>状态变量</TD><TD mono>{stateVars.length} 个</TD></tr>
                  <tr><TD>输入变量</TD><TD mono>{inputVars.length} 个</TD></tr>
                  <tr><TD>方程数</TD><TD mono>{Object.keys(formulas).length} 个</TD></tr>
                </tbody></table>
              );
              if (key === 'simcfg') return (
                <div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}><tbody>
                    <tr><TD>时间范围</TD><TD mono>{simStartDate} ~ {simEndDate}</TD></tr>
                    <tr><TD>步长</TD><TD mono>{stepValue} {stepUnit}</TD></tr>
                    <tr><TD>批量大小</TD><TD mono>{batchSize}</TD></tr>
                  </tbody></table>
                  {Object.keys(inputParams).length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><TH>变量</TH><TH>含义</TH><TH>值</TH></tr></thead>
                      <tbody>{Object.entries(inputParams).map(([k, v]) => (
                        <tr key={k}><TD mono>{k}</TD><TD>{allV[k]?.description || '—'}</TD><TD mono>{String(v)}</TD></tr>
                      ))}</tbody>
                    </table>
                  )}
                </div>
              );
              if (key === 'variables') return (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><TH>变量名</TH><TH>含义</TH><TH>类型</TH><TH>初始值</TH><TH>最终值</TH><TH>单位</TH></tr></thead>
                  <tbody>{Object.entries(allV).map(([name, d]: [string, any]) => {
                    const finalVal = latestStep?.[name] != null ? Number(latestStep[name]).toFixed(3) : '—';
                    const cite = citeStr(d.reference);
                    return <tr key={name}><TD mono>{name}</TD>
                      <TD>{d.description || '—'}{cite && <span style={{ color: c.primary, fontFamily: 'monospace', fontSize: 10 }}>{cite}</span>}</TD>
                      <TD>{d.type || '—'}</TD><TD mono>{d.value ?? '—'}</TD><TD mono>{finalVal}</TD><TD>{d.unit || '—'}</TD></tr>;
                  })}</tbody>
                </table>
              );
              if (key === 'formulas') return (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><TH>方程名</TH><TH>含义</TH><TH>条件</TH><TH>影响变量</TH></tr></thead>
                  <tbody>{Object.entries(formulas).map(([name, fd]: [string, any]) => {
                    const cond = fd.condition && fd.condition !== true && fd.condition !== 'true' ? String(fd.condition) : '常驻';
                    const affected = Object.keys(fd.dynamics || {}).join(', ') || '—';
                    const cite = citeStr(fd.reference);
                    return <tr key={name}><TD mono>{name}</TD>
                      <TD>{fd.description || '—'}{cite && <span style={{ color: c.primary, fontFamily: 'monospace', fontSize: 10 }}>{cite}</span>}</TD>
                      <TD mono>{cond}</TD><TD mono>{affected}</TD></tr>;
                  })}</tbody>
                </table>
              );
              if (key === 'plots') {
                if (!hasData) return <div style={{ color: c.textMute, fontSize: 11, padding: '8px 0' }}>尚无数据，请先运行仿真</div>;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {outputVars.map((varName, idx) => {
                      const varInfo = allV[varName];
                      return (
                        <div key={varName}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: c.text, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: VAR_COLORS[idx % VAR_COLORS.length], display: 'inline-block' }} />
                            <span style={{ fontFamily: 'monospace' }}>{varName}</span>
                            {varInfo?.description && <span style={{ color: c.textMute, fontWeight: 400 }}>{varInfo.description}</span>}
                            {varInfo?.unit && <span style={{ color: c.textMute, fontWeight: 400 }}>({varInfo.unit})</span>}
                          </div>
                          <SimChart varName={varName} unit={varInfo?.unit} data={simulationData}
                            isDarkMode={isDarkMode} c={c} colorIndex={idx} hideTitleBar />
                        </div>
                      );
                    })}
                  </div>
                );
              }
              if (key === 'refs') return (
                <div style={{ fontSize: 11, color: c.text, lineHeight: 1.9 }}>
                  {allRefs.length === 0
                    ? <span style={{ color: c.textMute }}>当前模型无参考文献（可在 YAML metadata.references / variable.reference / formula.reference 中添加）</span>
                    : allRefs.map((ref, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                          <span style={{ color: c.primary, fontWeight: 700, flexShrink: 0, fontFamily: 'monospace', minWidth: 28 }}>[{i + 1}]</span>
                          <span>{ref}</span>
                        </div>
                      ))
                  }
                </div>
              );
              if (key === 'opt') return (
                <div style={{ fontSize: 11, color: c.text }}>
                  {objectives.length > 0 && <><div style={{ fontWeight: 700, marginBottom: 4 }}>目标函数</div>
                    {objectives.map((o, i) => <div key={i} style={{ fontFamily: 'monospace', paddingLeft: 8 }}>
                      {o.direction === 'maximize' ? '↑' : '↓'} {o.variable}</div>)}</>}
                  {constraints.length > 0 && <><div style={{ fontWeight: 700, margin: '8px 0 4px' }}>约束条件</div>
                    {constraints.map((c2, i) => <div key={i} style={{ fontFamily: 'monospace', paddingLeft: 8 }}>
                      {c2.variable} {c2.op} {c2.value}</div>)}</>}
                  <div style={{ marginTop: 8, color: c.textMute }}>算法: {optAlgo} · 种群: {optPop} · 代数: {optGen}</div>
                </div>
              );
              return null;
            }

            // ── build report markdown (for export) ────────────────────────
            function buildMd(): string {
              const lines: string[] = [];
              const ts = new Date().toLocaleString('zh-CN');
              lines.push(`# 仿真报告\n\n> 生成时间：${ts}\n`);
              if (reportSections.has('intro') && meta.description) {
                lines.push(`## 简介\n`);
                lines.push(`${meta.description}\n`);
                if (meta.tags?.length) lines.push(`**标签**：${meta.tags.join('  ·  ')}\n`);
              }
              if (reportSections.has('overview')) {
                lines.push(`## 模型概览\n`);
                lines.push(`| 字段 | 值 |\n|------|-----|`);
                lines.push(`| 名称 | ${meta.name || selectedModel?.label || '—'} |`);
                lines.push(`| 描述 | ${(meta.description || '—').replace(/\n/g, ' ')} |`);
                if (meta.tags?.length) lines.push(`| 标签 | ${meta.tags.join(', ')} |`);
                lines.push(`| 状态变量数 | ${stateVars.length} |\n| 输入变量数 | ${inputVars.length} |\n| 方程数 | ${Object.keys(formulas).length} |\n`);
              }
              if (reportSections.has('simcfg')) {
                lines.push(`## 仿真配置\n\n| 参数 | 值 |\n|------|-----|`);
                lines.push(`| 时间范围 | ${simStartDate} ~ ${simEndDate} |\n| 步长 | ${stepValue} ${stepUnit} |\n| 批量大小 | ${batchSize} |`);
                if (Object.keys(inputParams).length) {
                  lines.push(`\n**输入参数**\n\n| 变量 | 含义 | 值 |\n|------|------|-----|`);
                  Object.entries(inputParams).forEach(([k, v]) => lines.push(`| \`${k}\` | ${allV[k]?.description || '—'} | ${v} |`));
                }
                lines.push('');
              }
              if (reportSections.has('variables')) {
                lines.push(`## 变量汇总\n\n| 变量名 | 含义 | 类型 | 初始值 | 最终值 | 单位 |\n|--------|------|------|--------|--------|------|`);
                Object.entries(allV).forEach(([name, d]: [string, any]) => {
                  const fv = latestStep?.[name] != null ? Number(latestStep[name]).toFixed(3) : '—';
                  lines.push(`| \`${name}\` | ${d.description || '—'}${citeStr(d.reference)} | ${d.type || '—'} | ${d.value ?? '—'} | ${fv} | ${d.unit || '—'} |`);
                });
                lines.push('');
              }
              if (reportSections.has('formulas')) {
                lines.push(`## 方程列表\n\n| 方程名 | 含义 | 条件 | 影响变量 |\n|--------|------|------|----------|`);
                Object.entries(formulas).forEach(([name, fd]: [string, any]) => {
                  const cond = fd.condition && fd.condition !== true && fd.condition !== 'true' ? String(fd.condition) : '常驻';
                  lines.push(`| \`${name}\` | ${fd.description || '—'}${citeStr(fd.reference)} | ${cond} | ${Object.keys(fd.dynamics || {}).join(', ') || '—'} |`);
                });
                lines.push('');
              }
              if (reportSections.has('plots') && hasData) {
                lines.push(`## Plot 曲线\n`);
                outputVars.forEach((varName, idx) => {
                  const d = allV[varName] || {};
                  const caption = [varName, d.description, d.unit ? `(${d.unit})` : ''].filter(Boolean).join('  ');
                  lines.push(`\n**${caption}**\n`);
                  const dataUrl = varToDataUrl(varName, idx);
                  if (dataUrl) lines.push(`![${varName}](${dataUrl})\n`);
                });
                lines.push('');
              }
              if (reportSections.has('opt') && mode === 'opt') {
                lines.push(`## 优化配置\n`);
                if (objectives.length) { lines.push(`**目标函数**\n`); objectives.forEach(o => lines.push(`- ${o.direction === 'maximize' ? '最大化' : '最小化'} \`${o.variable}\``)); }
                if (constraints.length) { lines.push(`\n**约束条件**\n`); constraints.forEach(c2 => lines.push(`- \`${c2.variable}\` ${c2.op} ${c2.value}`)); }
                lines.push(`\n算法: ${optAlgo} · 种群: ${optPop} · 代数: ${optGen}\n`);
              }
              if (reportSections.has('refs') && allRefs.length > 0) {
                lines.push(`## 参考文献\n`);
                allRefs.forEach((ref, i) => lines.push(`[${i + 1}] ${ref}`));
                lines.push('');
              }
              return lines.join('\n');
            }

            function buildHtml(md: string): string {
              const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
              const rows = md.split('\n');
              let html = '<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#1a2e22;line-height:1.6}' +
                'h1{color:#007A33;border-bottom:2px solid #007A33;padding-bottom:8px}h2{color:#007A33;margin-top:32px}' +
                'table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #dde5de;padding:6px 10px;text-align:left;font-size:13px}' +
                'th{background:#f2f4f2;font-weight:700}code{background:#f2f4f2;padding:1px 4px;border-radius:3px;font-size:12px}' +
                'blockquote{border-left:3px solid #b7eb8f;margin:0;padding-left:12px;color:#555}</style><body>';
              let inTable = false;
              rows.forEach(line => {
                if (line.startsWith('# '))       { if (inTable){html+='</table>';inTable=false;} html+=`<h1>${esc(line.slice(2))}</h1>`; }
                else if (line.startsWith('## ')) { if (inTable){html+='</table>';inTable=false;} html+=`<h2>${esc(line.slice(3))}</h2>`; }
                else if (line.startsWith('> '))  { html+=`<blockquote>${esc(line.slice(2))}</blockquote>`; }
                else if (/^\*\*.*\*\*$/.test(line)){ html+=`<p><strong>${esc(line.slice(2,-2))}</strong></p>`; }
                else if (/^!\[/.test(line)) {
                  const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
                  if (m) html += `<img alt="${esc(m[1])}" src="${m[2]}" style="width:100%;max-width:680px;margin:4px 0;display:block">`;
                }
                else if (line.startsWith('- '))  { html+=`<li>${line.slice(2).replace(/`([^`]+)`/g,(_,m)=>`<code>${esc(m)}</code>`)}</li>`; }
                else if (line.startsWith('|')) {
                  const cells = line.split('|').filter((_,i,a)=>i>0&&i<a.length-1).map(c=>c.trim());
                  if (cells.every(c=>/^[-:]+$/.test(c))) return;
                  if (!inTable){ html+='<table>'; inTable=true; }
                  html+='<tr>'+cells.map(c=>`<td>${c.replace(/`([^`]+)`/g,(_,m)=>`<code>${esc(m)}</code>`)}</td>`).join('')+'</tr>';
                } else { if(inTable){html+='</table>';inTable=false;} if(line.trim()) html+=`<p>${line.replace(/`([^`]+)`/g,(_,m)=>`<code>${esc(m)}</code>`)}</p>`; }
              });
              if (inTable) html += '</table>';
              return html + '</body>';
            }

            function previewHtml() {
              const w = window.open('', '_blank');
              if (w) { w.document.write(buildHtml(buildMd())); w.document.close(); }
            }

            function downloadMd() {
              setReportGenerating(true);
              const blob = new Blob([buildMd()], { type: 'text/markdown;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `report_${(meta.name || 'sim').replace(/\s+/g,'_')}_${Date.now()}.md`;
              document.body.appendChild(a); a.click();
              document.body.removeChild(a); URL.revokeObjectURL(url);
              setTimeout(() => setReportGenerating(false), 500);
            }

            function varToDataUrl(varName: string, colorIndex: number, W = 680, H = 160): string {
              if (simulationData.length === 0) return '';
              const canvas = document.createElement('canvas');
              canvas.width = W * 2; canvas.height = H * 2;
              const ctx = canvas.getContext('2d');
              if (!ctx) return '';
              ctx.scale(2, 2);
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, W, H);
              drawChartOnCtx(ctx, W, H, varName, simulationData, false, VAR_COLORS[colorIndex % VAR_COLORS.length]);
              return canvas.toDataURL('image/png');
            }

            function downloadTrajectoryCsv() {
              if (!hasData) return;
              const hasMC = dataPerRun.length > 1;
              const baseCols = Object.keys(simulationData[0]).filter(k => k !== 'step');
              const varCols = baseCols.filter(k => k !== 'time');
              // header: base columns, then run columns for each variable
              const mcRunCols = hasMC
                ? varCols.flatMap(k => dataPerRun.map((_, i) => `${k}_run${i}`))
                : [];
              const header = [
                ...baseCols.map(k => {
                  const desc = allV[k]?.description;
                  return desc ? `${k}(${desc})` : k;
                }),
                ...mcRunCols,
              ].join(',');
              const rows = simulationData.map((row, idx) => {
                const base = baseCols.map(k => row[k] != null ? String(row[k]) : '').join(',');
                if (!hasMC) return base;
                const mcVals = varCols.flatMap(k =>
                  dataPerRun.map(rd => (rd[idx]?.[k] as number) ?? '')
                ).join(',');
                return `${base},${mcVals}`;
              });
              const csv = [header, ...rows].join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `trajectory_${(meta.name || 'sim').replace(/\s+/g,'_')}_${Date.now()}.csv`;
              document.body.appendChild(a); a.click();
              document.body.removeChild(a); URL.revokeObjectURL(url);
            }

            const canExport = reportSections.size > 0;
            const btnBase: React.CSSProperties = {
              padding: '6px 16px', borderRadius: 5, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'opacity 0.15s',
            };

            return (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* ── Top action bar ── */}
                <div style={{
                  display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0,
                  padding: '10px 16px', borderBottom: `1px solid ${c.border}`, background: c.panel,
                }}>
                  <button onClick={previewHtml} disabled={!canExport} style={{
                    ...btnBase, border: `1px solid ${c.primary}`, background: 'transparent',
                    color: c.primary, opacity: canExport ? 1 : 0.4,
                  }}>⬡ HTML 预览</button>
                  <button onClick={downloadMd} disabled={!canExport || reportGenerating} style={{
                    ...btnBase, border: 'none', background: canExport ? c.primary : c.border,
                    color: '#fff', opacity: canExport && !reportGenerating ? 1 : 0.4,
                  }}>{reportGenerating ? '生成中…' : '↓ 导出 .md'}</button>
                  <button onClick={downloadTrajectoryCsv} disabled={!hasData} style={{
                    ...btnBase, border: `1px solid ${c.border}`, background: 'transparent',
                    color: hasData ? c.text : c.textMute, opacity: hasData ? 1 : 0.4,
                  }}>↓ 轨迹 .csv</button>
                  <Tooltip title="DOCX 导出功能开发中">
                    <button disabled style={{
                      ...btnBase, border: `1px solid ${c.border}`, background: 'transparent',
                      color: c.textMute, cursor: 'not-allowed', opacity: 0.4,
                    }}>↓ 导出 .docx</button>
                  </Tooltip>
                </div>

                {/* ── Main area: left checklist + right accordion ── */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                  {/* Left: section checklist */}
                  <div style={{
                    width: 168, flexShrink: 0, borderRight: `1px solid ${c.border}`,
                    background: c.panel, overflowY: 'auto', padding: '12px 0',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: c.textMute, letterSpacing: '0.1em',
                      textTransform: 'uppercase', padding: '0 14px 8px' }}>输出章节</div>
                    {ALL_REPORT_SECTIONS.map(s => {
                      const checked = reportSections.has(s.key);
                      const disabledPlots = s.key === 'plots' && !hasData;
                      const disabledOpt = s.key === 'opt' && mode !== 'opt';
                      const isDisabled = disabledPlots || disabledOpt;
                      const tooltipText = disabledPlots ? '需先完成仿真才能显示曲线'
                        : disabledOpt ? '仅在优化模式下可用' : '';
                      const row = (
                        <label key={s.key} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '7px 14px', cursor: isDisabled ? 'not-allowed' : 'pointer',
                          opacity: isDisabled ? 0.4 : 1,
                          background: checked && !isDisabled ? (c.primary + '12') : 'transparent',
                          borderLeft: `2px solid ${checked && !isDisabled ? c.primary : 'transparent'}`,
                          transition: 'all 0.12s',
                        }}>
                          <input type="checkbox" checked={checked} disabled={isDisabled}
                            onChange={() => {
                              setReportSections(p => { const s2 = new Set(p); s2.has(s.key) ? s2.delete(s.key) : s2.add(s.key); return s2; });
                              setOpenReportPreviews(p => { const s2 = new Set(p); checked ? s2.delete(s.key) : s2.add(s.key); return s2; });
                            }}
                            style={{ accentColor: c.primary, width: 12, height: 12, flexShrink: 0 }}
                          />
                          <span style={{ fontSize: 12, color: c.text }}>{s.label}</span>
                        </label>
                      );
                      return tooltipText
                        ? <Tooltip key={s.key} title={tooltipText} placement="right">{row}</Tooltip>
                        : row;
                    })}
                  </div>

                  {/* Right: accordion previews */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {reportSections.size === 0 && (
                      <div style={{ color: c.textMute, fontSize: 12, padding: '32px 0', textAlign: 'center' }}>
                        请在左侧勾选章节
                      </div>
                    )}
                    {ALL_REPORT_SECTIONS.filter(s => reportSections.has(s.key)).map(s => {
                      const isOpen = openReportPreviews.has(s.key);
                      const badge = sectionBadge(s.key);
                      return (
                        <div key={s.key} style={{
                          border: `1px solid ${c.border}`, borderRadius: 6, overflow: 'hidden',
                          background: c.panel, flexShrink: 0,
                        }}>
                          {/* Accordion header */}
                          <div
                            onClick={() => setOpenReportPreviews(p => { const s2 = new Set(p); s2.has(s.key) ? s2.delete(s.key) : s2.add(s.key); return s2; })}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '8px 12px', cursor: 'pointer',
                              background: isOpen ? c.sectionHd : 'transparent',
                              userSelect: 'none',
                            }}
                          >
                            <span style={{ fontSize: 9, color: c.textMute, transition: 'transform 0.15s',
                              transform: isOpen ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>▶</span>
                            <span style={{ fontWeight: 600, fontSize: 12, color: c.text, flex: 1 }}>{s.label}</span>
                            {badge && <span style={{
                              fontSize: 10, color: c.primary, fontFamily: 'monospace',
                              background: c.primary + '15', padding: '1px 7px', borderRadius: 8,
                            }}>{badge}</span>}
                          </div>
                          {/* Accordion content */}
                          {isOpen && (
                            <div style={{ padding: '10px 12px', borderTop: `1px solid ${c.border}` }}>
                              {renderSectionContent(s.key)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

    </div>
  );
};

export default Simulator;
