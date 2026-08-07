import React from 'react';
import { Empty, Tooltip } from 'antd';
import type { ModelFile, SimulationDataPoint, StepUnit } from '../../types';
import { getC } from '../../core/theme';
import { getDescriptionSections } from '../../core/modelUtils';
import SimChart, { VAR_COLORS } from './SimChart';

interface SimIntroTabProps {
  selectedModel: ModelFile | null;
  outputVars: string[];
  formulas: Record<string, any>;
  provenance: any;
  introOpen: Set<string>;
  setIntroOpen: React.Dispatch<React.SetStateAction<Set<string>>>;
  simulationData: SimulationDataPoint[];
  inputParams: Record<string, number>;
  simStartDate: string;
  simEndDate: string;
  stepValue: number;
  stepUnit: StepUnit;
  batchSize: number;
  objectives: Array<{ variable: string; direction: 'minimize' | 'maximize' }>;
  constraints: Array<{ variable: string; op: '≤' | '≥'; value: number }>;
  optAlgo: string;
  optPop: number;
  optGen: number;
  optResult: any;
  optElapsed: number;
  optMethod: string;
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  t: (key: string, params?: Record<string, string | number>) => string;
  fontSize: number;
}

const SimIntroTab: React.FC<SimIntroTabProps> = ({
  selectedModel, outputVars, formulas, provenance, introOpen, setIntroOpen,
  simulationData, inputParams,
  simStartDate, simEndDate, stepValue, stepUnit, batchSize,
  objectives, constraints, optAlgo, optPop, optGen,
  optResult, optElapsed, optMethod,
  isDarkMode, c, t, fontSize,
}) => {
  if (!selectedModel) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('sim.scene.empty')} />
    </div>
  );

  const meta: any = selectedModel?.content?.metadata ?? selectedModel?.content?.meta ?? {};
  const allV: Record<string, any> = selectedModel?.content?.variables || {};
  type RefEntry = { citation: string; description?: string };
  const refs: RefEntry[] = Array.isArray(meta?.references)
    ? meta.references
        .map((r: any): RefEntry => (typeof r === 'string' ? { citation: r } : { citation: r?.citation ?? '', description: r?.description }))
        .sort((a: RefEntry, b: RefEntry) => a.citation.localeCompare(b.citation))
    : [];
  const refsHaveNotes = refs.some(r => r.description);
  const descSections = getDescriptionSections(meta.description);
  const hasData = simulationData.length > 0;
  const hasOptResult = !!(optResult?.best_f || optResult?.pareto_front?.length);

  const importLabels: string[] = Array.isArray(provenance?.imports) ? provenance.imports : [];
  const sourceOf = (kind: 'variables' | 'formulas', name: string) => {
    const src = provenance?.[kind]?.[name];
    return src && importLabels.includes(src) ? src : '';
  };
  const SourceTag = ({ source }: { source?: string }) => source ? (
    <span style={{ color: c.textMute, border: `1px solid ${c.border}`, borderRadius: 4, padding: '1px 5px', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', whiteSpace: 'nowrap' }}>
      {source}
    </span>
  ) : null;
  const refStr = (ref: unknown, locator?: unknown): string => {
    const base = !ref ? '' : Array.isArray(ref) ? ref.filter(Boolean).join('; ') : String(ref);
    const loc = !locator ? '' : Array.isArray(locator) ? locator.filter(Boolean).join('; ') : String(locator);
    return base && loc ? `${base} (${loc})` : base;
  };

  const toggleIntro = (key: string) => setIntroOpen(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n;
  });

  const thS: React.CSSProperties = {
    padding: '3px 8px', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', fontWeight: 700, color: c.textMute,
    textAlign: 'left', borderBottom: `1px solid ${c.border}`, background: c.sectionHd,
  };
  const tdS: React.CSSProperties = {
    padding: '4px 8px', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', borderBottom: `1px solid ${c.border}`, verticalAlign: 'top',
  };

  const Section = ({ id, title, badge, children }: { id: string; title: string; badge?: string; children: React.ReactNode }) => {
    const open = introOpen.has(id);
    return (
      <div style={{ borderRadius: 10, border: `1px solid ${c.border}`, boxShadow: isDarkMode ? '0 1px 5px rgba(0,0,0,0.35)' : '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden', background: c.panel, flexShrink: 0 }}>
        <div onClick={() => toggleIntro(id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', cursor: 'pointer', background: c.sectionHd, userSelect: 'none' }}>
          <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', display: 'inline-block', transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
          <span style={{ flex: 1, fontWeight: 600, color: c.text, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{title}</span>
          {badge && <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>{badge}</span>}
        </div>
        {open && <div style={{ padding: '8px 12px 12px' }}>{children}</div>}
      </div>
    );
  };

  const varTypeBadge = (type: string) => ({
    state: t('sim.var.type.state'), input: t('sim.var.type.input'),
    parameter: t('sim.var.type.parameter'), evidence: t('sim.var.type.evidence'),
  })[type] || type || '—';

  const formatElapsed = (s: number) => {
    const sec = Math.round(s);
    const m = Math.floor(sec / 60);
    const ss = String(sec % 60).padStart(2, '0');
    return `${m}:${ss}`;
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: 8, gap: 8 }}>

      <Section id="meta" title={t('sim.report.section.intro')} badge={meta.name || undefined}>
        {descSections.length > 0
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {descSections.map(section => (
                <div key={section.key} style={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr)', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', fontWeight: 700, textTransform: 'uppercase' }}>{section.label}</span>
                  <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', color: c.text, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{section.text}</span>
                </div>
              ))}
            </div>
          : <div style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{t('sim.intro.no_description')}</div>
        }
        {(() => {
          const fs = 'calc(var(--lm-font-size, 14px) * 0.7857)';
          const sep = <span style={{ color: c.textMute, fontSize: fs, userSelect: 'none', opacity: 0.4, padding: '0 8px' }}>|</span>;
          const authors: any[] = Array.isArray(meta.authors) ? meta.authors
            : (meta.author && meta.author !== 'TODO:AUTHOR') ? [{ name: meta.author }] : [];
          const fields: React.ReactNode[] = [];
          if (meta.updated) fields.push(
            <span key="updated" style={{ color: c.textMute, fontSize: fs, fontFamily: 'monospace' }}>updated: {meta.updated}</span>
          );
          if (authors.length > 0) fields.push(
            <span key="authors" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: c.textMute, fontSize: fs, fontFamily: 'monospace' }}>
              authors: {authors.map((a: any, i: number) => (
                <span key={i}>
                  {a.email ? <a href={`mailto:${a.email}`} style={{ color: c.textMute, fontSize: fs }}>{a.name}</a> : a.name}
                  {i < authors.length - 1 && ', '}
                </span>
              ))}
            </span>
          );
          if (meta.tags?.length > 0) fields.push(
            <span key="tags" style={{ color: c.textMute, fontSize: fs, fontFamily: 'monospace' }}>tags: {meta.tags.join(', ')}</span>
          );
          if (fields.length === 0) return null;
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTop: `1px solid ${c.border}` }}>
              {fields.map((f, i) => <React.Fragment key={i}>{i > 0 && sep}{f}</React.Fragment>)}
            </div>
          );
        })()}
        {meta.ratings && (() => {
          const entries = Object.entries(meta.ratings).filter(([, v]) => v != null);
          if (entries.length === 0) return null;
          const fs = 'calc(var(--lm-font-size, 14px) * 0.7143)';
          const sep = <span style={{ color: c.textMute, fontSize: fs, userSelect: 'none', opacity: 0.4, padding: '0 8px' }}>|</span>;
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
              <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', fontFamily: 'monospace', marginRight: 4 }}>ratings:</span>
              {entries.map(([key, val], i) => {
                const raw = String(val);
                const score = parseInt(raw) || 0;
                const note = raw.replace(/^\d+\s*-\s*/, '');
                return (
                  <React.Fragment key={key}>
                    {i > 0 && sep}
                    <Tooltip title={note}>
                      <span style={{ color: c.textMute, fontSize: fs, fontFamily: 'monospace', cursor: 'default' }}>
                        {key} {'●'.repeat(score)}{'○'.repeat(5 - score)}
                      </span>
                    </Tooltip>
                  </React.Fragment>
                );
              })}
            </div>
          );
        })()}
      </Section>

      <Section id="variables" title={t('sim.tabs.variables')} badge={t('sim.report.badge.n_items', { n: Object.keys(allV).length })}>
        {Object.keys(allV).length === 0
          ? <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{t('sim.intro.no_variables')}</span>
          : <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead><tr>
                <th style={{ ...thS, width: '12%' }}>{t('sim.intro.col.name')}</th><th style={thS}>{t('sim.intro.col.description')}</th>
                <th style={{ ...thS, width: '7%' }}>{t('sim.intro.type')}</th><th style={{ ...thS, width: '7%' }}>{t('sim.intro.init_value')}</th>
                <th style={{ ...thS, width: '7%' }}>{t('sim.intro.unit')}</th><th style={{ ...thS, width: '11%' }}>{t('sim.intro.source')}</th>
                <th style={{ ...thS, width: '13%' }}>{t('sim.intro.col.reference')}</th>
              </tr></thead>
              <tbody>
                {Object.entries(allV).map(([name, d]: [string, any]) => {
                  const ref = refStr(d.reference, d.locator);
                  return (
                    <tr key={name}>
                      <td style={{ ...tdS, color: c.text, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
                        {name}
                        {outputVars.includes(name) && <span style={{ color: c.textMute, marginLeft: 4 }}>({t('sim.intro.output_marker')})</span>}
                      </td>
                      <td style={{ ...tdS, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.description || ''}>{d.description || '—'}</td>
                      <td style={{ ...tdS, color: c.textSec, whiteSpace: 'nowrap' }}>
                        {varTypeBadge(d.type)}
                        {d.evidence_type && (
                          <Tooltip title={`${t('sim.var.type.evidence')}: ${d.evidence_type}${d.evidence_raw_value != null ? ` (raw ${d.evidence_raw_value})` : ''}`}>
                            <span style={{ marginLeft: 3, color: c.textMute, cursor: 'help' }}>•</span>
                          </Tooltip>
                        )}
                      </td>
                      <td style={{ ...tdS, fontFamily: 'monospace', color: c.primary, whiteSpace: 'nowrap' }}>{String(d.value ?? '—')}</td>
                      <td style={{ ...tdS, color: c.textMute, whiteSpace: 'nowrap' }}>{d.unit || '—'}</td>
                      <td style={tdS}><SourceTag source={sourceOf('variables', name)} /></td>
                      <td style={{ ...tdS, color: c.textMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ref}>{ref || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        }
      </Section>

      {Object.keys(formulas).length > 0 && (
        <Section id="formulas" title={t('sim.tabs.formulas')} badge={t('sim.report.badge.n_items', { n: Object.keys(formulas).length })}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead><tr>
              <th style={{ ...thS, width: '14%' }}>{t('sim.intro.col.name')}</th><th style={{ ...thS, width: '22%' }}>{t('sim.intro.col.description')}</th>
              <th style={thS}>{t('sim.intro.col.expression')}</th><th style={{ ...thS, width: '12%' }}>{t('sim.intro.col.condition')}</th>
              <th style={{ ...thS, width: '12%' }}>{t('sim.intro.source')}</th><th style={{ ...thS, width: '12%' }}>{t('sim.intro.col.reference')}</th>
            </tr></thead>
            <tbody>
              {Object.entries(formulas).map(([name, fd]: [string, any]) => {
                const cond = fd.condition && fd.condition !== true && fd.condition !== 'true' ? String(fd.condition) : null;
                const expr = typeof fd.dynamics === 'object' && fd.dynamics
                  ? Object.entries(fd.dynamics).map(([v2, e]) => `${v2} = ${e}`).join('; ')
                  : String(fd.dynamics ?? '');
                const ref = refStr(fd.reference, fd.locator);
                return (
                  <tr key={name}>
                    <td style={{ ...tdS, color: c.text, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</td>
                    <td style={{ ...tdS, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fd.description || ''}>{fd.description || '—'}</td>
                    <td style={{ ...tdS, color: isDarkMode ? '#86efac' : '#007A33', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={expr}>{expr || '—'}</td>
                    <td style={{ ...tdS, color: c.textMute, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cond || ''}>{cond || '—'}</td>
                    <td style={tdS}><SourceTag source={sourceOf('formulas', name)} /></td>
                    <td style={{ ...tdS, color: c.textMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ref}>{ref || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {refs.length > 0 && (
        <Section id="refs" title={t('sim.report.section.refs')} badge={t('sim.report.badge.refs', { n: refs.length })}>
          {refsHaveNotes ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '6px 16px' }}>
              {refs.map((r, i) => (
                <React.Fragment key={i}>
                  <span style={{ color: c.textSec, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', lineHeight: 1.5, minWidth: 0 }}>{r.citation}</span>
                  <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', lineHeight: 1.5, minWidth: 0 }}>{r.description || ''}</span>
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {refs.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>
                  <span style={{ color: c.textMute, flexShrink: 0, minWidth: 12 }}>&middot;</span>
                  <span style={{ color: c.textSec, lineHeight: 1.5 }}>{r.citation}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      <Section id="simcfg" title={t('sim.report.section.simcfg')} badge={t('sim.report.badge.simcfg', { n: Object.keys(inputParams).length })}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: Object.keys(inputParams).length ? 8 : 0 }}><tbody>
          <tr><td style={tdS}>{t('sim.report.simcfg.time_range')}</td><td style={{ ...tdS, fontFamily: 'monospace', color: c.primary }}>{simStartDate} ~ {simEndDate}</td></tr>
          <tr><td style={tdS}>{t('sim.report.simcfg.step')}</td><td style={{ ...tdS, fontFamily: 'monospace', color: c.primary }}>{stepValue} {stepUnit}</td></tr>
          <tr><td style={tdS}>{t('sim.report.simcfg.batch')}</td><td style={{ ...tdS, fontFamily: 'monospace', color: c.primary }}>{batchSize}</td></tr>
        </tbody></table>
        {Object.keys(inputParams).length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={thS}>{t('sim.report.simcfg.variable')}</th><th style={thS}>{t('sim.report.simcfg.meaning')}</th><th style={thS}>{t('sim.report.simcfg.value')}</th></tr></thead>
            <tbody>{Object.entries(inputParams).map(([k, v]) => (
              <tr key={k}>
                <td style={{ ...tdS, fontFamily: 'monospace' }}>{k}</td>
                <td style={tdS}>{allV[k]?.description || '—'}</td>
                <td style={{ ...tdS, fontFamily: 'monospace', color: c.primary }}>{String(v)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>

      <Section id="sim_result" title={t('sim.report.section.sim_result')} badge={hasData ? t('sim.report.badge.sim_result', { n: outputVars.length }) : t('sim.report.badge.no_data')}>
        {!hasData
          ? <div style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{t('sim.report.no_data')}</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {outputVars.map((varName, idx) => {
                const varInfo = allV[varName];
                return (
                  <div key={varName} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: VAR_COLORS[idx % VAR_COLORS.length], display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'monospace', color: c.text }}>{varName}</span>
                      {varInfo?.description && <span style={{ color: c.textMute }}>{varInfo.description}</span>}
                      {varInfo?.unit && <span style={{ color: c.textMute }}>({varInfo.unit})</span>}
                    </div>
                    <SimChart
                      varName={varName} colorIndex={idx}
                      data={simulationData} isDarkMode={isDarkMode} c={c}
                      hideTitleBar fontSize={fontSize}
                    />
                  </div>
                );
              })}
            </div>
        }
      </Section>

      {(objectives.length > 0 || constraints.length > 0) && (
        <Section id="opt_config" title={t('sim.report.section.opt_config')} badge={t('sim.report.badge.opt_config', { n: objectives.length })}>
          <div style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', color: c.text }}>
            {objectives.length > 0 && <><div style={{ fontWeight: 700, marginBottom: 4 }}>{t('sim.report.objective_fn')}</div>
              {objectives.map((o, i) => <div key={i} style={{ fontFamily: 'monospace', paddingLeft: 8 }}>
                {o.direction === 'maximize' ? '↑' : '↓'} {o.variable}</div>)}</>}
            {constraints.length > 0 && <><div style={{ fontWeight: 700, margin: '8px 0 4px' }}>{t('sim.report.constraints')}</div>
              {constraints.map((con, i) => <div key={i} style={{ fontFamily: 'monospace', paddingLeft: 8 }}>
                {con.variable} {con.op} {con.value}</div>)}</>}
            <div style={{ marginTop: 8, color: c.textMute }}>{t('sim.report.algo_label')}: {optAlgo} · {t('sim.report.pop_label')}: {optPop} · {t('sim.report.gen_label')}: {optGen}</div>
          </div>
        </Section>
      )}

      {hasOptResult && (
        <Section id="opt_result" title={t('sim.report.section.opt_result')} badge={t('sim.report.badge.opt_result', { n: optResult.n_solutions ?? optResult.pareto_front?.length ?? 0 })}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            <tr><td style={tdS}>{t('sim.report.opt_result.method_label')}</td><td style={{ ...tdS, fontFamily: 'monospace', color: c.primary }}>{optResult.method || optMethod || '—'}</td></tr>
            <tr><td style={tdS}>{t('sim.report.opt_result.n_solutions_label')}</td><td style={{ ...tdS, fontFamily: 'monospace', color: c.primary }}>{optResult.n_solutions ?? optResult.pareto_front?.length ?? 0}</td></tr>
            <tr><td style={tdS}>{t('sim.report.opt_result.elapsed_label')}</td><td style={{ ...tdS, fontFamily: 'monospace', color: c.primary }}>{formatElapsed(optElapsed)}</td></tr>
            {(optResult.best_f || []).map((v: number, i: number) => {
              const o = (optResult.objectives || objectives || [])[i];
              const dir = o?.direction === 'maximize' ? t('sim.report.md.maximize') : t('sim.report.md.minimize');
              return (
                <tr key={i}>
                  <td style={{ ...tdS, fontFamily: 'monospace' }}>{o?.variable ?? `f${i}`} ({dir})</td>
                  <td style={{ ...tdS, fontFamily: 'monospace', color: c.primary }}>{v}</td>
                </tr>
              );
            })}
            {optResult.best_x?.length > 0 && (
              <tr><td style={tdS}>{t('sim.report.opt_result.decision_vars_label')}</td><td style={{ ...tdS, fontFamily: 'monospace', color: c.primary }}>{(optResult.best_x as number[]).map((v, i) => `x${i}=${v}`).join(', ')}</td></tr>
            )}
          </tbody></table>
        </Section>
      )}

      </div>
    </div>
  );
};

export default SimIntroTab;
