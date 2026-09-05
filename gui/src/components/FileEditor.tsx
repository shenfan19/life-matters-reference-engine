// FileEditor.tsx — embedded file card editor (always used in embedded/controlled mode)
// Left panel is in SimModelTree; this component only renders the card area.

import React, { useState, useEffect, useRef } from 'react';
import { App, Button, Tooltip } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import jsyaml from 'js-yaml';
import { validateModelFile } from '../core/validate';
import { useI18n } from '../core/i18n';

// ─── File type registry ───────────────────────────────────────────────────────

const FT = {
  game_story: { label: 'Game',     color: '#722ed1', bg: '#f9f0ff', icon: '🎮' },
  scenario:   { label: 'Scenario', color: '#1677ff', bg: '#e6f4ff', icon: '📋' },
  model:      { label: 'Model',    color: '#007A33', bg: '#f6ffed', icon: '📊' },
  other:      { label: 'File',     color: '#8c8c8c', bg: '#f5f5f5', icon: '📄' },
} as const;
type FTName = keyof typeof FT;

function fileType(key: string): FTName {
  if (key.includes('game') || key.includes('story')) return 'game_story';
  if (key.includes('scenario')) return 'scenario';
  if (key.endsWith('.yaml') || key.endsWith('.yml')) return 'model';
  return 'other';
}

// ─── Equation type detection ───────────────────────────────────────────────────

function autoType(fd: any): string {
  if (fd?.dynamics && Object.keys(fd.dynamics).length > 0) return 'dynamics';
  if (fd?.equation) return 'equation';
  return '?';
}

function TChip({ t }: { t: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    dynamics: { bg: '#e6f4ff', fg: '#1677ff' },
    equation:  { bg: '#f6ffed', fg: '#389e0d' },
    '?':      { bg: '#f5f5f5', fg: '#8c8c8c' },
  };
  const { bg, fg } = colors[t] ?? colors['?'];
  return (
    <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', padding: '1px 5px', borderRadius: 3,
      background: bg, color: fg, fontWeight: 600, flexShrink: 0 }}>
      {t}
    </span>
  );
}

// ─── Deep clone & dirty check ─────────────────────────────────────────────────

const clone = (o: any) => JSON.parse(JSON.stringify(o));
const differ = (a: any, b: any) => JSON.stringify(a) !== JSON.stringify(b);

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  isDarkMode: boolean;
  c: any;
  controlledFiles?: string[];
  onReloadTree?: () => void;
  onUncheckedFile?: (key: string) => void;
  scsMode?: boolean;
  preloadedMetas?: Record<string, any>;
  onSessionModelUpdate?: (key: string, content: any) => void;
  autoEditKey?: string;
}

