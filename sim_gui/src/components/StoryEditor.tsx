// StoryEditor.tsx
// Browse & edit game_story.yaml files under scenarios/to_game/

import React, { useState, useEffect, useMemo } from 'react';
import { Input, message, Button, Modal } from 'antd';
import { SearchOutlined, LoadingOutlined, PlusOutlined } from '@ant-design/icons';
import jsYaml from 'js-yaml';

// ─── helpers ──────────────────────────────────────────────────────────────────

const clone  = (o: any) => JSON.parse(JSON.stringify(o));
const differ = (a: any, b: any) => JSON.stringify(a) !== JSON.stringify(b);

const SECT_COLORS: Record<string, { accent: string; bg: string }> = {
  '基本信息':  { accent: '#1677ff', bg: '#e6f4ff' },
  '游戏变量':  { accent: '#52c41a', bg: '#f6ffed' },
  '游戏规则':  { accent: '#722ed1', bg: '#f9f0ff' },
  '失败条件':  { accent: '#f5222d', bg: '#fff1f0' },
  '玩家卡牌':  { accent: '#fa8c16', bg: '#fff7e6' },
  '环境卡牌':  { accent: '#eb2f96', bg: '#fff0f6' },
};

function Sect({ title, action, children, c, isDarkMode }: {
  title: string; action?: React.ReactNode; children: React.ReactNode; c: any; isDarkMode: boolean;
}) {
  const col = SECT_COLORS[title] ?? { accent: '#8c8c8c', bg: '#f5f5f5' };
  return (
    <div style={{ borderBottom: `1px solid ${c.border}`, padding: '12px 14px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 8 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: col.accent, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: col.accent,
          background: isDarkMode ? col.accent + '22' : col.bg,
          padding: '1px 8px', borderRadius: 8, letterSpacing: '0.04em' }}>
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
      <span style={{ fontSize: 10, color: c.textMute, whiteSpace: 'nowrap',
        minWidth: inline ? 80 : undefined }}>{label}</span>
      <div style={{ flex: 1, width: '100%' }}>{children}</div>
    </div>
  );
}

function FV({ editing, value, onChange, c, mono }: {
  editing: boolean; value: string; onChange(v: string): void; c: any; mono?: boolean;
}) {
  if (!editing) return (
    <span style={{ fontSize: 12, color: c.text, fontFamily: mono ? 'monospace' : 'inherit' }}>
      {value || <span style={{ opacity: 0.35 }}>—</span>}
    </span>
  );
  return (
    <input value={value} onChange={e => onChange(e.target.value)}
      style={{ fontSize: 12, padding: '3px 8px', border: `1px solid ${c.border}`,
        borderRadius: 4, background: c.bg, color: c.text, outline: 'none', width: '100%',
        fontFamily: mono ? 'monospace' : 'inherit' }} />
  );
}

function NV({ editing, value, onChange, c }: {
  editing: boolean; value: number | string; onChange(v: number): void; c: any;
}) {
  if (!editing) return <span style={{ fontSize: 12, color: c.text }}>{value}</span>;
  return (
    <input type="number" value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{ fontSize: 12, padding: '3px 8px', border: `1px solid ${c.border}`,
        borderRadius: 4, background: c.bg, color: c.text, outline: 'none', width: 90 }} />
  );
}

function TA({ editing, value, onChange, rows, c }: {
  editing: boolean; value: string; onChange(v: string): void; rows?: number; c: any;
}) {
  if (!editing) return (
    <span style={{ fontSize: 11, color: c.textMute, lineHeight: 1.6, display: 'block' }}>
      {value || <span style={{ opacity: 0.35 }}>—</span>}
    </span>
  );
  return (
    <textarea value={value} rows={rows ?? 2} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', fontSize: 11, resize: 'vertical', border: `1px solid ${c.border}`,
        borderRadius: 4, padding: '4px 8px', background: c.bg, color: c.text,
        outline: 'none', fontFamily: 'inherit', lineHeight: 1.55, boxSizing: 'border-box' }} />
  );
}

function Btn({ onClick, color, disabled, loading, outline, children }: {
  onClick(): void; color: string; disabled?: boolean; loading?: boolean;
  outline?: boolean; children: React.ReactNode;
}) {
  return (
    <Button size="small" disabled={disabled} loading={loading} onClick={onClick}
      style={{ fontWeight: 600, ...(outline
        ? { background: 'transparent', color, borderColor: color }
        : { background: disabled||loading ? undefined : color,
            borderColor: disabled||loading ? undefined : color,
            color: disabled||loading ? undefined : '#fff' }) }}>
      {children}
    </Button>
  );
}

