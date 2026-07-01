import React, { useState, useEffect, useRef } from 'react';
import { Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { SimulationDataPoint, PlanResult } from '../../types';
import { getC } from '../../core/theme';

export const VAR_COLORS = ['#007A33', '#52c41a', '#00897B', '#2E7D32', '#43A047', '#1565C0'];
export const PLAN_COLORS = ['#e53935', '#1e88e5', '#ff7043', '#7b1fa2', '#0097a7', '#558b2f'];

function niceTickStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / mag;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * mag;
}

function drawChartOnCtx(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  varName: string, data: SimulationDataPoint[], isDark: boolean, lineColor: string,
  runsData?: SimulationDataPoint[][],
  uiFontSize = 14,
  planDatasets?: PlanResult[]
) {
  ctx.clearRect(0, 0, W, H);
  const PAD = { l: 58, r: 12, t: 8, b: 28 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const tickFont = `${Math.max(7, uiFontSize * 9 / 14)}px system-ui`;

  const activePlans = planDatasets?.filter(p => p.data.length > 0);
  const isMultiPlan = (activePlans?.length ?? 0) > 0;
  const srcData = isMultiPlan ? activePlans![0].data : data;
  if (srcData.length === 0) return;

  // Collect all values for shared y-range
  let allValues: number[] = [];
  if (isMultiPlan) {
    for (const p of activePlans!) {
      for (const d of p.data) allValues.push((d[varName] as number) ?? 0);
      for (const rd of (p.runsData || [])) for (const d of rd) allValues.push((d[varName] as number) ?? 0);
    }
  } else {
    allValues = data.map(d => (d[varName] as number) ?? 0);
    if (runsData && runsData.length > 1) for (const rd of runsData) for (const d of rd) allValues.push((d[varName] as number) ?? 0);
  }
  let minV = Math.min(...allValues); let maxV = Math.max(...allValues);
  if (minV === maxV) { minV -= 1; maxV += 1; }
  const step = niceTickStep(maxV - minV, 5);
  const yMin = Math.floor(minV / step) * step;
  const yMax = yMin + step * Math.ceil((maxV - yMin) / step || 1);
  const yActualRange = yMax - yMin || 1;
  const tMin = srcData[0].time ?? 0;
  const tMax = srcData[srcData.length - 1].time ?? 0;
  const tRange = tMax - tMin || 1;
  const toX = (t: number) => PAD.l + ((t - tMin) / tRange) * plotW;
  const toY = (v: number) => PAD.t + plotH - ((v - yMin) / yActualRange) * plotH;

  // Grid y
  ctx.lineWidth = 1;
  const tickCount = Math.round((yMax - yMin) / step);
  for (let i = 0; i <= tickCount; i++) {
    const val = yMin + i * step;
    const y = toY(val);
    if (y < PAD.t - 1 || y > PAD.t + plotH + 1) continue;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)';
    ctx.font = tickFont; ctx.textAlign = 'right';
    const lbl = Math.abs(val) >= 1000 ? val.toExponential(1) : val % 1 === 0 ? String(val) : val.toFixed(2);
    ctx.fillText(lbl, PAD.l - 4, y + 3);
  }
  // Grid x
  const fmtX = (t: number): string => {
    if (tRange <= 172800)   return `${Math.round(t / 3600)}h`;
    if (tRange <= 1209600)  return `${Math.round(t / 86400)}d`;
    if (tRange <= 31536000) return `${Math.round(t / 604800)}w`;
    return `${Math.round(t / 2592000)}mo`;
  };
  for (let i = 0; i <= 6; i++) {
    const x = PAD.l + (plotW / 6) * i;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + plotH); ctx.stroke();
    const t = tMin + (tRange / 6) * i;
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)';
    ctx.font = tickFont; ctx.textAlign = 'center';
    ctx.fillText(fmtX(t), x, H - 6);
  }

  if (isMultiPlan) {
    // Multi-plan: draw each plan's MC traces then main curve
    for (const plan of activePlans!) {
      if (plan.data.length === 0) continue;
      if (plan.runsData && plan.runsData.length > 1) {
        const alpha = Math.max(0.2, Math.min(0.5, 3.0 / plan.runsData.length));
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1;
        ctx.strokeStyle = plan.color;
        for (const rd of plan.runsData) {
          if (rd.length === 0) continue;
          ctx.beginPath();
          rd.forEach((d, i) => {
            const x = toX(d.time ?? 0);
            const y = toY(Math.max(yMin, Math.min(yMax, (d[varName] as number) ?? 0)));
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.strokeStyle = plan.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      plan.data.forEach((d, i) => {
        const x = toX(d.time ?? 0);
        const y = toY((d[varName] as number) ?? 0);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  } else {
    // Single-plan: existing MC traces + main curve
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
    ctx.strokeStyle = lineColor; ctx.lineWidth = runsData && runsData.length > 1 ? 2 : 1.5;
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = toX(d.time ?? 0); const y = toY((d[varName] as number) ?? 0);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

const CANVAS_H = 160;

const SimChart: React.FC<{
  varName: string;
  unit?: string;
  data: SimulationDataPoint[];
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  colorIndex?: number;
  hideTitleBar?: boolean;
  runsData?: SimulationDataPoint[][];
  fontSize: number;
  planDatasets?: PlanResult[];
}> = ({ varName, unit, data, isDarkMode, c, colorIndex = 0, hideTitleBar = false, runsData, fontSize, planDatasets }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; time: number; value: number } | null>(null);

  const lineColor = VAR_COLORS[colorIndex % VAR_COLORS.length];
  const activePlans = planDatasets?.filter(p => p.data.length > 0);
  const isMultiPlan = (activePlans?.length ?? 0) > 0;

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
        runsData && runsData.length > 1 ? runsData : undefined, fontSize, planDatasets);
    });
    return () => cancelAnimationFrame(frame);
  }, [data, runsData, varName, isDarkMode, lineColor, fontSize, planDatasets]);

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

  return (
    <div
      ref={containerRef}
      style={{ marginBottom: 8, flexShrink: 0, position: 'relative', background: isDarkMode ? '#111111' : '#fafafa', border: `1px solid ${c.border}`, borderRadius: 6, overflow: 'hidden' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
    >
      {!hideTitleBar && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '3px 10px', borderBottom: `1px solid ${c.border}`,
          background: isDarkMode ? '#1a1a1a' : '#f0f0f0', flexShrink: 0,
        }}>
          {isMultiPlan ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, color: c.text, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{varName}</span>
              {activePlans!.map(plan => (
                <span key={plan.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: plan.color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ color: c.textSec, fontSize: 'calc(var(--lm-font-size, 14px) * 0.75)' }}>{plan.label}</span>
                </span>
              ))}
              {planDatasets?.some(p => p.running) && (
                <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.75)' }}>…</span>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: lineColor, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: c.text, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{varName}</span>
              {unit && <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>({unit})</span>}
            </div>
          )}
          <Button
            size="small" type="text" icon={<DownloadOutlined />}
            onClick={exportCSV}
            style={{ color: c.textMute, padding: '0 4px', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}
          >
            CSV
          </Button>
        </div>
      )}
      <canvas ref={canvasRef} style={{ width: '100%', height: CANVAS_H, display: 'block' }} />
      {hover && !isMultiPlan && (
        <>
          <div style={{ position: 'absolute', left: hover.x, top: 28 + 8, bottom: 28, width: 1, background: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: hover.x + 8, top: 36, background: isDarkMode ? '#222' : '#fff', border: `1px solid ${c.border}`, borderRadius: 4, padding: '3px 7px', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', color: c.text, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
            <div style={{ color: c.textMute }}>{(hover.time / 3600).toFixed(2)} h</div>
            <div style={{ fontWeight: 600, color: lineColor }}>{hover.value.toFixed(4)}</div>
          </div>
        </>
      )}
    </div>
  );
};

export default SimChart;

export function varToDataUrl(
  varName: string, colorIndex: number,
  simulationData: SimulationDataPoint[], fontSize: number,
  planDatasets?: PlanResult[],
  W = 680, H = 160
): string {
  const activePlans = planDatasets?.filter(p => p.data.length > 0) ?? [];
  const isMultiPlan = activePlans.length > 1;
  if (!isMultiPlan && simulationData.length === 0) return '';

  const canvas = document.createElement('canvas');
  canvas.width = W * 2; canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  drawChartOnCtx(ctx, W, H, varName, simulationData, false,
    VAR_COLORS[colorIndex % VAR_COLORS.length], undefined, fontSize,
    isMultiPlan ? activePlans : undefined);

  // Legend for multi-plan exports
  if (isMultiPlan) {
    const lgFont = Math.max(9, fontSize * 9 / 14);
    ctx.font = `${lgFont}px system-ui`;
    const sq = 8; const igap = 4; const ibetween = 10;
    const metrics = activePlans.map(p => ctx.measureText(p.label).width);
    const totalW = activePlans.reduce((s, _, i) => s + sq + igap + metrics[i] + ibetween, 0) - ibetween + 12;
    const lx = W - 14 - totalW + 8; const ly = 18;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(lx - 6, ly - lgFont - 1, totalW, lgFont + 8);
    let curX = lx;
    for (let i = 0; i < activePlans.length; i++) {
      ctx.fillStyle = activePlans[i].color;
      ctx.fillRect(curX, ly - lgFont + 2, sq, sq);
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.textAlign = 'left';
      ctx.fillText(activePlans[i].label, curX + sq + igap, ly);
      curX += sq + igap + metrics[i] + ibetween;
    }
  }

  return canvas.toDataURL('image/png');
}
