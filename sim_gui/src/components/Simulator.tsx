// sim_gui/src/components/Simulator.tsx
// Integrated Loader + 3-column Simulator layout

import React, { useState, useEffect, useRef } from 'react';
import {
  Button, Switch, Select, InputNumber, Tooltip, Tag,
  message, Spin, Alert, Descriptions, Empty, Input, Tree,
  Segmented,
} from 'antd';
import {
  PlayCircleOutlined, PauseOutlined, StopOutlined,
  DownloadOutlined, StepForwardOutlined,
  LockOutlined, UnlockOutlined, SwapOutlined,
  BookOutlined, CheckCircleOutlined,
  PlusOutlined, MinusCircleOutlined,
  FileOutlined, FolderOutlined, FilterOutlined,
  SortAscendingOutlined, UnorderedListOutlined, ClusterOutlined,
  LoadingOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type { SimulatorProps, SimulationDataPoint, SimulationState, DurationUnit, StepUnit, DataNode, ModelFile } from '../types';
import { validateModFile } from '../core/validate';
import { useI18n } from '../core/i18n';

const API_BASE = '/api';

function getC(dark: boolean) {
  return dark ? {
    bg: '#0d1a10', panel: '#111f16', border: '#1e3824',
    primary: '#52c41a', text: 'rgba(255,255,255,0.92)',
    textSec: 'rgba(255,255,255,0.75)', textMute: 'rgba(255,255,255,0.52)',
    inputBg: '#162a1b', sectionHd: '#0a1409', rowHover: '#1a3a22',
  } : {
    bg: '#f5faf6', panel: '#ffffff', border: '#c8e6c9',
    primary: '#007A33', text: '#1a2e22',
    textSec: '#3d5c47', textMute: 'rgba(0,0,0,0.55)',
    inputBg: '#ffffff', sectionHd: '#edf7f0', rowHover: '#e8f5e9',
  };
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function PanelSection({ title, children, c, defaultOpen = true }: {
  title: string; children: React.ReactNode;
  c: ReturnType<typeof getC>; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: `1px solid ${c.border}` }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '6px 12px', cursor: 'pointer', userSelect: 'none',
          background: c.sectionHd,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: c.textMute,
        }}
      >
        {title}
        <span style={{ fontSize: 11, opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <div style={{ padding: '8px 12px' }}>{children}</div>}
    </div>
  );
}

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
  const c = getC(isDarkMode);
  const { t } = useI18n();

  const {
    status, progress, currentStep, simulationData,
    inputParams, stateVariables, sessionId,
    timeValue, timeUnit, stepValue, stepUnit, batchSize, updateInterval,
  } = state;

  // ── mode toggle ──────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'sim' | 'opt'>('sim');

  // ── loader state ─────────────────────────────────────────────────────────────
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const selectedStory = selectedKey ? loadedMods[selectedKey] ?? null : null;

  // ── opt mode state ───────────────────────────────────────────────────────────
  const [optRanges, setOptRanges] = useState<Record<string, { min: number; max: number; locked: boolean }>>({});
  const [objectives, setObjectives] = useState<Array<{ variable: string; direction: 'minimize' | 'maximize' }>>([]);
  const [constraints, setConstraints] = useState<Array<{ variable: string; op: '≤' | '≥'; value: number }>>([]);
  const [optAlgo, setOptAlgo] = useState<'NSGA-II' | 'MOEA/D'>('NSGA-II');
  const [optPop, setOptPop] = useState(100);
  const [optGen, setOptGen] = useState(200);

  // ── chart selected vars ──────────────────────────────────────────────────────
  const [selectedVars, setSelectedVars] = useState<string[]>([]);

  const isRunningRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
      Object.entries(selectedModel.content.variables).forEach(([name, data]: [string, any]) => {
        if (data.type === 'input') inputs[name] = data.value;
        else if (data.type === 'state') states[name] = data.value;
      });
      set('inputParams', inputs);
      set('stateVariables', states);
      const ranges: typeof optRanges = {};
      Object.entries(inputs).forEach(([name, val]) => {
        ranges[name] = { min: 0, max: (val as number) * 2 || 1, locked: true };
      });
      setOptRanges(ranges);
    }
    if (selectedModel?.content?.simulator) {
      const sim = selectedModel.content.simulator;
      set('stepValue', sim.step_size || 3600);
      set('stepUnit', 'second');
      set('timeValue', (sim.total_time || 86400) / 3600);
      set('timeUnit', 'day');
      if (sim.output_variables?.length) setSelectedVars(sim.output_variables.slice(0, 3));
    }
  }, [selectedModel]);

  // ── load tree on mount ───────────────────────────────────────────────────────
  useEffect(() => {
    if (storyTree.length === 0) loadFileTree();
  }, []);

  // ── reset validation on selection change ─────────────────────────────────────
  useEffect(() => {
    setValidationResult(null);
    setIsLocked(false);
  }, [selectedKey]);

  // ── chart drawing ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || simulationData.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    ctx.clearRect(0, 0, W, H);

    const vars = selectedVars.length > 0
      ? selectedVars
      : (selectedModel?.content?.simulator?.output_variables || Object.keys(stateVariables).slice(0, 3));
    const colors = ['#007A33', '#52c41a', '#00897B', '#2E7D32', '#43A047', '#1565C0'];
    const PAD = { l: 44, r: 16, t: 18, b: 28 };
    const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;

    ctx.strokeStyle = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.t + (plotH / 4) * i;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      const x = PAD.l + (plotW / 6) * i;
      ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + plotH); ctx.stroke();
    }

    vars.forEach((varName: string, idx: number) => {
      const values = simulationData.map(d => d[varName] ?? 0);
      const minV = Math.min(...values), maxV = Math.max(...values);
      const range = maxV - minV || 1;
      ctx.strokeStyle = colors[idx % colors.length];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      simulationData.forEach((d, i) => {
        const x = PAD.l + (i / Math.max(simulationData.length - 1, 1)) * plotW;
        const y = PAD.t + plotH - ((d[varName] ?? 0) - minV) / range * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      // legend dot + label
      const lx = PAD.l + idx * 110;
      ctx.fillStyle = colors[idx % colors.length];
      ctx.fillRect(lx, 4, 12, 5);
      ctx.fillStyle = isDarkMode ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)';
      ctx.font = '10px system-ui';
      ctx.fillText(varName, lx + 15, 10);
    });

    ctx.fillStyle = isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
    ctx.font = '9px system-ui';
    const n = simulationData.length;
    [0, 0.25, 0.5, 0.75, 1].forEach(frac => {
      const idx2 = Math.round(frac * (n - 1));
      const x = PAD.l + frac * plotW;
      const t2 = simulationData[idx2]?.time ?? 0;
      ctx.fillText(`${(t2 / 3600).toFixed(0)}h`, x - 8, H - 6);
    });
  }, [simulationData, selectedVars, selectedModel, stateVariables, isDarkMode]);

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
                title: <span>{item.title} <Tag color="blue" style={{ fontSize: 11 }}>pkg</Tag></span>,
                titleStr: item.title, mod_type: 'story',
              };
            }
          }
          return {
            title: item.type === 'file'
              ? <span>{titleStr}{item.mod_type && <Tag color="blue" style={{ marginLeft: 6, fontSize: 11 }}>{item.mod_type}</Tag>}</span>
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
      message.error(`加载失败: ${e.message}`);
    } finally {
      setTreeLoading(false);
    }
  };

  const loadFileContent = async (filePath: string) => {
    setTreeLoading(true);
    try {
      const cleanPath = filePath.replace(/^mods\//, '');
      const fileResult = await fetch(`${API_BASE}/file/${cleanPath}`).then(r => r.json());
      if (!fileResult.success) { message.error(`读取失败: ${fileResult.error}`); return; }
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
      message.error(`加载失败: ${e.message}`);
    } finally {
      setTreeLoading(false);
    }
  };

  const handleSelect = (keys: React.Key[]) => {
    if (!keys.length) return;
    const key = keys[0] as string;
    if (!key.endsWith('.yaml') && !key.endsWith('.yml')) return;
    setSelectedKey(key);
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
    setValidationResult(result);
    if (result.valid) {
      setIsLocked(true);
      message.success('✅ 验证通过，场景已锁定');
    } else {
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
  const modelMeta = selectedModel?.content?.metadata || {};
  const references: string[] = modelMeta.references || modelMeta.citations || [];
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
        message.error(result.error || '启动失败');
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
          if (res.data.completed) { set('status', 'completed'); isRunningRef.current = false; message.success('仿真完成'); }
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
        if (res.data.completed) message.success('仿真完成');
      }
    } catch (e: any) { message.error(e.message); }
  };

  const pauseSimulation = () => { isRunningRef.current = false; set('status', 'paused'); };
  const resetSimulation = () => {
    isRunningRef.current = false;
    set('status', 'idle'); set('progress', 0); set('currentStep', 0); setSimData([]);
  };
  const exportCSV = async () => {
    if (!sessionId) return;
    try {
      const r = await fetch(`${API_BASE}/simulation/export`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const res = await r.json();
      if (res.success) message.success('已导出');
    } catch (e: any) { message.error(e.message); }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // LEFT PANEL
  // ─────────────────────────────────────────────────────────────────────────────

  // Section content: Parameters
  const renderParamsContent = () => (
    <div style={{ padding: '8px 0' }}>
      {/* Input parameters */}
      {inputVars.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: c.textMute, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            输入参数
          </div>
          {inputVars.map(v => (
            <div key={v.name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: c.textSec, flex: 1 }}>{v.name}</span>
                {v.unit && <span style={{ fontSize: 12, color: c.textMute }}>{v.unit}</span>}
                <Tag color="cyan" style={{ fontSize: 11, margin: 0 }}>{v.type || 'input'}</Tag>
              </div>
              {mode === 'opt' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Tooltip title={optRanges[v.name]?.locked ? '锁定' : '优化范围'}>
                    <Button
                      size="small" type="text"
                      icon={optRanges[v.name]?.locked ? <LockOutlined /> : <SwapOutlined />}
                      onClick={() => setOptRanges(r => ({ ...r, [v.name]: { ...r[v.name], locked: !r[v.name]?.locked } }))}
                      style={{ color: optRanges[v.name]?.locked ? c.textMute : c.primary, padding: '0 4px' }}
                    />
                  </Tooltip>
                  {optRanges[v.name]?.locked
                    ? <InputNumber size="small" value={inputParams[v.name] ?? v.value}
                        onChange={val => set('inputParams', { ...inputParams, [v.name]: val || 0 })}
                        style={{ flex: 1 }} />
                    : <>
                        <InputNumber size="small" placeholder="min" value={optRanges[v.name]?.min ?? 0}
                          onChange={val => setOptRanges(r => ({ ...r, [v.name]: { ...r[v.name], min: val || 0 } }))}
                          style={{ flex: 1 }} />
                        <span style={{ color: c.textMute, fontSize: 11 }}>~</span>
                        <InputNumber size="small" placeholder="max" value={optRanges[v.name]?.max ?? 1}
                          onChange={val => setOptRanges(r => ({ ...r, [v.name]: { ...r[v.name], max: val || 1 } }))}
                          style={{ flex: 1 }} />
                      </>
                  }
                </div>
              ) : (
                <InputNumber
                  size="small" value={inputParams[v.name] ?? v.value}
                  onChange={val => set('inputParams', { ...inputParams, [v.name]: val || 0 })}
                  style={{ width: '100%' }}
                />
              )}
              {v.description && <div style={{ fontSize: 12, color: c.textMute, marginTop: 2 }}>{v.description}</div>}
            </div>
          ))}
        </>
      )}

      {/* State variables */}
      {stateVars.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: c.textMute, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '12px 0 6px' }}>
            状态变量
          </div>
          {stateVars.map(v => (
            <div key={v.name} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, color: c.textSec }}>{v.name}</div>
                {v.description && <div style={{ fontSize: 12, color: c.textMute }}>{v.description}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: c.primary }}>
                  {(latestData[v.name] ?? v.value ?? 0).toFixed(4)}
                </div>
                {v.unit && <div style={{ fontSize: 11, color: c.textMute }}>{v.unit}</div>}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Probability constants */}
      {probConsts.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: c.textMute, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '12px 0 6px' }}>
            概率常数
          </div>
          {probConsts.map(v => (
            <div key={v.name} style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, color: c.textSec }}>{v.name}</div>
                {v.description && <div style={{ fontSize: 12, color: c.textMute }}>{v.description}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: c.textSec }}>{v.value}</span>
                {v.unit && <span style={{ fontSize: 11, color: c.textMute }}>{v.unit}</span>}
                <LockOutlined style={{ fontSize: 12, color: c.textMute }} />
              </div>
            </div>
          ))}
        </>
      )}

      {inputVars.length === 0 && stateVars.length === 0 && probConsts.length === 0 && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先选择场景" />
      )}
    </div>
  );

  // Section content: Formulas
  const renderFormulasContent = () => {
    const entries = Object.entries(formulas);
    if (entries.length === 0) return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无公式" style={{ marginTop: 20 }} />
    );
    return (
      <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.map(([name, detail]: [string, any]) => (
          <div key={name} style={{
            border: `1px solid ${c.border}`, borderRadius: 4, padding: '6px 8px',
            background: c.sectionHd,
          }}>
            <div style={{ marginBottom: 4 }}>
              <Tooltip title={detail.condition != null && detail.condition !== true ? `条件: ${String(detail.condition)}` : undefined}>
                <strong style={{ fontSize: 12, color: c.text, cursor: detail.condition != null && detail.condition !== true ? 'help' : 'default' }}>
                  {name}{detail.condition != null && detail.condition !== true ? ' *' : ''}
                </strong>
              </Tooltip>
            </div>
            <code style={{ fontSize: 11, whiteSpace: 'pre-wrap', display: 'block', color: isDarkMode ? '#86efac' : '#007A33', lineHeight: 1.6 }}>
              {typeof detail.dynamics === 'object' && detail.dynamics
                ? Object.entries(detail.dynamics).map(([v2, e]) => `${v2} = ${e}`).join('\n')
                : String(detail.dynamics ?? '')}
            </code>
          </div>
        ))}
      </div>
    );
  };

  // Section content: Regimens/Schedules
  const renderRegimensContent = () => {
    const entries = Object.entries(schedules);
    if (entries.length === 0) return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无计划表" style={{ marginTop: 20 }} />
    );
    return (
      <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map(([name, sched]: [string, any]) => (
          <div key={name} style={{ border: `1px solid ${c.border}`, borderRadius: 4, padding: '6px 8px', background: c.sectionHd }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <strong style={{ fontSize: 12, color: c.text }}>{name}</strong>
              <Tag style={{ fontSize: 11 }}>{sched.interpolation || 'step'}</Tag>
            </div>
            {sched.recurrence && (
              <div style={{ fontSize: 12, color: c.textMute, marginBottom: 4 }}>
                {sched.recurrence}{sched.days_of_week ? ` · ${sched.days_of_week.join(' ')}` : ''}
              </div>
            )}
            {sched.points?.map((pt: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, fontFamily: 'monospace', color: c.text, marginBottom: 2 }}>
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

  // Section content: Objectives + Constraints + Algorithm (opt mode)
  const renderOptContent = () => (
    <div style={{ padding: '8px 0' }}>
      {/* Objectives */}
      <div style={{ fontSize: 12, fontWeight: 700, color: c.textMute, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>优化目标</div>
      {objectives.map((obj, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: c.textMute, width: 14 }}>{i + 1}.</span>
          <Select size="small" value={obj.variable} style={{ flex: 1 }}
            options={allVarNames.map(n => ({ label: n, value: n }))}
            onChange={v => setObjectives(p => p.map((o, j) => j === i ? { ...o, variable: v } : o))} />
          <Select size="small" value={obj.direction} style={{ width: 80 }}
            options={[{ label: '最小化', value: 'minimize' }, { label: '最大化', value: 'maximize' }]}
            onChange={v => setObjectives(p => p.map((o, j) => j === i ? { ...o, direction: v } : o))} />
          <Button size="small" danger icon={<MinusCircleOutlined />}
            onClick={() => setObjectives(p => p.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="small" icon={<PlusOutlined />} block
        onClick={() => setObjectives(p => [...p, { variable: allVarNames[0] || '', direction: 'minimize' }])}
        style={{ borderColor: c.border, color: c.textSec, marginBottom: 14 }}>
        添加目标
      </Button>

      {/* Constraints */}
      <div style={{ fontSize: 12, fontWeight: 700, color: c.textMute, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>约束条件</div>
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
        添加约束
      </Button>

      {/* Algorithm */}
      <div style={{ fontSize: 12, fontWeight: 700, color: c.textMute, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>算法配置</div>
      <Select size="small" value={optAlgo}
        options={[{ label: 'NSGA-II', value: 'NSGA-II' }, { label: 'MOEA/D', value: 'MOEA/D' }]}
        onChange={v => setOptAlgo(v as any)} style={{ width: '100%', marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: c.textMute, marginBottom: 3 }}>种群</div>
          <InputNumber size="small" value={optPop} onChange={v => setOptPop(v || 100)} style={{ width: '100%' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: c.textMute, marginBottom: 3 }}>代数</div>
          <InputNumber size="small" value={optGen} onChange={v => setOptGen(v || 200)} style={{ width: '100%' }} />
        </div>
      </div>
    </div>
  );


  // ─────────────────────────────────────────────────────────────────────────────
  // CENTER PANEL
  // ─────────────────────────────────────────────────────────────────────────────
  const renderCenterPanel = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0 10px' }}>
      {/* Variable selector */}
      <div style={{
        padding: '7px 0 5px', borderBottom: `1px solid ${c.border}`,
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, color: c.textMute, flexShrink: 0 }}>显示</span>
        {outputVars.map(v => (
          <Tag
            key={v}
            onClick={() => setSelectedVars(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])}
            style={{
              cursor: 'pointer', userSelect: 'none', fontSize: 11, margin: 0,
              borderColor: selectedVars.includes(v) ? c.primary : c.border,
              background: selectedVars.includes(v) ? (isDarkMode ? 'rgba(82,196,26,0.15)' : 'rgba(0,122,51,0.08)') : 'transparent',
              color: selectedVars.includes(v) ? c.primary : c.textSec,
            }}
          >
            {v}
          </Tag>
        ))}
      </div>

      {/* Chart */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, paddingTop: 8 }}>
        {simulationData.length === 0 ? (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: c.textMute, fontSize: 12,
            border: `1px dashed ${c.border}`, borderRadius: 6,
            flexDirection: 'column', gap: 8,
          }}>
            {!isLocked
              ? <><span style={{ fontSize: 18 }}>📂</span><span>在左侧选择场景并锁定后运行</span></>
              : status === 'idle'
                ? <><span style={{ fontSize: 18 }}>▶</span><span>点击"运行仿真"开始</span></>
                : <span>正在计算…</span>
            }
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{
              width: '100%', height: '100%', display: 'block',
              background: isDarkMode ? '#0a1409' : '#fafffe',
              border: `1px solid ${c.border}`, borderRadius: 6,
            }}
          />
        )}
      </div>

      {/* Opt mode Pareto placeholder */}
      {mode === 'opt' && (
        <div style={{
          marginTop: 8, padding: 12, flexShrink: 0,
          border: `1px dashed ${c.border}`, borderRadius: 6,
          textAlign: 'center', color: c.textMute, fontSize: 11,
        }}>
          Pareto 前沿 – 多目标优化后显示
        </div>
      )}

      {/* Latest values */}
      {simulationData.length > 0 && (
        <div style={{ paddingTop: 8, flexShrink: 0, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(selectedVars.length > 0 ? selectedVars : outputVars).map(v => (
            <div key={v} style={{
              padding: '4px 8px',
              background: isDarkMode ? '#111f16' : '#f0f7f1',
              border: `1px solid ${c.border}`, borderRadius: 6,
            }}>
              <div style={{ fontSize: 11, color: c.textMute }}>{v}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: c.text, fontFamily: 'monospace' }}>
                {(latestData[v] ?? 0).toFixed(4)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // RIGHT PANEL: metadata
  // ─────────────────────────────────────────────────────────────────────────────
  const renderRightPanel = () => (
    <div style={{
      width: 280, flexShrink: 0,
      borderLeft: `1px solid ${c.border}`,
      background: c.panel, overflowY: 'auto',
    }}>
      {!selectedStory ? (
        <div style={{ padding: 16, fontSize: 11, color: c.textMute }}>选择场景后显示参数</div>
      ) : (
        <>
          <PanelSection
            title={`参数${inputVars.length + stateVars.length > 0 ? ` (${inputVars.length + stateVars.length})` : ''}`}
            c={c}
          >
            {renderParamsContent()}
          </PanelSection>
          <PanelSection
            title={`计划表${Object.keys(schedules).length > 0 ? ` (${Object.keys(schedules).length})` : ''}`}
            c={c} defaultOpen={false}
          >
            {renderRegimensContent()}
          </PanelSection>
          {mode === 'opt' && (
            <PanelSection title="目标 / 约束 / 算法" c={c}>
              {renderOptContent()}
            </PanelSection>
          )}
          {simulationData.length > 0 && (
            <PanelSection title="运行统计" c={c}>
              <div style={{ fontSize: 11, color: c.textSec, marginBottom: 3 }}>
                步数: <span style={{ color: c.text, fontFamily: 'monospace' }}>{currentStep}</span>
              </div>
              <div style={{ fontSize: 11, color: c.textSec, marginBottom: 3 }}>
                数据点: <span style={{ color: c.text, fontFamily: 'monospace' }}>{simulationData.length}</span>
              </div>
              <div style={{ fontSize: 11, color: c.textSec }}>
                状态: <Tag color={
                  status === 'running' ? 'processing' : status === 'completed' ? 'success' :
                  status === 'paused' ? 'warning' : 'default'
                } style={{ fontSize: 11 }}>{status.toUpperCase()}</Tag>
              </div>
            </PanelSection>
          )}
        </>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  const countLeaves = (nodes: DataNode[]): number => {
    let n = 0;
    nodes.forEach(node => { if (node.isLeaf) n++; else if (node.children) n += countLeaves(node.children); });
    return n;
  };
  const total = countLeaves(storyTree);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '7px 12px', flexShrink: 0,
        borderBottom: `1px solid ${c.border}`, background: c.panel,
        flexWrap: 'wrap',
      }}>
        {/* Model name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {isLocked
            ? <LockOutlined style={{ color: c.primary, fontSize: 12 }} />
            : <UnlockOutlined style={{ color: c.textMute, fontSize: 12 }} />}
          <span style={{
            fontFamily: 'monospace', fontSize: 12,
            color: isLocked ? c.text : c.textMute,
            maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {selectedModel?.title || '— 未选择场景 —'}
          </span>
        </div>

        {/* Mode segmented */}
        <Segmented
          size="small"
          value={mode}
          onChange={v => setMode(v as 'sim' | 'opt')}
          options={[{ label: '仿真模式', value: 'sim' }, { label: '优化模式', value: 'opt' }]}
          style={{ flexShrink: 0 }}
        />

        <div style={{ width: 1, height: 18, background: c.border, flexShrink: 0 }} />

        {/* Duration */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: c.textMute }}>时长</span>
          <InputNumber size="small" value={timeValue} onChange={v => set('timeValue', v || 1)} style={{ width: 60 }} min={0} />
          <Select size="small" value={timeUnit} onChange={v => set('timeUnit', v)} style={{ width: 72 }}
            options={[{ label: 'Hour', value: 'hour' }, { label: 'Day', value: 'day' }, { label: 'Month', value: 'month' }, { label: 'Year', value: 'year' }]} />
        </div>

        {/* Step */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: c.textMute }}>步长</span>
          <InputNumber size="small" value={stepValue} onChange={v => set('stepValue', v || 1)} style={{ width: 60 }} min={0} />
          <Select size="small" value={stepUnit} onChange={v => set('stepUnit', v)} style={{ width: 68 }}
            options={[{ label: 'Sec', value: 'second' }, { label: 'Min', value: 'minute' }, { label: 'Hour', value: 'hour' }, { label: 'Day', value: 'day' }]} />
        </div>
      </div>

      {/* ── Three-column body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT: scenario browser + model detail */}
        <div style={{
          width: 300, flexShrink: 0,
          borderRight: `1px solid ${c.border}`,
          background: c.panel,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Scenario browser (top ~38%) */}
          <div style={{
            flex: '0 0 38%', display: 'flex', flexDirection: 'column',
            borderBottom: `2px solid ${c.border}`,
            minHeight: 120, overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6,
              background: c.sectionHd, borderBottom: `1px solid ${c.border}`, flexShrink: 0,
            }}>
              <BookOutlined style={{ color: c.primary, fontSize: 12 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: c.text, flex: 1 }}>
                场景 ({total})
              </span>
              <Input
                size="small" placeholder="搜索" value={storyFilter}
                onChange={e => setStoryFilter(e.target.value)}
                prefix={<FilterOutlined style={{ color: c.textMute, fontSize: 12 }} />}
                style={{ width: 90 }}
              />
              <Tooltip title={storyViewMode === 'tree' ? '切换列表' : '切换树形'}>
                <Button size="small" type="text"
                  icon={storyViewMode === 'tree' ? <UnorderedListOutlined /> : <ClusterOutlined />}
                  onClick={() => setStoryViewMode(storyViewMode === 'tree' ? 'list' : 'tree')}
                  style={{ color: c.textMute, padding: '0 3px' }}
                />
              </Tooltip>
              <Tooltip title="刷新">
                <Button size="small" type="text" icon={<ReloadOutlined />}
                  onClick={() => { setSelectedKey(null); setConfirmedModel(null); setValidationResult(null); setIsLocked(false); loadFileTree(); }}
                  style={{ color: c.textMute, padding: '0 3px' }}
                />
              </Tooltip>
            </div>

            {/* Tree / List */}
            <Spin spinning={treeLoading} indicator={<LoadingOutlined />} style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ flex: 1, overflow: 'auto', padding: '4px 4px' }}>
                {storyViewMode === 'tree' ? (
                  <Tree
                    showIcon
                    expandedKeys={expandedKeys}
                    onExpand={setExpandedKeys}
                    selectedKeys={selectedKey ? [selectedKey] : []}
                    onSelect={handleSelect}
                    treeData={storyTree}
                    style={{ fontSize: 12 }}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {storyList.length === 0
                      ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无场景" style={{ marginTop: 16 }} />
                      : storyList.map((mod: any) => (
                          <div
                            key={mod.key}
                            onClick={() => handleSelect([mod.key])}
                            style={{
                              display: 'flex', alignItems: 'center', padding: '4px 8px',
                              borderRadius: 4, cursor: 'pointer', fontSize: 12,
                              background: selectedKey === mod.key ? c.rowHover : 'transparent',
                              color: c.text,
                            }}
                          >
                            <BookOutlined style={{ marginRight: 6, color: c.textMute, fontSize: 11 }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {mod.displayTitle}
                            </span>
                          </div>
                        ))
                    }
                  </div>
                )}
              </div>
            </Spin>
          </div>

          {/* Model detail (bottom ~62%) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!selectedStory ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择场景后显示详情" />
              </div>
            ) : (
              <>
                {/* Title + validate button */}
                <div style={{
                  padding: '6px 10px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  borderBottom: `1px solid ${c.border}`,
                  background: c.sectionHd,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: c.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedStory.title}
                    {isLocked && <Tag color="success" icon={<LockOutlined />} style={{ marginLeft: 6, fontSize: 11 }}>已锁定</Tag>}
                  </span>
                  <Button
                    type={isLocked ? 'default' : 'primary'}
                    danger={isLocked}
                    size="small"
                    icon={isLocked ? <UnlockOutlined /> : <CheckCircleOutlined />}
                    loading={validating}
                    onClick={isLocked
                      ? () => { setIsLocked(false); setValidationResult(null); }
                      : handleValidateAndLock}
                    style={{ flexShrink: 0, marginLeft: 6 }}
                  >
                    {isLocked ? '解锁' : '验证锁定'}
                  </Button>
                </div>

                {/* Validation result */}
                {validationResult && (
                  <Alert
                    type={validationResult.valid ? 'success' : 'error'}
                    message={validationResult.valid ? '验证通过' : '验证失败'}
                    description={!validationResult.valid && validationResult.errors.length > 0 && (
                      <div style={{ maxHeight: 80, overflow: 'auto', fontSize: 12, fontFamily: 'monospace' }}>
                        {validationResult.errors.map((err, i) => (
                          <div key={i} style={{ marginBottom: 2 }}>• {err}</div>
                        ))}
                      </div>
                    )}
                    showIcon closable onClose={() => setValidationResult(null)}
                    style={{ margin: '4px 8px', fontSize: 11 }}
                  />
                )}

                {/* Basic info + Formulas as collapsible sections */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <PanelSection title="基本信息" c={c}>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: c.textMute, marginBottom: 2 }}>路径</div>
                      <code style={{ fontSize: 11, color: c.primary, wordBreak: 'break-all' }}>{selectedStory.path}</code>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      {selectedStory.type && <Tag style={{ fontSize: 11 }}>{selectedStory.type.toUpperCase()}</Tag>}
                      {selectedStory.category && <Tag color="blue" style={{ fontSize: 11 }}>{selectedStory.category}</Tag>}
                    </div>
                    {modelMeta.description && (
                      <div style={{ fontSize: 11, color: c.textSec, lineHeight: 1.5, marginBottom: 6 }}>
                        {modelMeta.description}
                      </div>
                    )}
                    {selectedStory.imports && selectedStory.imports.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: c.textMute, marginBottom: 3 }}>导入模型</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {selectedStory.imports.map((imp: string, i: number) => (
                            <Tag key={i} color="cyan" style={{ fontSize: 11, margin: 0 }}>{imp}</Tag>
                          ))}
                        </div>
                      </div>
                    )}
                  </PanelSection>
                  <PanelSection
                    title={`公式${Object.keys(formulas).length > 0 ? ` (${Object.keys(formulas).length})` : ''}`}
                    c={c} defaultOpen={Object.keys(formulas).length > 0}
                  >
                    {renderFormulasContent()}
                  </PanelSection>
                </div>
              </>
            )}
          </div>
        </div>

        {/* CENTER */}
        {renderCenterPanel()}

        {/* RIGHT */}
        {renderRightPanel()}
      </div>

      {/* ── Bottom bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', flexShrink: 0,
        borderTop: `1px solid ${c.border}`, background: c.panel,
      }}>
        {!isLocked && <span style={{ fontSize: 11, color: '#faad14' }}>⚠ 需先验证锁定场景</span>}

        <Button type="primary" size="small" icon={<PlayCircleOutlined />}
          onClick={startSimulation} disabled={!isLocked || status === 'running'}>
          {mode === 'opt' ? '运行优化' : status === 'running' ? '运行中' : '运行仿真'}
        </Button>
        <Button size="small" icon={<PauseOutlined />} onClick={pauseSimulation} disabled={status !== 'running'}>暂停</Button>
        <Button size="small" icon={<StopOutlined />} danger onClick={resetSimulation}>停止</Button>
        <Button size="small" icon={<StepForwardOutlined />} onClick={runSingleStep} disabled={!sessionId || status === 'running'}>单步</Button>
        <Button size="small" icon={<DownloadOutlined />} onClick={exportCSV} disabled={simulationData.length === 0}>导出</Button>

        <div style={{ flex: 1, maxWidth: 260 }}>
          <div style={{
            height: 6, background: isDarkMode ? '#1e3824' : '#e8f5e9',
            borderRadius: 3, overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress}%`, height: '100%',
              background: c.primary, transition: 'width 0.3s',
              borderRadius: 3,
            }} />
          </div>
        </div>
        {progress > 0 && <span style={{ fontSize: 11, color: c.textMute, fontFamily: 'monospace' }}>{Math.round(progress)}%</span>}

        <span style={{ fontSize: 11, color: c.textMute, marginLeft: 'auto', fontFamily: 'monospace' }}>
          step {currentStep}
        </span>
      </div>
    </div>
  );
};

export default Simulator;
