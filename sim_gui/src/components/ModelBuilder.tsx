// ModelBuilder.tsx
// Select files (max 5) → structured cards shown side-by-side
// Click 编辑 on a card → all fields become inline inputs
// Save button activates (green) when there are unsaved changes

import React, { useState, useEffect, useMemo, useRef } from 'react';

function useResize(initial: number, min = 150, max = 600, direction: 'right' | 'left' = 'right') {
  const [width, setWidth] = useState(initial);
  const ref = useRef(width);
  ref.current = width;
  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = ref.current;
    const onMove = (ev: MouseEvent) => {
      const delta = direction === 'right' ? ev.clientX - startX : startX - ev.clientX;
      setWidth(Math.max(min, Math.min(max, startW + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
  return { width, startDrag };
}
import { App, Input, Button, Modal } from 'antd';
import { SearchOutlined, LoadingOutlined, PlusOutlined } from '@ant-design/icons';
import { validateModelFile } from '../core/validate';

// ─── File type registry ───────────────────────────────────────────────────────

const FT = {
  game_story: { label: 'Game',     color: '#722ed1', bg: '#f9f0ff', icon: '🎮' },
  scenario:   { label: 'Scenario', color: '#1677ff', bg: '#e6f4ff', icon: '📋' },
  model:      { label: 'Model',    color: '#007A33', bg: '#f6ffed', icon: '📊' },
  other:      { label: 'File',     color: '#8c8c8c', bg: '#f5f5f5', icon: '📄' },
} as const;
type FTName = keyof typeof FT;

function fileType(key: string): FTName {
  if (/game_story\.(yaml|yml)$/.test(key)) return 'game_story';
  if (key.includes('/scenarios/'))          return 'scenario';
  if (key.includes('/components/'))         return 'model';
  return 'other';
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────

interface FlatNode {
  kind: 'folder' | 'file';
  key: string; depth: number; name: string;
  ft?: FTName; fileCount?: number;
  tags?: string[];
}

function flatten(nodes: any[], depth = 0, out: FlatNode[] = []): FlatNode[] {
  for (const n of nodes) {
    if (n.type === 'folder') {
      out.push({ kind: 'folder', key: n.key, depth, name: n.title || n.key,
        fileCount: countF(n.children || []) });
      flatten(n.children || [], depth + 1, out);
    } else {
      const name = (n.title || n.key).split('/').pop() || n.key;
      out.push({ kind: 'file', key: n.key, depth, name, ft: fileType(n.key), tags: n.tags || [] });
    }
  }
  return out;
}
function countF(ns: any[]): number {
  return ns.reduce((s, n) => s + (n.type === 'file' ? 1 : countF(n.children || [])), 0);
}

// Returns 'none' | 'partial' | 'all' based on how many descendant files are checked
function folderSelState(folderKey: string, nodes: FlatNode[], checked: Set<string>): 'none'|'partial'|'all' {
  const files = nodes.filter(n => n.kind === 'file' && n.key.startsWith(folderKey + '/'));
  if (!files.length) return 'none';
  const sel = files.filter(n => checked.has(n.key)).length;
  if (sel === 0) return 'none';
  return sel === files.length ? 'all' : 'partial';
}

// Checkbox that supports indeterminate state
function TriChk({ state, onClick, primary }: {
  state: 'none'|'partial'|'all'; onClick(e: React.MouseEvent): void; primary: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!ref.current) return;
    ref.current.checked = state === 'all';
    ref.current.indeterminate = state === 'partial';
  }, [state]);
  return (
    <input ref={ref} type="checkbox" readOnly onClick={onClick}
      style={{ width: 12, height: 12, cursor: 'pointer', accentColor: primary, flexShrink: 0 }} />
  );
}

// ─── Formula type detection ───────────────────────────────────────────────────

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  Type1: { bg: '#f6ffed', fg: '#237804' }, Type2: { bg: '#fff7e6', fg: '#ad4e00' },
  Type3: { bg: '#f9f0ff', fg: '#531dab' }, Type4: { bg: '#fffbe6', fg: '#874d00' },
  Type5: { bg: '#fff0f6', fg: '#9e1068' }, Type6: { bg: '#e6f4ff', fg: '#003eb3' },
  D1: { bg: '#fff1f0', fg: '#a8071a' }, D2: { bg: '#fff1f0', fg: '#a8071a' },
  D3: { bg: '#fff1f0', fg: '#a8071a' }, derived: { bg: '#f5f5f5', fg: '#8c8c8c' },
};
const CONV_TYPES = ['Type1','Type2','Type3','Type4','Type5','Type6','D1','D2','D3','derived'];

function autoType(fd: any): string {
  const expr = Object.values(fd.dynamics || {}).join(' ');
  const cond  = fd.condition;
  if ((fd.priority || 5) <= 2 && (cond === true || cond === 'true')) return 'derived';
  if (typeof cond === 'string' && !['true','false'].includes(cond.toLowerCase())) return 'Type4';
  if (/step_size/.test(expr)) return 'Type6';
  return 'Type6';
}

function TChip({ t }: { t: string }) {
  const col = TYPE_COLORS[t] || TYPE_COLORS.derived;
  return (
    <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', padding: '1px 5px', borderRadius: 3,
      fontFamily: 'monospace', fontWeight: 700,
      background: col.bg, color: col.fg, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {t}
    </span>
  );
}

// ─── Deep clone & dirty check ─────────────────────────────────────────────────

const clone = (o: any) => JSON.parse(JSON.stringify(o));
const differ = (a: any, b: any) => JSON.stringify(a) !== JSON.stringify(b);

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { isDarkMode: boolean; c: any; }

export default function ModelBuilder({ isDarkMode, c }: Props) {
  const { modal, message } = App.useApp();
  const { width: leftW, startDrag: startLeftDrag } = useResize(230);

  const [allNodes, setAllNodes] = useState<FlatNode[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['models', 'scenarios']));
  const [search, setSearch] = useState('');

  // selection: clicking a file row toggles it in the checked set
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [metas, setMetas]     = useState<Record<string, any>>({});
  const [drafts, setDrafts]   = useState<Record<string, any>>({});
  const [editSet, setEditSet] = useState<Set<string>>(new Set());
  const [savingSet, setSavingSet] = useState<Set<string>>(new Set());

  // ── Merge state ──
  const [mergeOut, setMergeOut]   = useState('models/scenarios/merged_output.yaml');
  const [showMerge, setShowMerge] = useState(false);
  const [merging, setMerging]     = useState(false);

  // ── Validate state (per file) ──
  const [validateSt, setValidateSt] = useState<Record<string, {
    loading: boolean; valid?: boolean; errors: string[];
  }>>({});

  // ── File management ──
  const [dragKey, setDragKey] = useState<string | null>(null);    // key being dragged
  const [dropTarget, setDropTarget] = useState<string | null>(null); // folder key being hovered
  const [newFileModal, setNewFileModal] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [newFileTemplate, setNewFileTemplate] = useState<'model' | 'scenario'>('model');
  const [newFileLoading, setNewFileLoading] = useState(false);

  useEffect(() => {
    fetch('/api/files').then(r => r.json()).then(d => {
      if (d.success) {
        const nodes = flatten(d.data);
        setAllNodes(nodes);
        // Collapse only depth >= 2 (keep root + top-level folders open)
        setCollapsed(new Set(nodes.filter(n => n.kind === 'folder' && n.depth >= 2).map(n => n.key)));
      }
    }).catch(() => {});
  }, []);

  const checkedFiles = useMemo(() =>
    allNodes.filter(n => n.kind === 'file' && checked.has(n.key)).map(n => n.key),
    [allNodes, checked]
  );

  const visible = useMemo(() => {
    const q = search.toLowerCase();

    if (!q) {
      return allNodes.filter(n => {
        const parts = n.key.split('/');
        for (let i = 1; i < parts.length; i++)
          if (collapsed.has(parts.slice(0, i).join('/'))) return false;
        return true;
      });
    }

    // Search mode: find matching files, derive ancestor folders, ignore collapse
    // Tag matching: substring OR shared word-root (handles agriculture↔agricultural etc.)
    const tagMatches = (t: string) => {
      const tl = t.toLowerCase();
      if (tl.includes(q)) return true;
      const minLen = Math.min(q.length, tl.length);
      return minLen >= 5 && tl.slice(0, minLen - 1) === q.slice(0, minLen - 1);
    };
    const matchedKeys = new Set(
      allNodes
        .filter(n => n.kind === 'file' && (
          n.key.toLowerCase().includes(q) ||
          (n.tags || []).some(t => typeof t === 'string' && tagMatches(t))
        ))
        .map(n => n.key)
    );
    if (matchedKeys.size === 0) return [];

    // Build ancestor folder paths from matched file keys
    const relevantFolders = new Set<string>();
    for (const key of matchedKeys) {
      const parts = key.split('/');
      for (let i = 1; i < parts.length; i++)
        relevantFolders.add(parts.slice(0, i).join('/'));
    }

    return allNodes.filter(n => {
      if (n.kind === 'file') return matchedKeys.has(n.key);
      // depth-0 root ('models') is a wrapper not reflected in file paths — show if anything matches
      if (n.depth === 0) return true;
      return relevantFolders.has(n.key);
    });
  }, [allNodes, collapsed, search]);

  // ── Merge handler ────────────────────────────────────────────────────────
  async function handleMerge() {
    if (checkedFiles.length < 2) { message.warning('请至少选择 2 个文件'); return; }
    setMerging(true);
    try {
      const r = await fetch('/api/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: checkedFiles, output_path: mergeOut }),
      });
      const d = await r.json();
      if (d.success || d.message) { message.success('合并成功'); setShowMerge(false); }
      else message.error('合并失败: ' + (d.detail || d.error || ''));
    } catch (e: any) { message.error(String(e)); }
    finally { setMerging(false); }
  }

  // ── Deselect all ─────────────────────────────────────────────────────────
  function deselectAll() {
    setChecked(new Set());
    setMetas({});
    setDrafts({});
    setEditSet(new Set());
    setValidateSt({});
  }

  // ── Validate a file ───────────────────────────────────────────────────────
  async function handleValidate(key: string) {
    setValidateSt(p => ({ ...p, [key]: { loading: true, errors: [] } }));
    const result = await validateModelFile(key);
    setValidateSt(p => ({ ...p, [key]: { loading: false, valid: result.valid, errors: result.errors } }));
  }

  // ── Auto-fix: merge patch into file and enter edit mode ───────────────────
  function handleAutoFix(key: string) {
    const st = validateSt[key];
    if (!st || st.valid !== false) return;
    const base = clone(metas[key]);
    if (!base) return;

    const missingVars: string[] = [];
    const unusedVars: string[] = [];
    for (const err of st.errors) {
      const m1 = err.match(/dynamics 键 '([^']+)' 未在 variables 中定义/);
      if (m1) missingVars.push(m1[1]);
      const m2 = err.match(/变量 '([^']+)' 已定义但未被任何公式使用/);
      if (m2) unusedVars.push(m2[1]);
    }

    // Add missing variables
    if (!base.variables) base.variables = {};
    for (const v of missingVars) {
      if (!base.variables[v])
        base.variables[v] = { type: 'state', unit: '', value: 0, bounds: [0, 100], description: '' };
    }

    // Add draft_patch formula for unused variables
    if (unusedVars.length > 0) {
      if (!base.formulas) base.formulas = {};
      const patch = base.formulas['draft_patch'] || { condition: true, priority: 5, dynamics: {} };
      if (!patch.dynamics) patch.dynamics = {};
      for (const v of unusedVars) patch.dynamics[v] = 0;
      base.formulas['draft_patch'] = patch;
    }

    setDrafts(p => ({ ...p, [key]: base }));
    setEditSet(p => new Set([...p, key]));
    setValidateSt(p => { const n = { ...p }; delete n[key]; return n; });
  }

  // ── Toggle all files in a folder ─────────────────────────────────────────
  function toggleFolderFiles(folderKey: string, e: React.MouseEvent) {
    e.stopPropagation();
    const files = allNodes.filter(n => n.kind === 'file' && n.key.startsWith(folderKey + '/'));
    const state = folderSelState(folderKey, allNodes, checked);
    if (state !== 'none') {
      // deselect all (partial or all → clear everything under this folder)
      const next = new Set(checked);
      files.forEach(f => {
        next.delete(f.key);
        setMetas(p => { const n={...p}; delete n[f.key]; return n; });
        setDrafts(p => { const n={...p}; delete n[f.key]; return n; });
        setEditSet(p => { const s=new Set(p); s.delete(f.key); return s; });
        setValidateSt(p => { const n={...p}; delete n[f.key]; return n; });
      });
      setChecked(next);
    } else {
      // select remaining up to limit
      const next = new Set(checked);
      for (const f of files) {
        if (f.ft === 'game_story') continue;
        if (next.size >= 5) { message.warning('最多同时查看 5 个文件'); break; }
        next.add(f.key);
      }
      setChecked(next);
      // load metas for newly added
      files.filter(f => !checked.has(f.key) && next.has(f.key)).forEach(async f => {
        const clean = f.key.replace(/^models\//, '');
        try {
          const d = await fetch(`/api/file/${clean}`).then(r => r.json());
          if (d.success && d.data?.content) setMetas(p => ({ ...p, [f.key]: d.data.content }));
        } catch {}
      });
    }
  }

  // ── Toggle a file (select/deselect) ──────────────────────────────────────
  async function toggleFile(key: string) {
    if (checked.has(key)) {
      setChecked(p => { const s = new Set(p); s.delete(key); return s; });
      setMetas(p => { const n = { ...p }; delete n[key]; return n; });
      setDrafts(p => { const n = { ...p }; delete n[key]; return n; });
      setEditSet(p => { const s = new Set(p); s.delete(key); return s; });
    } else {
      if (fileType(key) === 'game_story') return; // game_story not supported in editor
      if (checked.size >= 5) { message.warning('最多同时查看 5 个文件'); return; }
      setChecked(p => new Set([...p, key]));
      const clean = key.replace(/^models\//, '');
      try {
        const d = await fetch(`/api/file/${clean}`).then(r => r.json());
        if (d.success && d.data?.content)
          setMetas(p => ({ ...p, [key]: d.data.content }));
      } catch {}
    }
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

  function patch(key: string, fn: (d: any) => void) {
    setDrafts(p => {
      const d = clone(p[key]);
      fn(d);
      return { ...p, [key]: d };
    });
  }

  async function saveFile(key: string) {
    const draft = drafts[key]; if (!draft) return;
    setSavingSet(p => new Set([...p, key]));
    try {
      const r = await fetch('/api/save-file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: key, content: draft }),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`HTTP ${r.status}: ${txt.slice(0, 120)}`);
      }
      const d = await r.json();
      if (d.success) {
        message.success('已保存');
        setMetas(p => ({ ...p, [key]: clone(draft) }));
        cancelEdit(key);
        // Re-fetch from disk to confirm sync
        const clean = key.replace(/^models\//, '');
        fetch(`/api/file/${clean}`).then(r => r.json()).then(fresh => {
          if (fresh.success && fresh.data?.content)
            setMetas(p => ({ ...p, [key]: fresh.data.content }));
        }).catch(() => {});
      } else message.error('保存失败: ' + (d.detail || d.error || ''));
    } catch (e: any) { message.error(String(e)); }
    finally { setSavingSet(p => { const s = new Set(p); s.delete(key); return s; }); }
  }

  // ── Expand / Collapse all ─────────────────────────────────────────────────
  function expandAll() { setCollapsed(new Set()); }
  function collapseAll() {
    setCollapsed(new Set(allNodes.filter(n => n.kind === 'folder').map(n => n.key)));
  }

  // ── Reload file tree ──────────────────────────────────────────────────────
  function reloadTree() {
    fetch('/api/files').then(r => r.json()).then(d => {
      if (d.success) {
        const nodes = flatten(d.data);
        setAllNodes(nodes);
      }
    }).catch(() => {});
  }

  // ── Delete file ───────────────────────────────────────────────────────────
  function handleDelete(key: string) {
    const name = key.split('/').pop();
    modal.confirm({
      title: '删除文件',
      content: `确定要删除 "${name}" 吗？此操作不可撤销。`,
      okText: '删除', okType: 'danger', cancelText: '取消',
      onOk: async () => {
        try {
          const r = await fetch(`/api/file/${key.replace(/^models\//, '')}`, { method: 'DELETE' });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          message.success('文件已删除');
          if (checked.has(key)) toggleFile(key);
          reloadTree();
        } catch (e: any) { message.error('删除失败: ' + String(e)); }
      },
    });
  }

  // ── Drag-to-move ──────────────────────────────────────────────────────────
  function handleDrop(folderKey: string) {
    if (!dragKey) return;
    const srcName = dragKey.split('/').pop()!;
    const dst = folderKey + '/' + srcName;
    if (dst === dragKey) { setDragKey(null); setDropTarget(null); return; }
    fetch('/api/file-move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ src: dragKey, dst }),
    }).then(r => r.json()).then(d => {
      if (d.success) { message.success(`已移动到 ${folderKey}`); reloadTree(); }
      else message.error('移动失败: ' + (d.detail || ''));
    }).catch(e => message.error(String(e)));
    setDragKey(null); setDropTarget(null);
  }

  // ── Create new file ───────────────────────────────────────────────────────
  async function handleCreateFile() {
    if (!newFilePath.trim()) { message.warning('请填写文件路径'); return; }
    let path = newFilePath.trim();
    if (!path.endsWith('.yaml') && !path.endsWith('.yml')) path += '.yaml';
    setNewFileLoading(true);
    try {
      const r = await fetch('/api/file-new', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, template: newFileTemplate }),
      });
      const d = await r.json();
      if (d.success) {
        message.success('文件已创建');
        setNewFileModal(false); setNewFilePath('');
        reloadTree();
      } else message.error('创建失败: ' + (d.detail || ''));
    } catch (e: any) { message.error(String(e)); }
    finally { setNewFileLoading(false); }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  const { border, panel, bg, text, textMute: mute, primary } = c;

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: bg }}>

      {/* ── LEFT: file tree ── */}
      <div style={{ width: leftW, flexShrink: 0,
        background: panel, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div style={{ padding: '10px 10px 6px' }}>
          <Input size="small"
            prefix={<SearchOutlined style={{ color: mute }} />}
            placeholder="搜索…" value={search} onChange={e => setSearch(e.target.value)}
            style={{  }}
          />
        </div>

        <div style={{ padding: '4px 10px 4px 12px', borderBottom: `1px solid ${border}`,
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ color: mute, fontFamily: 'monospace' }}>
            {checked.size > 0 ? `${checked.size}/5 已选` : '0 已选'}
          </span>
          <Button size="small" onClick={expandAll}
            style={{ color: mute, borderColor: border, padding: '0 5px' }}>
            展开
          </Button>
          <Button size="small" onClick={collapseAll}
            style={{ color: mute, borderColor: border, padding: '0 5px' }}>
            折叠
          </Button>
          {checked.size > 0 && (
            <Button size="small" onClick={deselectAll}
              style={{ color: mute, borderColor: border }}>
              全取消
            </Button>
          )}
          <Button size="small" icon={<PlusOutlined style={{  }} />}
            onClick={() => { setNewFilePath(''); setNewFileTemplate('model'); setNewFileModal(true); }}
            style={{ color: primary, borderColor: primary, padding: '0 5px' }}>
            新建
          </Button>
          {checkedFiles.length >= 2 && (
            <Button size="small" onClick={() => setShowMerge(p => !p)}
              style={{ marginLeft: 'auto', fontWeight: 600,
                background: showMerge ? primary : 'transparent',
                color: showMerge ? '#fff' : primary, borderColor: primary }}>
              合并
            </Button>
          )}
        </div>
        {showMerge && (
          <div style={{ padding: '6px 10px 8px', background: isDarkMode ? 'rgba(82,196,26,0.06)' : '#f6ffed',
            borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
            <div style={{ color: mute, marginBottom: 4 }}>输出路径（相对 models/）</div>
            <input value={mergeOut} onChange={e => setMergeOut(e.target.value)}
              style={{ width: '100%', fontFamily: 'monospace', padding: '3px 7px',
                border: `1px solid ${border}`, borderRadius: 4,
                background: isDarkMode ? '#162a1b' : '#fff', color: text, outline: 'none', marginBottom: 6 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="small" loading={merging} onClick={handleMerge}
                style={{ flex: 1, fontWeight: 600, background: primary, borderColor: primary, color: '#fff' }}>
                确认合并
              </Button>
              <Button size="small" onClick={() => setShowMerge(false)}
                style={{ color: mute, borderColor: border }}>
                取消
              </Button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
          {search && visible.length === 0 && (
            <div style={{ padding: '20px 12px', textAlign: 'center', color: mute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>
              无匹配结果
            </div>
          )}
          {visible.map(n => {
            if (n.kind === 'folder') {
              const open   = !collapsed.has(n.key);
              const fss    = folderSelState(n.key, allNodes, checked);
              const isDrop = dropTarget === n.key && dragKey !== null;
              return (
                <div key={n.key}
                  onClick={() => setCollapsed(p => { const s = new Set(p); s.has(n.key) ? s.delete(n.key) : s.add(n.key); return s; })}
                  onDragOver={e => { e.preventDefault(); setDropTarget(n.key); }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={e => { e.preventDefault(); handleDrop(n.key); }}
                  style={{ minHeight: 28, display: 'flex', alignItems: 'center', gap: 5,
                    paddingLeft: 6 + n.depth * 14, cursor: 'pointer', borderRadius: 4,
                    color: fss !== 'none' ? text : mute, userSelect: 'none',
                    background: isDrop ? (isDarkMode ? 'rgba(82,196,26,0.15)' : '#d9f7be') : 'transparent',
                    outline: isDrop ? `2px dashed ${primary}` : 'none',
                    transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (!isDrop) e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.04)' : '#f5f5f5'; }}
                  onMouseLeave={e => { if (!isDrop) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ width: 10, textAlign: 'center' }}>{open ? '▾' : '▸'}</span>
                  <TriChk state={fss} onClick={e => toggleFolderFiles(n.key, e)} primary={primary} />
                  <span style={{ fontFamily: 'monospace', fontWeight: fss !== 'none' ? 600 : 400 }}>{n.name}/</span>
                  <span style={{ marginLeft: 'auto', fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', color: mute }}>{n.fileCount}</span>
                </div>
              );
            }
            const ft   = FT[n.ft!];
            const sel  = checked.has(n.key);
            const isGs = n.ft === 'game_story';
            return (
              <div key={n.key}
                draggable={!isGs}
                onDragStart={() => setDragKey(n.key)}
                onDragEnd={() => { setDragKey(null); setDropTarget(null); }}
                onClick={() => toggleFile(n.key)}
                style={{ minHeight: 28, display: 'flex', alignItems: 'center', gap: 6,
                  paddingLeft: 6 + n.depth * 14,
                  cursor: isGs ? 'default' : 'pointer', borderRadius: 4,
                  background: sel ? (isDarkMode ? '#1a3a22' : '#e8f5e9') : 'transparent', color: text, transition: 'background 0.1s',
                  opacity: isGs ? 0.4 : dragKey === n.key ? 0.4 : 1 }}
                onMouseEnter={e => { if (!sel && !isGs) e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.04)' : '#f9fafb'; }}
                onMouseLeave={e => { e.currentTarget.style.background = sel ? (isDarkMode ? '#1a3a22' : '#e8f5e9') : 'transparent'; }}
              >
                <input type="checkbox" checked={sel} readOnly
                  onClick={e => { e.stopPropagation(); if (!isGs) toggleFile(n.key); }}
                  style={{ width: 12, height: 12, cursor: isGs ? 'default' : 'pointer',
                    accentColor: primary, flexShrink: 0 }} />
                <span style={{ flexShrink: 0 }}>{ft.icon}</span>
                <span style={{ flex: 1, fontFamily: 'monospace', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.name}
                </span>
                <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', padding: '1px 4px', borderRadius: 3, flexShrink: 0,
                  background: ft.bg, color: ft.color, fontWeight: 600 }}>
                  {ft.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Resize handle ── */}
      <div onMouseDown={startLeftDrag}
        style={{ width: 4, flexShrink: 0, cursor: 'col-resize', background: 'transparent',
          borderRight: `1px solid ${border}`, transition: 'background 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.background = `${c.primary}55`; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      />

      {/* ── RIGHT: card area ── */}
      {checkedFiles.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 10, color: mute }}>
          <div style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 2.2857)' }}>📂</div>
          <div style={{  }}>点击左侧文件查看</div>
          <div style={{ fontFamily: 'monospace' }}>可同时查看最多 5 个文件</div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden',
          display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px',
          background: isDarkMode ? 'rgba(0,0,0,0.18)' : '#eef0f3' }}>
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
              onClose={() => toggleFile(key)}
              onPatch={fn => patch(key, fn)}
              onValidate={() => handleValidate(key)}
              onAutoFix={() => handleAutoFix(key)}
              onDelete={() => handleDelete(key)}
              c={c} isDarkMode={isDarkMode}
            />
          ))}
        </div>
      )}

      {/* ── New file modal ── */}
      <Modal
        open={newFileModal}
        title="新建文件"
        onCancel={() => setNewFileModal(false)}
        onOk={handleCreateFile}
        okText="创建" cancelText="取消"
        confirmLoading={newFileLoading}
        width={420}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>模板类型</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['model', 'scenario'] as const).map(t => (
                <button key={t} onClick={() => setNewFileTemplate(t)}
                  style={{ flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer',
                    border: `1.5px solid ${newFileTemplate === t ? primary : border}`,
                    background: newFileTemplate === t ? (isDarkMode ? 'rgba(0,122,51,0.12)' : '#f0faf2') : 'transparent',
                    color: newFileTemplate === t ? primary : mute, fontWeight: newFileTemplate === t ? 600 : 400 }}>
                  {t === 'model' ? '📊 Model' : '📋 Scenario'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>
              文件路径 <span style={{ color: mute, fontWeight: 400 }}>（相对 models/）</span>
            </div>
            <input
              value={newFilePath}
              onChange={e => setNewFilePath(e.target.value)}
              placeholder={newFileTemplate === 'model' ? 'models/my_module/my_model.yaml' : 'scenarios/my_scene.yaml'}
              style={{ width: '100%', fontFamily: 'monospace', padding: '6px 10px',
                border: `1px solid ${border}`, borderRadius: 6,
                background: isDarkMode ? '#162a1b' : '#fff', color: text, outline: 'none', boxSizing: 'border-box' }}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFile(); }}
              autoFocus
            />
          </div>
        </div>
      </Modal>
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
  onValidate(): void; onAutoFix(): void; onDelete(): void;
  c: any; isDarkMode: boolean;
}

function FileCard({ fileKey, meta, editing, draft, dirty, saving, totalCards,
  validateSt, onEdit, onCancel, onSave, onClose, onPatch, onValidate, onAutoFix, onDelete,
  c, isDarkMode }: CardProps) {

  const { border, panel, bg, text, textMute: mute, primary } = c;
  const data = editing ? draft : meta;
  const ft   = FT[fileType(fileKey)];
  const mt   = data?.metadata ?? data?.meta ?? {};
  const vars = data?.variables ?? {};
  const fmls = data?.formulas  ?? {};
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
  const shadow = isDarkMode
    ? '0 2px 12px rgba(0,0,0,0.45)'
    : '0 2px 10px rgba(0,0,0,0.10)';

  return (
    <div style={{ width: cardW, flexShrink: 0, display: 'flex', flexDirection: 'column',
      maxHeight: '100%', borderRadius: 10, overflow: 'hidden',
      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
      boxShadow: shadow, background: isDarkMode ? '#1e2328' : '#fff' }}>

      {/* ── Top strip ── */}
      <div style={{ height: 3, flexShrink: 0, background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }} />

      {/* ── Card header ── */}
      <div style={{ padding: '10px 14px 10px', flexShrink: 0,
        background: isDarkMode ? 'rgba(255,255,255,0.03)' : '#fafafa',
        borderBottom: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 1.4286)', flexShrink: 0 }}>{ft.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
            <Btn onClick={onDelete} color={mute} outline danger>删除</Btn>
            <Btn onClick={onEdit} color={primary} outline>编辑</Btn>
            {validateSt?.valid === false && (
              <Btn onClick={onAutoFix} color={primary} outline>自动修复</Btn>
            )}
            <Btn onClick={onValidate} color={mute} outline loading={validateSt?.loading ?? false}>
              {validateSt?.loading ? <><LoadingOutlined style={{ marginRight: 4 }} />验证中</> : '验证'}
            </Btn>
          </>
        ) : (
          <>
            <Btn
              onClick={onSave}
              color={dirty ? primary : mute}
              disabled={!dirty}
              loading={saving}
            >
              {saving ? '保存中…' : dirty ? '● 保存' : '已保存'}
            </Btn>
            <Btn onClick={onCancel} color={mute} outline>取消</Btn>
          </>
        )}
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer',
            color: mute, padding: '0 4px', lineHeight: 1, borderRadius: 3 }}>
          ×
        </button>
      </div>

      {/* ── Validate status bar ── */}
      {validateSt && !validateSt.loading && validateSt.valid !== undefined && (
        <div style={{
          padding: '6px 16px', flexShrink: 0,
          background: validateSt.valid
            ? (isDarkMode ? 'rgba(82,196,26,0.1)' : '#f6ffed')
            : (isDarkMode ? 'rgba(255,77,79,0.1)' : '#fff1f0'),
          borderBottom: `1px solid ${validateSt.valid
            ? (isDarkMode ? 'rgba(82,196,26,0.3)' : '#b7eb8f')
            : (isDarkMode ? 'rgba(255,77,79,0.3)' : '#ffa39e')}`,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <span style={{ fontWeight: 700, flexShrink: 0,
            color: validateSt.valid ? (isDarkMode ? '#52c41a' : '#237804') : '#cf1322' }}>
            {validateSt.valid ? '✓ 验证通过' : '✗ 验证失败'}
          </span>
          <div style={{ flex: 1, color: isDarkMode ? 'rgba(255,255,255,0.75)' : '#333' }}>
            {validateSt.errors.map((e, i) => (
              <div key={i} style={{ marginBottom: 1 }}>· {e}</div>
            ))}
          </div>
        </div>
      )}

      {/* ── Scrollable body ── */}
      {!meta ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: mute }}>
          加载中…
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', background: isDarkMode ? '#1e2328' : '#fff' }}>

          {/* META */}
          <Sect title="基本信息" c={c} isDarkMode={isDarkMode}>
            <Row label="名称" c={c}>
              <FV editing={editing} value={mt.name || ''} onChange={v => onPatch(d => {
                const m = d.metadata ?? d.meta; if (m) m.name = v;
              })} c={c} />
            </Row>
            <Row label="描述" c={c}>
              {editing ? (
                <textarea value={formatDescription(mt.description)} rows={4}
                  onChange={e => onPatch(d => { const m = d.metadata ?? d.meta; if (m) m.description = e.target.value; })}
                  style={{ width: '100%', resize: 'vertical', border: `1px solid ${border}`,
                    borderRadius: 4, padding: '4px 8px', background: bg, color: text,
                    outline: 'none', fontFamily: 'inherit', lineHeight: 1.55 }} />
              ) : (
                <span style={{ color: mute, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {formatDescription(mt.description) || <span style={{ opacity: 0.4 }}>—</span>}
                </span>
              )}
            </Row>
            {(mt.tags?.length > 0 || editing) && (
              <Row label="标签" c={c}>
                <TagsField
                  tags={mt.tags || []} editing={editing}
                  onChange={tags => onPatch(d => { const m = d.metadata ?? d.meta; if (m) m.tags = tags; })}
                  c={c}
                />
              </Row>
            )}
            {mt.author && <Row label="作者" c={c}><span style={{ color: mute }}>{mt.author}</span></Row>}
            {mt.reference && (
              <Row label="参考" c={c}>
                <span style={{ color: mute, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {mt.reference}
                </span>
              </Row>
            )}
          </Sect>

          {/* VARIABLES */}
          {(Object.keys(vars).length > 0 || editing) && (
            <Sect title="变量" isDarkMode={isDarkMode} action={editing ? (
              <SmBtn onClick={() => onPatch(d => {
                if (!d.variables) d.variables = {};
                const k = `var_${Object.keys(d.variables).length + 1}`;
                d.variables[k] = { type: 'state', unit: '', value: 0, bounds: [0, 100], description: '' };
              })} c={c}>+ 添加</SmBtn>
            ) : null} c={c}>
              <VarsTable
                vars={vars} editing={editing}
                onFieldChange={(varKey, field, value) => onPatch(d => {
                  if (!d.variables) return;
                  if (field === '_rename') {
                    // rename key
                    const rebuilt: any = {};
                    for (const [k, v] of Object.entries(d.variables))
                      rebuilt[k === varKey ? value : k] = v;
                    d.variables = rebuilt;
                  } else if (d.variables[varKey]) {
                    d.variables[varKey][field] = value;
                  }
                })}
                onDelete={varKey => onPatch(d => { if (d.variables) delete d.variables[varKey]; })}
                c={c} isDarkMode={isDarkMode}
              />
            </Sect>
          )}

          {/* FORMULAS */}
          {(Object.keys(fmls).length > 0 || editing) && (
            <Sect title="公式" isDarkMode={isDarkMode} action={editing ? (
              <SmBtn onClick={() => onPatch(d => {
                if (!d.formulas) d.formulas = {};
                const k = `formula_${Object.keys(d.formulas).length + 1}`;
                d.formulas[k] = { condition: true, priority: 5, dynamics: {} };
              })} c={c}>+ 公式</SmBtn>
            ) : null} c={c}>
              <FormulasSection
                fmls={fmls} editing={editing}
                onRename={(fn, nk) => onPatch(d => {
                  if (!d.formulas || fn === nk) return;
                  const rebuilt: any = {};
                  for (const [k, v] of Object.entries(d.formulas)) rebuilt[k === fn ? nk : k] = v;
                  d.formulas = rebuilt;
                })}
                onField={(fn, field, value) => onPatch(d => {
                  if (d.formulas?.[fn] !== undefined) d.formulas[fn][field] = value;
                })}
                onDynChange={(fn, varKey, expr) => onPatch(d => {
                  if (d.formulas?.[fn]) d.formulas[fn].dynamics = { ...d.formulas[fn].dynamics, [varKey]: expr };
                })}
                onDynRename={(fn, oldK, newK) => onPatch(d => {
                  if (!d.formulas?.[fn]?.dynamics) return;
                  const rebuilt: any = {};
                  for (const [k, v] of Object.entries(d.formulas[fn].dynamics))
                    rebuilt[k === oldK ? newK : k] = v;
                  d.formulas[fn].dynamics = rebuilt;
                })}
                onDynDelete={(fn, varKey) => onPatch(d => {
                  if (d.formulas?.[fn]?.dynamics) delete d.formulas[fn].dynamics[varKey];
                })}
                onDynAdd={(fn) => onPatch(d => {
                  if (!d.formulas?.[fn]) return;
                  if (!d.formulas[fn].dynamics) d.formulas[fn].dynamics = {};
                  const k = `var_${Object.keys(d.formulas[fn].dynamics).length + 1}`;
                  d.formulas[fn].dynamics[k] = '';
                })}
                onDelete={fn => onPatch(d => { if (d.formulas) delete d.formulas[fn]; })}
                c={c}
              />
            </Sect>
          )}

          {/* SIMULATOR / SIMULATION */}
          {Object.keys(sim).length > 0 && (
            <Sect title="仿真参数" c={c} isDarkMode={isDarkMode}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.keys(sim).map(k => (
                  <Row key={k} label={k} c={c} inline>
                    {editing ? (
                      <input
                        type={typeof sim[k] === 'number' ? 'number' : 'text'}
                        value={sim[k] ?? ''}
                        onChange={e => onPatch(d => {
                          if (d[simK]) d[simK][k] = typeof sim[k] === 'number' ? Number(e.target.value) : e.target.value;
                        })}
                        style={{ fontFamily: 'monospace', padding: '2px 6px',
                          border: `1px solid ${border}`, borderRadius: 3,
                          background: bg, color: text, outline: 'none', width: '100%' }}
                      />
                    ) : (
                      <span style={{ fontFamily: 'monospace', color: text }}>{String(sim[k])}</span>
                    )}
                  </Row>
                ))}
              </div>
            </Sect>
          )}

          {/* OPTIMIZER (scenario only) */}
          {data?.optimizer && (
            <Sect title="优化器" c={c} isDarkMode={isDarkMode}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.keys(data.optimizer).map(k => (
                  <Row key={k} label={k} c={c} inline>
                    {editing ? (
                      <input type="text"
                        value={Array.isArray(data.optimizer[k]) ? data.optimizer[k].join(', ') : String(data.optimizer[k] ?? '')}
                        onChange={e => onPatch(d => {
                          if (!d.optimizer) return;
                          d.optimizer[k] = e.target.value;
                        })}
                        style={{ fontFamily: 'monospace', padding: '2px 6px',
                          border: `1px solid ${border}`, borderRadius: 3,
                          background: bg, color: text, outline: 'none', width: '100%' }}
                      />
                    ) : (
                      <span style={{ fontFamily: 'monospace', color: text }}>
                        {Array.isArray(data.optimizer[k]) ? data.optimizer[k].join(', ') : String(data.optimizer[k])}
                      </span>
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

function VarsTable({ vars, editing, onFieldChange, onDelete, c, isDarkMode }: {
  vars: Record<string, any>; editing: boolean;
  onFieldChange(varKey: string, field: string, value: any): void;
  onDelete(varKey: string): void;
  c: any; isDarkMode: boolean;
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
        <thead>
          <tr>
            {['变量名','类型','单位','初始值','范围'].map(h => <th key={h} style={thSt}>{h}</th>)}
            {editing && <th style={thSt} />}
          </tr>
        </thead>
        <tbody>
          {entries.map(([vk, vv]: [string, any]) => {
            const tc = vv.type === 'state' ? '#007A33' : vv.type === 'input' ? '#1677ff' : '#8c8c8c';
            return (
              <tr key={vk} style={{ borderTop: `1px solid ${border}` }}>
                {/* Name */}
                <td style={tdSt}>
                  {editing ? (
                    <VarNameInput value={vk}
                      onCommit={v => onFieldChange(vk, '_rename', v)}
                      c={c} />
                  ) : (
                    <span style={{ fontFamily: 'monospace', color: text }}>{vk}</span>
                  )}
                </td>
                {/* Type */}
                <td style={tdSt}>
                  {editing ? (
                    <select value={vv.type || 'state'}
                      onChange={e => onFieldChange(vk, 'type', e.target.value)}
                      style={{ border: `1px solid ${border}`, borderRadius: 3,
                        padding: '1px 4px', background: panel, color: text }}>
                      <option value="state">state</option>
                      <option value="input">input</option>
                      <option value="parameter">parameter</option>
                    </select>
                  ) : (
                    <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', padding: '1px 5px', borderRadius: 3,
                      fontWeight: 700, background: tc + '1a', color: tc }}>
                      {vv.type || 'state'}
                    </span>
                  )}
                </td>
                {/* Unit */}
                <td style={tdSt}>
                  {editing ? (
                    <input value={vv.unit || ''} placeholder="—"
                      onChange={e => onFieldChange(vk, 'unit', e.target.value)}
                      style={{ width: 50, fontFamily: 'monospace',
                        border: `1px solid ${border}`, borderRadius: 3, padding: '2px 5px',
                        background: bg, color: text, outline: 'none' }} />
                  ) : (
                    <span style={{ color: mute, fontFamily: 'monospace' }}>{vv.unit || '—'}</span>
                  )}
                </td>
                {/* Initial value */}
                <td style={tdSt}>
                  {editing ? (
                    <input type="number" value={vv.value ?? 0}
                      onChange={e => onFieldChange(vk, 'value', Number(e.target.value))}
                      style={{ width: 60, fontFamily: 'monospace',
                        border: `1px solid ${border}`, borderRadius: 3, padding: '2px 5px',
                        background: bg, color: text, outline: 'none' }} />
                  ) : (
                    <span style={{ fontFamily: 'monospace', color: text }}>
                      {vv.value ?? '—'}
                    </span>
                  )}
                </td>
                {/* Bounds */}
                <td style={tdSt}>
                  {editing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <input type="number" value={vv.bounds?.[0] ?? 0}
                        onChange={e => onFieldChange(vk, 'bounds', [Number(e.target.value), vv.bounds?.[1] ?? 100])}
                        style={{ width: 45, fontFamily: 'monospace',
                          border: `1px solid ${border}`, borderRadius: 3, padding: '2px 4px',
                          background: bg, color: text, outline: 'none' }} />
                      <span style={{ color: mute }}>–</span>
                      <input type="number" value={vv.bounds?.[1] ?? 100}
                        onChange={e => onFieldChange(vk, 'bounds', [vv.bounds?.[0] ?? 0, Number(e.target.value)])}
                        style={{ width: 45, fontFamily: 'monospace',
                          border: `1px solid ${border}`, borderRadius: 3, padding: '2px 4px',
                          background: bg, color: text, outline: 'none' }} />
                    </div>
                  ) : (
                    <span style={{ fontFamily: 'monospace', color: mute }}>
                      {vv.bounds ? `[${vv.bounds[0]}, ${vv.bounds[1]}]` : '—'}
                    </span>
                  )}
                </td>
                {/* Delete */}
                {editing && (
                  <td style={{ ...tdSt, padding: '3px 0' }}>
                    <button onClick={() => onDelete(vk)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: mute, padding: '0 3px', lineHeight: 1 }}>×</button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── FormulasSection ─────────────────────────────────────────────────────────

function FormulasSection({ fmls, editing, onRename, onField, onDynChange, onDynRename,
  onDynDelete, onDynAdd, onDelete, c }: {
  fmls: Record<string, any>; editing: boolean;
  onRename(fn: string, nk: string): void;
  onField(fn: string, field: string, value: any): void;
  onDynChange(fn: string, varKey: string, expr: string): void;
  onDynRename(fn: string, oldK: string, newK: string): void;
  onDynDelete(fn: string, varKey: string): void;
  onDynAdd(fn: string): void;
  onDelete(fn: string): void;
  c: any;
}) {
  const { border, text, textMute: mute, bg, panel, primary } = c;
  const entries = Object.entries(fmls);
  if (!entries.length) return <span style={{ color: mute }}>—</span>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: editing ? 10 : 3 }}>
      {entries.map(([fn, fd]: [string, any]) => {
        const t = autoType(fd);
        const dynEntries = Object.entries(fd.dynamics || {});

        if (!editing) {
          const hasExtra = (fd.condition !== undefined && fd.condition !== true && fd.condition !== 'true')
            || (fd.priority !== undefined && fd.priority !== 5);
          return (
            <div key={fn} style={{ border: `1px solid ${border}`, borderRadius: 5, overflow: 'hidden',
              background: isDarkBg(bg) ? 'rgba(255,255,255,0.03)' : '#fafafa' }}>
              {/* Header */}
              <div style={{ padding: '5px 10px',
                borderBottom: dynEntries.length > 0 ? `1px solid ${border}` : 'none',
                display: 'flex', alignItems: 'center', gap: 6,
                background: isDarkBg(bg) ? 'rgba(255,255,255,0.04)' : '#f0f0f0' }}>
                <TChip t={t} />
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: text, flex: 1 }}>{fn}</span>
                {hasExtra && (
                  <span style={{ color: mute, fontFamily: 'monospace' }}>
                    {fd.condition !== undefined && fd.condition !== true && fd.condition !== 'true'
                      ? `if ${fd.condition}` : ''}
                    {fd.priority !== undefined && fd.priority !== 5 ? ` pri:${fd.priority}` : ''}
                  </span>
                )}
              </div>
              {/* Dynamics */}
              {dynEntries.length > 0 && (
                <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {dynEntries.map(([dk, dv]: [string, any]) => (
                    <div key={dk} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontFamily: 'monospace', color: text,
                        whiteSpace: 'nowrap', minWidth: 60 }}>{dk}</span>
                      <span style={{ color: mute, flexShrink: 0 }}>=</span>
                      <span style={{ fontFamily: 'monospace', color: text,
                        wordBreak: 'break-all', lineHeight: 1.5 }}>{String(dv ?? '—')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }

        // Edit mode: expanded block
        return (
          <div key={fn} style={{ border: `1px solid ${border}`, borderRadius: 5,
            background: isDarkBg(bg) ? 'rgba(255,255,255,0.03)' : '#fafafa', overflow: 'hidden' }}>
            {/* Formula header row */}
            <div style={{ padding: '6px 10px', borderBottom: `1px solid ${border}`,
              display: 'flex', alignItems: 'center', gap: 6, background: isDarkBg(bg) ? 'rgba(255,255,255,0.04)' : '#f0f7f1' }}>
              <TChip t={t} />
              <VarNameInput value={fn} onCommit={nk => onRename(fn, nk)} c={c} />
              <span style={{ color: mute, marginLeft: 4 }}>cond:</span>
              <input value={String(fd.condition ?? 'true')}
                onChange={e => onField(fn, 'condition', e.target.value)}
                style={{ width: 80, fontFamily: 'monospace', padding: '1px 5px',
                  border: `1px solid ${border}`, borderRadius: 3, background: bg, color: text, outline: 'none' }} />
              <span style={{ color: mute }}>pri:</span>
              <input type="number" value={fd.priority ?? 5}
                onChange={e => onField(fn, 'priority', Number(e.target.value))}
                style={{ width: 40, fontFamily: 'monospace', padding: '1px 5px',
                  border: `1px solid ${border}`, borderRadius: 3, background: bg, color: text, outline: 'none' }} />
              <button onClick={() => onDelete(fn)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                  color: mute, padding: '0 3px', lineHeight: 1 }}>×</button>
            </div>
            {/* Dynamics rows */}
            <div style={{ padding: '6px 10px' }}>
              <div style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: mute, marginBottom: 5 }}>dynamics</div>
              {dynEntries.map(([dk, dv]: [string, any]) => (
                <div key={dk} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <VarNameInput value={dk} onCommit={nk => onDynRename(fn, dk, nk)} c={c} />
                  <span style={{ color: mute }}>=</span>
                  <input value={String(dv ?? '')}
                    onChange={e => onDynChange(fn, dk, e.target.value)}
                    style={{ flex: 1, fontFamily: 'monospace', padding: '2px 6px',
                      border: `1px solid ${border}`, borderRadius: 3, background: bg, color: text, outline: 'none' }} />
                  <button onClick={() => onDynDelete(fn, dk)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: mute, padding: '0 2px', lineHeight: 1 }}>×</button>
                </div>
              ))}
              <button onClick={() => onDynAdd(fn)}
                style={{ padding: '2px 8px', borderRadius: 3, marginTop: 2,
                  background: 'transparent', color: primary, border: `1px dashed ${primary}`,
                  cursor: 'pointer' }}>
                + 动态项
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// isDarkBg: simple heuristic to decide background tint for formula blocks
function isDarkBg(bg: string) { return bg.startsWith('#0') || bg.startsWith('#1') || bg.startsWith('rgba(0'); }

// ─── Variable name input (local state to avoid focus loss on keystroke) ───────

function VarNameInput({ value, onCommit, c }: { value: string; onCommit(v: string): void; c: any }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <input value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onCommit(local); }}
      style={{ width: 100, fontFamily: 'monospace',
        border: `1px solid ${c.border}`, borderRadius: 3, padding: '2px 5px',
        background: c.bg, color: c.text, outline: 'none' }} />
  );
}

// ─── TagsField ────────────────────────────────────────────────────────────────

function TagsField({ tags, editing, onChange, c }: {
  tags: string[]; editing: boolean;
  onChange(tags: string[]): void; c: any;
}) {
  const [input, setInput] = useState('');
  const { border, text, textMute: mute, primary } = c;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {tags.map((t, i) => (
        <span key={i} style={{ padding: '2px 8px', borderRadius: 10,
          border: `1px solid ${border}`, color: text, display: 'flex', alignItems: 'center', gap: 4 }}>
          {t}
          {editing && (
            <button onClick={() => onChange(tags.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: mute, padding: 0, lineHeight: 1 }}>×</button>
          )}
        </span>
      ))}
      {editing && (
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
            e.preventDefault(); onChange([...tags, input.trim()]); setInput('');
          }}}
          placeholder="+ 标签" style={{ padding: '2px 8px',
            border: `1px dashed ${border}`, borderRadius: 10,
            background: 'transparent', color: text, outline: 'none', width: 70 }} />
      )}
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Sect({ title, action, children, c, isDarkMode }: {
  title: string; action?: React.ReactNode; children: React.ReactNode; c: any; isDarkMode?: boolean;
}) {
  return (
    <div style={{ borderBottom: `1px solid ${c.border}`, padding: '12px 14px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 6 }}>
        <span style={{
          fontWeight: 700,
          color: isDarkMode ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)',
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          {title}
        </span>
        {action && <div style={{ marginLeft: 'auto' }}>{action}</div>}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children, c, inline }: {
  label: string; children: React.ReactNode; c: any; inline?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: inline ? 'row' : 'column',
      alignItems: inline ? 'center' : 'flex-start', gap: inline ? 8 : 3, marginBottom: 8 }}>
      <span style={{ color: c.textMute, whiteSpace: 'nowrap',
        minWidth: inline ? 80 : undefined }}>{label}</span>
      <div style={{ flex: 1, width: '100%' }}>{children}</div>
    </div>
  );
}

function FV({ editing, value, onChange, c }: {
  editing: boolean; value: string; onChange(v: string): void; c: any;
}) {
  if (!editing) return <span style={{ color: c.text }}>{value || '—'}</span>;
  return (
    <input value={value} onChange={e => onChange(e.target.value)}
      style={{ padding: '3px 8px', border: `1px solid ${c.border}`,
        borderRadius: 4, background: c.bg, color: c.text, outline: 'none', width: '100%' }} />
  );
}

// ─── Btn: thin wrapper around antd Button for consistent app-wide style ──────
function Btn({ onClick, color, disabled, loading, outline, danger, children }: {
  onClick(): void; color: string; disabled?: boolean; loading?: boolean;
  outline?: boolean; danger?: boolean; children: React.ReactNode;
}) {
  const dangerColor = '#cf1322';
  return (
    <Button
      size="small"
      disabled={disabled}
      loading={loading}
      onClick={onClick}
      style={{
        fontWeight: 500,
        ...(outline
          ? { background: 'transparent', color: danger ? dangerColor : color, borderColor: danger ? dangerColor + '66' : color }
          : { background: disabled || loading ? undefined : color,
              borderColor: disabled || loading ? undefined : color,
              color: disabled || loading ? undefined : '#fff' }),
      }}
    >
      {children}
    </Button>
  );
}

function SmBtn({ onClick, children, c }: { onClick(): void; children: React.ReactNode; c: any }) {
  return (
    <Button size="small" onClick={onClick}
      style={{ fontWeight: 600, background: c.primary, borderColor: c.primary, color: '#fff' }}>
      {children}
    </Button>
  );
}
