/**
 * OptSetupTab — left panel for the Optimization tab.
 *
 * Three sections (collapsible SortableCards):
 *   1. "决策变量" (optInputs) — T1–T4 per-variable editor
 *   2. "背景输入"  (optBackgrounds) — fixed background during evaluation
 *   3. "优化器配置" — objectives / constraints / algorithm
 *
 * Transfer:
 *   "← 从 Sim 导入" copies current sim inputEvents into optInputs with auto bounds.
 */
import React, { useRef, useState, useEffect } from 'react';
import { Button, InputNumber, Input, Select, Slider, Tooltip } from 'antd';
import { HolderOutlined, MinusCircleOutlined, PlusOutlined, SwapLeftOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { InputEvent, OptInput } from '../types';
import { getC } from '../core/theme';

interface OptSetupTabProps {
  optInputs: OptInput[];
  addOptInput: () => void;
  updateOptInput: (id: string, patch: Partial<OptInput>) => void;
  removeOptInput: (id: string) => void;
  optBackgrounds: InputEvent[];
  addOptBackground: () => void;
  updateOptBackground: (id: string, patch: Partial<InputEvent>) => void;
  removeOptBackground: (id: string) => void;
  inputVars: Array<{ name: string; [k: string]: any }>;
  allVarNames: string[];
  openSections: Set<string>;
  setOpenSections: React.Dispatch<React.SetStateAction<Set<string>>>;
  simStartDate: string;
  simEndDate: string;
  objectives: Array<{ variable: string; direction: 'minimize' | 'maximize' }>;
  setObjectives: React.Dispatch<React.SetStateAction<Array<{ variable: string; direction: 'minimize' | 'maximize' }>>>;
  constraints: Array<{ variable: string; op: '≤' | '≥'; value: number }>;
  setConstraints: React.Dispatch<React.SetStateAction<Array<{ variable: string; op: '≤' | '≥'; value: number }>>>;
  optAlgo: 'NSGA-II' | 'MOEA/D' | 'l-bfgs-b' | 'nelder-mead';
  setOptAlgo: React.Dispatch<React.SetStateAction<'NSGA-II' | 'MOEA/D' | 'l-bfgs-b' | 'nelder-mead'>>;
  optPop: number;
  setOptPop: React.Dispatch<React.SetStateAction<number>>;
  optGen: number;
  setOptGen: React.Dispatch<React.SetStateAction<number>>;
  onImportFromSim: () => void;
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  t: (key: string) => string;
}

const OptSetupTab: React.FC<OptSetupTabProps> = ({
  optInputs, addOptInput, updateOptInput, removeOptInput,
  optBackgrounds, addOptBackground, updateOptBackground, removeOptBackground,
  inputVars, allVarNames, openSections, setOpenSections,
  simStartDate, simEndDate,
  objectives, setObjectives, constraints, setConstraints,
  optAlgo, setOptAlgo, optPop, setOptPop, optGen, setOptGen,
  onImportFromSim, isDarkMode, c, t,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const DAY_LABELS = t('sim.setup.day_labels').split(',');

  const [localPop, setLocalPop] = useState(optPop);
  const [localGen, setLocalGen] = useState(optGen);
  useEffect(() => setLocalPop(optPop), [optPop]);
  useEffect(() => setLocalGen(optGen), [optGen]);
  const commitPop = (v: number) => { setLocalPop(v); setOptPop(v); };
  const commitGen = (v: number) => { setLocalGen(v); setOptGen(v); };

  const Tog = ({ label, active, title, onToggle }: {
    label: string; active: boolean; title?: string; onToggle: () => void;
  }) => (
    <Tooltip title={title}>
      <button onClick={onToggle} style={{
        fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', padding: '1px 5px', borderRadius: 3, lineHeight: 1.4,
        border: `1px solid ${active ? c.primary : c.border}`,
        background: active ? (isDarkMode ? 'rgba(82,196,26,0.18)' : 'rgba(0,122,51,0.09)') : 'transparent',
        color: active ? c.primary : c.textMute, cursor: 'pointer', flexShrink: 0,
      }}>{label}</button>
    </Tooltip>
  );

  // ── Decision variables section ──────────────────────────────────────────────
  const decisionVarsContent = (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <Tooltip title={t('sim.opt.import_from_sim_tip')}>
          <Button size="small" icon={<SwapLeftOutlined />} onClick={onImportFromSim}
            style={{ color: c.primary, borderColor: c.primary }}>
            {t('sim.opt.import_from_sim')}
          </Button>
        </Tooltip>
      </div>
      {optInputs.length === 0 && (
        <div style={{ textAlign: 'center', color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', padding: 8 }}>
          {t('sim.opt.no_inputs')}
        </div>
      )}
      {optInputs.map(oi => {
        const varDef = inputVars.find(v => v.name === oi.variable);
        return (
          <div key={oi.id} style={{ marginBottom: 6, border: `1px solid ${c.border}`, borderRadius: 5, padding: '4px 6px', background: c.panel }}>
            {/* Header row: variable selector + toggles + remove */}
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <select value={oi.variable} onChange={e => updateOptInput(oi.id, { variable: e.target.value })}
                style={{ flex: 1, minWidth: 0, fontSize: 'inherit', padding: '1px 4px', borderRadius: 4 }}>
                {inputVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
              <Tog label={t('sim.setup.tog.time')} active={oi.timeEnabled} title={t('sim.setup.tog.time_tip')} onToggle={() => updateOptInput(oi.id, { timeEnabled: !oi.timeEnabled, ...(!oi.timeEnabled && { optimizeTime: false }) })} />
              <Tog label={t('sim.setup.tog.day')} active={oi.daysEnabled} title={t('sim.setup.tog.day_tip')} onToggle={() => updateOptInput(oi.id, { daysEnabled: !oi.daysEnabled, ...(!oi.daysEnabled && { optimizeDays: false }) })} />
              <Tog label={t('sim.setup.tog.range')} active={oi.validRangeEnabled} title={t('sim.setup.tog.range_tip')} onToggle={() => updateOptInput(oi.id, {
                validRangeEnabled: !oi.validRangeEnabled,
                ...(!oi.validRangeEnabled && { validStart: simStartDate, validEnd: simEndDate }),
                ...(!oi.validRangeEnabled === false && { optimizeDateStart: false, optimizeDateEnd: false }),
              })} />
              <div style={{ flex: 1 }} />
              <Button size="small" danger type="text" icon={<MinusCircleOutlined />}
                style={{ padding: '0 2px' }} onClick={() => removeOptInput(oi.id)} />
            </div>

            {/* T1: value bounds row */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: c.textMute, flexShrink: 0, width: 28 }}>val</span>
              <InputNumber size="small" value={oi.valueBounds[0]} placeholder="lo" style={{ flex: 1, minWidth: 0 }}
                onChange={v => updateOptInput(oi.id, { valueBounds: [v ?? 0, oi.valueBounds[1]] })} />
              <span style={{ color: c.primary, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', flexShrink: 0 }}>~</span>
              <InputNumber size="small" value={oi.valueBounds[1]} placeholder="hi" style={{ flex: 1, minWidth: 0 }}
                onChange={v => updateOptInput(oi.id, { valueBounds: [oi.valueBounds[0], v ?? 1] })} />
              {varDef?.unit && <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: c.textMute, flexShrink: 0 }}>{varDef.unit}</span>}
            </div>

            {/* T2: time row */}
            {oi.timeEnabled && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3 }}>
                <Tooltip title={oi.optimizeTime ? t('sim.setup.opt.time_win_tip') : t('sim.setup.opt.time_win')}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', flexShrink: 0, width: 28 }}>
                    <input type="checkbox" checked={oi.optimizeTime}
                      onChange={e => updateOptInput(oi.id, {
                        optimizeTime: e.target.checked,
                        timeWindow: e.target.checked ? (oi.timeWindow || `${oi.time}~${oi.time}`) : oi.timeWindow,
                      })}
                      style={{ accentColor: c.primary, width: 11, height: 11 }} />
                    <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: oi.optimizeTime ? c.primary : c.textMute }}>opt</span>
                  </label>
                </Tooltip>
                {oi.optimizeTime ? (
                  <>
                    <Input size="small" value={(oi.timeWindow ?? '').split('~')[0]?.trim()} placeholder="HH:MM"
                      style={{ flex: 1, minWidth: 0, fontFamily: 'monospace' }}
                      onChange={e => { const end = (oi.timeWindow ?? '~').split('~')[1]?.trim() ?? ''; updateOptInput(oi.id, { timeWindow: `${e.target.value}~${end}` }); }} />
                    <span style={{ color: c.primary, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', flexShrink: 0 }}>~</span>
                    <Input size="small" value={(oi.timeWindow ?? '~').split('~')[1]?.trim()} placeholder="HH:MM"
                      style={{ flex: 1, minWidth: 0, fontFamily: 'monospace' }}
                      onChange={e => { const s = (oi.timeWindow ?? '~').split('~')[0]?.trim() ?? ''; updateOptInput(oi.id, { timeWindow: `${s}~${e.target.value}` }); }} />
                    <select value={oi.optStep ?? '1h'} onChange={e => updateOptInput(oi.id, { optStep: e.target.value })}
                      style={{ width: 60, fontSize: 'inherit', padding: '1px 3px', borderRadius: 4 }}>
                      <option value="1h">1h</option>
                      <option value="15min">15min</option>
                    </select>
                  </>
                ) : (
                  <Input size="small" value={oi.time} placeholder="HH:MM"
                    style={{ width: 70, fontFamily: 'monospace' }}
                    onChange={e => updateOptInput(oi.id, { time: e.target.value })} />
                )}
              </div>
            )}

            {/* T3: days row */}
            {oi.daysEnabled && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3 }}>
                <Tooltip title={(oi.daysOptions?.length ?? 0) > 0 ? oi.daysOptions!.map(p => p.join(' ')).join(' | ') : t('sim.setup.tog.day_opt_tip')}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', flexShrink: 0, width: 28 }}>
                    <input type="checkbox" checked={oi.optimizeDays}
                      onChange={e => updateOptInput(oi.id, { optimizeDays: e.target.checked })}
                      style={{ accentColor: c.primary, width: 11, height: 11 }} />
                    <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: oi.optimizeDays ? c.primary : c.textMute }}>opt</span>
                  </label>
                </Tooltip>
                <div style={{ display: 'flex', gap: 2 }}>
                  {DAY_LABELS.map((d, i) => (
                    <button key={i} onClick={() => updateOptInput(oi.id, { days: oi.days.map((v, j) => j === i ? !v : v) })}
                      style={{ width: 20, height: 20, borderRadius: 3, fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', cursor: 'pointer', padding: 0,
                        background: oi.days[i] ? c.primary : c.panel, color: oi.days[i] ? '#fff' : c.textMute,
                        border: `1px solid ${c.border}` }}>{d}</button>
                  ))}
                </div>
              </div>
            )}

            {/* T4: valid range / date window row */}
            {oi.validRangeEnabled && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                <Tooltip title={oi.optimizeDateStart ? t('sim.setup.opt.date_win_tip') : t('sim.setup.opt.date_win')}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', flexShrink: 0, width: 28 }}>
                    <input type="checkbox" checked={oi.optimizeDateStart}
                      onChange={e => {
                        const ds = oi.validStart || simStartDate;
                        const de = oi.validEnd || simEndDate;
                        updateOptInput(oi.id, {
                          optimizeDateStart: e.target.checked,
                          dateStartWindow: e.target.checked ? (oi.dateStartWindow || `${ds}~${ds}`) : oi.dateStartWindow,
                          dateEndWindow: e.target.checked ? (oi.dateEndWindow || `${de}~${de}`) : oi.dateEndWindow,
                          optimizeDateEnd: e.target.checked ? (oi.optimizeDateEnd) : false,
                        });
                      }}
                      style={{ accentColor: c.primary, width: 11, height: 11 }} />
                    <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: oi.optimizeDateStart ? c.primary : c.textMute }}>opt</span>
                  </label>
                </Tooltip>
                {oi.optimizeDateStart ? (
                  <>
                    <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.6786)', flexShrink: 0 }}>{t('sim.setup.opt.date_start_label')}</span>
                    <Input size="small" value={(oi.dateStartWindow ?? '').split('~')[0]?.trim()} placeholder="YYYY-MM-DD"
                      style={{ width: 88, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}
                      onChange={e => { const end = (oi.dateStartWindow ?? '~').split('~')[1]?.trim() ?? ''; updateOptInput(oi.id, { dateStartWindow: `${e.target.value}~${end}` }); }} />
                    <span style={{ color: c.primary, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', flexShrink: 0 }}>~</span>
                    <Input size="small" value={(oi.dateStartWindow ?? '~').split('~')[1]?.trim()} placeholder="YYYY-MM-DD"
                      style={{ width: 88, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}
                      onChange={e => { const s = (oi.dateStartWindow ?? '~').split('~')[0]?.trim() ?? ''; updateOptInput(oi.id, { dateStartWindow: `${s}~${e.target.value}` }); }} />
                  </>
                ) : (
                  <>
                    <Input size="small" value={oi.validStart} placeholder="YYYY-MM-DD"
                      style={{ width: 88, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}
                      onChange={e => updateOptInput(oi.id, { validStart: e.target.value })} />
                    <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}>–</span>
                    <Input size="small" value={oi.validEnd} placeholder="YYYY-MM-DD"
                      style={{ width: 88, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}
                      onChange={e => updateOptInput(oi.id, { validEnd: e.target.value })} />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      <Button size="small" icon={<PlusOutlined />} block onClick={addOptInput}
        disabled={inputVars.length === 0}
        style={{ borderColor: c.border, color: c.textSec, marginTop: 4 }}>
        {t('sim.opt.add_input')}
      </Button>
    </div>
  );

  // ── Background inputs section ────────────────────────────────────────────────
  const backgroundContent = (
    <div style={{ padding: '4px 0' }}>
      <div style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', color: c.textSec, marginBottom: 6 }}>
        {t('sim.opt.background_hint')}
      </div>
      {optBackgrounds.length === 0 && (
        <div style={{ textAlign: 'center', color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', padding: 8 }}>
          {t('sim.opt.no_background')}
        </div>
      )}
      {optBackgrounds.map(bg => {
        const varDef = inputVars.find(v => v.name === bg.variable);
        return (
          <div key={bg.id} style={{ marginBottom: 5, border: `1px solid ${c.border}`, borderRadius: 5, padding: '4px 6px', background: c.panel }}>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <select value={bg.variable} onChange={e => updateOptBackground(bg.id, { variable: e.target.value })}
                style={{ flex: 1, minWidth: 0, fontSize: 'inherit', padding: '1px 4px', borderRadius: 4 }}>
                {inputVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
              <div style={{ flex: 1 }} />
              <Button size="small" danger type="text" icon={<MinusCircleOutlined />}
                style={{ padding: '0 2px' }} onClick={() => removeOptBackground(bg.id)} />
            </div>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginTop: 3 }}>
              <InputNumber size="small" value={bg.value} style={{ flex: 1, minWidth: 0 }}
                onChange={v => updateOptBackground(bg.id, { value: v ?? 0 })} />
              {varDef?.unit && <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: c.textMute, flexShrink: 0 }}>{varDef.unit}</span>}
              {bg.timeEnabled && (
                <Input size="small" value={bg.time} placeholder="HH:MM"
                  style={{ width: 58, fontFamily: 'monospace' }}
                  onChange={e => updateOptBackground(bg.id, { time: e.target.value })} />
              )}
            </div>
          </div>
        );
      })}
      <Button size="small" icon={<PlusOutlined />} block onClick={addOptBackground}
        disabled={inputVars.length === 0}
        style={{ borderColor: c.border, color: c.textSec, marginTop: 4 }}>
        {t('sim.opt.add_background')}
      </Button>
    </div>
  );

  // ── Optimizer config section ─────────────────────────────────────────────────
  const sm = 'calc(var(--lm-font-size, 14px) * 0.7857)';
  const xs = 'calc(var(--lm-font-size, 14px) * 0.6429)';
  const PRESETS = [
    { key: 'quick',    pop: 20,  gen: 40,  labelKey: 'sim.opt.preset.quick'    },
    { key: 'standard', pop: 50,  gen: 80,  labelKey: 'sim.opt.preset.standard' },
    { key: 'fine',     pop: 100, gen: 200, labelKey: 'sim.opt.preset.fine'     },
  ];
  const activePreset = PRESETS.find(p => p.pop === optPop && p.gen === optGen)?.key ?? null;

  const configContent = (
    <div style={{ padding: '8px 0' }}>
      <div style={{ fontWeight: 700, color: c.textMute, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{t('sim.opt.objectives')}</div>
      {objectives.map((obj, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
          <span style={{ color: c.textMute, width: 14 }}>{i + 1}.</span>
          <Select size="small" value={obj.variable} style={{ flex: 1 }}
            options={allVarNames.map(n => ({ label: n === 'lm_score' ? `⭐ ${n}` : n, value: n }))}
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

      <div style={{ fontWeight: 700, color: c.textMute, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{t('sim.opt.algorithm')}</div>
      <Select size="small" value={optAlgo}
        options={[
          { label: t('sim.setup.algo.nsga2'), value: 'NSGA-II' },
          { label: t('sim.setup.algo.moead'), value: 'MOEA/D' },
          { label: t('sim.setup.algo.lbfgsb'), value: 'l-bfgs-b' },
          { label: t('sim.setup.algo.nelder'), value: 'nelder-mead' },
        ]}
        onChange={v => setOptAlgo(v as any)} style={{ width: '100%', marginBottom: 10 }} />
      {(optAlgo === 'NSGA-II' || optAlgo === 'MOEA/D') && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {PRESETS.map(p => {
              const active = activePreset === p.key;
              return (
                <button key={p.key} onClick={() => { setOptPop(p.pop); setOptGen(p.gen); }}
                  style={{ flex: 1, padding: '4px 0', borderRadius: 4, cursor: 'pointer', textAlign: 'center',
                    border: `1px solid ${active ? c.primary : c.border}`,
                    background: active ? c.activeBg : 'transparent',
                    color: active ? c.primary : c.textSec }}>
                  <div style={{ fontSize: sm, fontWeight: 600 }}>{t(p.labelKey)}</div>
                  <div style={{ fontSize: xs, color: active ? c.primary : c.textMute, fontFamily: 'monospace' }}>{p.pop}×{p.gen}</div>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ color: c.textMute, fontSize: sm, width: 28, flexShrink: 0 }}>{t('sim.opt.population')}</span>
            <Slider style={{ flex: 1, margin: '0 4px' }} min={5} max={200}
              value={Math.min(localPop, 200)} onChange={v => setLocalPop(v)}
              onChangeComplete={v => commitPop(v)} tooltip={{ formatter: null }} />
            <InputNumber size="small" min={1} value={localPop} style={{ width: 56, flexShrink: 0 }}
              onChange={v => setLocalPop(v ?? 1)} onBlur={() => commitPop(localPop)} onPressEnter={() => commitPop(localPop)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: c.textMute, fontSize: sm, width: 28, flexShrink: 0 }}>{t('sim.opt.generations')}</span>
            <Slider style={{ flex: 1, margin: '0 4px' }} min={5} max={200}
              value={Math.min(localGen, 200)} onChange={v => setLocalGen(v)}
              onChangeComplete={v => commitGen(v)} tooltip={{ formatter: null }} />
            <InputNumber size="small" min={1} value={localGen} style={{ width: 56, flexShrink: 0 }}
              onChange={v => setLocalGen(v ?? 1)} onBlur={() => commitGen(localGen)} onPressEnter={() => commitGen(localGen)} />
          </div>
        </>
      )}
    </div>
  );

  const tabs = [
    { key: 'opt-inputs', label: `${t('sim.opt.decision_vars')}${optInputs.length > 0 ? ` (${optInputs.length})` : ''}`, content: decisionVarsContent },
    { key: 'opt-bg',     label: `${t('sim.opt.background')}${optBackgrounds.length > 0 ? ` (${optBackgrounds.length})` : ''}`, content: backgroundContent },
    { key: 'opt-cfg',    label: t('sim.tabs.optimizer'), content: configContent },
  ];

  const [tabOrder, setTabOrder] = useState(tabs.map(t2 => t2.key));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setTabOrder(prev => {
        const oi2 = prev.indexOf(String(active.id));
        const ni = prev.indexOf(String(over.id));
        return arrayMove(prev, oi2, ni);
      });
    }
  };
  const orderedTabs = tabOrder.filter(k => tabs.some(t2 => t2.key === k)).map(k => tabs.find(t2 => t2.key === k)!);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedTabs.map(t2 => t2.key)} strategy={verticalListSortingStrategy}>
        <div ref={panelRef} style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orderedTabs.map(tab => (
            <SortableCard key={tab.key} id={tab.key} label={tab.label}
              isOpen={openSections.has(tab.key)}
              onToggle={() => setOpenSections(prev => { const n = new Set(prev); if (n.has(tab.key)) n.delete(tab.key); else n.add(tab.key); return n; })}
              c={c} isDarkMode={isDarkMode}>
              {tab.content}
            </SortableCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

function SortableCard({ id, label, isOpen, onToggle, c, isDarkMode, children }: {
  id: string; label: string; isOpen: boolean; onToggle: () => void;
  c: ReturnType<typeof getC>; isDarkMode: boolean; children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, borderRadius: 10, border: `1px solid ${c.border}`, boxShadow: isDarkMode ? '0 1px 5px rgba(0,0,0,0.35)' : '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden', background: c.panel, flexShrink: 0 }}>
      <div onClick={onToggle} style={{ height: 32, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', cursor: 'pointer', background: c.sectionHd, userSelect: 'none' }}>
        <span {...attributes} {...listeners} onClick={e => e.stopPropagation()} style={{ cursor: isDragging ? 'grabbing' : 'grab', color: c.textMute, display: 'flex', alignItems: 'center', padding: '0 2px' }}>
          <HolderOutlined style={{ fontSize: 13 }} />
        </span>
        <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
        <span style={{ flex: 1, fontWeight: 600, color: c.text }}>{label}</span>
      </div>
      {isOpen && <div style={{ padding: '8px 12px' }}>{children}</div>}
    </div>
  );
}

export default OptSetupTab;
