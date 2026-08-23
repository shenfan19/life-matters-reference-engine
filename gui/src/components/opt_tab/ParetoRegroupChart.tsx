import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Select } from 'antd';
import { getC } from '../../core/theme';
import { useI18n } from '../../core/i18n';

const SERIES_COLORS = ['#3b82d8', '#d89a1d', '#9254de', '#13a8a8', '#d4622f'];

type Field = { key: string; label: string };
type ChartPoint = { xv: number; yv: number; gv: number };

const ParetoRegroupChart: React.FC<{
  result: any;
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  fontSize: number;
  xKey?: string;
  yKey?: string;
  groupKey?: string;
  onXKeyChange: (key: string) => void;
  onYKeyChange: (key: string) => void;
  onGroupKeyChange: (key: string) => void;
}> = ({ result, isDarkMode, c, fontSize, xKey: xKeyProp, yKey: yKeyProp, groupKey: groupKeyProp, onXKeyChange, onYKeyChange, onGroupKeyChange }) => {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; xv: number; yv: number; label: string } | null>(null);

  const objectives = result?.objectives || [];
  const front = result?.pareto_front || [];
  const xLen = front[0]?.x?.length || 0;
  const labels: string[] | undefined = result?.decision_var_labels;

  const fields: Field[] = useMemo(() => ([
    ...objectives.map((o: any, i: number) => ({ key: `f${i}`, label: o.variable || `f${i + 1}` })),
    ...Array.from({ length: xLen }, (_, i) => ({ key: `x${i}`, label: labels?.[i] || `x${i + 1}` })),
  ]), [objectives, xLen, labels]);

  const decisionFields = fields.filter(f => f.key.startsWith('x'));
  const defaultX = decisionFields[0]?.key || fields[0]?.key;
  const defaultY = fields.find(f => f.key.startsWith('f') && f.key !== defaultX)?.key || fields[1]?.key;
  const defaultGroup = decisionFields.find(f => f.key !== defaultX)?.key || 'none';

  // Session-persisted selection wins as long as it's still valid for the current
  // result's fields; otherwise fall back to the computed default. No local state:
  // the parent (per-model session) is the single source of truth, so the selection
  // survives page refresh and switching models and back without a resync effect.
  const xKey = fields.some(f => f.key === xKeyProp) ? xKeyProp! : defaultX;
  const yKey = fields.some(f => f.key === yKeyProp) ? yKeyProp! : defaultY;
  const groupKey = groupKeyProp === 'none' || fields.some(f => f.key === groupKeyProp) ? groupKeyProp! : defaultGroup;

  const valueOf = (p: any, key: string): number => {
    if (!key) return NaN;
    const i = Number(key.slice(1));
    return key[0] === 'f' ? Number(p.f?.[i]) : Number(p.x?.[i]);
  };

  const points = front
    .map((p: any) => ({ xv: valueOf(p, xKey), yv: valueOf(p, yKey), gv: groupKey === 'none' ? 0 : valueOf(p, groupKey) }))
    .filter((p: any) => Number.isFinite(p.xv) && Number.isFinite(p.yv));

  const groups = useMemo(() => {
    if (groupKey === 'none' || points.length === 0) {
      return [{ label: t('sim.opt.regroup_all') || '全部解', points: [...points].sort((a: any, b: any) => a.xv - b.xv) }];
    }
    const gvs = points.map((p: ChartPoint) => p.gv);
    const uniq = Array.from(new Set<number>(gvs.map((v: number) => Math.round(v * 100) / 100))).sort((a, b) => a - b);
    const groupField = fields.find(f => f.key === groupKey);
    if (uniq.length <= 6) {
      return uniq.map(v => ({
        label: `${groupField?.label || groupKey}=${v}`,
        points: points.filter((p: ChartPoint) => Math.round(p.gv * 100) / 100 === v).sort((a: ChartPoint, b: ChartPoint) => a.xv - b.xv),
      })).filter(g => g.points.length > 0);
    }
    const gMin = Math.min(...gvs), gMax = Math.max(...gvs);
    const nBins = 5;
    const width = (gMax - gMin) / nBins || 1;
    const bins = Array.from({ length: nBins }, (_, i) => ({
      lo: gMin + i * width, hi: gMin + (i + 1) * width, points: [] as any[],
    }));
    points.forEach((p: any) => {
      const idx = Math.min(nBins - 1, Math.floor((p.gv - gMin) / width));
      bins[Math.max(0, idx)].points.push(p);
    });
    return bins.filter(b => b.points.length > 0).map(b => ({
      label: `${groupField?.label || groupKey} ${b.lo.toFixed(2)}–${b.hi.toFixed(2)}`,
      points: b.points.sort((a: any, b2: any) => a.xv - b2.xv),
    }));
  }, [points, groupKey, fields, t]);

  const PAD = { l: 52, r: 16, t: 10, b: 44 };

  const draw = () => {
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

    const xs = points.map((p: any) => p.xv), ys = points.map((p: any) => p.yv);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = xMax - xMin || 1, yRange = yMax - yMin || 1;
    const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
    const toX = (v: number) => PAD.l + ((v - xMin) / xRange) * plotW;
    const toY = (v: number) => PAD.t + plotH - ((v - yMin) / yRange) * plotH;

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
      ctx.fillText((xMin + (xRange / 4) * i).toFixed(2), PAD.l + (plotW / 4) * i, H - 4);
    }
    ctx.save(); ctx.translate(10, PAD.t + plotH / 2); ctx.rotate(-Math.PI / 2);
    for (let i = 0; i <= 4; i++) {
      ctx.fillText((yMin + (yRange / 4) * i).toFixed(2), -(plotH / 4) * i + plotH / 2, 8);
    }
    ctx.restore();

    groups.forEach((g, gi) => {
      const color = groupKey === 'none' ? c.primary : SERIES_COLORS[gi % SERIES_COLORS.length];
      ctx.strokeStyle = color; ctx.lineWidth = 1.6;
      ctx.beginPath();
      g.points.forEach((p: any, i: number) => {
        const cx = toX(p.xv), cy = toY(p.yv);
        if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
      g.points.forEach((p: any) => {
        const cx = toX(p.xv), cy = toY(p.yv);
        ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = isDarkMode ? '#111' : '#fff'; ctx.lineWidth = 1; ctx.stroke();
      });
    });
  };

  useEffect(() => { draw(); }, [result, xKey, yKey, groupKey, isDarkMode, fontSize]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    const xs = points.map((p: any) => p.xv), ys = points.map((p: any) => p.yv);
    const xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = xMax - xMin || 1, yRange = yMax - yMin || 1;
    const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
    const toX = (v: number) => PAD.l + ((v - xMin) / xRange) * plotW;
    const toY = (v: number) => PAD.t + plotH - ((v - yMin) / yRange) * plotH;
    let best: any = null, bestD = 15;
    groups.forEach(g => g.points.forEach((p: any) => {
      const cx = toX(p.xv), cy = toY(p.yv);
      const d = Math.hypot(mx - cx, my - cy);
      if (d < bestD) { bestD = d; best = { x: mx, y: my, xv: p.xv, yv: p.yv, label: g.label }; }
    }));
    setHover(best);
  };

  const xLabel = fields.find(f => f.key === xKey)?.label || xKey;
  const yLabel = fields.find(f => f.key === yKey)?.label || yKey;

  if (fields.length < 2) {
    return <div style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', padding: '8px 4px' }}>
      {t('sim.opt.regroup_empty') || '至少需要 2 个目标/决策变量'}
    </div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>{t('sim.opt.regroup_x') || 'X 轴'}</span>
        <Select size="small" value={xKey} onChange={onXKeyChange} style={{ minWidth: '12ch' }}
          options={fields.map(f => ({ value: f.key, label: f.label }))} />
        <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>{t('sim.opt.regroup_y') || 'Y 轴'}</span>
        <Select size="small" value={yKey} onChange={onYKeyChange} style={{ minWidth: '12ch' }}
          options={fields.map(f => ({ value: f.key, label: f.label }))} />
        <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>{t('sim.opt.regroup_group') || '分组'}</span>
        <Select size="small" value={groupKey} onChange={onGroupKeyChange} style={{ minWidth: '12ch' }}
          options={[
            { value: 'none', label: t('sim.opt.regroup_group_none') || '不分组' },
            ...fields.filter(f => f.key !== xKey && f.key !== yKey).map(f => ({ value: f.key, label: f.label })),
          ]} />
      </div>
      <div style={{ position: 'relative', width: '100%', height: 240 }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }}
          onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)} />
        {hover && (
          <div style={{
            position: 'absolute', left: hover.x + 10, top: Math.max(0, hover.y - 10),
            background: c.panel, border: `1px solid ${c.border}`, borderRadius: 4, padding: '4px 8px',
            fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', color: c.text, pointerEvents: 'none', whiteSpace: 'pre',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 10,
          }}>
            {`${hover.label}\n${xLabel}: ${hover.xv.toFixed(4)}\n${yLabel}: ${hover.yv.toFixed(4)}`}
          </div>
        )}
      </div>
      {groupKey !== 'none' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
          {groups.map((g, gi) => (
            <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', color: c.textSec }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: SERIES_COLORS[gi % SERIES_COLORS.length], display: 'inline-block' }} />
              <span style={{ fontFamily: 'monospace' }}>{g.label}</span>
              <span style={{ color: c.textMute }}>(n={g.points.length})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ParetoRegroupChart;
