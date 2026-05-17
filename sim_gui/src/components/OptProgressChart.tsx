import React, { useEffect, useRef } from 'react';
import { getC } from '../core/theme';

const OptProgressChart: React.FC<{
  history: any[];
  metric: 'pareto_count' | 'feasible_ratio' | 'n_eval' | 'mean_cv' | 'hypervolume';
  label: string;
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  fontSize: number;
}> = ({ history, metric, label, isDarkMode, c, fontSize }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const points = history
    .map((h: any) => ({ x: Number(h.iteration ?? 0), y: Number(h[metric] ?? 0) }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = isDarkMode ? '#111' : '#fff';
    ctx.fillRect(0, 0, W, H);
    const pad = { l: 36, r: 10, t: 18, b: 24 };
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    let yMin = Math.min(...ys), yMax = Math.max(...ys);
    if (metric === 'feasible_ratio' || metric === 'hypervolume') { yMin = 0; yMax = Math.max(1, yMax); }
    const xRange = xMax - xMin || 1, yRange = yMax - yMin || 1;
    const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;
    const cx = (v: number) => pad.l + ((v - xMin) / xRange) * plotW;
    const cy = (v: number) => pad.t + plotH - ((v - yMin) / yRange) * plotH;

    ctx.strokeStyle = isDarkMode ? '#252525' : '#eee';
    for (let i = 0; i <= 3; i++) {
      const y = pad.t + (plotH / 3) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + plotW, y); ctx.stroke();
    }
    ctx.strokeStyle = c.primary;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(cx(p.x), cy(p.y)) : ctx.lineTo(cx(p.x), cy(p.y)));
    ctx.stroke();
    const last = points[points.length - 1];
    ctx.beginPath(); ctx.arc(cx(last.x), cy(last.y), 3.5, 0, Math.PI * 2); ctx.fillStyle = c.primary; ctx.fill();
    ctx.fillStyle = isDarkMode ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.62)';
    ctx.font = `${Math.max(9, fontSize * 11 / 14)}px sans-serif`;
    ctx.fillText(label, pad.l, 12);
    ctx.font = `${Math.max(8, fontSize * 10 / 14)}px monospace`;
    ctx.fillText(String(xMin), pad.l, H - 6);
    ctx.textAlign = 'right';
    ctx.fillText(String(xMax), W - pad.r, H - 6);
  }, [history, metric, label, isDarkMode, fontSize]);

  if (points.length === 0) {
    return (
      <div style={{
        height: 80,
        border: `1px dashed ${c.border}`,
        borderRadius: 4,
        background: isDarkMode ? '#111' : '#fff',
        color: c.textMute,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          inset: '18px 10px 24px 36px',
          backgroundImage: `linear-gradient(${isDarkMode ? '#252525' : '#eee'} 1px, transparent 1px)`,
          backgroundSize: '100% 33.33%',
          borderLeft: `1px solid ${c.border}`,
          borderBottom: `1px solid ${c.border}`,
        }} />
        <div style={{ position: 'absolute', left: 36, top: 4, fontSize: Math.max(9, fontSize * 11 / 14) }}>
          {label}
        </div>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>
          待运行
        </div>
      </div>
    );
  }
  return <canvas ref={canvasRef} style={{ width: '100%', height: 80, display: 'block' }} />;
};

export default OptProgressChart;