function TagsField({ tags, editing, onChange, c }: {
  tags: string[]; editing: boolean; onChange(t: string[]): void; c: any;
}) {
  const [inp, setInp] = useState('');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {tags.map((t, i) => (
        <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10,
          border: `1px solid ${c.border}`, color: c.text, display: 'flex', alignItems: 'center', gap: 4 }}>
          {t}
          {editing && <button onClick={() => onChange(tags.filter((_,j) => j !== i))}
            style={{ background:'none', border:'none', cursor:'pointer', color:c.textMute, fontSize:11, padding:0, lineHeight:1 }}>×</button>}
        </span>
      ))}
      {editing && <input value={inp} onChange={e => setInp(e.target.value)}
        onKeyDown={e => { if ((e.key==='Enter'||e.key===',') && inp.trim()) { e.preventDefault(); onChange([...tags, inp.trim()]); setInp(''); }}}
        placeholder="+ 标签" style={{ fontSize:10, padding:'2px 8px', border:`1px dashed ${c.border}`, borderRadius:10,
          background:'transparent', color:c.text, outline:'none', width:70 }} />}
    </div>
  );
}

// ─── Difficulty badge ─────────────────────────────────────────────────────────

const DIFF: Record<string, { label: string; color: string }> = {
  easy:   { label: '简单', color: '#52c41a' },
  medium: { label: '中等', color: '#fa8c16' },
  hard:   { label: '困难', color: '#f5222d' },
};

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { isDarkMode: boolean; c: any; }

interface StoryEntry {
  key: string;   // e.g. "scenarios/to_game/ad1346_europe_black_death/game_story.yaml"
  folder: string; // e.g. "ad1346_europe_black_death"
}

