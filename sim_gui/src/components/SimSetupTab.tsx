import React, { useRef, useState, useEffect } from 'react';
import { Button, InputNumber, Select, Slider, Tooltip, Input } from 'antd';
import { HolderOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { InputEvent, ModelFile, SimPlan } from '../types';
import { getC } from '../core/theme';

interface SimSetupTabProps {
  inputEvents: InputEvent[];
  addInputEvent: () => void;
  updateInputEvent: (id: string, patch: Partial<InputEvent>) => void;
  removeInputEvent: (id: string) => void;
  inputVars: Array<{ name: string; [k: string]: any }>;
  mode: 'sim' | 'opt';
  selectedModel: ModelFile | null;
  openSections: Set<string>;
  setOpenSections: React.Dispatch<React.SetStateAction<Set<string>>>;
  sectionWeights: Record<string, number>;
  setSectionWeights: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  SECTION_H: number;
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
  allVarNames: string[];
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  t: (key: string) => string;
  plans?: SimPlan[];
  activePlanId?: string;
  onSelectPlan?: (id: string) => void;
  onAddPlan?: () => void;
  onRemovePlan?: (id: string) => void;
}

const SimSetupTab: React.FC<SimSetupTabProps> = ({
  inputEvents, addInputEvent, updateInputEvent, removeInputEvent,
  inputVars, mode, selectedModel,
  openSections, setOpenSections, sectionWeights: _sw, setSectionWeights: _ssw, SECTION_H: _sh,
  objectives, setObjectives, constraints, setConstraints,
  optAlgo, setOptAlgo, optPop, setOptPop, optGen, setOptGen,
  allVarNames, isDarkMode, c, t,
  plans, activePlanId, onSelectPlan, onAddPlan, onRemovePlan,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const DAY_LABELS = t('sim.setup.day_labels').split(',');

  // Local state for slider/input — only propagate to parent on commit (mouseup / blur / Enter)
  const [localPop, setLocalPop] = useState(optPop);
  const [localGen, setLocalGen] = useState(optGen);
  useEffect(() => setLocalPop(optPop), [optPop]);
  useEffect(() => setLocalGen(optGen), [optGen]);
  const commitPop = (v: number) => { setLocalPop(v); setOptPop(v); };
  const commitGen = (v: number) => { setLocalGen(v); setOptGen(v); };

  const Tog = ({ label, active, disabled, title, onToggle }: {
    label: string; active: boolean; disabled?: boolean; title?: string; onToggle: () => void;
  }) => (
    <Tooltip title={title}>
      <button
        onClick={disabled ? undefined : onToggle}
        style={{
          fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', padding: '1px 5px', borderRadius: 3, lineHeight: 1.4,
          border: `1px solid ${active ? c.primary : c.border}`,
          background: active ? (isDarkMode ? 'rgba(82,196,26,0.18)' : 'rgba(0,122,51,0.09)') : 'transparent',
          color: disabled ? c.border : active ? c.primary : c.textMute,
          cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
        }}
      >{label}</button>
    </Tooltip>
  );

  const optVars = new Set<string>(
    ((selectedModel?.content?.optimizer?.inputs ?? []) as any[])
      .filter((e: any) => e.optimize?.value).map((e: any) => e.variable)
  );
  const visibleEvents = mode === 'opt' && optVars.size > 0
    ? inputEvents.filter(ev => optVars.has(ev.variable))
    : inputEvents;

  const inputsContent = (
    <div style={{ padding: '4px 0' }}>
      {visibleEvents.length === 0 && (
        <div style={{ textAlign: 'center', color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', padding: 8 }}>
          {mode === 'opt' ? t('sim.setup.no_opt_vars') : t('sim.setup.no_events')}
        </div>
      )}
      {visibleEvents.map(ev => {
        const varDef = inputVars.find(v => v.name === ev.variable);
        const bounds = varDef?.bounds as [number, number] | undefined;
        const hasDetails = ev.timeEnabled || ev.daysEnabled || ev.validRangeEnabled;
        return (
          <div key={ev.id} style={{ marginBottom: 5, border: `1px solid ${c.border}`, borderRadius: 5, padding: '4px 6px', background: c.panel }}>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <Select size="small" value={ev.variable} style={{ flex: 1, minWidth: 0 }}
                options={inputVars.map(v => ({ label: v.name, value: v.name }))}
                onChange={val => updateInputEvent(ev.id, {
                  variable: val,
                  valueBounds: [(inputVars.find(v => v.name === val)?.bounds as any)?.[0] ?? 0, (inputVars.find(v => v.name === val)?.bounds as any)?.[1] ?? 1],
                })} />
              <Tog label={t('sim.setup.tog.value')} active disabled title={t('sim.setup.tog.value_tip')} onToggle={() => {}} />
              <Tog label={t('sim.setup.tog.time')} active={ev.timeEnabled} title={t('sim.setup.tog.time_tip')} onToggle={() => updateInputEvent(ev.id, { timeEnabled: !ev.timeEnabled })} />
              <Tog label={t('sim.setup.tog.day')} active={ev.daysEnabled} title={t('sim.setup.tog.day_tip')} onToggle={() => updateInputEvent(ev.id, { daysEnabled: !ev.daysEnabled })} />
              <Tog label={t('sim.setup.tog.range')} active={ev.validRangeEnabled} title={t('sim.setup.tog.range_tip')} onToggle={() => updateInputEvent(ev.id, { validRangeEnabled: !ev.validRangeEnabled })} />
              <div style={{ flex: 1 }} />
              <Button size="small" danger type="text" icon={<MinusCircleOutlined />}
                style={{ padding: '0 2px' }} onClick={() => removeInputEvent(ev.id)} />
            </div>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginTop: 3 }}>
              <InputNumber size="small" value={ev.value} style={{ flex: 1, minWidth: 0 }}
                onChange={v => updateInputEvent(ev.id, { value: v ?? 0 })} />
              {varDef?.unit && <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: c.textMute, flexShrink: 0 }}>{varDef.unit}</span>}
              {mode === 'opt' && (
                <Tooltip title={ev.optimizeValue ? t('sim.setup.unopt') : t('sim.setup.addopt')}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', flexShrink: 0 }}>
                    <input type="checkbox" checked={ev.optimizeValue}
                      onChange={e => updateInputEvent(ev.id, {
                        optimizeValue: e.target.checked,
                        valueBounds: ev.valueBounds[0] === 0 && ev.valueBounds[1] === 1
                          ? [bounds?.[0] ?? 0, bounds?.[1] ?? ((ev.value * 2) || 1)]
                          : ev.valueBounds,
                      })}
                      style={{ accentColor: c.primary, width: 11, height: 11 }} />
                    <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: ev.optimizeValue ? c.primary : c.textMute }}>opt</span>
                  </label>
                </Tooltip>
              )}
              {mode === 'opt' && ev.optimizeValue && (
                <>
                  <InputNumber size="small" value={ev.valueBounds[0]} placeholder="lo" style={{ width: 48 }}
                    onChange={v => updateInputEvent(ev.id, { valueBounds: [v ?? 0, ev.valueBounds[1]] })} />
                  <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', flexShrink: 0 }}>~</span>
                  <InputNumber size="small" value={ev.valueBounds[1]} placeholder="hi" style={{ width: 48 }}
                    onChange={v => updateInputEvent(ev.id, { valueBounds: [ev.valueBounds[0], v ?? 1] })} />
                </>
              )}
            </div>
            {hasDetails && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                {/* 时间：固定时间点 or 时窗（~ = 可优化） */}
                {ev.timeEnabled && (<>
                  {mode === 'opt' && ev.optimizeValue && ev.optimizeTime ? (
                    // 时窗模式：~ 分隔表示可优化
                    <>
                      <Input size="small"
                        value={(ev.timeWindow ?? '').split('~')[0]?.trim()}
                        placeholder="HH:MM"
                        style={{ width: 52, fontFamily: 'monospace' }}
                        onChange={e => {
                          const end = (ev.timeWindow ?? '~').split('~')[1]?.trim() ?? '';
                          updateInputEvent(ev.id, { timeWindow: `${e.target.value}~${end}` });
                        }} />
                      <span style={{ color: c.primary, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', flexShrink: 0 }}>~</span>
                      <Input size="small"
                        value={(ev.timeWindow ?? '~').split('~')[1]?.trim()}
                        placeholder="HH:MM"
                        style={{ width: 52, fontFamily: 'monospace' }}
                        onChange={e => {
                          const start = (ev.timeWindow ?? '~').split('~')[0]?.trim() ?? '';
                          updateInputEvent(ev.id, { timeWindow: `${start}~${e.target.value}` });
                        }} />
                      <Select size="small" value={ev.optStep ?? '1h'} style={{ width: 64 }}
                        options={[{ value: '1h', label: '1h' }, { value: '15min', label: '15min' }]}
                        onChange={v => updateInputEvent(ev.id, { optStep: v })} />
                    </>
                  ) : (
                    // 固定时间点
                    <Input size="small" value={ev.time} placeholder="HH:mm"
                      style={{ width: 58, fontFamily: 'monospace' }}
                      onChange={e => updateInputEvent(ev.id, { time: e.target.value })} />
                  )}
                  {/* ~ checkbox：切换时窗优化 */}
                  {mode === 'opt' && ev.optimizeValue && (
                    <Tooltip title={ev.optimizeTime ? t('sim.setup.opt.time_win_tip') : t('sim.setup.opt.time_win')}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', flexShrink: 0 }}>
                        <input type="checkbox" checked={ev.optimizeTime ?? false}
                          onChange={e => updateInputEvent(ev.id, {
                            optimizeTime: e.target.checked,
                            timeWindow: e.target.checked ? `${ev.time}~${ev.time}` : ev.timeWindow,
                          })}
                          style={{ accentColor: c.primary, width: 11, height: 11 }} />
                        <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: (ev.optimizeTime ?? false) ? c.primary : c.textMute }}>opt</span>
                      </label>
                    </Tooltip>
                  )}
                </>)}
                {/* 星期：粗框选中态；T3 ~ checkbox（仅 YAML 提供 daysOptions 时出现） */}
                {ev.daysEnabled && (
                  <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    {DAY_LABELS.map((d, i) => (
                      <button key={i}
                        onClick={() => updateInputEvent(ev.id, { days: ev.days.map((v, j) => j === i ? !v : v) })}
                        style={{ width: 20, height: 20, borderRadius: 3, fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', cursor: 'pointer', padding: 0,
                          ...(ev.optimizeDays
                            ? { background: ev.days[i] ? c.primary : c.panel, color: ev.days[i] ? '#fff' : c.textMute, border: `1px solid ${c.border}` }
                            : { background: c.panel, color: ev.days[i] ? c.primary : c.textMute, border: ev.days[i] ? `2px solid ${c.primary}` : `1px solid ${c.border}`, fontWeight: ev.days[i] ? 700 : 400 })
                        }}>{d}</button>
                    ))}
                    {mode === 'opt' && ev.optimizeValue && (
                      <Tooltip title={(ev.daysOptions?.length ?? 0) > 0
                        ? ev.daysOptions!.map(p => p.join(' ')).join(' | ')
                        : t('sim.setup.tog.day_opt_tip')}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', marginLeft: 2, flexShrink: 0 }}>
                          <input type="checkbox" checked={ev.optimizeDays ?? false}
                            onChange={e => updateInputEvent(ev.id, { optimizeDays: e.target.checked })}
                            style={{ accentColor: c.primary, width: 11, height: 11 }} />
                          <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: ev.optimizeDays ? c.primary : c.textMute }}>opt</span>
                        </label>
                      </Tooltip>
                    )}
                  </div>
                )}
                {/* 有效期：固定用 -，滑动窗口用 ~ */}
                {ev.validRangeEnabled && (<>
                  {mode === 'opt' && ev.optimizeValue && ev.optimizeDateStart ? (
                    // 窗口模式：~ 分隔表示可优化
                    <>
                      <Input size="small"
                        value={(ev.dateStartWindow ?? '').split('~')[0]?.trim()}
                        placeholder="YYYY-MM-DD"
                        style={{ width: 90, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}
                        onChange={e => {
                          const end = (ev.dateStartWindow ?? '~').split('~')[1]?.trim() ?? '';
                          updateInputEvent(ev.id, { dateStartWindow: `${e.target.value}~${end}` });
                        }} />
                      <span style={{ color: c.primary, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', flexShrink: 0 }}>~</span>
                      <Input size="small"
                        value={(ev.dateStartWindow ?? '~').split('~')[1]?.trim()}
                        placeholder="YYYY-MM-DD"
                        style={{ width: 90, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}
                        onChange={e => {
                          const start = (ev.dateStartWindow ?? '~').split('~')[0]?.trim() ?? '';
                          updateInputEvent(ev.id, { dateStartWindow: `${start}~${e.target.value}` });
                        }} />
                    </>
                  ) : (
                    // 固定范围：- 分隔表示确定
                    <>
                      <Input size="small" value={ev.validStart} placeholder="YYYY-MM-DD"
                        style={{ width: 88, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}
                        onChange={e => updateInputEvent(ev.id, { validStart: e.target.value })} />
                      <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', flexShrink: 0 }}>-</span>
                      <Input size="small" value={ev.validEnd} placeholder="YYYY-MM-DD"
                        style={{ width: 88, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}
                        onChange={e => updateInputEvent(ev.id, { validEnd: e.target.value })} />
                    </>
                  )}
                  {/* ~ checkbox：切换滑动窗口优化 */}
                  {mode === 'opt' && ev.optimizeValue && (
                    <Tooltip title={ev.optimizeDateStart ? t('sim.setup.opt.date_win_tip') : t('sim.setup.opt.date_win')}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', flexShrink: 0 }}>
                        <input type="checkbox" checked={ev.optimizeDateStart ?? false}
                          onChange={e => updateInputEvent(ev.id, {
                            optimizeDateStart: e.target.checked,
                            dateStartWindow: e.target.checked ? `${ev.validStart}~${ev.validEnd}` : ev.dateStartWindow,
                          })}
                          style={{ accentColor: c.primary, width: 11, height: 11 }} />
                        <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: (ev.optimizeDateStart ?? false) ? c.primary : c.textMute }}>opt</span>
                      </label>
                    </Tooltip>
                  )}
                </>)}
              </div>
            )}
          </div>
        );
      })}
      <Button size="small" icon={<PlusOutlined />} block onClick={addInputEvent}
        disabled={inputVars.length === 0}
        style={{ borderColor: c.border, color: c.textSec, marginTop: 4 }}>
        {t('sim.setup.add_event')}
      </Button>
    </div>
  );

  const optContent = (
    <div style={{ padding: '8px 0' }}>
      {!!(selectedModel?.content?.optimizer?.enabled !== false && selectedModel?.content?.optimizer) && (
        <div style={{ background: c.sectionHd, border: `1px solid ${c.border}`, borderRadius: 4, padding: '4px 8px', marginBottom: 10, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', color: c.textSec }}>
          {t('sim.setup.opt_config_hint')}
        </div>
      )}
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
      {(optAlgo === 'NSGA-II' || optAlgo === 'MOEA/D') && (() => {
        const PRESETS = [
          { key: 'quick',    pop: 20,  gen: 40,  labelKey: 'sim.opt.preset.quick'    },
          { key: 'standard', pop: 50,  gen: 80,  labelKey: 'sim.opt.preset.standard' },
          { key: 'fine',     pop: 100, gen: 200, labelKey: 'sim.opt.preset.fine'     },
        ];
        const activeKey = PRESETS.find(p => p.pop === optPop && p.gen === optGen)?.key ?? null;
        const sm = 'calc(var(--lm-font-size, 14px) * 0.7857)';
        const xs = 'calc(var(--lm-font-size, 14px) * 0.6429)';
        return (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {PRESETS.map(p => {
                const active = activeKey === p.key;
                return (
                  <button key={p.key} onClick={() => { setOptPop(p.pop); setOptGen(p.gen); }}
                    style={{ flex: 1, padding: '4px 0', borderRadius: 4, cursor: 'pointer', textAlign: 'center',
                      border: `1px solid ${active ? c.primary : c.border}`,
                      background: active ? c.activeBg : 'transparent',
                      color: active ? c.primary : c.textSec }}>
                    <div style={{ fontSize: sm, fontWeight: 600 }}>{t(p.labelKey)}</div>
                    <div style={{ fontSize: xs, color: active ? c.primary : c.textMute, fontFamily: 'monospace' }}>
                      {p.pop}×{p.gen}
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ color: c.textMute, fontSize: sm, width: 28, flexShrink: 0 }}>{t('sim.opt.population')}</span>
              <Slider style={{ flex: 1, margin: '0 4px' }} min={5} max={200}
                value={Math.min(localPop, 200)} onChange={v => setLocalPop(v)}
                onChangeComplete={v => commitPop(v)} tooltip={{ formatter: null }} />
              <InputNumber size="small" min={1} value={localPop}
                onChange={v => setLocalPop(v ?? 1)}
                onBlur={() => commitPop(localPop)}
                onPressEnter={() => commitPop(localPop)}
                style={{ width: 56, flexShrink: 0 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: c.textMute, fontSize: sm, width: 28, flexShrink: 0 }}>{t('sim.opt.generations')}</span>
              <Slider style={{ flex: 1, margin: '0 4px' }} min={5} max={200}
                value={Math.min(localGen, 200)} onChange={v => setLocalGen(v)}
                onChangeComplete={v => commitGen(v)} tooltip={{ formatter: null }} />
              <InputNumber size="small" min={1} value={localGen}
                onChange={v => setLocalGen(v ?? 1)}
                onBlur={() => commitGen(localGen)}
                onPressEnter={() => commitGen(localGen)}
                style={{ width: 56, flexShrink: 0 }} />
            </div>
          </>
        );
      })()}
    </div>
  );

  const tabs = [
    { key: 'inputs', label: `${t('sim.tabs.inputs')}${inputEvents.length > 0 ? ` (${inputEvents.length})` : ''}`, content: inputsContent },
    ...(mode === 'opt' ? [{ key: 'opt', label: t('sim.tabs.optimizer'), content: optContent }] : []),
  ];

  const tabKeys = tabs.map(t2 => t2.key);
  const [tabOrder, setTabOrder] = useState<string[]>(tabKeys);
  useEffect(() => { setTabOrder(tabKeys); }, [mode]);

  const orderedTabs = tabOrder
    .filter(k => tabKeys.includes(k))
    .map(k => tabs.find(t2 => t2.key === k)!);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setTabOrder(prev => {
        const oldIdx = prev.indexOf(String(active.id));
        const newIdx = prev.indexOf(String(over.id));
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedTabs.map(t2 => t2.key)} strategy={verticalListSortingStrategy}>
        {/* Plan Manager — shown in sim mode when plan callbacks are provided */}
        {mode === 'sim' && plans && onSelectPlan && onAddPlan && onRemovePlan && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderBottom: `1px solid ${c.border}`, background: c.sectionHd, flexWrap: 'wrap' }}>
            <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.75)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>{t('sim.setup.plans')}</span>
            {plans.map(plan => {
              const isActive = plan.id === activePlanId;
              return (
                <div key={plan.id} style={{ display: 'flex', alignItems: 'center', gap: 3, borderRadius: 4, border: `1px solid ${isActive ? plan.color : c.border}`, padding: '2px 4px 2px 6px', background: isActive ? (isDarkMode ? '#1a2e1a' : '#f0f7f0') : 'transparent', cursor: 'pointer', flexShrink: 0 }}
                  onClick={() => onSelectPlan(plan.id)}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: plan.color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ color: isActive ? plan.color : c.textSec, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8)', fontWeight: isActive ? 600 : 400, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.label}</span>
                  {plans.length > 1 && (
                    <span style={{ color: c.textMute, cursor: 'pointer', marginLeft: 1, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8)', lineHeight: 1, padding: '0 2px' }}
                      onClick={e => { e.stopPropagation(); onRemovePlan(plan.id); }}>×</span>
                  )}
                </div>
              );
            })}
            <button onClick={onAddPlan} style={{ border: `1px dashed ${c.border}`, borderRadius: 4, padding: '2px 7px', background: 'transparent', color: c.textMute, cursor: 'pointer', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8)', flexShrink: 0 }}>
              {t('sim.setup.add_plan')}
            </button>
          </div>
        )}
        <div ref={panelRef} style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orderedTabs.map(tab => (
            <SortableCard
              key={tab.key}
              id={tab.key}
              label={tab.label}
              isOpen={openSections.has(tab.key)}
              onToggle={() => setOpenSections(prev => { const n = new Set(prev); if (n.has(tab.key)) n.delete(tab.key); else n.add(tab.key); return n; })}
              c={c}
              isDarkMode={isDarkMode}
            >
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
  c: ReturnType<typeof getC>; isDarkMode: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        borderRadius: 10,
        border: `1px solid ${c.border}`,
        boxShadow: isDarkMode ? '0 1px 5px rgba(0,0,0,0.35)' : '0 1px 4px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        background: c.panel,
        flexShrink: 0,
      }}
    >
      <div
        onClick={onToggle}
        style={{ height: 32, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', cursor: 'pointer', background: c.sectionHd, userSelect: 'none' }}
      >
        <span
          {...attributes}
          {...listeners}
          onClick={e => e.stopPropagation()}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', color: c.textMute, display: 'flex', alignItems: 'center', padding: '0 2px' }}
        >
          <HolderOutlined style={{ fontSize: 13 }} />
        </span>
        <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
        <span style={{ flex: 1, fontWeight: 600, color: c.text }}>{label}</span>
      </div>
      {isOpen && (
        <div style={{ padding: '8px 12px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default SimSetupTab;