export default function FileEditor({
  isDarkMode, c, controlledFiles, onReloadTree, onUncheckedFile,
  scsMode = false, preloadedMetas, onSessionModelUpdate, autoEditKey,
}: Props) {
  const { message } = App.useApp();
  const { t } = useI18n();

  const [metas,      setMetas]      = useState<Record<string, any>>({});
  const [drafts,     setDrafts]     = useState<Record<string, any>>({});
  const [editSet,    setEditSet]    = useState<Set<string>>(new Set());
  const [savingSet,  setSavingSet]  = useState<Set<string>>(new Set());
  const [validateSt, setValidateSt] = useState<Record<string, { loading: boolean; valid?: boolean; errors: string[] }>>({});

  // Auto-enter edit mode when autoEditKey changes and content is ready
  const prevAutoEditKey = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!autoEditKey || autoEditKey === prevAutoEditKey.current) return;
    prevAutoEditKey.current = autoEditKey;
    const tryEnter = () => {
      if (metas[autoEditKey]) { setEditSet(p => new Set([...p, autoEditKey])); return; }
      setTimeout(() => { if (metas[autoEditKey]) setEditSet(p => new Set([...p, autoEditKey])); }, 150);
    };
    tryEnter();
  }, [autoEditKey, metas]);

  // Sync controlledFiles → internal metas
  const checkedRef = useRef<string[]>([]);
  useEffect(() => {
    const prev = new Set(checkedRef.current);
    const next = new Set(controlledFiles ?? []);
    checkedRef.current = controlledFiles ?? [];

    // Remove deselected
    [...prev].filter(k => !next.has(k)).forEach(key => {
      setMetas(p => { const n = { ...p }; delete n[key]; return n; });
      setDrafts(p => { const n = { ...p }; delete n[key]; return n; });
      setEditSet(p => { const s = new Set(p); s.delete(key); return s; });
      setValidateSt(p => { const n = { ...p }; delete n[key]; return n; });
    });

    // Load newly added
    const added = [...next].filter(k => !prev.has(k));
    added.forEach(async key => {
      if (preloadedMetas?.[key]) {
        setMetas(p => ({ ...p, [key]: preloadedMetas[key] }));
        return;
      }
      const clean = key.replace(/^models\//, '');
      try {
        const d = await fetch(`/api/file/${clean}`).then(r => r.json());
        if (d.success && d.data?.content) setMetas(p => ({ ...p, [key]: d.data.content }));
      } catch {}
    });
  }, [controlledFiles]);

  // KEY FIX: checkedFiles includes session keys (not filtered through allNodes)
  const checkedFiles = (controlledFiles ?? []).filter(k => metas[k]);

  function removeFile(key: string) {
    setMetas(p => { const n = { ...p }; delete n[key]; return n; });
    setDrafts(p => { const n = { ...p }; delete n[key]; return n; });
    setEditSet(p => { const s = new Set(p); s.delete(key); return s; });
    setValidateSt(p => { const n = { ...p }; delete n[key]; return n; });
    onUncheckedFile?.(key);
  }

  function enterEdit(key: string) {
    const meta = metas[key]; if (!meta) return;
    setDrafts(p => ({ ...p, [key]: clone(meta) }));
    setEditSet(p => new Set([...p, key]));
  }

  function cancelEdit(key: string) {
    setDrafts(p => { const n = { ...p }; delete n[key]; return n; });
    setEditSet(p => { const s = new Set(p); s.delete(key); return s; });
  }

  function patchDraft(key: string, fn: (d: any) => void) {
    setDrafts(p => { const d = clone(p[key]); fn(d); return { ...p, [key]: d }; });
  }

  async function saveFile(key: string) {
    const draft = drafts[key]; if (!draft) return;
    if (key.startsWith('session/')) {
      setMetas(p => ({ ...p, [key]: clone(draft) }));
      cancelEdit(key);
      onSessionModelUpdate?.(key, draft);
      message.success(t('file.msg.saved_to_session'));
      return;
    }
    setSavingSet(p => new Set([...p, key]));
    try {
      const r = await fetch('/api/save-file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: key, content: draft }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
      const d = await r.json();
      if (d.success) {
        message.success(t('file.msg.saved'));
        setMetas(p => ({ ...p, [key]: clone(draft) }));
        cancelEdit(key);
        onReloadTree?.();
      } else message.error(t('file.msg.save_failed') + ': ' + (d.detail || d.error || ''));
    } catch (e: any) { message.error(String(e)); }
    finally { setSavingSet(p => { const s = new Set(p); s.delete(key); return s; }); }
  }

  async function handleValidate(key: string) {
    setValidateSt(p => ({ ...p, [key]: { loading: true, errors: [] } }));
    const result = await validateModelFile(key);
    setValidateSt(p => ({ ...p, [key]: { loading: false, valid: result.valid, errors: result.errors } }));
  }

  function handleAutoFix(key: string) {
    const st = validateSt[key];
    if (!st || st.valid !== false) return;
    const base = clone(metas[key]); if (!base) return;
    const missingVars: string[] = [];
    const unusedVars: string[] = [];
    for (const err of st.errors) {
      const m1 = err.match(/dynamics key '([^']+)' is not defined in variables/);
      if (m1) missingVars.push(m1[1]);
      const m2 = err.match(/Variable '([^']+)' is defined but not used by any equation/);
      if (m2) unusedVars.push(m2[1]);
    }
    if (!base.variables) base.variables = {};
    for (const v of missingVars)
      if (!base.variables[v])
        base.variables[v] = { type: 'state', unit: '', value: 0, bounds: [0, 100], description: '' };
    if (unusedVars.length > 0) {
      if (!base.equations) base.equations = {};
      const p = base.equations['draft_patch'] || { condition: true, priority: 5, dynamics: {} };
      if (!p.dynamics) p.dynamics = {};
      for (const v of unusedVars) p.dynamics[v] = 0;
      base.equations['draft_patch'] = p;
    }
    setDrafts(p => ({ ...p, [key]: base }));
    setEditSet(p => new Set([...p, key]));
    setValidateSt(p => { const n = { ...p }; delete n[key]; return n; });
  }

  const { bg, mute, isDark } = { bg: c.bg, mute: c.textMute, isDark: isDarkMode };

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: bg }}>
      {checkedFiles.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 10, color: mute }}>
          <div style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 2.2857)' }}>📂</div>
          <div>{t('file.editor.empty_hint')}</div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden',
          display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px',
          background: isDark ? 'rgba(0,0,0,0.18)' : '#eef0f3' }}>
          {checkedFiles.map(key => (
            <FileCard
              key={key}
              fileKey={key}
              meta={metas[key] ?? null}
              editing={editSet.has(key)}
              draft={drafts[key] ?? null}
              dirty={editSet.has(key) && differ(metas[key], drafts[key])}
              saving={savingSet.has(key)}
              totalCards={checkedFiles.length}
              validateSt={validateSt[key] ?? null}
              onEdit={() => enterEdit(key)}
              onCancel={() => cancelEdit(key)}
              onSave={() => saveFile(key)}
              onClose={() => removeFile(key)}
              onPatch={fn => patchDraft(key, fn)}
              onValidate={() => handleValidate(key)}
              onAutoFix={() => handleAutoFix(key)}
              onDelete={async () => {
                if (key.startsWith('session/')) { removeFile(key); return; }
                try {
                  const r = await fetch(`/api/file/${key.replace(/^models\//, '')}`, { method: 'DELETE' });
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                  message.success(t('file.msg.deleted'));
                  removeFile(key);
                  onReloadTree?.();
                } catch (e: any) { message.error(t('file.msg.delete_failed') + ': ' + String(e)); }
              }}
              onSaveAs={() => {
                const content = drafts[key] || metas[key];
                if (!content) return;
                const name = content?.metadata?.name || key.split('/').pop()?.replace(/\.ya?ml$/i, '') || 'model';
                const text = jsyaml.dump(content, { allowUnicode: true, sortKeys: false, indent: 2 });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([text], { type: 'text/yaml' }));
                a.download = `${name}.yaml`;
                a.click();
                URL.revokeObjectURL(a.href);
              }}
              c={c} isDarkMode={isDarkMode} scsMode={scsMode} t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FileCard ─────────────────────────────────────────────────────────────────

interface CardProps {
  fileKey: string; meta: any; editing: boolean; draft: any;
  dirty: boolean; saving: boolean; totalCards: number;
  validateSt: { loading: boolean; valid?: boolean; errors: string[] } | null;
  onEdit(): void; onCancel(): void; onSave(): void; onClose(): void;
  onPatch(fn: (d: any) => void): void;
  onValidate(): void; onAutoFix(): void; onDelete(): void; onSaveAs(): void;
  c: any; isDarkMode: boolean;
  scsMode?: boolean;
  t: (key: string, params?: Record<string, string | number>) => any;
}

function FileCard({ fileKey, meta, editing, draft, dirty, saving, totalCards,
  validateSt, onEdit, onCancel, onSave, onClose, onPatch, onValidate, onAutoFix, onDelete, onSaveAs,
  c, isDarkMode, scsMode = false, t }: CardProps) {

  const { border, bg, text, textMute: mute, primary } = c;
  const data = editing ? draft : meta;
  const ft   = FT[fileType(fileKey)];
  const mt   = data?.metadata ?? data?.meta ?? {};
  const vars = data?.variables ?? {};
  const eqs = data?.equations  ?? {};
  const simK = data?.simulator ? 'simulator' : 'simulation';
  const sim  = data?.[simK]   ?? {};
  const formatDescription = (description: any): string => {
    if (!description) return '';
    if (typeof description === 'string') return description;
    if (typeof description !== 'object') return String(description);
    return Object.entries(description)
      .filter(([, value]) => value != null && String(value).trim())
      .map(([key, value]) => `${key}: ${String(value).trim()}`)
      .join('\n\n');
  };

  const cardW = totalCards === 1 ? 560 : totalCards === 2 ? 440 : 360;
  const shadow = isDarkMode ? '0 2px 12px rgba(0,0,0,0.45)' : '0 2px 10px rgba(0,0,0,0.10)';

  return (
    <div style={{ width: cardW, flexShrink: 0, display: 'flex', flexDirection: 'column',
      maxHeight: '100%', borderRadius: 10, overflow: 'hidden',
      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
      boxShadow: shadow, background: isDarkMode ? '#1e2328' : '#fff' }}>

      <div style={{ height: 3, flexShrink: 0, background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }} />

      <div style={{ padding: '10px 14px 10px', flexShrink: 0,
        background: isDarkMode ? 'rgba(255,255,255,0.03)' : '#fafafa',
        borderBottom: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 1.4286)', flexShrink: 0 }}>{ft.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {mt.name || fileKey.split('/').pop()}
          </div>
          <div style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', color: mute, fontFamily: 'monospace',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
            {fileKey}
          </div>
        </div>
        <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', padding: '2px 6px', borderRadius: 4,
          border: `1px solid ${border}`, color: mute, fontWeight: 600, flexShrink: 0 }}>
          {ft.label}
        </span>

        {!editing ? (
          <>
            {!scsMode && <Btn onClick={onDelete} color={mute} outline danger>{t('file.editor.delete')}</Btn>}
            <Btn onClick={onEdit} color={primary} outline>{t('file.editor.edit')}</Btn>
            {!scsMode && validateSt?.valid === false && (
              <Btn onClick={onAutoFix} color={primary} outline>{t('file.editor.auto_fix')}</Btn>
            )}
            <Btn onClick={onValidate} color={mute} outline loading={validateSt?.loading ?? false}>
              {validateSt?.loading ? <><LoadingOutlined style={{ marginRight: 4 }} />{t('file.editor.validating')}</> : t('file.editor.validate')}
            </Btn>
            <Btn onClick={onSaveAs} color={mute} outline>{t('file.editor.download')}</Btn>
          </>
        ) : (
          <>
            {(() => {
              const saveBlockedByScs = scsMode && !fileKey.startsWith('session/');
              return (
                <Tooltip title={saveBlockedByScs ? t('file.editor.save_only_local') : ''}>
                  <span>
                    <Btn onClick={onSave} color={dirty && !saveBlockedByScs ? primary : mute}
                      disabled={!dirty || saveBlockedByScs} loading={saving}>
                      {saving ? t('file.editor.saving') : dirty ? t('file.editor.save_dirty') : t('file.editor.saved')}
                    </Btn>
                  </span>
                </Tooltip>
              );
            })()}
            <Btn onClick={onCancel} color={mute} outline>{t('file.editor.cancel')}</Btn>
            <Btn onClick={onSaveAs} color={mute} outline>{t('file.editor.download')}</Btn>
          </>
        )}
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: mute, padding: '0 4px', lineHeight: 1, borderRadius: 3 }}>
          ×
        </button>
      </div>

      {validateSt && !validateSt.loading && validateSt.valid !== undefined && (
        <div style={{ padding: '6px 16px', flexShrink: 0,
          background: validateSt.valid ? (isDarkMode ? 'rgba(82,196,26,0.1)' : '#f6ffed') : (isDarkMode ? 'rgba(255,77,79,0.1)' : '#fff1f0'),
          borderBottom: `1px solid ${validateSt.valid ? (isDarkMode ? 'rgba(82,196,26,0.3)' : '#b7eb8f') : (isDarkMode ? 'rgba(255,77,79,0.3)' : '#ffa39e')}`,
          display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontWeight: 700, flexShrink: 0, color: validateSt.valid ? (isDarkMode ? '#52c41a' : '#237804') : '#cf1322' }}>
            {validateSt.valid ? t('file.editor.validate_ok') : t('file.editor.validate_fail')}
          </span>
          <div style={{ flex: 1, color: isDarkMode ? 'rgba(255,255,255,0.75)' : '#333' }}>
            {validateSt.errors.map((e, i) => <div key={i} style={{ marginBottom: 1 }}>· {e}</div>)}
          </div>
        </div>
      )}

      {!meta ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: mute }}>{t('file.editor.loading')}</div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', background: isDarkMode ? '#1e2328' : '#fff' }}>
          <Sect title={t('file.editor.section.basic')} c={c} isDarkMode={isDarkMode}>
            <Row label={t('file.editor.field.name')} c={c}>
              <FV editing={editing} value={mt.name || ''} onChange={v => onPatch(d => { const m = d.metadata ?? d.meta; if (m) m.name = v; })} c={c} />
            </Row>
            <Row label={t('file.editor.field.description')} c={c}>
              {editing ? (
                <textarea value={formatDescription(mt.description)} rows={4}
                  onChange={e => onPatch(d => { const m = d.metadata ?? d.meta; if (m) m.description = e.target.value; })}
                  style={{ width: '100%', resize: 'vertical', border: `1px solid ${border}`, borderRadius: 4,
                    padding: '4px 8px', background: bg, color: text, outline: 'none', fontFamily: 'inherit', lineHeight: 1.55 }} />
              ) : (
                <span style={{ color: mute, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {formatDescription(mt.description) || <span style={{ opacity: 0.4 }}>—</span>}
                </span>
              )}
            </Row>
            {(mt.tags?.length > 0 || editing) && (
              <Row label={t('file.editor.field.tags')} c={c}>
                <TagsField tags={mt.tags || []} editing={editing}
                  onChange={tags => onPatch(d => { const m = d.metadata ?? d.meta; if (m) m.tags = tags; })} c={c} t={t} />
              </Row>
            )}
            {(Array.isArray(mt.authors) ? mt.authors.length > 0 : !!mt.author) && (
              <Row label={t('file.editor.field.author')} c={c}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {(Array.isArray(mt.authors) ? mt.authors : [{ name: mt.author }]).map((a: any, i: number) => (
                    <span key={i} style={{ color: mute, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      {a.name}
                      {a.email && <a href={`mailto:${a.email}`} style={{ color: primary, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{a.email}</a>}
                    </span>
                  ))}
                </div>
              </Row>
            )}
          </Sect>

          {(Object.keys(vars).length > 0 || editing) && (
            <Sect title={t('file.editor.section.variables')} isDarkMode={isDarkMode} action={editing ? (
              <SmBtn onClick={() => onPatch(d => {
                if (!d.variables) d.variables = {};
                const k = `var_${Object.keys(d.variables).length + 1}`;
                d.variables[k] = { type: 'state', unit: '', value: 0, bounds: [0, 100], description: '' };
              })} c={c}>{t('file.editor.add_var')}</SmBtn>
            ) : null} c={c}>
              <VarsTable vars={vars} editing={editing} t={t}
                onFieldChange={(varKey, field, value) => onPatch(d => {
                  if (!d.variables) return;
                  if (field === '_rename') {
                    const rebuilt: any = {};
                    for (const [k, v] of Object.entries(d.variables)) rebuilt[k === varKey ? value : k] = v;
                    d.variables = rebuilt;
                  } else if (d.variables[varKey]) d.variables[varKey][field] = value;
                })}
                onDelete={varKey => onPatch(d => { if (d.variables) delete d.variables[varKey]; })}
                c={c} />
            </Sect>
          )}

          {(Object.keys(eqs).length > 0 || editing) && (
            <Sect title={t('file.editor.section.equations')} isDarkMode={isDarkMode} action={editing ? (
              <SmBtn onClick={() => onPatch(d => {
                if (!d.equations) d.equations = {};
                const k = `equation_${Object.keys(d.equations).length + 1}`;
                d.equations[k] = { condition: true, priority: 5, dynamics: {} };
              })} c={c}>{t('file.editor.add_equation')}</SmBtn>
            ) : null} c={c}>
              <EquationsSection eqs={eqs} editing={editing} t={t}
                onRename={(fn, nk) => onPatch(d => {
                  if (!d.equations || fn === nk) return;
                  const rebuilt: any = {};
                  for (const [k, v] of Object.entries(d.equations)) rebuilt[k === fn ? nk : k] = v;
                  d.equations = rebuilt;
                })}
                onField={(fn, field, value) => onPatch(d => { if (d.equations?.[fn] !== undefined) d.equations[fn][field] = value; })}
                onDynChange={(fn, varKey, expr) => onPatch(d => { if (d.equations?.[fn]) d.equations[fn].dynamics = { ...d.equations[fn].dynamics, [varKey]: expr }; })}
                onDynRename={(fn, oldK, newK) => onPatch(d => {
                  if (!d.equations?.[fn]?.dynamics) return;
                  const rebuilt: any = {};
                  for (const [k, v] of Object.entries(d.equations[fn].dynamics)) rebuilt[k === oldK ? newK : k] = v;
                  d.equations[fn].dynamics = rebuilt;
                })}
                onDynDelete={(fn, varKey) => onPatch(d => { if (d.equations?.[fn]?.dynamics) delete d.equations[fn].dynamics[varKey]; })}
                onDynAdd={(fn) => onPatch(d => {
                  if (!d.equations?.[fn]) return;
                  if (!d.equations[fn].dynamics) d.equations[fn].dynamics = {};
                  const k = `var_${Object.keys(d.equations[fn].dynamics).length + 1}`;
                  d.equations[fn].dynamics[k] = '';
                })}
                onDelete={fn => onPatch(d => { if (d.equations) delete d.equations[fn]; })}
                c={c} />
            </Sect>
          )}

          {Object.keys(sim).length > 0 && (
            <Sect title={t('file.editor.section.sim_params')} c={c} isDarkMode={isDarkMode}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.keys(sim).map(k => (
                  <Row key={k} label={k} c={c} inline>
                    {editing ? (
                      <input type={typeof sim[k] === 'number' ? 'number' : 'text'} value={sim[k] ?? ''}
                        onChange={e => onPatch(d => { if (d[simK]) d[simK][k] = typeof sim[k] === 'number' ? Number(e.target.value) : e.target.value; })}
                        style={{ fontFamily: 'monospace', padding: '2px 6px', border: `1px solid ${border}`, borderRadius: 3, background: bg, color: text, outline: 'none', width: '100%' }} />
                    ) : (
                      <span style={{ fontFamily: 'monospace', color: text }}>{String(sim[k])}</span>
                    )}
                  </Row>
                ))}
              </div>
            </Sect>
          )}
        </div>
      )}
    </div>
  );
}

// ─── VarsTable ────────────────────────────────────────────────────────────────

function VarsTable({ vars, editing, onFieldChange, onDelete, c, t }: {
  vars: Record<string, any>; editing: boolean;
  onFieldChange(varKey: string, field: string, value: any): void;
  onDelete(varKey: string): void;
  c: any;
  t: (key: string) => any;
}) {
  const { border, text, textMute: mute, bg, panel } = c;
  const entries = Object.entries(vars);
  if (entries.length === 0) return <span style={{ color: mute }}>—</span>;
  const thSt = { fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase' as const, color: mute, padding: '0 6px 6px 0', textAlign: 'left' as const };
  const tdSt = { padding: '3px 6px 3px 0', verticalAlign: 'middle' as const };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{[t('file.editor.var_table.name'),t('file.editor.var_table.type'),t('file.editor.var_table.unit'),t('file.editor.var_table.init'),t('file.editor.var_table.bounds')].map(h => <th key={h} style={thSt}>{h}</th>)}{editing && <th style={thSt} />}</tr></thead>
        <tbody>
          {entries.map(([vk, vv]: [string, any]) => {
            const tc = vv.type === 'state' ? '#007A33' : vv.type === 'input' ? '#1677ff' : '#8c8c8c';
            return (
              <tr key={vk} style={{ borderTop: `1px solid ${border}` }}>
                <td style={tdSt}>{editing ? <VarNameInput value={vk} onCommit={v => onFieldChange(vk, '_rename', v)} c={c} /> : <span style={{ fontFamily: 'monospace', color: text }}>{vk}</span>}</td>
                <td style={tdSt}>{editing ? (
                  <select value={vv.type || 'state'} onChange={e => onFieldChange(vk, 'type', e.target.value)}
                    style={{ border: `1px solid ${border}`, borderRadius: 3, padding: '1px 4px', background: panel, color: text }}>
                    <option value="state">state</option><option value="input">input</option><option value="parameter">parameter</option>
                  </select>
                ) : <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', padding: '1px 5px', borderRadius: 3, fontWeight: 700, background: tc + '1a', color: tc }}>{vv.type || 'state'}</span>}</td>
                <td style={tdSt}>{editing ? <input value={vv.unit || ''} placeholder="—" onChange={e => onFieldChange(vk, 'unit', e.target.value)} style={{ width: 50, fontFamily: 'monospace', border: `1px solid ${border}`, borderRadius: 3, padding: '2px 5px', background: bg, color: text, outline: 'none' }} /> : <span style={{ color: mute, fontFamily: 'monospace' }}>{vv.unit || '—'}</span>}</td>
                <td style={tdSt}>{editing ? <input type="number" value={vv.value ?? 0} onChange={e => onFieldChange(vk, 'value', Number(e.target.value))} style={{ width: 60, fontFamily: 'monospace', border: `1px solid ${border}`, borderRadius: 3, padding: '2px 5px', background: bg, color: text, outline: 'none' }} /> : <span style={{ fontFamily: 'monospace', color: text }}>{vv.value ?? '—'}</span>}</td>
                <td style={tdSt}>{editing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <input type="number" value={vv.bounds?.[0] ?? 0} onChange={e => onFieldChange(vk, 'bounds', [Number(e.target.value), vv.bounds?.[1] ?? 100])} style={{ width: 45, fontFamily: 'monospace', border: `1px solid ${border}`, borderRadius: 3, padding: '2px 4px', background: bg, color: text, outline: 'none' }} />
                    <span style={{ color: mute }}>–</span>
                    <input type="number" value={vv.bounds?.[1] ?? 100} onChange={e => onFieldChange(vk, 'bounds', [vv.bounds?.[0] ?? 0, Number(e.target.value)])} style={{ width: 45, fontFamily: 'monospace', border: `1px solid ${border}`, borderRadius: 3, padding: '2px 4px', background: bg, color: text, outline: 'none' }} />
                  </div>
                ) : <span style={{ fontFamily: 'monospace', color: mute }}>{vv.bounds ? `[${vv.bounds[0]}, ${vv.bounds[1]}]` : '—'}</span>}</td>
                {editing && <td style={{ ...tdSt, padding: '3px 0' }}><button onClick={() => onDelete(vk)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: mute, padding: '0 3px', lineHeight: 1 }}>×</button></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── EquationsSection ─────────────────────────────────────────────────────────

function EquationsSection({ eqs, editing, onRename, onField, onDynChange, onDynRename, onDynDelete, onDynAdd, onDelete, c, t }: {
  eqs: Record<string, any>; editing: boolean;
  onRename(fn: string, nk: string): void; onField(fn: string, field: string, value: any): void;
  onDynChange(fn: string, varKey: string, expr: string): void; onDynRename(fn: string, oldK: string, newK: string): void;
  onDynDelete(fn: string, varKey: string): void; onDynAdd(fn: string): void; onDelete(fn: string): void; c: any;
  t: (key: string) => any;
}) {
  const { border, text, textMute: mute, bg, primary } = c;
  const entries = Object.entries(eqs);
  if (!entries.length) return <span style={{ color: mute }}>—</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: editing ? 10 : 3 }}>
      {entries.map(([fn, fd]: [string, any]) => {
        const equationType = autoType(fd);
        const dynEntries = Object.entries(fd.dynamics || {});
        if (!editing) {
          const hasExtra = (fd.condition !== undefined && fd.condition !== true && fd.condition !== 'true') || (fd.priority !== undefined && fd.priority !== 5);
          return (
            <div key={fn} style={{ border: `1px solid ${border}`, borderRadius: 5, overflow: 'hidden', background: isDarkBg(bg) ? 'rgba(255,255,255,0.03)' : '#fafafa' }}>
              <div style={{ padding: '5px 10px', borderBottom: dynEntries.length > 0 ? `1px solid ${border}` : 'none', display: 'flex', alignItems: 'center', gap: 6, background: isDarkBg(bg) ? 'rgba(255,255,255,0.04)' : '#f0f0f0' }}>
                <TChip t={equationType} /><span style={{ fontFamily: 'monospace', fontWeight: 600, color: text, flex: 1 }}>{fn}</span>
                {hasExtra && <span style={{ color: mute, fontFamily: 'monospace' }}>{fd.condition !== undefined && fd.condition !== true && fd.condition !== 'true' ? `if ${fd.condition}` : ''}{fd.priority !== undefined && fd.priority !== 5 ? ` pri:${fd.priority}` : ''}</span>}
              </div>
              {dynEntries.length > 0 && <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>{dynEntries.map(([dk, dv]: [string, any]) => <div key={dk} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span style={{ fontFamily: 'monospace', color: text, whiteSpace: 'nowrap', minWidth: 60 }}>{dk}</span><span style={{ color: mute, flexShrink: 0 }}>=</span><span style={{ fontFamily: 'monospace', color: text, wordBreak: 'break-all', lineHeight: 1.5 }}>{String(dv ?? '—')}</span></div>)}</div>}
            </div>
          );
        }
        return (
          <div key={fn} style={{ border: `1px solid ${border}`, borderRadius: 5, background: isDarkBg(bg) ? 'rgba(255,255,255,0.03)' : '#fafafa', overflow: 'hidden' }}>
            <div style={{ padding: '6px 10px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 6, background: isDarkBg(bg) ? 'rgba(255,255,255,0.04)' : '#f0f7f1' }}>
              <TChip t={equationType} /><VarNameInput value={fn} onCommit={nk => onRename(fn, nk)} c={c} />
              <span style={{ color: mute, marginLeft: 4 }}>cond:</span>
              <input value={String(fd.condition ?? 'true')} onChange={e => onField(fn, 'condition', e.target.value)} style={{ width: 80, fontFamily: 'monospace', padding: '1px 5px', border: `1px solid ${border}`, borderRadius: 3, background: bg, color: text, outline: 'none' }} />
              <span style={{ color: mute }}>pri:</span>
              <input type="number" value={fd.priority ?? 5} onChange={e => onField(fn, 'priority', Number(e.target.value))} style={{ width: 40, fontFamily: 'monospace', padding: '1px 5px', border: `1px solid ${border}`, borderRadius: 3, background: bg, color: text, outline: 'none' }} />
              <button onClick={() => onDelete(fn)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: mute, padding: '0 3px', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '6px 10px' }}>
              <div style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: mute, marginBottom: 5 }}>dynamics</div>
              {dynEntries.map(([dk, dv]: [string, any]) => (
                <div key={dk} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <VarNameInput value={dk} onCommit={nk => onDynRename(fn, dk, nk)} c={c} />
                  <span style={{ color: mute }}>=</span>
                  <input value={String(dv ?? '')} onChange={e => onDynChange(fn, dk, e.target.value)} style={{ flex: 1, fontFamily: 'monospace', padding: '2px 6px', border: `1px solid ${border}`, borderRadius: 3, background: bg, color: text, outline: 'none' }} />
                  <button onClick={() => onDynDelete(fn, dk)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: mute, padding: '0 2px', lineHeight: 1 }}>×</button>
                </div>
              ))}
              <button onClick={() => onDynAdd(fn)} style={{ padding: '2px 8px', borderRadius: 3, marginTop: 2, background: 'transparent', color: primary, border: `1px dashed ${primary}`, cursor: 'pointer' }}>{t('file.editor.add_dyn_item')}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function isDarkBg(bg: string) { return bg.startsWith('#0') || bg.startsWith('#1') || bg.startsWith('rgba(0'); }

function VarNameInput({ value, onCommit, c }: { value: string; onCommit(v: string): void; c: any }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return <input value={local} onChange={e => setLocal(e.target.value)} onBlur={() => { if (local !== value) onCommit(local); }} style={{ width: 100, fontFamily: 'monospace', border: `1px solid ${c.border}`, borderRadius: 3, padding: '2px 5px', background: c.bg, color: c.text, outline: 'none' }} />;
}

function TagsField({ tags, editing, onChange, c, t }: { tags: string[]; editing: boolean; onChange(tags: string[]): void; c: any; t: (key: string) => any }) {
  const [input, setInput] = useState('');
  const { border, text, textMute: mute } = c;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {tags.map((tag, i) => (
        <span key={i} style={{ padding: '2px 8px', borderRadius: 10, border: `1px solid ${border}`, color: text, display: 'flex', alignItems: 'center', gap: 4 }}>
          {tag}{editing && <button onClick={() => onChange(tags.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: mute, padding: 0, lineHeight: 1 }}>×</button>}
        </span>
      ))}
      {editing && <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ',') && input.trim()) { e.preventDefault(); onChange([...tags, input.trim()]); setInput(''); }}} placeholder={t('file.editor.tag_placeholder')} style={{ padding: '2px 8px', border: `1px dashed ${border}`, borderRadius: 10, background: 'transparent', color: text, outline: 'none', width: 70 }} />}
    </div>
  );
}

function Sect({ title, action, children, c, isDarkMode }: { title: string; action?: React.ReactNode; children: React.ReactNode; c: any; isDarkMode?: boolean }) {
  return (
    <div style={{ borderBottom: `1px solid ${c.border}`, padding: '12px 14px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 6 }}>
        <span style={{ fontWeight: 700, color: isDarkMode ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{title}</span>
        {action && <div style={{ marginLeft: 'auto' }}>{action}</div>}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children, c, inline }: { label: string; children: React.ReactNode; c: any; inline?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: inline ? 'row' : 'column', alignItems: inline ? 'center' : 'flex-start', gap: inline ? 8 : 3, marginBottom: 8 }}>
      <span style={{ color: c.textMute, whiteSpace: 'nowrap', minWidth: inline ? 80 : undefined }}>{label}</span>
      <div style={{ flex: 1, width: '100%' }}>{children}</div>
    </div>
  );
}

function FV({ editing, value, onChange, c }: { editing: boolean; value: string; onChange(v: string): void; c: any }) {
  if (!editing) return <span style={{ color: c.text }}>{value || '—'}</span>;
  return <input value={value} onChange={e => onChange(e.target.value)} style={{ padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: 4, background: c.bg, color: c.text, outline: 'none', width: '100%' }} />;
}

function Btn({ onClick, color, disabled, loading, outline, danger, children }: { onClick(): void; color: string; disabled?: boolean; loading?: boolean; outline?: boolean; danger?: boolean; children: React.ReactNode }) {
  const dangerColor = '#cf1322';
  return (
    <Button size="small" disabled={disabled} loading={loading} onClick={onClick}
      style={{ fontWeight: 500, ...(outline ? { background: 'transparent', color: danger ? dangerColor : color, borderColor: danger ? dangerColor + '66' : color } : { background: disabled || loading ? undefined : color, borderColor: disabled || loading ? undefined : color, color: disabled || loading ? undefined : '#fff' }) }}>
      {children}
    </Button>
  );
}

function SmBtn({ onClick, children, c }: { onClick(): void; children: React.ReactNode; c: any }) {
  return <Button size="small" onClick={onClick} style={{ fontWeight: 600, background: c.primary, borderColor: c.primary, color: '#fff' }}>{children}</Button>;
}
