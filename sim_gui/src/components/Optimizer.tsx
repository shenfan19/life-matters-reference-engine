// sim_gui/src/components/Optimizer.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card, Button, Space, Statistic, Row, Col, InputNumber,
  message, Alert, Select, Tabs, Tag, Tooltip,
} from 'antd';
import {
  ThunderboltOutlined, StopOutlined,
  ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { OptimizerProps, StepUnit } from '../types';
import { Input } from 'antd';

const API_BASE = '/api';

function getC(dark: boolean) {
  return dark ? {
    bg: '#111111', panel: '#1a1a1a', border: '#2a2a2a',
    primary: '#52c41a', text: 'rgba(255,255,255,0.92)',
    textMute: 'rgba(255,255,255,0.45)', inputBg: '#222222',
  } : {
    bg: '#f5f5f5', panel: '#ffffff', border: '#e0e0e0',
    primary: '#007A33', text: '#1a2e22',
    textMute: 'rgba(0,0,0,0.45)', inputBg: '#ffffff',
  };
}

interface HistoryEntry {
  iteration: number;
  fitness: number | null;
  fitness_std?: number;
  n_eval?: number;
}

interface LogEntry {
  t: number;
  msg: string;
}

// ─── Canvas fitness chart ─────────────────────────────────────────────────────
function drawFitnessChart(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  history: HistoryEntry[], isDark: boolean, primaryColor: string,
) {
  ctx.clearRect(0, 0, W, H);
  const PAD = { l: 60, r: 12, t: 10, b: 28 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const validPts = history.filter(h => h.fitness != null) as (HistoryEntry & { fitness: number })[];
  if (validPts.length === 0) {
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('等待第一代数据…', W / 2, H / 2);
    return;
  }

  const xMin = validPts[0].iteration;
  const xMax = validPts[validPts.length - 1].iteration;
  const yVals = validPts.map(p => p.fitness);
  let yMin = Math.min(...yVals);
  let yMax = Math.max(...yVals);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const yPad = (yMax - yMin) * 0.1;
  yMin -= yPad; yMax += yPad;
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const toX = (i: number) => PAD.l + ((i - xMin) / xRange) * plotW;
  const toY = (v: number) => PAD.t + plotH - ((v - yMin) / yRange) * plotH;

  // Grid lines
  const gridC = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
  const textC = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)';
  ctx.strokeStyle = gridC; ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const v = yMin + (yRange / 5) * i;
    const y = toY(v);
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    ctx.fillStyle = textC; ctx.font = '9px system-ui'; ctx.textAlign = 'right';
    const lbl = Math.abs(v) >= 1000 ? v.toExponential(1) : v.toFixed(3);
    ctx.fillText(lbl, PAD.l - 4, y + 3);
  }
  for (let i = 0; i <= 5; i++) {
    const x = PAD.l + (plotW / 5) * i;
    ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + plotH); ctx.stroke();
    ctx.fillStyle = textC; ctx.font = '9px system-ui'; ctx.textAlign = 'center';
    const it = Math.round(xMin + (xRange / 5) * i);
    ctx.fillText(String(it), x, PAD.t + plotH + 14);
  }

  // Std band
  const hasStd = validPts.some(p => p.fitness_std != null && p.fitness_std > 0);
  if (hasStd) {
    ctx.save();
    ctx.fillStyle = isDark ? 'rgba(82,196,26,0.12)' : 'rgba(0,122,51,0.1)';
    ctx.beginPath();
    validPts.forEach((p, idx) => {
      const x = toX(p.iteration);
      const std = p.fitness_std || 0;
      const y = toY(p.fitness + std);
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    for (let i = validPts.length - 1; i >= 0; i--) {
      const p = validPts[i];
      const std = p.fitness_std || 0;
      ctx.lineTo(toX(p.iteration), toY(p.fitness - std));
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Fitness line
  ctx.strokeStyle = primaryColor; ctx.lineWidth = 2;
  ctx.beginPath();
  validPts.forEach((p, idx) => {
    const x = toX(p.iteration); const y = toY(p.fitness);
    if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Last point dot
  const last = validPts[validPts.length - 1];
  ctx.fillStyle = primaryColor;
  ctx.beginPath();
  ctx.arc(toX(last.iteration), toY(last.fitness), 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Axis label
  ctx.fillStyle = textC; ctx.font = '9px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('Iteration / Generation', W / 2, H - 2);
}

const OptChart: React.FC<{
  history: HistoryEntry[];
  isDark: boolean;
  primary: string;
}> = ({ history, isDark, primary }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const dpr = window.devicePixelRatio || 1;
      const W = container.clientWidth;
      const H = container.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      drawFitnessChart(ctx, W, H, history, isDark, primary);
    });
    return () => cancelAnimationFrame(frame);
  }, [history, isDark, primary]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
};

// ─── Log Console ──────────────────────────────────────────────────────────────
const LogConsole: React.FC<{
  logs: LogEntry[];
  isDark: boolean;
  c: ReturnType<typeof getC>;
}> = ({ logs, isDark, c }) => {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div style={{
      height: '100%', overflowY: 'auto',
      background: isDark ? '#0d1710' : '#f0f7f0',
      border: `1px solid ${c.border}`,
      borderRadius: 4, padding: '6px 8px',
      fontFamily: 'monospace', fontSize: 11,
      color: c.text,
    }}>
      {logs.length === 0 && (
        <span style={{ color: c.textMute }}>等待日志...</span>
      )}
      {logs.map((entry, i) => {
        const d = new Date(entry.t * 1000);
        const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        return (
          <div key={i} style={{ lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            <span style={{ color: c.textMute }}>{ts}</span>
            {' '}
            <span>{entry.msg}</span>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const Optimizer: React.FC<OptimizerProps> = ({
  selectedModel, state, setState, isLocked = false, isDarkMode,
}) => {
  const c = getC(isDarkMode);
  const {
    status, progress,
    inputParams, simStartDate, simEndDate, stepValue, stepUnit, batchSize,
  } = state;

  // Config
  const [optInnerRuns, setOptInnerRuns] = useState(5);
  const [optAggregation, setOptAggregation] = useState<'mean' | 'min' | 'median'>('mean');
  const [optVerifyRuns, setOptVerifyRuns] = useState(20);

  // Job tracking
  const [jobId, setJobId] = useState<string | null>(null);
  const [liveHistory, setLiveHistory] = useState<HistoryEntry[]>([]);
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [jobResult, setJobResult] = useState<any>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setStatus = (val: typeof state.status) => setState(prev => ({ ...prev, status: val }));
  const setInputParams = (val: Record<string, number>) => setState(prev => ({ ...prev, inputParams: val }));
  const setSimStartDate = (val: string) => setState(prev => ({ ...prev, simStartDate: val }));
  const setSimEndDate = (val: string) => setState(prev => ({ ...prev, simEndDate: val }));
  const setStepValue = (val: number) => setState(prev => ({ ...prev, stepValue: val }));
  const setStepUnit = (val: StepUnit) => setState(prev => ({ ...prev, stepUnit: val }));

  const STEP_UNITS: Record<string, number> = { day: 86400, hour: 3600, minute: 60, second: 1 };
  const dateToHours = (s: string, e: string) =>
    Math.max(0, (new Date(e + 'T00:00:00').getTime() - new Date(s + 'T00:00:00').getTime()) / 3_600_000);

  useEffect(() => {
    if (selectedModel?.content?.variables) {
      const inputs: Record<string, number> = {};
      Object.entries(selectedModel.content.variables).forEach(([name, data]: [string, any]) => {
        if (data.type === 'input') inputs[name] = data.value;
      });
      setInputParams(inputs);
    }
    if (selectedModel?.content?.simulator) {
      const sim = selectedModel.content.simulator;
      if (stepValue === 3600) {
        setStepValue(sim.step_size || 3600);
        setStepUnit('second');
        const base = '2000-01-01';
        const d = new Date(base + 'T00:00:00');
        d.setSeconds(d.getSeconds() + Math.round(sim.total_time || 86400));
        setSimStartDate(base);
        setSimEndDate(d.toISOString().slice(0, 10));
      }
    }
  }, [selectedModel]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback((jid: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${API_BASE}/optimizer/status/${jid}`);
        if (!resp.ok) return;
        const data = await resp.json();
        setLiveHistory(data.history || []);
        setLiveLogs(data.logs || []);
        setElapsed(data.elapsed || 0);
        setState(prev => ({
          ...prev,
          optimizationData: data.history || [],
          progress: data.status === 'completed' ? 100 : Math.min(99, (data.iteration / 80) * 100),
        }));
        if (data.status === 'completed') {
          setStatus('completed');
          setJobResult(data.result);
          stopPolling();
          message.success('优化完成！');
        } else if (data.status === 'failed') {
          setStatus('idle');
          setJobError(data.error || '优化失败');
          stopPolling();
          message.error(data.error || '优化失败');
        } else if (data.status === 'cancelled') {
          setStatus('idle');
          stopPolling();
        }
      } catch { /* ignore poll errors */ }
    }, 1500);
  }, [stopPolling]);

  const startYamlOpt = async () => {
    if (!selectedModel) { message.warning('请先选择模型'); return; }
    stopPolling();
    setStatus('running'); setLiveHistory([]); setLiveLogs([]);
    setElapsed(0); setJobResult(null); setJobError(null);
    setState(prev => ({ ...prev, progress: 0, optimizationData: [] }));

    // 优先用完整相对路径，find_model_file 支持带 / 的路径直接查找
    const modelName = selectedModel.key || selectedModel.content?.metadata?.name || '';
    try {
      const resp = await fetch(`${API_BASE}/optimizer/run_yaml`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: modelName, folder: null }),
      });
      const data = await resp.json();
      if (data.success && data.job_id) {
        setJobId(data.job_id);
        startPolling(data.job_id);
      } else {
        message.error(data.detail || data.error || '启动失败');
        setStatus('idle');
      }
    } catch (e: any) { message.error(e.message); setStatus('idle'); }
  };


  const handleCancel = async () => {
    stopPolling();
    if (jobId) {
      try { await fetch(`${API_BASE}/optimizer/job/${jobId}`, { method: 'DELETE' }); } catch {}
    }
    setStatus('idle');
  };

  const handleReset = () => {
    stopPolling();
    setJobId(null); setLiveHistory([]); setLiveLogs([]);
    setElapsed(0); setJobResult(null); setJobError(null);
    setState(prev => ({ ...prev, status: 'idle', progress: 0, optimizationData: [] }));
  };

  const handleStepUnitChange = (newUnit: StepUnit) => {
    const seconds = stepValue * (STEP_UNITS[stepUnit] || 1);
    setStepValue(Number((seconds / (STEP_UNITS[newUnit] || 1)).toFixed(2)));
    setStepUnit(newUnit);
  };

  const isRunning = status === 'running';
  const isCompleted = status === 'completed';
  const currentBest = liveHistory.length > 0
    ? liveHistory.filter(h => h.fitness != null).reduce((b, h) => (h.fitness! < b.fitness! ? h : b), liveHistory.find(h => h.fitness != null)!)
    : null;

  // ── Config Panel ─────────────────────────────────────────────────────────
  const renderConfig = () => (
    <Card size="small" style={{ borderRadius: 4, border: `1px solid ${c.border}`, background: c.panel }}>
      <Space direction="vertical" style={{ width: '100%' }} size={10}>
        {!isLocked && <Alert message="模型未锁定，请先在 Simulator 中锁定模型" type="warning" showIcon />}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: c.textMute, marginBottom: 3 }}>时间范围</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Input size="small" value={simStartDate} placeholder="YYYY-MM-DD"
                onChange={e => setSimStartDate(e.target.value)}
                style={{ width: 105, fontFamily: 'monospace' }} />
              <span style={{ color: c.textMute, fontSize: 11 }}>~</span>
              <Input size="small" value={simEndDate} placeholder="YYYY-MM-DD"
                onChange={e => setSimEndDate(e.target.value)}
                style={{ width: 105, fontFamily: 'monospace' }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: c.textMute, marginBottom: 3 }}>步长</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <Select size="small" value={stepUnit} onChange={handleStepUnitChange}
                options={[{ label: '秒', value: 'second' }, { label: '分', value: 'minute' }, { label: '时', value: 'hour' }, { label: '天', value: 'day' }]}
                style={{ width: 60 }} />
              <InputNumber size="small" value={stepValue} onChange={v => setStepValue(v || 1)} style={{ width: 70 }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: c.textMute, marginBottom: 3 }}>MC 内评估次数</div>
            <InputNumber size="small" value={optInnerRuns} min={1} max={20}
              onChange={v => setOptInnerRuns(v || 1)} style={{ width: 70 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: c.textMute, marginBottom: 3 }}>聚合方式</div>
            <Select size="small" value={optAggregation} onChange={v => setOptAggregation(v)} style={{ width: 80 }}
              options={[{ label: '均值', value: 'mean' }, { label: '最坏', value: 'min' }, { label: '中位数', value: 'median' }]} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: c.textMute, marginBottom: 3 }}>验证条数</div>
            <InputNumber size="small" value={optVerifyRuns} min={1} max={50}
              onChange={v => setOptVerifyRuns(v || 1)} style={{ width: 70 }} />
          </div>
        </div>

        <Space wrap>
          <Button type="primary" icon={<ThunderboltOutlined />}
            onClick={startYamlOpt}
            disabled={!isLocked || isRunning}
            style={{ background: isRunning ? undefined : '#007A33', borderColor: '#007A33' }}>
            NSGA-II 优化
          </Button>
          {isRunning && (
            <Button danger icon={<StopOutlined />} onClick={handleCancel}>停止</Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={handleReset} disabled={isRunning}>重置</Button>
        </Space>
      </Space>
    </Card>
  );

  // ── Status bar ────────────────────────────────────────────────────────────
  const renderStatusBar = () => {
    if (status === 'idle' && !jobError) return null;
    const statusTag = isRunning
      ? <Tag icon={<LoadingOutlined />} color="processing">运行中</Tag>
      : isCompleted
        ? <Tag icon={<CheckCircleOutlined />} color="success">已完成</Tag>
        : jobError
          ? <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>
          : null;

    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '6px 10px', borderRadius: 4,
        background: isDarkMode ? '#0d1710' : '#f6ffed',
        border: `1px solid ${c.border}`,
        fontSize: 12,
      }}>
        {statusTag}
        <span style={{ color: c.textMute }}>
          elapsed: <span style={{ fontFamily: 'monospace', color: c.text }}>{elapsed.toFixed(1)}s</span>
        </span>
        <span style={{ color: c.textMute }}>
          iterations: <span style={{ fontFamily: 'monospace', color: c.text }}>{liveHistory.length}</span>
        </span>
        {currentBest?.fitness != null && (
          <span style={{ color: c.textMute }}>
            best: <span style={{ fontFamily: 'monospace', color: c.primary }}>{currentBest.fitness.toFixed(5)}</span>
          </span>
        )}
        {jobError && <span style={{ color: '#ff4d4f' }}>{jobError}</span>}
      </div>
    );
  };

  // ── Progress panel: chart + logs ──────────────────────────────────────────
  const renderProgress = () => {
    if (status === 'idle' && liveHistory.length === 0 && liveLogs.length === 0) return null;

    return (
      <div style={{ display: 'flex', gap: 8, height: 220 }}>
        {/* Fitness chart */}
        <div style={{
          flex: 3, border: `1px solid ${c.border}`, borderRadius: 4,
          padding: 4, background: c.panel, minWidth: 0,
        }}>
          <div style={{ fontSize: 10, color: c.textMute, marginBottom: 2, paddingLeft: 4 }}>
            Fitness vs Iteration
          </div>
          <div style={{ height: 'calc(100% - 18px)' }}>
            <OptChart history={liveHistory} isDark={isDarkMode} primary={c.primary} />
          </div>
        </div>

        {/* Log console */}
        <div style={{ flex: 2, minWidth: 0 }}>
          <LogConsole logs={liveLogs} isDark={isDarkMode} c={c} />
        </div>
      </div>
    );
  };

  // ── Results ───────────────────────────────────────────────────────────────
  const renderResults = () => {
    if (!isCompleted || !jobResult) return null;
    const r = jobResult;
    return (
      <Card size="small" style={{ borderRadius: 4, border: `1px solid ${c.border}`, background: c.panel }}>
        <Row gutter={[16, 8]}>
          {r.best_f != null && (
            <Col span={8}>
              <Statistic title="最优目标值" value={Array.isArray(r.best_f) ? r.best_f[0]?.toFixed(5) : r.best_f?.toFixed ? r.best_f.toFixed(5) : r.best_f}
                valueStyle={{ fontSize: 16, color: c.primary }} />
            </Col>
          )}
          {r.n_solutions != null && (
            <Col span={8}>
              <Statistic title="Pareto 解数" value={r.n_solutions}
                valueStyle={{ fontSize: 16 }} />
            </Col>
          )}
          {r.verification?.mean != null && (
            <Col span={8}>
              <Statistic title={`验证均值 (N=${r.verification.verify_runs})`}
                value={r.verification.mean.toFixed(5)}
                valueStyle={{ fontSize: 16, color: c.primary }} />
            </Col>
          )}
        </Row>
        {r.verification && (
          <div style={{
            marginTop: 8, padding: '6px 10px',
            background: isDarkMode ? '#1a2a1a' : '#f6ffed',
            borderRadius: 4, fontSize: 11, color: isDarkMode ? '#95de64' : '#389e0d',
            fontFamily: 'monospace',
          }}>
            验证分布: mean={r.verification.mean.toFixed(4)}, std={r.verification.std.toFixed(4)},
            range=[{r.verification.min.toFixed(4)}, {r.verification.max.toFixed(4)}]
          </div>
        )}
        {r.best_x && (
          <div style={{
            marginTop: 8, padding: '6px 10px',
            background: isDarkMode ? '#111' : '#fafafa',
            borderRadius: 4, fontSize: 11, fontFamily: 'monospace', color: c.textMute,
          }}>
            最优参数: [{(r.best_x as number[]).map((v: number) => v.toFixed(4)).join(', ')}]
          </div>
        )}
      </Card>
    );
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 2 }}>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        {renderConfig()}
        {renderStatusBar()}
        {renderProgress()}
        {renderResults()}
      </Space>
    </div>
  );
};

export default Optimizer;
