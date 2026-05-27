import React, { useState } from 'react';
import { Empty, Tooltip } from 'antd';
import type { ModelFile } from '../../types';
import { getC } from '../../core/theme';
import { getDescriptionSections } from '../../core/modelUtils';

interface SimIntroTabProps {
  selectedModel: ModelFile | null;
  outputVars: string[];
  formulas: Record<string, any>;
  provenance: any;
  introOpen: Set<string>;
  setIntroOpen: React.Dispatch<React.SetStateAction<Set<string>>>;
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  t: (key: string) => string;
}

const SimIntroTab: React.FC<SimIntroTabProps> = ({
  selectedModel, outputVars, formulas, provenance, introOpen, setIntroOpen,
  isDarkMode, c, t,
}) => {
  if (!selectedModel) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('sim.scene.empty')} />
    </div>
  );

  const meta: any = selectedModel?.content?.metadata ?? selectedModel?.content?.meta ?? {};
  const allV: Record<string, any> = selectedModel?.content?.variables || {};
  const refs: string[] = Array.isArray(meta?.references) ? meta.references : [];
  const descSections = getDescriptionSections(meta.description);

  const sourceOf = (kind: 'variables' | 'formulas', name: string) => provenance?.[kind]?.[name] || '';
  const SourceTag = ({ source }: { source?: string }) => source ? (
    <span style={{ color: c.textMute, border: `1px solid ${c.border}`, borderRadius: 4, padding: '1px 5px', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', whiteSpace: 'nowrap' }}>
      from {source}
    </span>
  ) : null;

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

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: 8, gap: 8 }}>

      <Section id="meta" title="Description" badge={meta.case_id ? `#${meta.case_id}` : (meta.name || undefined)}>
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
          {meta.updated && <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', fontFamily: 'monospace' }}>updated: {meta.updated}</span>}
          {meta.author && meta.author !== 'TODO:AUTHOR' && <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>{meta.author}</span>}
          {meta.paper && <span style={{ color: c.primary, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>{meta.paper}</span>}
          {meta.tags?.length > 0 && <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>{meta.tags.join(' · ')}</span>}
        </div>
      </Section>

      <Section id="variables" title={t('sim.tabs.variables')} badge={`${Object.keys(allV).length} 个`}>
        {Object.keys(allV).length === 0
          ? <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{t('sim.intro.no_variables')}</span>
          : <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead><tr>
                <th style={{ ...thS, width: '22%' }}>Name</th><th style={thS}>Description</th>
                <th style={thS}>{t('sim.intro.type')}</th><th style={thS}>{t('sim.intro.init_value')}</th><th style={thS}>{t('sim.intro.unit')}</th><th style={thS}>{t('sim.intro.source')}</th>
              </tr></thead>
              <tbody>
                {Object.entries(allV).map(([name, d]: [string, any]) => (
                  <tr key={name}>
                    <td style={{ ...tdS, color: c.text, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</td>
                    <td style={{ ...tdS, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.description || ''}>{d.description || '—'}</td>
                    <td style={{ ...tdS, color: c.textSec, whiteSpace: 'nowrap' }}>{varTypeBadge(d.type)}</td>
                    <td style={{ ...tdS, fontFamily: 'monospace', color: c.primary, whiteSpace: 'nowrap' }}>{String(d.value ?? '—')}</td>
                    <td style={{ ...tdS, color: c.textMute, whiteSpace: 'nowrap' }}>{d.unit || '—'}</td>
                    <td style={tdS}><SourceTag source={sourceOf('variables', name)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </Section>

      <Section id="outputs" title={t('sim.intro.output_vars')} badge={`${outputVars.length} 个`}>
        {outputVars.length === 0
          ? <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{t('sim.intro.no_outputs')}</span>
          : <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead><tr>
                <th style={{ ...thS, width: '22%' }}>Name</th><th style={thS}>Description</th>
                <th style={thS}>{t('sim.intro.type')}</th><th style={thS}>{t('sim.intro.unit')}</th><th style={thS}>{t('sim.intro.source')}</th>
              </tr></thead>
              <tbody>
                {outputVars.map(name => {
                  const d = allV[name] || {};
                  return (
                    <tr key={name}>
                      <td style={{ ...tdS, fontFamily: 'monospace', color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</td>
                      <td style={{ ...tdS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.description || ''}>{d.description || '—'}</td>
                      <td style={{ ...tdS, color: c.textSec, whiteSpace: 'nowrap' }}>{varTypeBadge(d.type)}</td>
                      <td style={{ ...tdS, color: c.textMute, whiteSpace: 'nowrap' }}>{d.unit || '—'}</td>
                      <td style={tdS}><SourceTag source={sourceOf('variables', name)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        }
      </Section>

      {Object.keys(formulas).length > 0 && (
        <Section id="formulas" title={t('sim.tabs.formulas')} badge={`${Object.keys(formulas).length} 个`}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead><tr>
              <th style={{ ...thS, width: '20%' }}>Name</th><th style={{ ...thS, width: '26%' }}>Description</th>
              <th style={thS}>Expression</th><th style={{ ...thS, width: '14%' }}>Condition</th><th style={{ ...thS, width: '12%' }}>{t('sim.intro.source')}</th>
            </tr></thead>
            <tbody>
              {Object.entries(formulas).map(([name, fd]: [string, any]) => {
                const cond = fd.condition && fd.condition !== true && fd.condition !== 'true' ? String(fd.condition) : null;
                const expr = typeof fd.dynamics === 'object' && fd.dynamics
                  ? Object.entries(fd.dynamics).map(([v2, e]) => `${v2} = ${e}`).join('; ')
                  : String(fd.dynamics ?? '');
                return (
                  <tr key={name}>
                    <td style={{ ...tdS, color: c.text, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</td>
                    <td style={{ ...tdS, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fd.description || ''}>{fd.description || '—'}</td>
                    <td style={{ ...tdS, color: isDarkMode ? '#86efac' : '#007A33', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={expr}>{expr || '—'}</td>
                    <td style={{ ...tdS, color: c.textMute, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cond || ''}>{cond || '—'}</td>
                    <td style={tdS}><SourceTag source={sourceOf('formulas', name)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {refs.length > 0 && (
        <Section id="refs" title="References" badge={`${refs.length} 条`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {refs.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>
                <span style={{ color: c.primary, fontFamily: 'monospace', flexShrink: 0, minWidth: 24 }}>[{i + 1}]</span>
                <span style={{ color: c.textSec, lineHeight: 1.5 }}>{r}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
};

export default SimIntroTab;