export default function StoryEditor({ isDarkMode, c }: Props) {
  const { border, panel, bg, text, textMute: mute, primary } = c;

  const [stories, setStories] = useState<StoryEntry[]>([]);
  const [search,  setSearch]  = useState('');
  const [active,  setActive]  = useState<string | null>(null);
  const [meta,    setMeta]    = useState<any>(null);
  const [draft,   setDraft]   = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  // ── new story modal ──
  const [newModal,    setNewModal]    = useState(false);
  const [newFolder,   setNewFolder]   = useState('');
  const [newCreating, setNewCreating] = useState(false);

  // Load story list from file tree
  useEffect(() => {
    fetch('/api/files').then(r => r.json()).then(d => {
      if (!d.success) return;
      const entries: StoryEntry[] = [];
      function walk(nodes: any[]) {
        for (const n of nodes) {
          if (n.type === 'folder') { walk(n.children || []); continue; }
          const k: string = n.key || '';
          if (/scenarios\/to_game\/[^/]+\/game_story\.ya?ml$/.test(k)) {
            const parts = k.split('/');
            entries.push({ key: k, folder: parts[parts.length - 2] });
          }
        }
      }
      walk(d.data);
      setStories(entries);
    }).catch(() => {});
  }, []);

  function reloadList() {
    fetch('/api/files').then(r => r.json()).then(d => {
      if (!d.success) return;
      const entries: StoryEntry[] = [];
      function walk(nodes: any[]) {
        for (const n of nodes) {
          if (n.type === 'folder') { walk(n.children || []); continue; }
          const k: string = n.key || '';
          if (/scenarios\/to_game\/[^/]+\/game_story\.ya?ml$/.test(k)) {
            const parts = k.split('/');
            entries.push({ key: k, folder: parts[parts.length - 2] });
          }
        }
      }
      walk(d.data);
      setStories(entries);
    }).catch(() => {});
  }

  const visible = useMemo(() => {
    if (!search) return stories;
    const q = search.toLowerCase();
    return stories.filter(s =>
      s.folder.toLowerCase().includes(q) ||
      (meta && active === s.key && (meta.meta?.name || '').toLowerCase().includes(q))
    );
  }, [stories, search, meta, active]);

  async function loadStory(key: string) {
    if (editing && differ(meta, draft)) {
      const ok = await new Promise<boolean>(res =>
        Modal.confirm({ title: '有未保存更改', content: '切换故事将丢失更改，确定吗？',
          okText: '确定', cancelText: '取消', onOk: () => res(true), onCancel: () => res(false) })
      );
      if (!ok) return;
    }
    setActive(key);
    setEditing(false);
    setMeta(null);
    setDraft(null);
    setLoadingKey(key);
    try {
      const clean = key.replace(/^mods\//, '');
      const d = await fetch(`/api/file/${clean}`).then(r => r.json());
      if (d.success && d.data?.content) {
        setMeta(d.data.content);
      } else {
        message.error('加载失败');
      }
    } catch (e: any) { message.error(String(e)); }
    setLoadingKey(null);
  }

  function enterEdit() {
    if (!meta) return;
    setDraft(clone(meta));
    setEditing(true);
  }
  function cancelEdit() { setDraft(null); setEditing(false); }
  function patch(fn: (d: any) => void) {
    setDraft((p: any) => { const d = clone(p); fn(d); return d; });
  }
  const dirty = editing && draft ? differ(meta, draft) : false;
  const data  = editing ? draft : meta;

  async function saveFile() {
    if (!draft || !active) return;
    setSaving(true);
    try {
      const path = active.replace(/^mods\//, '');
      const r = await fetch('/api/save-file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: draft }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.success) { message.success('已保存'); setMeta(clone(draft)); cancelEdit(); }
      else message.error('保存失败: ' + (d.detail || d.error || ''));
    } catch (e: any) { message.error(String(e)); }
    setSaving(false);
  }

  async function handleExport() {
    if (!meta) return;
    const yamlText = jsYaml.dump(meta, { indent: 2, lineWidth: -1, noCompatMode: true });
    const blob = new Blob([yamlText], { type: 'text/yaml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'game_story.yaml'; a.click();
    URL.revokeObjectURL(url);
  }

  function handleDelete() {
    if (!active) return;
    const folder = active.split('/').slice(-2, -1)[0];
    Modal.confirm({
      title: '删除故事',
      content: `确定要删除 "${folder}" 的 game_story.yaml 吗？此操作不可撤销。`,
      okText: '删除', okType: 'danger', cancelText: '取消',
      onOk: async () => {
        try {
          const r = await fetch(`/api/file/${active.replace(/^mods\//, '')}`, { method: 'DELETE' });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          message.success('已删除');
          setActive(null); setMeta(null); setDraft(null); setEditing(false);
          reloadList();
        } catch (e: any) { message.error('删除失败: ' + String(e)); }
      },
    });
  }

  async function handleCreateStory() {
    const folder = newFolder.trim();
    if (!folder) { message.warning('请填写文件夹名'); return; }
    const path = `scenarios/to_game/${folder}/game_story.yaml`;
    setNewCreating(true);
    try {
      const template = {
        meta: { id: folder, name: '新故事', period: '', location: '', difficulty: 'medium',
          description: '', science_note: '', tags: [] },
        variables: {
          health: { label: '生命值', value: 100, max: 100, color: '#52c41a' },
        },
        game: { ap_per_turn: 3, max_turns: 10, hand_size: 4 },
        lose_conditions: [{ condition: 'health <= 0', message: '角色死亡。' }],
        player_cards: [],
        environment_cards: [],
      };
      const r = await fetch('/api/save-file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: template }),
      });
      const d = await r.json();
      if (d.success) {
        message.success('故事已创建');
        setNewModal(false); setNewFolder('');
        reloadList();
      } else message.error('创建失败: ' + (d.detail || ''));
    } catch (e: any) { message.error(String(e)); }
    setNewCreating(false);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: bg }}>

      {/* ── LEFT: story list ── */}
      <div style={{ width: 230, flexShrink: 0, borderRight: `1px solid ${border}`,
        background: panel, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div style={{ padding: '10px 10px 6px' }}>
          <Input size="small"
            prefix={<SearchOutlined style={{ fontSize: 11, color: mute }} />}
            placeholder="搜索故事…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ fontSize: 11 }}
          />
        </div>

        <div style={{ padding: '4px 10px 6px', borderBottom: `1px solid ${border}`,
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: mute, fontFamily: 'monospace' }}>
            {stories.length} 个故事
          </span>
          <Button size="small" icon={<PlusOutlined style={{ fontSize: 10 }} />}
            onClick={() => { setNewFolder(''); setNewModal(true); }}
            style={{ fontSize: 10, color: primary, borderColor: primary, padding: '0 5px', marginLeft: 'auto' }}>
            新建
          </Button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
          {visible.map(s => {
            const isSel = active === s.key;
            const isLoading = loadingKey === s.key;
            return (
              <div key={s.key} onClick={() => loadStory(s.key)}
                style={{ minHeight: 32, display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 8px', cursor: 'pointer', borderRadius: 6,
                  background: isSel ? (isDarkMode ? '#2a1f40' : '#f9f0ff') : 'transparent',
                  border: `1px solid ${isSel ? '#722ed1' : 'transparent'}`,
                  fontSize: 11, color: isSel ? (isDarkMode ? '#b37feb' : '#531dab') : text,
                  transition: 'background 0.1s', marginBottom: 2 }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.04)' : '#f9fafb'; }}
                onMouseLeave={e => { e.currentTarget.style.background = isSel ? (isDarkMode ? '#2a1f40' : '#f9f0ff') : 'transparent'; }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>🎮</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: isSel ? 600 : 400, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 10 }}>
                    {s.folder}
                  </div>
                </div>
                {isLoading && <LoadingOutlined style={{ fontSize: 11, color: mute }} />}
              </div>
            );
          })}
          {stories.length === 0 && (
            <div style={{ padding: '20px 8px', textAlign: 'center', color: mute, fontSize: 11 }}>
              暂无故事文件
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: editor ── */}
      {!active ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 10, color: mute }}>
          <div style={{ fontSize: 36 }}>🎮</div>
          <div style={{ fontSize: 13 }}>点击左侧故事查看</div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: isDarkMode ? 'rgba(0,0,0,0.18)' : '#eef0f3', padding: 14 }}>
          <div style={{ flex: 1, overflow: 'hidden', borderRadius: 10,
            border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
            boxShadow: isDarkMode ? '0 2px 12px rgba(0,0,0,0.45)' : '0 2px 10px rgba(0,0,0,0.10)',
            background: isDarkMode ? '#1e2328' : '#fff',
            display: 'flex', flexDirection: 'column' }}>

            {/* Coloured top strip */}
            <div style={{ height: 4, flexShrink: 0, background: '#722ed1' }} />

            {/* Header */}
            <div style={{ padding: '10px 14px', flexShrink: 0,
              background: isDarkMode ? '#722ed11a' : '#f9f0ff',
              borderBottom: `1px solid ${isDarkMode ? '#722ed133' : '#722ed128'}`,
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>🎮</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {data?.meta?.name || active.split('/').slice(-2, -1)[0]}
                </div>
                <div style={{ fontSize: 9, color: mute, fontFamily: 'monospace', marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {active.replace(/^mods\//, '')}
                </div>
              </div>
              {data?.meta?.difficulty && (
                <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, flexShrink: 0,
                  background: DIFF[data.meta.difficulty]?.color || '#8c8c8c', color: '#fff', fontWeight: 700 }}>
                  {DIFF[data.meta.difficulty]?.label || data.meta.difficulty}
                </span>
              )}

              {!editing ? (
                <>
                  <Btn onClick={handleExport} color={mute} outline>导出</Btn>
                  <Btn onClick={enterEdit} color={primary}>✏️ 编辑</Btn>
                  <Btn onClick={handleDelete} color="#ff4d4f" outline>删除</Btn>
                </>
              ) : (
                <>
                  <Btn onClick={saveFile} color={dirty ? primary : mute}
                    disabled={!dirty} loading={saving}>
                    {saving ? '保存中…' : dirty ? '● 保存' : '已保存'}
                  </Btn>
                  <Btn onClick={cancelEdit} color={mute} outline>取消</Btn>
                </>
              )}
            </div>

            {/* Body */}
            {!data ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: mute }}>
                <LoadingOutlined style={{ fontSize: 20 }} />
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', background: isDarkMode ? '#1e2328' : '#fff' }}>

                {/* ── 基本信息 ── */}
                <Sect title="基本信息" c={c} isDarkMode={isDarkMode}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                    <Row label="ID" c={c}><FV editing={editing} value={data.meta?.id || ''} mono
                      onChange={v => patch(d => { if (d.meta) d.meta.id = v; })} c={c} /></Row>
                    <Row label="名称" c={c}><FV editing={editing} value={data.meta?.name || ''}
                      onChange={v => patch(d => { if (d.meta) d.meta.name = v; })} c={c} /></Row>
                    <Row label="时期" c={c}><FV editing={editing} value={data.meta?.period || ''}
                      onChange={v => patch(d => { if (d.meta) d.meta.period = v; })} c={c} /></Row>
                    <Row label="地点" c={c}><FV editing={editing} value={data.meta?.location || ''}
                      onChange={v => patch(d => { if (d.meta) d.meta.location = v; })} c={c} /></Row>
                  </div>
                  <Row label="难度" c={c}>
                    {editing ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(['easy', 'medium', 'hard'] as const).map(d => (
                          <button key={d} onClick={() => patch(p => { if (p.meta) p.meta.difficulty = d; })}
                            style={{ fontSize: 11, padding: '2px 10px', borderRadius: 4, cursor: 'pointer',
                              border: `1.5px solid ${data.meta?.difficulty === d ? DIFF[d].color : border}`,
                              background: data.meta?.difficulty === d ? DIFF[d].color + '22' : 'transparent',
                              color: data.meta?.difficulty === d ? DIFF[d].color : mute }}>
                            {DIFF[d].label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: DIFF[data.meta?.difficulty]?.color || text }}>
                        {DIFF[data.meta?.difficulty]?.label || data.meta?.difficulty || '—'}
                      </span>
                    )}
                  </Row>
                  <Row label="描述" c={c}><TA editing={editing} value={data.meta?.description || ''} rows={3}
                    onChange={v => patch(d => { if (d.meta) d.meta.description = v; })} c={c} /></Row>
                  <Row label="科学说明" c={c}><TA editing={editing} value={data.meta?.science_note || ''} rows={2}
                    onChange={v => patch(d => { if (d.meta) d.meta.science_note = v; })} c={c} /></Row>
                  <Row label="标签" c={c}><TagsField tags={data.meta?.tags || []} editing={editing}
                    onChange={tags => patch(d => { if (d.meta) d.meta.tags = tags; })} c={c} /></Row>
                </Sect>

                {/* ── 游戏规则 ── */}
                <Sect title="游戏规则" c={c} isDarkMode={isDarkMode}>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <Row label="每回合行动点" c={c} inline>
                      <NV editing={editing} value={data.game?.ap_per_turn ?? 3}
                        onChange={v => patch(d => { if (!d.game) d.game = {}; d.game.ap_per_turn = v; })} c={c} />
                    </Row>
                    <Row label="最大回合数" c={c} inline>
                      <NV editing={editing} value={data.game?.max_turns ?? 10}
                        onChange={v => patch(d => { if (!d.game) d.game = {}; d.game.max_turns = v; })} c={c} />
                    </Row>
                    <Row label="手牌数" c={c} inline>
                      <NV editing={editing} value={data.game?.hand_size ?? 4}
                        onChange={v => patch(d => { if (!d.game) d.game = {}; d.game.hand_size = v; })} c={c} />
                    </Row>
                  </div>
                </Sect>

                {/* ── 游戏变量 ── */}
                <Sect title="游戏变量" c={c} isDarkMode={isDarkMode}
                  action={editing && (
                    <button onClick={() => patch(d => {
                      const key = `var_${Date.now()}`;
                      if (!d.variables) d.variables = {};
                      d.variables[key] = { label: '新变量', value: 0, max: 100, color: '#8c8c8c' };
                    })} style={{ fontSize: 10, padding: '1px 8px', borderRadius: 4, cursor: 'pointer',
                      border: `1px solid ${primary}`, background: 'transparent', color: primary }}>
                      + 添加
                    </button>
                  )}>
                  {Object.entries(data.variables || {}).map(([k, vd]: [string, any]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10,
                      padding: '6px 0', borderBottom: `1px solid ${border}`, fontSize: 11 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                        background: vd.color || '#8c8c8c', border: `1px solid ${border}` }} />
                      <span style={{ width: 120, fontFamily: 'monospace', fontSize: 10, color: mute, flexShrink: 0 }}>{k}</span>
                      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 60px 60px 80px', gap: 8, alignItems: 'center' }}>
                        <FV editing={editing} value={vd.label || ''} c={c}
                          onChange={v => patch(d => { if (d.variables?.[k]) d.variables[k].label = v; })} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: 9 }}>
                          <span style={{ color: mute }}>初始</span>
                          <NV editing={editing} value={vd.value ?? 0} c={c}
                            onChange={v => patch(d => { if (d.variables?.[k]) d.variables[k].value = v; })} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: 9 }}>
                          <span style={{ color: mute }}>最大</span>
                          <NV editing={editing} value={vd.max ?? 100} c={c}
                            onChange={v => patch(d => { if (d.variables?.[k]) d.variables[k].max = v; })} />
                        </div>
                        {editing ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="color" value={vd.color || '#8c8c8c'}
                              onChange={e => patch(d => { if (d.variables?.[k]) d.variables[k].color = e.target.value; })}
                              style={{ width: 24, height: 24, padding: 0, border: `1px solid ${border}`,
                                borderRadius: 4, cursor: 'pointer', background: 'none' }} />
                            <span style={{ fontSize: 9, color: mute, fontFamily: 'monospace' }}>{vd.color}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 9, fontFamily: 'monospace', color: mute }}>{vd.color}</span>
                        )}
                      </div>
                      {editing && (
                        <button onClick={() => patch(d => { if (d.variables) delete d.variables[k]; })}
                          style={{ background: 'none', border: 'none', cursor: 'pointer',
                            color: '#ff4d4f', fontSize: 14, padding: '0 2px', lineHeight: 1 }}>×</button>
                      )}
                    </div>
                  ))}
                </Sect>

                {/* ── 失败条件 ── */}
                <Sect title="失败条件" c={c} isDarkMode={isDarkMode}
                  action={editing && (
                    <button onClick={() => patch(d => {
                      if (!d.lose_conditions) d.lose_conditions = [];
                      d.lose_conditions.push({ condition: '', message: '' });
                    })} style={{ fontSize: 10, padding: '1px 8px', borderRadius: 4, cursor: 'pointer',
                      border: `1px solid #f5222d`, background: 'transparent', color: '#f5222d' }}>
                      + 添加
                    </button>
                  )}>
                  {(data.lose_conditions || []).map((lc: any, i: number) => (
                    <div key={i} style={{ padding: '8px 10px', borderRadius: 6, marginBottom: 6,
                      background: isDarkMode ? 'rgba(245,34,45,0.06)' : '#fff1f0',
                      border: `1px solid ${isDarkMode ? 'rgba(245,34,45,0.2)' : '#ffa39e'}` }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: mute, marginBottom: 3 }}>条件表达式</div>
                          <FV editing={editing} value={lc.condition || ''} mono c={c}
                            onChange={v => patch(d => { if (d.lose_conditions?.[i]) d.lose_conditions[i].condition = v; })} />
                          <div style={{ fontSize: 9, color: mute, margin: '6px 0 3px' }}>失败消息</div>
                          <TA editing={editing} value={lc.message || ''} rows={1} c={c}
                            onChange={v => patch(d => { if (d.lose_conditions?.[i]) d.lose_conditions[i].message = v; })} />
                        </div>
                        {editing && (
                          <button onClick={() => patch(d => { d.lose_conditions?.splice(i, 1); })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer',
                              color: '#ff4d4f', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>×</button>
                        )}
                      </div>
                    </div>
                  ))}
                </Sect>

                {/* ── 玩家卡牌 ── */}
                <Sect title="玩家卡牌" c={c} isDarkMode={isDarkMode}
                  action={editing && (
                    <button onClick={() => patch(d => {
                      if (!d.player_cards) d.player_cards = [];
                      d.player_cards.push({ id: `card_${Date.now()}`, name: '新卡牌', type: 'social',
                        cost: 1, emoji: '🃏', flavor: '', effects: [] });
                    })} style={{ fontSize: 10, padding: '1px 8px', borderRadius: 4, cursor: 'pointer',
                      border: `1px solid #fa8c16`, background: 'transparent', color: '#fa8c16' }}>
                      + 添加
                    </button>
                  )}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(data.player_cards || []).map((card: any, ci: number) => (
                      <CardRow key={ci} card={card} editing={editing}
                        onPatch={fn => patch(d => fn(d.player_cards?.[ci]))}
                        onDelete={() => patch(d => { d.player_cards?.splice(ci, 1); })}
                        variables={Object.keys(data.variables || {})}
                        c={c} isDarkMode={isDarkMode} />
                    ))}
                    {(!data.player_cards || data.player_cards.length === 0) && (
                      <span style={{ fontSize: 11, color: mute, opacity: 0.5 }}>暂无卡牌</span>
                    )}
                  </div>
                </Sect>

                {/* ── 环境卡牌 ── */}
                <Sect title="环境卡牌" c={c} isDarkMode={isDarkMode}
                  action={editing && (
                    <button onClick={() => patch(d => {
                      if (!d.environment_cards) d.environment_cards = [];
                      d.environment_cards.push({ id: `env_${Date.now()}`, name: '新环境卡',
                        emoji: '🌍', description: '', always_active: false, effects: [] });
                    })} style={{ fontSize: 10, padding: '1px 8px', borderRadius: 4, cursor: 'pointer',
                      border: `1px solid #eb2f96`, background: 'transparent', color: '#eb2f96' }}>
                      + 添加
                    </button>
                  )}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(data.environment_cards || []).map((card: any, ci: number) => (
                      <EnvCardRow key={ci} card={card} editing={editing}
                        onPatch={fn => patch(d => fn(d.environment_cards?.[ci]))}
                        onDelete={() => patch(d => { d.environment_cards?.splice(ci, 1); })}
                        variables={Object.keys(data.variables || {})}
                        c={c} isDarkMode={isDarkMode} />
                    ))}
                    {(!data.environment_cards || data.environment_cards.length === 0) && (
                      <span style={{ fontSize: 11, color: mute, opacity: 0.5 }}>暂无环境卡牌</span>
                    )}
                  </div>
                </Sect>

              </div>
            )}
          </div>
        </div>
      )}

      {/* ── New story modal ── */}
      <Modal open={newModal} title="新建故事" onCancel={() => setNewModal(false)}
        onOk={handleCreateStory} okText="创建" cancelText="取消"
        confirmLoading={newCreating} width={380}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>
            文件夹名 <span style={{ color: mute, fontWeight: 400 }}>（路径: scenarios/to_game/<b>名称</b>/game_story.yaml）</span>
          </div>
          <input value={newFolder} onChange={e => setNewFolder(e.target.value)}
            placeholder="e.g. ad1492_new_world" autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleCreateStory(); }}
            style={{ fontSize: 12, fontFamily: 'monospace', padding: '6px 10px',
              border: `1px solid ${border}`, borderRadius: 6,
              background: isDarkMode ? '#162a1b' : '#fff', color: text, outline: 'none' }} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Card row sub-components ──────────────────────────────────────────────────

