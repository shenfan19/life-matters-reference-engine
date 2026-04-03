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
  Button, Select, InputNumber, Tooltip, Tag,
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
import type { SimulatorProps, SimulationDataPoint, SimulationState, DurationUnit, StepUnit, DataNode, ModelFile } from '../types';
import { validateModFile } from '../core/validate';
import { useI18n } from '../core/i18n';

const API_BASE = '/api';

type InputFreq = 'hourly' | 'daily' | 'weekly' | 'monthly';
interface InputEntry {
  id: string;
  variable: string;
  value: number;
  frequency: InputFreq;
  time: string; // 'HH:mm', relevant for daily
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
}> = ({ varName, unit, data, isDarkMode, c, colorIndex = 0, hideTitleBar = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; time: number; value: number } | null>(null);

  const lineColor = VAR_COLORS[colorIndex % VAR_COLORS.length];

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    ctx.clearRect(0, 0, W, H);

    const PAD = { l: 58, r: 12, t: 8, b: 28 };
    const plotW = W - PAD.l - PAD.r;
    const plotH = H - PAD.t - PAD.b;

    if (data.length === 0) return;

    // Y-axis range
    const values = data.map(d => (d[varName] as number) ?? 0);
    let minV = Math.min(...values);
    let maxV = Math.max(...values);
    if (minV === maxV) { minV -= 1; maxV += 1; }
    const yRange = maxV - minV;
    const step = niceTickStep(yRange, 5);
    const yMin = Math.floor(minV / step) * step;
    const yMax = yMin + step * Math.ceil((maxV - yMin) / step || 1);
    const yActualRange = yMax - yMin || 1;

    // X-axis range (seconds → hours)
    const tMin = data[0].time ?? 0;
    const tMax = data[data.length - 1].time ?? 0;
    const tRange = tMax - tMin || 1;

    const toX = (t: number) => PAD.l + ((t - tMin) / tRange) * plotW;
    const toY = (v: number) => PAD.t + plotH - ((v - yMin) / yActualRange) * plotH;

    // Grid lines
    ctx.lineWidth = 1;

    // Horizontal gridlines (5 ticks)
    const tickCount = Math.round((yMax - yMin) / step);
    for (let i = 0; i <= tickCount; i++) {
      const val = yMin + i * step;
      const y = toY(val);
      if (y < PAD.t - 1 || y > PAD.t + plotH + 1) continue;
      ctx.strokeStyle = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
      // Y label
      ctx.fillStyle = isDarkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
      ctx.font = '9px system-ui';
      ctx.textAlign = 'right';
      const label = Math.abs(val) >= 1000 ? val.toExponential(1) : val % 1 === 0 ? String(val) : val.toFixed(2);
      ctx.fillText(label, PAD.l - 4, y + 3);
    }

    // Vertical gridlines (6)
    for (let i = 0; i <= 6; i++) {
      const x = PAD.l + (plotW / 6) * i;
      ctx.strokeStyle = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + plotH); ctx.stroke();
      // X label (hours)
      const t = tMin + (tRange / 6) * i;
      ctx.fillStyle = isDarkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
      ctx.font = '9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${(t / 3600).toFixed(0)}h`, x, H - 6);
    }

    // Data line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = toX(d.time ?? 0);
      const y = toY((d[varName] as number) ?? 0);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Crosshair (drawn from hover state during mousemove — handled separately)
  }, [data, varName, isDarkMode, lineColor]);

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
    const rows = ['time_s,time_h,' + varName,
      ...data.map(d => `${d.time},${((d.time ?? 0) / 3600).toFixed(4)},${((d[varName] as number) ?? 0)}`)];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${varName}.csv`; a.click();
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
}) => {
  const { t } = useI18n();
  const c = getC(isDarkMode);
  const { width: leftW, startDrag: startLeftDrag } = useResize(380, 200, 520);
  const freqLabels: Record<InputFreq, string> = {
    hourly: t('sim.freq.hourly'), daily: t('sim.freq.daily'),
    weekly: t('sim.freq.weekly'), monthly: t('sim.freq.monthly'),
  };

  const {
    status, progress, currentStep, simulationData,
    inputParams, stateVariables, sessionId,
    timeValue, timeUnit, stepValue, stepUnit, batchSize, updateInterval,
  } = state;

  // ── mode toggle ──────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'sim' | 'opt'>(() => readSP()?.mode || 'sim');

  // ── loader state ─────────────────────────────────────────────────────────────
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => readSP()?.selectedKey || null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const selectedStory = selectedKey ? loadedMods[selectedKey] ?? null : null;

  // ── left panel sections ───────────────────────────────────────────────────────
  const SECTION_H = 26; // header height px
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(readSP()?.openSections || ['scene', 'inputs']));
  const [sectionWeights, setSectionWeights] = useState<Record<string, number>>(() => readSP()?.sectionWeights || { scene: 2, inputs: 1, vars: 1, formulas: 1, schedule: 1, opt: 1 });
  const leftPanelRef = useRef<HTMLDivElement>(null);

  // ── opt mode state ───────────────────────────────────────────────────────────
  const [optRanges, setOptRanges] = useState<Record<string, { min: number; max: number; locked: boolean }>>({});
  const [objectives, setObjectives] = useState<Array<{ variable: string; direction: 'minimize' | 'maximize' }>>([]);
  const [constraints, setConstraints] = useState<Array<{ variable: string; op: '≤' | '≥'; value: number }>>([]);
  const [optAlgo, setOptAlgo] = useState<'NSGA-II' | 'MOEA/D'>('NSGA-II');
  const [optPop, setOptPop] = useState(100);
  const [optGen, setOptGen] = useState(200);

  // ── scheduled input entries ──────────────────────────────────────────────────
  const [inputEntries, setInputEntries] = useState<InputEntry[]>(() => readSP()?.inputEntries || []);

  const isRunningRef = useRef(false);
  // refs for restore flow
  const pendingRestoreKey = useRef<string | null>(readSP()?.selectedKey || null);
  const skipInputInitRef = useRef<boolean>(!!(readSP()?.inputEntries?.length));
  const isInitialMount = useRef(true);

  const TIME_UNITS: Record<DurationUnit, number> = { year: 8760, month: 720, day: 24, hour: 1 };
  const STEP_UNITS: Record<StepUnit, number> = { day: 86400, hour: 3600, minute: 60, second: 1 };

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
      const entries: InputEntry[] = [];
      Object.entries(selectedModel.content.variables).forEach(([name, data]: [string, any]) => {
        if (data.type === 'input') {
          inputs[name] = data.value;
          entries.push({ id: `${name}-0`, variable: name, value: data.value ?? 0, frequency: 'daily', time: '08:00' });
        } else if (data.type === 'state') states[name] = data.value;
      });
      set('inputParams', inputs);
      set('stateVariables', states);
      if (skipInputInitRef.current) {
        skipInputInitRef.current = false; // use saved entries once, then allow model defaults on next load
      } else {
        setInputEntries(entries);
      }
      const ranges: typeof optRanges = {};
      Object.entries(inputs).forEach(([name, val]) => {
        ranges[name] = { min: 0, max: (val as number) * 2 || 1, locked: true };
      });
      setOptRanges(ranges);
    }
    const sim = selectedModel?.content?.simulation ?? selectedModel?.content?.simulator;
    if (sim) {
      set('stepValue', sim.step_size || 3600);
      set('stepUnit', 'second');
      set('timeValue', (sim.total_time || 86400) / 3600);
      set('timeUnit', 'hour');
    }
  }, [selectedModel]);

  // ── sync inputEntries → inputParams ─────────────────────────────────────────
  useEffect(() => {
    const params: Record<string, number> = {};
    inputEntries.forEach(e => { params[e.variable] = e.value; }); // last value wins per variable
    set('inputParams', params);
  }, [inputEntries]);

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
      ...(saved.timeValue != null && { timeValue: saved.timeValue }),
      ...(saved.timeUnit && { timeUnit: saved.timeUnit }),
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
    writeSP({ ...current, selectedKey, mode, inputEntries, isLocked, openSections: [...openSections], sectionWeights, timeValue, timeUnit, stepValue, stepUnit });
  }, [selectedKey, mode, inputEntries, isLocked, openSections, sectionWeights, timeValue, timeUnit, stepValue, stepUnit]);

  // ── persist simulation results on status settle ───────────────────────────────
  useEffect(() => {
    if (status === 'running') return; // skip during active run to avoid constant writes
    const current = readSP() || {};
    writeSP({ ...current, simulationData, status, currentStep, progress });
  }, [status]); // captures simulationData snapshot at the moment status changes

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
          return {
            title: item.type === 'file'
              ? <span>{titleStr}{item.mod_type && <Tag color="blue" style={{ marginLeft: 6 }}>{item.mod_type}</Tag>}</span>
              : item.title,
            key: item.key,
            icon: item.type === 'folder' ? <FolderOutlined /> : <FileOutlined />,
            isLeaf: item.type === 'file',
            children: item.children ? convert(item.children) : undefined,
            titleStr, mod_type: item.mod_type,
          };
        });
        const modsNode = result.data.find((n: any) => n.key === 'mods');
        if (modsNode?.children) {
          const sNode = modsNode.children.find((n: any) => n.key === 'scenarios');
          if (sNode) setStoryTree(convert(sNode.children || []));
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
        folder: path.includes('/') ? path.split('/')[0] : undefined,
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
      message.success(t('sim.msg.validation_ok'));
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
  const probConsts = selectedModel?.content?.variables
    ? Object.entries(selectedModel.content.variables)
        .filter(([, d]: [string, any]) => d.type === 'probability_constant' || d.type === 'probability')
        .map(([name, d]: [string, any]) => ({ name, ...d }))
    : [];
  const schedules = selectedModel?.content?.schedules || {};
  const formulas: Record<string, any> = selectedModel?.content?.formulas || {};
  const outputVars: string[] = selectedModel?.content?.simulator?.output_variables
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
      set('status', 'running'); set('progress', 0); set('currentStep', 0); setSimData([]);
      isRunningRef.current = true;
      const resp = await fetch(`${API_BASE}/simulation/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: selectedModel.content!.metadata.name,
          folder: selectedModel.folder,
          time_hours: timeValue * TIME_UNITS[timeUnit],
          step_size: stepValue * STEP_UNITS[stepUnit],
          input_params: inputParams,
        }),
      });
      const result = await resp.json();
      if (result.success && result.data) {
        set('sessionId', result.data.session_id);
        set('totalSteps', result.data.total_steps);
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
          if (res.data.completed) { set('status', 'completed'); isRunningRef.current = false; message.success(t('sim.msg.sim_complete')); }
          else setTimeout(loop, updateInterval);
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
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // LEFT PANEL TAB CONTENT RENDERERS
  // ─────────────────────────────────────────────────────────────────────────────

  const addInputEntry = () => {
    const firstVar = inputVars[0]?.name ?? '';
    setInputEntries(prev => [...prev, {
      id: `${firstVar}-${Date.now()}`,
      variable: firstVar,
      value: inputVars[0]?.value ?? 0,
      frequency: 'daily',
      time: '08:00',
    }]);
  };

  const updateEntry = (id: string, patch: Partial<InputEntry>) =>
    setInputEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));

  const removeEntry = (id: string) =>
    setInputEntries(prev => prev.filter(e => e.id !== id));

  const renderInputsContent = () => {
    if (inputVars.length === 0) return (
      <div style={{ padding: '8px 0' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('sim.inputs.empty')} />
      </div>
    );
    const varOptions = inputVars.map(v => ({ label: v.name, value: v.name }));
    const freqOptions = (Object.keys(freqLabels) as InputFreq[]).map(k => ({ label: freqLabels[k], value: k }));
    return (
      <div style={{ padding: '8px 0' }}>
        {inputEntries.map(entry => {
          const varDef = inputVars.find(v => v.name === entry.variable);
          return (
            <div key={entry.id} style={{
              display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8,
              padding: '6px 8px', borderRadius: 6,
              background: c.inputBg, border: `1px solid ${c.border}`,
              flexWrap: 'wrap',
            }}>
              {/* Variable name dropdown */}
              <Select
                size="small"
                value={entry.variable}
                options={varOptions}
                onChange={val => {
                  const def = inputVars.find(v => v.name === val);
                  updateEntry(entry.id, { variable: val, value: def?.value ?? 0 });
                }}
                style={{ minWidth: 100, flex: 1 }}
              />
              {/* Value */}
              <InputNumber
                size="small"
                value={entry.value}
                onChange={val => updateEntry(entry.id, { value: val ?? 0 })}
                style={{ width: 72 }}
              />
              {/* Unit */}
              {varDef?.unit && (
                <span style={{ color: c.textMute, flexShrink: 0, minWidth: 20 }}>{varDef.unit}</span>
              )}
              {/* Frequency */}
              <Select
                size="small"
                value={entry.frequency}
                options={freqOptions}
                onChange={val => updateEntry(entry.id, { frequency: val })}
                style={{ width: 80 }}
              />
              {/* Time (only for daily) */}
              {entry.frequency === 'daily' && (
                <Input
                  size="small"
                  value={entry.time}
                  placeholder="08:00"
                  onChange={e => updateEntry(entry.id, { time: e.target.value })}
                  style={{ width: 58 }}
                />
              )}
              {/* Delete */}
              <Button
                size="small" type="text" danger
                icon={<MinusCircleOutlined />}
                onClick={() => removeEntry(entry.id)}
                style={{ padding: '0 2px', flexShrink: 0 }}
              />
            </div>
          );
        })}
        <Button
          size="small" type="dashed" icon={<PlusOutlined />}
          onClick={addInputEntry}
          style={{ width: '100%', marginTop: 4 }}
        >
          {t('sim.inputs.add')}
        </Button>
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

  const renderRegimensContent = () => {
    const entries = Object.entries(schedules);
    if (entries.length === 0) return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('sim.schedules.empty')} style={{ marginTop: 20 }} />
    );
    return (
      <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map(([name, sched]: [string, any]) => (
          <div key={name} style={{ border: `1px solid ${c.border}`, borderRadius: 4, padding: '6px 8px', background: c.sectionHd }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <strong style={{ color: c.text }}>{name}</strong>
              <Tag style={{}}>{sched.interpolation || 'step'}</Tag>
            </div>
            {sched.recurrence && (
              <div style={{ color: c.textMute, marginBottom: 4 }}>
                {sched.recurrence}{sched.days_of_week ? ` · ${sched.days_of_week.join(' ')}` : ''}
              </div>
            )}
            {sched.points?.map((pt: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontFamily: 'monospace', color: c.text, marginBottom: 2 }}>
                <span style={{ color: c.textMute, width: 46 }}>
                  {typeof pt.time === 'number' ? `${(pt.time / 3600).toFixed(1)}h` : pt.time}
                </span>
                <span style={{ color: c.textMute }}>→</span>
                <span>{typeof pt.value === 'number' ? pt.value.toFixed(3) : pt.value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const renderOptContent = () => (
    <div style={{ padding: '8px 0' }}>
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
        options={[{ label: 'NSGA-II', value: 'NSGA-II' }, { label: 'MOEA/D', value: 'MOEA/D' }]}
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

  // ─────────────────────────────────────────────────────────────────────────────
  // LEFT PANEL SECTION RESIZE
  // ─────────────────────────────────────────────────────────────────────────────
  const startSectionResize = (keyA: string, keyB: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const container = leftPanelRef.current;
    if (!container) return;
    const allKeys = ['scene', 'inputs', 'vars', 'formulas', 'schedule', ...(mode === 'opt' ? ['opt'] : [])];
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
    const rows = ['time_s,time_h,' + varName,
      ...simulationData.map(d => `${d.time},${((d.time ?? 0) / 3600).toFixed(4)},${((d[varName] as number) ?? 0)}`)];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${varName}.csv`; a.click();
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
                      label: (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: lineColor, display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ fontWeight: 600 }}>{v.name}</span>
                          {v.unit && <span style={{ color: c.textMute, fontWeight: 400 }}>({v.unit})</span>}
                        </span>
                      ),
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
                        />
                      ),
                      styles: { header: { padding: '4px 8px' }, body: { padding: 0 } },
                    };
                  })}
                />
              </>
            )}
            {mode === 'opt' && (
              <div style={{
                marginTop: 8, padding: 12,
                border: `1px dashed ${c.border}`, borderRadius: 6,
                textAlign: 'center', color: c.textMute,
              }}>
                {t('sim.opt.pareto')}
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

  const leftTabs = [
    { key: 'inputs',   label: `${t('sim.tabs.inputs')}${inputEntries.length > 0 ? ` (${inputEntries.length})` : ''}`,           content: renderInputsContent() },
    { key: 'vars',     label: `${t('sim.tabs.variables')}${stateVars.length > 0 ? ` (${stateVars.length})` : ''}`,              content: renderVarsContent() },
    { key: 'formulas', label: `${t('sim.tabs.formulas')}${Object.keys(formulas).length > 0 ? ` (${Object.keys(formulas).length})` : ''}`, content: renderFormulasContent() },
    { key: 'schedule', label: `${t('sim.tabs.schedules')}${Object.keys(schedules).length > 0 ? ` (${Object.keys(schedules).length})` : ''}`, content: renderRegimensContent() },
    ...(mode === 'opt' ? [{ key: 'opt', label: t('sim.tabs.optimizer'), content: renderOptContent() }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Top bar — controls + time settings ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
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
          icon={status === 'running' ? <PauseOutlined /> : <PlayCircleOutlined />}
          onClick={status === 'running' ? pauseSimulation : status === 'paused' ? resumeSimulation : startSimulation}
          disabled={!isLocked || status === 'completed'}
          style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          {status === 'running'
            ? t('sim.control.pause')
            : status === 'paused'
              ? t('sim.control.continue')
              : t('sim.control.run')}
        </Button>
        <Button size="small" icon={<StepForwardOutlined />}
          onClick={runSingleStep}
          disabled={!sessionId || status === 'running' || status === 'completed'}
          style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
        >{t('sim.control.step')}</Button>
        <Button size="small" icon={<StopOutlined />}
          onClick={resetSimulation}
          disabled={status === 'idle'}
          style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
        >{t('sim.control.reset')}</Button>

        <div style={{ width: 1, height: 16, background: c.border, flexShrink: 0 }} />

        {/* Duration */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span style={{ color: c.textSec, whiteSpace: 'nowrap' }}>{t('sim.duration.label')}</span>
          <InputNumber size="small" value={timeValue} onChange={v => set('timeValue', v || 1)} style={{ width: 58 }} min={0} />
          <Select size="small" value={timeUnit} onChange={v => set('timeUnit', v)} style={{ width: 76, flexShrink: 0 }}
            options={[{ label: t('sim.duration.hour'), value: 'hour' }, { label: t('sim.duration.day'), value: 'day' }, { label: t('sim.duration.month'), value: 'month' }, { label: t('sim.duration.year'), value: 'year' }]} />
        </div>

        {/* Step size */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span style={{ color: c.textSec, whiteSpace: 'nowrap' }}>{t('sim.step.label')}</span>
          <InputNumber size="small" value={stepValue} onChange={v => set('stepValue', v || 1)} style={{ width: 58 }} min={0} />
          <Select size="small" value={stepUnit} onChange={v => set('stepUnit', v)} style={{ width: 62, flexShrink: 0 }}
            options={[{ label: t('sim.step.second'), value: 'second' }, { label: t('sim.step.minute'), value: 'minute' }, { label: t('sim.step.hour'), value: 'hour' }, { label: t('sim.step.day'), value: 'day' }]} />
        </div>

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

        {/* LEFT PANEL */}
        <div style={{
          width: leftW, flexShrink: 0,
          background: c.panel,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {(() => {
            const allKeys = ['scene', 'inputs', 'vars', 'formulas', 'schedule', ...(mode === 'opt' ? ['opt'] : [])];
            const sceneExtra = selectedKey ? (
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
                  onClick={e => { e.stopPropagation(); if (isLocked) { setIsLocked(false); setValidationResult(null); } else handleValidateAndLock(); }}
                >
                  {isLocked ? t('sim.scene.locked') : t('sim.control.pending')}
                </Button>
              </Popover>
            ) : null;

            const sceneChildren = (
              <div>
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
            );

            const panels: { key: string; label: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode }[] = [
              { key: 'scene', label: <>{t('sim.scene.header')} ({total})</>, extra: sceneExtra, children: sceneChildren },
              ...leftTabs.map(tab => ({ key: tab.key, label: tab.label, children: tab.content })),
            ];

            return (
              <div ref={leftPanelRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {panels.map((panel, idx) => {
                  const isOpen = openSections.has(panel.key);
                  const openArr = allKeys.filter(k => openSections.has(k));
                  // find the next open panel key for the drag handle
                  const nextOpenKey = allKeys.slice(allKeys.indexOf(panel.key) + 1).find(k => openSections.has(k));
                  const showDragHandle = isOpen && nextOpenKey !== undefined;
                  return (
                    <React.Fragment key={panel.key}>
                      <div style={{
                        flex: isOpen ? String(sectionWeights[panel.key] || 1) : '0 0 auto',
                        minHeight: SECTION_H,
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        borderBottom: `1px solid ${c.border}`,
                      }}>
                        {/* Section header */}
                        <div
                          onClick={() => setOpenSections(prev => { const n = new Set(prev); if (n.has(panel.key)) n.delete(panel.key); else n.add(panel.key); return n; })}
                          style={{
                            height: SECTION_H, flexShrink: 0,
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '0 10px', cursor: 'pointer',
                            background: c.sectionHd, userSelect: 'none',
                          }}
                        >
                          <span style={{ color: c.textMute, fontSize: 9, transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
                          <span style={{ flex: 1, fontWeight: 600, color: c.text }}>{panel.label}</span>
                          {panel.extra && <span onClick={e => e.stopPropagation()}>{panel.extra}</span>}
                        </div>
                        {/* Section content */}
                        {isOpen && (
                          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
                            {panel.children}
                          </div>
                        )}
                      </div>
                      {/* Drag handle between two adjacent open sections */}
                      {showDragHandle && (
                        <div
                          onMouseDown={startSectionResize(panel.key, nextOpenKey!)}
                          style={{ height: 4, flexShrink: 0, cursor: 'row-resize', background: 'transparent', transition: 'background 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = `${c.primary}55`; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* LEFT-CENTER resize handle */}
        <div
          onMouseDown={startLeftDrag}
          style={{
            width: 4, flexShrink: 0, cursor: 'col-resize', background: 'transparent',
            borderRight: `1px solid ${c.border}`, transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `${c.primary}55`; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        />

        {/* CENTER */}
        {renderCenterPanel()}
      </div>

    </div>
  );
};

export default Simulator;
