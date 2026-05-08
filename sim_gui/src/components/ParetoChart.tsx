import React, { useState, useEffect, useRef } from 'react';
import { getC } from '../core/theme';

const ParetoChart: React.FC<{
  result: any;
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  fontSize: number;
}> = ({ result, isDarkMode, c, fontSize }) => {
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

    ctx.strokeStyle = isDarkMode ? '#222' : '#eee';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const x = PAD.l + (plotW / 4) * i;
      ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + plotH); ctx.stroke();
      const y = PAD.t + (plotH / 4) * i;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + plotW, y); ctx.stroke();
    }

    ctx.fillStyle = isDarkMode ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
    ctx.font = `${Math.max(8, fontSize * 10 / 14)}px monospace`; ctx.textAlign = 'center';
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

    ctx.fillStyle = isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
    ctx.font = `${Math.max(9, fontSize * 11 / 14)}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(labelX, PAD.l + plotW / 2, H - 28);
    ctx.save(); ctx.translate(12, PAD.t + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(labelY, 0, 0); ctx.restore();

    const sorted = [...pts].sort((a, b) => a.x - b.x);
    ctx.strokeStyle = isDarkMode ? '#52c41a' : '#007A33';
    ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath();
    sorted.forEach((p, i) => {
      const cx = toCanvasX(p.x), cy = toCanvasY(p.y);
      if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
    });
    ctx.stroke(); ctx.setLineDash([]);

    pts.forEach((p) => {
      const cx = toCanvasX(p.x), cy = toCanvasY(p.y);
      ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = isDarkMode ? '#52c41a' : '#007A33';
      ctx.fill();
      ctx.strokeStyle = isDarkMode ? '#111' : '#fff';
      ctx.lineWidth = 1.5; ctx.stroke();
    });
  };

  useEffect(() => { draw(); }, [result, isDarkMode, fontSize]);

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
          fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', color: c.text, pointerEvents: 'none', whiteSpace: 'pre',
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

export default ParetoChart;
