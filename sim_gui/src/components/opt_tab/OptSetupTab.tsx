import React, { useRef, useState, useEffect } from 'react';
import { Button, Dropdown, InputNumber, Input, Select, Slider, Tooltip } from 'antd';
import { HolderOutlined, ImportOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { InputEvent, SimPlan } from '../../types';
import { getC } from '../../core/theme';

interface OptSetupTabProps {
  inputEvents: InputEvent[];
  addInputEvent: () => void;
  removeInputEvent: (id: string) => void;
  plans: SimPlan[];
  onImportFromPlan: (events: InputEvent[]) => void;
  updateInputEvent: (id: string, patch: Partial<InputEvent>) => void;
  updateInputEventOpt: (id: string, patch: Partial<InputEvent>) => void;
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
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  t: (key: string) => string;
}

const OptSetupTab: React.FC<OptSetupTabProps> = ({
  inputEvents, addInputEvent, removeInputEvent, plans, onImportFromPlan, updateInputEvent, updateInputEventOpt,
  inputVars, allVarNames, openSections, setOpenSections,
  simStartDate, simEndDate,
  objectives, setObjectives, constraints, setConstraints,
  optAlgo, setOptAlgo, optPop, setOptPop, optGen, setOptGen,
  isDarkMode, c, t,
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

  // ── Inputs section (unified: all inputEvents, each with OPT toggle) ──────────
  const inputsContent = (
    <div style={{ padding: '4px 0' }}>
      {inputEvents.length === 0 && (
        <div style={{ textAlign: 'center', color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', padding: 8 }}>
          {t('sim.setup.no_events')}
        </div>
      )}
      {inputEvents.map(ev => {
        const varDef = inputVars.find(v => v.name === ev.variable);
        const bounds = ev.valueBounds ?? [0, (ev.value * 2) || 1] as [number, number];

        return (
          <div key={ev.id} style={{
            marginBottom: 5, borderRadius: 5, padding: '4px 6px', background: c.panel,
            border: `1px solid ${c.border}`,
          }}>
            {/* Header: variable + visibility toggles + delete */}
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 'inherit', color: c.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ev.variable}
              </span>
              <Tog label={t('sim.setup.tog.time')} active={ev.timeEnabled}
                title={t('sim.setup.tog.time_tip')}
                onToggle={() => updateInputEventOpt(ev.id, { timeEnabled: !ev.timeEnabled, ...(!ev.timeEnabled && { optimizeTime: false }) })} />
              <Tog label={t('sim.setup.tog.day')} active={ev.daysEnabled}
                title={t('sim.setup.tog.day_tip')}
                onToggle={() => updateInputEventOpt(ev.id, { daysEnabled: !ev.daysEnabled, ...(!ev.daysEnabled && { optimizeDays: false }) })} />
              <Tog label={t('sim.setup.tog.range')} active={ev.validRangeEnabled}
                title={t('sim.setup.tog.range_tip')}
                onToggle={() => updateInputEventOpt(ev.id, {
                  validRangeEnabled: !ev.validRangeEnabled,
                  ...(!ev.validRangeEnabled && { validStart: simStartDate, validEnd: simEndDate }),
                  ...(ev.validRangeEnabled && { optimizeDateStart: false }),
                })} />
              <Button size="small" danger type="text" icon={<MinusCircleOutlined />}
                style={{ padding: '0 2px' }} onClick={() => removeInputEvent(ev.id)} />
            </div>

            {/* T1: value row with opt toggle at start */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 4 }}>
              <Tog label="opt" active={!!ev.optimizeValue}
                title={ev.optimizeValue ? t('sim.opt.tog.opt_on_tip') : t('sim.opt.tog.opt_off_tip')}
                onToggle={() => {
                  const varDef2 = inputVars.find(v => v.name === ev.variable);
                  const lo = varDef2?.bounds?.[0] ?? 0;
                  const hi = varDef2?.bounds?.[1] ?? ((ev.value * 2) || 1);
                  updateInputEventOpt(ev.id, {
                    optimizeValue: !ev.optimizeValue,
                    valueBounds: ev.valueBounds ?? [lo, hi] as [number, number],
                  });
                }} />
              {ev.optimizeValue ? (
                <>
                  <InputNumber size="small" value={bounds[0]} placeholder="lo" style={{ flex: 1, minWidth: 0 }}
                    onChange={v => updateInputEventOpt(ev.id, { valueBounds: [v ?? 0, bounds[1]] })} />
                  <span style={{ color: c.primary, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', flexShrink: 0 }}>~</span>
                  <InputNumber size="small" value={bounds[1]} placeholder="hi" style={{ flex: 1, minWidth: 0 }}
                    onChange={v => updateInputEventOpt(ev.id, { valueBounds: [bounds[0], v ?? 1] })} />
                </>
              ) : (
                <InputNumber size="small" value={ev.value} style={{ flex: 1, minWidth: 0 }}
                  onChange={v => updateInputEvent(ev.id, { value: v ?? 0 })} />
              )}
              {varDef?.unit && <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: c.textMute, flexShrink: 0 }}>{varDef.unit}</span>}
            </div>

            {/* T2: time row */}
            {ev.timeEnabled && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3 }}>
                <Tog label="opt" active={!!ev.optimizeTime}
                  onToggle={() => updateInputEventOpt(ev.id, {
                    optimizeTime: !ev.optimizeTime,
                    timeWindow: !ev.optimizeTime ? (ev.timeWindow || `${ev.time}~${ev.time}`) : ev.timeWindow,
                  })} />
                {ev.optimizeTime ? (
                  <>
                    <Input size="small" value={(ev.timeWindow ?? '').split('~')[0]?.trim()} placeholder="HH:MM"
                      style={{ flex: 1, minWidth: 0, fontFamily: 'monospace' }}
                      onChange={e => { const end = (ev.timeWindow ?? '~').split('~')[1]?.trim() ?? ''; updateInputEventOpt(ev.id, { timeWindow: `${e.target.value}~${end}` }); }} />
                    <span style={{ color: c.primary, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', flexShrink: 0 }}>~</span>
                    <Input size="small" value={(ev.timeWindow ?? '~').split('~')[1]?.trim()} placeholder="HH:MM"
                      style={{ flex: 1, minWidth: 0, fontFamily: 'monospace' }}
                      onChange={e => { const s = (ev.timeWindow ?? '~').split('~')[0]?.trim() ?? ''; updateInputEventOpt(ev.id, { timeWindow: `${s}~${e.target.value}` }); }} />
                    <select value={ev.optStep ?? '1h'} onChange={e => updateInputEventOpt(ev.id, { optStep: e.target.value })}
                      style={{ width: 60, fontSize: 'inherit', padding: '1px 3px', borderRadius: 4 }}>
                      <option value="1h">1h</option>
                      <option value="15min">15min</option>
                    </select>
                  </>
                ) : (
                  <Input size="small" value={ev.time} placeholder="HH:MM"
                    style={{ width: 70, fontFamily: 'monospace' }}
                    onChange={e => updateInputEvent(ev.id, { time: e.target.value })} />
                )}
              </div>
            )}

            {/* T3: days row */}
            {ev.daysEnabled && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3 }}>
                <Tog label="opt" active={!!ev.optimizeDays}
                  onToggle={() => updateInputEventOpt(ev.id, { optimizeDays: !ev.optimizeDays })} />
                <div style={{ display: 'flex', gap: 2 }}>
                  {DAY_LABELS.map((d, i) => (
                    <button key={i} onClick={() => updateInputEvent(ev.id, { days: ev.days.map((v, j) => j === i ? !v : v) })}
                      style={{ width: 20, height: 20, borderRadius: 3, fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', cursor: 'pointer', padding: 0,
                        background: ev.days[i] ? c.primary : c.panel, color: ev.days[i] ? '#fff' : c.textMute,
                        border: `1px solid ${c.border}` }}>{d}</button>
                  ))}
                </div>
              </div>
            )}

            {/* T4: valid range / date window row */}
            {ev.validRangeEnabled && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start', marginTop: 3 }}>
                <Tog label="opt" active={!!ev.optimizeDateStart}
                  onToggle={() => {
                    const newOpt = !ev.optimizeDateStart;
                    const vs = ev.validStart || simStartDate;
                    const ve = ev.validEnd || simEndDate;
                    updateInputEventOpt(ev.id, {
                      optimizeDateStart: newOpt,
                      ...(newOpt && {
                        dateStartWindow: ev.dateStartWindow || `${simStartDate}~${vs}`,
                        dateEndWindow: ev.dateEndWindow || `${ve}~${simEndDate}`,
                      }),
                    });
                  }} />
                {ev.optimizeDateStart ? (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.6786)', color: c.textMute, flexShrink: 0, width: 24 }}>sta</span>
                      <Input size="small" value={(ev.dateStartWindow ?? '').split('~')[0]?.trim()} placeholder="YYYY-MM-DD"
                        style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}
                        onChange={e => { const end = (ev.dateStartWindow ?? '~').split('~')[1]?.trim() ?? ''; updateInputEventOpt(ev.id, { dateStartWindow: `${e.target.value}~${end}` }); }} />
                      <span style={{ color: c.primary, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', flexShrink: 0 }}>~</span>
                      <Input size="small" value={(ev.dateStartWindow ?? '~').split('~')[1]?.trim()} placeholder="YYYY-MM-DD"
                        style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}
                        onChange={e => { const s = (ev.dateStartWindow ?? '~').split('~')[0]?.trim() ?? ''; updateInputEventOpt(ev.id, { dateStartWindow: `${s}~${e.target.value}` }); }} />
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.6786)', color: c.textMute, flexShrink: 0, width: 24 }}>end</span>
                      <Input size="small" value={(ev.dateEndWindow ?? '').split('~')[0]?.trim()} placeholder="YYYY-MM-DD"
                        style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}
                        onChange={e => { const end2 = (ev.dateEndWindow ?? '~').split('~')[1]?.trim() ?? ''; updateInputEventOpt(ev.id, { dateEndWindow: `${e.target.value}~${end2}` }); }} />
                      <span style={{ color: c.primary, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', flexShrink: 0 }}>~</span>
                      <Input size="small" value={(ev.dateEndWindow ?? '~').split('~')[1]?.trim()} placeholder="YYYY-MM-DD"
                        style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}
                        onChange={e => { const s2 = (ev.dateEndWindow ?? '~').split('~')[0]?.trim() ?? ''; updateInputEventOpt(ev.id, { dateEndWindow: `${s2}~${e.target.value}` }); }} />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 1 }}>
                    <Input size="small" value={ev.validStart} placeholder="YYYY-MM-DD"
                      style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}
                      onChange={e => updateInputEvent(ev.id, { validStart: e.target.value })} />
                    <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}>–</span>
                    <Input size="small" value={ev.validEnd} placeholder="YYYY-MM-DD"
                      style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}
                      onChange={e => updateInputEvent(ev.id, { validEnd: e.target.value })} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <Button size="small" icon={<PlusOutlined />} block onClick={addInputEvent}
        style={{ borderColor: c.border, color: c.textSec, marginTop: 4 }}
        disabled={inputVars.length === 0}>
        {t('sim.setup.add_event')}
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

  const decisionCount = inputEvents.filter(ev => ev.optimizeValue || ev.optimizeTime || ev.optimizeDays || ev.optimizeDateStart).length;
  const importDropdown = (
    <Dropdown
      menu={{
        items: plans.map(p => ({
          key: p.id,
          label: <span><span style={{ color: p.color, marginRight: 6 }}>■</span>{p.label}</span>,
          onClick: () => onImportFromPlan(p.inputEvents),
        })),
      }}
      disabled={plans.length === 0}
    >
      <Button size="small" icon={<ImportOutlined />} style={{ color: plans.length > 0 ? c.textSec : c.textMute, borderColor: c.border, height: 22, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>
        {t('sim.opt.import_from_plan')}
      </Button>
    </Dropdown>
  );
  const tabs = [
    { key: 'opt-inputs', label: `${t('sim.tabs.inputs')}${inputEvents.length > 0 ? ` (${inputEvents.length}, OPT: ${decisionCount})` : ''}`, content: inputsContent, headerExtra: importDropdown },
    { key: 'opt-cfg',    label: t('sim.tabs.optimizer'), content: configContent },
  ];

  const [tabOrder, setTabOrder] = useState(tabs.map(t2 => t2.key));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setTabOrder(prev => {
        const oi = prev.indexOf(String(active.id));
        const ni = prev.indexOf(String(over.id));
        return arrayMove(prev, oi, ni);
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
              c={c} isDarkMode={isDarkMode} headerExtra={(tab as any).headerExtra}>
              {tab.content}
            </SortableCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

function SortableCard({ id, label, isOpen, onToggle, c, isDarkMode, children, headerExtra }: {
  id: string; label: string; isOpen: boolean; onToggle: () => void;
  c: ReturnType<typeof getC>; isDarkMode: boolean; children: React.ReactNode;
  headerExtra?: React.ReactNode;
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
        {headerExtra && <span onClick={e => e.stopPropagation()}>{headerExtra}</span>}
      </div>
      {isOpen && <div style={{ padding: '8px 12px' }}>{children}</div>}
    </div>
  );
}

export default OptSetupTab;