const CARD_TYPE_COLORS: Record<string, string> = {
  medical: '#1677ff', social: '#52c41a', military: '#f5222d',
  economic: '#fa8c16', religious: '#722ed1',
};

function CardRow({ card, editing, onPatch, onDelete, variables, c, isDarkMode }: {
  card: any; editing: boolean;
  onPatch(fn: (c: any) => void): void;
  onDelete(): void;
  variables: string[];
  c: any; isDarkMode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { border, text, textMute: mute } = c;
  const typeColor = CARD_TYPE_COLORS[card.type] || '#8c8c8c';

  return (
    <div style={{ borderRadius: 6, border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : border}`,
      background: isDarkMode ? 'rgba(255,255,255,0.03)' : '#fafafa', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
        cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{card.emoji || '🃏'}</span>
        <span style={{ fontWeight: 600, fontSize: 12, color: text, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {card.name || card.id}
        </span>
        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
          background: typeColor + '22', color: typeColor, fontWeight: 700 }}>{card.type}</span>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
          background: isDarkMode ? 'rgba(255,255,255,0.1)' : '#f0f0f0', color: mute }}>
          ⚡{card.cost ?? 1}
        </span>
        <span style={{ fontSize: 10, color: mute }}>{open ? '▴' : '▾'}</span>
        {editing && <button onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ background:'none', border:'none', cursor:'pointer', color:'#ff4d4f', fontSize:14, padding:'0 2px', lineHeight:1 }}>×</button>}
      </div>
      {open && (
        <div style={{ padding: '8px 10px 10px', borderTop: `1px solid ${border}`, fontSize: 11 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px', gap: 8, marginBottom: 8 }}>
            <div><div style={{ fontSize: 9, color: mute, marginBottom: 2 }}>名称</div>
              <FV editing={editing} value={card.name || ''} c={c}
                onChange={v => onPatch(d => { if (d) d.name = v; })} /></div>
            <div><div style={{ fontSize: 9, color: mute, marginBottom: 2 }}>Emoji</div>
              <FV editing={editing} value={card.emoji || ''} c={c}
                onChange={v => onPatch(d => { if (d) d.emoji = v; })} /></div>
            <div><div style={{ fontSize: 9, color: mute, marginBottom: 2 }}>费用</div>
              <NV editing={editing} value={card.cost ?? 1} c={c}
                onChange={v => onPatch(d => { if (d) d.cost = v; })} /></div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: mute, marginBottom: 2 }}>类型</div>
            {editing ? (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {Object.keys(CARD_TYPE_COLORS).map(t => (
                  <button key={t} onClick={() => onPatch(d => { if (d) d.type = t; })}
                    style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                      border: `1px solid ${card.type === t ? CARD_TYPE_COLORS[t] : border}`,
                      background: card.type === t ? CARD_TYPE_COLORS[t] + '22' : 'transparent',
                      color: card.type === t ? CARD_TYPE_COLORS[t] : mute }}>{t}</button>
                ))}
              </div>
            ) : <span style={{ color: typeColor, fontSize: 11 }}>{card.type}</span>}
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: mute, marginBottom: 2 }}>描述</div>
            <FV editing={editing} value={card.flavor || ''} c={c}
              onChange={v => onPatch(d => { if (d) d.flavor = v; })} />
          </div>
          <EffectsEditor effects={card.effects || []} editing={editing} variables={variables} c={c}
            onChange={effs => onPatch(d => { if (d) d.effects = effs; })} />
        </div>
      )}
    </div>
  );
}

function EnvCardRow({ card, editing, onPatch, onDelete, variables, c, isDarkMode }: {
  card: any; editing: boolean;
  onPatch(fn: (c: any) => void): void;
  onDelete(): void;
  variables: string[];
  c: any; isDarkMode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { border, text, textMute: mute } = c;

  return (
    <div style={{ borderRadius: 6, border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : border}`,
      background: isDarkMode ? 'rgba(255,255,255,0.03)' : '#fafafa', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
        cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{card.emoji || '🌍'}</span>
        <span style={{ fontWeight: 600, fontSize: 12, color: text, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {card.name || card.id}
        </span>
        {card.always_active && (
          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
            background: '#eb2f9622', color: '#eb2f96', fontWeight: 700 }}>常驻</span>
        )}
        <span style={{ fontSize: 10, color: mute }}>{open ? '▴' : '▾'}</span>
        {editing && <button onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ background:'none', border:'none', cursor:'pointer', color:'#ff4d4f', fontSize:14, padding:'0 2px', lineHeight:1 }}>×</button>}
      </div>
      {open && (
        <div style={{ padding: '8px 10px 10px', borderTop: `1px solid ${border}`, fontSize: 11 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div><div style={{ fontSize: 9, color: mute, marginBottom: 2 }}>名称</div>
              <FV editing={editing} value={card.name || ''} c={c}
                onChange={v => onPatch(d => { if (d) d.name = v; })} /></div>
            <div><div style={{ fontSize: 9, color: mute, marginBottom: 2 }}>Emoji</div>
              <FV editing={editing} value={card.emoji || ''} c={c}
                onChange={v => onPatch(d => { if (d) d.emoji = v; })} /></div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: mute, marginBottom: 2 }}>描述</div>
            <FV editing={editing} value={card.description || ''} c={c}
              onChange={v => onPatch(d => { if (d) d.description = v; })} />
          </div>
          {card.science !== undefined && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: mute, marginBottom: 2 }}>科学说明</div>
              <FV editing={editing} value={card.science || ''} c={c}
                onChange={v => onPatch(d => { if (d) d.science = v; })} />
            </div>
          )}
          {editing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: mute }}>常驻生效</span>
              <input type="checkbox" checked={!!card.always_active}
                onChange={e => onPatch(d => { if (d) d.always_active = e.target.checked; })}
                style={{ cursor: 'pointer', accentColor: '#eb2f96' }} />
            </div>
          )}
          <EffectsEditor effects={card.effects || []} editing={editing} variables={variables} c={c}
            onChange={effs => onPatch(d => { if (d) d.effects = effs; })} />
        </div>
      )}
    </div>
  );
}

