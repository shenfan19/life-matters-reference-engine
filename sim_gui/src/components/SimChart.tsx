import React, { useState, useEffect, useRef } from 'react';
import { Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { SimulationDataPoint } from '../types';
import { getC } from '../core/theme';

export const VAR_COLORS = ['#007A33', '#52c41a', '#00897B', '#2E7D32', '#43A047', '#1565C0'];

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
  uiFontSize = 14
) {
  ctx.clearRect(0, 0, W, H);
  const PAD = { l: 58, r: 12, t: 8, b: 28 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const tickFont = `${Math.max(7, uiFontSize * 9 / 14)}px system-ui`;
  if (data.length === 0) return;

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
    ctx.font = tickFont; ctx.textAlign = 'right';
    const lbl = Math.abs(val) >= 1000 ? val.toExponential(1) : val % 1 === 0 ? String(val) : val.toFixed(2);
    ctx.fillText(lbl, PAD.l - 4, y + 3);
  }
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
}> = ({ varName, unit, data, isDarkMode, c, colorIndex = 0, hideTitleBar = false, runsData, fontSize }) => {
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
        runsData && runsData.length > 1 ? runsData : undefined, fontSize);
    });
    return () => cancelAnimationFrame(frame);
  }, [data, runsData, varName, isDarkMode, lineColor, fontSize]);

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
          background: isDarkMode ? '#1a1a1a' : '#f0f0f0',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: lineColor, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: c.text, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{varName}</span>
            {unit && <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>({unit})</span>}
          </div>
          <Button
            size="small" type="text" icon={<DownloadOutlined />}
            onClick={exportCSV}
            style={{ color: c.textMute, padding: '0 4px', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}
          >
            CSV
          </Button>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: CANVAS_H, display: 'block' }}
      />
      {hover && (
        <>
          <div style={{
            position: 'absolute',
            left: hover.x,
            top: 28 + 8,
            bottom: 28,
            width: 1,
            background: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute',
            left: hover.x + 8,
            top: 36,
            background: isDarkMode ? '#222' : '#fff',
            border: `1px solid ${c.border}`,
            borderRadius: 4,
            padding: '3px 7px',
            fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)',
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

export default SimChart;

export function varToDataUrl(
  varName: string, colorIndex: number,
  simulationData: SimulationDataPoint[], fontSize: number,
  W = 680, H = 160
): string {
  if (simulationData.length === 0) return '';
  const canvas = document.createElement('canvas');
  canvas.width = W * 2; canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  drawChartOnCtx(ctx, W, H, varName, simulationData, false, VAR_COLORS[colorIndex % VAR_COLORS.length], undefined, fontSize);
  return canvas.toDataURL('image/png');
}

