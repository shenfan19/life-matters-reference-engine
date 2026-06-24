import React, { useRef } from 'react';
import { Button, InputNumber, Input, Tooltip } from 'antd';
import { HolderOutlined, MinusCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { InputEvent, SimPlan } from '../../types';
import { getC } from '../../core/theme';

interface SimSetupTabProps {
  inputEvents: InputEvent[];
  addInputEvent: () => void;
  updateInputEvent: (id: string, patch: Partial<InputEvent>) => void;
  removeInputEvent: (id: string) => void;
  inputVars: Array<{ name: string; [k: string]: any }>;
  openSections: Set<string>;
  setOpenSections: React.Dispatch<React.SetStateAction<Set<string>>>;
  SECTION_H: number;
  simStartDate: string;
  simEndDate: string;
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  t: (key: string) => string;
  plans?: SimPlan[];
  activePlanId?: string;
  onSelectPlan?: (id: string) => void;
  onAddPlan?: () => void;
  onRemovePlan?: (id: string) => void;
  onResetToYaml?: () => void;
}

const SimSetupTab: React.FC<SimSetupTabProps> = ({
  inputEvents, addInputEvent, updateInputEvent, removeInputEvent,
  inputVars, openSections, setOpenSections,
  simStartDate, simEndDate, isDarkMode, c, t,
  plans, activePlanId, onSelectPlan, onAddPlan, onRemovePlan, onResetToYaml,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const DAY_LABELS = t('sim.setup.day_labels').split(',');

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

  const inputsContent = (
    <div style={{ padding: '4px 0' }}>
      {inputEvents.length === 0 && (
        <div style={{ textAlign: 'center', color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', padding: 8 }}>
          {t('sim.setup.no_events')}
        </div>
      )}
      {inputEvents.map(ev => {
        const varDef = inputVars.find(v => v.name === ev.variable);
        const isPulse = ev.timeStart === ev.timeEnd;
        return (
          <div key={ev.id} style={{ marginBottom: 5, border: `1px solid ${c.border}`, borderRadius: 5, padding: '4px 6px', background: c.panel }}>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <select value={ev.variable} onChange={e => updateInputEvent(ev.id, { variable: e.target.value })}
                style={{ flex: 1, minWidth: 0, fontSize: 'inherit', padding: '1px 4px', borderRadius: 4 }}>
                {inputVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
              <Tog label={t('sim.setup.tog.day')} active={ev.daysEnabled} title={t('sim.setup.tog.day_tip')} onToggle={() => updateInputEvent(ev.id, { daysEnabled: !ev.daysEnabled })} />
              <Tog label={t('sim.setup.tog.range')} active={ev.validRangeEnabled} title={t('sim.setup.tog.range_tip')} onToggle={() => updateInputEvent(ev.id, {
                validRangeEnabled: !ev.validRangeEnabled,
                ...(!ev.validRangeEnabled && !ev.validStart && !ev.validEnd && { validStart: simStartDate, validEnd: simEndDate }),
              })} />
              <div style={{ flex: 1 }} />
              <Button size="small" danger type="text" icon={<MinusCircleOutlined />}
                style={{ padding: '0 2px' }} onClick={() => removeInputEvent(ev.id)} />
            </div>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginTop: 3 }}>
              <InputNumber size="small" value={ev.value} style={{ flex: 1, minWidth: 0 }}
                onChange={v => updateInputEvent(ev.id, { value: v ?? 0 })} />
              {varDef?.unit && <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: c.textMute, flexShrink: 0 }}>{varDef.unit}</span>}
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
              <Tooltip title={t('sim.setup.time_start_tip')}>
                <Input size="small" value={ev.timeStart} placeholder="HH:MM"
                  style={{ width: 64, fontFamily: 'monospace' }}
                  onChange={e => updateInputEvent(ev.id, {
                    timeStart: e.target.value,
                    ...(isPulse ? { timeEnd: e.target.value } : {}),
                  })} />
              </Tooltip>
              <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}>→</span>
              <Tooltip title={t('sim.setup.time_end_tip')}>
                <Input size="small" value={ev.timeEnd} placeholder="HH:MM"
                  style={{
                    width: 64, fontFamily: 'monospace',
                    color: isPulse ? c.textMute : c.text,
                    borderStyle: isPulse ? 'dashed' : 'solid',
                  }}
                  onChange={e => updateInputEvent(ev.id, { timeEnd: e.target.value })} />
              </Tooltip>
              {!isPulse && (
                <Tooltip title={t('sim.setup.time_collapse_tip')}>
                  <span onClick={() => updateInputEvent(ev.id, { timeEnd: ev.timeStart })}
                    style={{ cursor: 'pointer', color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', lineHeight: 1, padding: '0 2px' }}>×</span>
                </Tooltip>
              )}
              {ev.daysEnabled && (
                <div style={{ display: 'flex', gap: 2 }}>
                  {DAY_LABELS.map((d, i) => (
                    <button key={i} onClick={() => updateInputEvent(ev.id, { days: ev.days.map((v, j) => j === i ? !v : v) })}
                      style={{ width: 20, height: 20, border: `1px solid ${c.border}`, borderRadius: 3,
                        fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', cursor: 'pointer',
                        background: ev.days[i] ? c.primary : c.panel,
                        color: ev.days[i] ? '#fff' : c.textMute, padding: 0 }}>{d}</button>
                  ))}
                </div>
              )}
              {ev.validRangeEnabled && (
                <>
                  <Input size="small" value={ev.validStart} placeholder="YYYY-MM-DD"
                    style={{ width: 100, fontFamily: 'monospace' }}
                    onChange={e => updateInputEvent(ev.id, { validStart: e.target.value })} />
                  <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}>→</span>
                  <Input size="small" value={ev.validEnd} placeholder="YYYY-MM-DD"
                    style={{ width: 100, fontFamily: 'monospace' }}
                    onChange={e => updateInputEvent(ev.id, { validEnd: e.target.value })} />
                </>
              )}
            </div>
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

  const tabs = [
    { key: 'inputs', label: `${t('sim.tabs.inputs')}${inputEvents.length > 0 ? ` (${inputEvents.length})` : ''}`, content: inputsContent },
  ];

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const handleDragEnd = (_event: DragEndEvent) => { /* single tab */ };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs.map(t2 => t2.key)} strategy={verticalListSortingStrategy}>
        {plans && onSelectPlan && onAddPlan && onRemovePlan && (
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
          {tabs.map(tab => (
            <SortableCard key={tab.key} id={tab.key} label={tab.label}
              isOpen={openSections.has(tab.key)}
              onToggle={() => setOpenSections(prev => { const n = new Set(prev); if (n.has(tab.key)) n.delete(tab.key); else n.add(tab.key); return n; })}
              c={c} isDarkMode={isDarkMode}
              headerExtra={tab.key === 'inputs' && onResetToYaml ? (
                <Tooltip title={t('sim.setup.reset_to_yaml')}>
                  <span onClick={e => { e.stopPropagation(); onResetToYaml(); }}
                    style={{ cursor: 'pointer', color: c.textMute, display: 'flex', alignItems: 'center', padding: '0 2px' }}>
                    <ReloadOutlined style={{ fontSize: 11 }} />
                  </span>
                </Tooltip>
              ) : undefined}
            >
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
  c: ReturnType<typeof getC>; isDarkMode: boolean;
  children: React.ReactNode; headerExtra?: React.ReactNode;
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
        {headerExtra}
      </div>
      {isOpen && <div style={{ padding: '8px 12px' }}>{children}</div>}
    </div>
  );
}

export default SimSetupTab;