function EffectsEditor({ effects, editing, variables, onChange, c }: {
  effects: any[]; editing: boolean; variables: string[];
  onChange(effs: any[]): void; c: any;
}) {
  const { border, textMute: mute } = c;
  return (
    <div>
      <div style={{ fontSize: 9, color: mute, marginBottom: 4 }}>
        效果 <span style={{ opacity: 0.6 }}>({effects.length})</span>
      </div>
      {effects.map((ef: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 11 }}>
          {editing ? (
            <>
              <select value={ef.variable || ''} onChange={e => { const n = [...effects]; n[i] = {...n[i], variable: e.target.value}; onChange(n); }}
                style={{ fontSize: 10, border: `1px solid ${border}`, borderRadius: 4,
                  background: c.bg, color: c.text, padding: '2px 4px', outline: 'none', flex: 1 }}>
                <option value="">— 选择变量 —</option>
                {variables.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <span style={{ color: mute, flexShrink: 0 }}>Δ</span>
              <input type="number" value={ef.delta ?? 0}
                onChange={e => { const n = [...effects]; n[i] = {...n[i], delta: Number(e.target.value)}; onChange(n); }}
                style={{ width: 60, fontSize: 11, border: `1px solid ${border}`, borderRadius: 4,
                  background: c.bg, color: c.text, padding: '2px 6px', outline: 'none', flexShrink: 0 }} />
              <button onClick={() => onChange(effects.filter((_,j) => j !== i))}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#ff4d4f', fontSize:13, padding:'0 2px', lineHeight:1 }}>×</button>
            </>
          ) : (
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: mute }}>
              {ef.variable} <span style={{ color: (ef.delta ?? 0) >= 0 ? '#52c41a' : '#f5222d' }}>
                {(ef.delta ?? 0) >= 0 ? '+' : ''}{ef.delta}
              </span>
            </span>
          )}
        </div>
      ))}
      {editing && (
        <button onClick={() => onChange([...effects, { variable: variables[0] || '', delta: 0 }])}
          style={{ fontSize: 10, padding: '2px 10px', borderRadius: 4, cursor: 'pointer', marginTop: 2,
            border: `1px dashed ${border}`, background: 'transparent', color: mute }}>
          + 效果
        </button>
      )}
    </div>
  );
}
