// StoryEditor.tsx — Scenario → Game Converter + Card Builder (3-panel)

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Input, Select, Button, message, Spin, Tooltip, Segmented } from 'antd';
import {
  SearchOutlined, LoadingOutlined, FolderOutlined, FolderOpenOutlined,
  FileTextOutlined, CheckCircleOutlined, SwapRightOutlined,
  EditOutlined, SaveOutlined, CloseOutlined, RightOutlined, DownOutlined,
  ReloadOutlined, AppstoreOutlined, PlusOutlined, DeleteOutlined,
  EnvironmentOutlined, UserOutlined,
} from '@ant-design/icons';

// ─── Resize hook ──────────────────────────────────────────────────────────────
function useResize(initial: number, min = 150, max = 500) {
  const [width, setWidth] = useState(initial);
  const ref = useRef(width);
  ref.current = width;
  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = ref.current;
    const onMove = (ev: MouseEvent) =>
      setWidth(Math.max(min, Math.min(max, startW + ev.clientX - startX)));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
  return { width, startDrag };
}

const clone = (o: any) => JSON.parse(JSON.stringify(o));

// ─── Tree types ───────────────────────────────────────────────────────────────
interface TreeNode {
  key: string;        // path relative to mods/, e.g. "models/medical/dynamics/foo.yaml"
  title: string;
  type: 'folder' | 'file';
  children?: TreeNode[];
}

interface SelectedItem {
  filePath: string;   // full path relative to mods/
  matchKey: string;   // basename without extension, used to pair with to_game/
  name: string;
}

interface GameFolder { name: string; hasGameStory: boolean; }

interface CardFile {
  key: string;          // filename without extension, e.g. "env_fitness_dynamics"
  path: string;         // full path e.g. "stories/banister.../cards/env_fitness_dynamics.yaml"
  data: any;            // parsed yaml content
}

// ─── Recursive tree component ─────────────────────────────────────────────────
function TreeItem({
  node, depth, selected, expanded, onSelect, onToggle, c, gameFolders,
}: {
  node: TreeNode; depth: number; selected: string | null;
  expanded: Set<string>; onSelect: (n: TreeNode) => void;
  onToggle: (key: string) => void; c: any;
  gameFolders: GameFolder[];
}) {
  const { text, textMute: mute, primary } = c;
  const isFile    = node.type === 'file';
  const isActive  = isFile && selected === node.key;
  const isOpen    = expanded.has(node.key);
  const matchKey  = node.title.replace(/\.ya?ml$/, '');
  const isPaired  = isFile && gameFolders.some(g => g.name === matchKey);

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: `6px 10px 6px ${10 + depth * 16}px`, cursor: 'pointer',
    background: isActive ? (c.isDark ? '#2a2a2a' : '#ebebeb') : 'transparent',
    color: isActive ? primary : text,
    borderLeft: `2px solid ${isActive ? primary : 'transparent'}`,
    transition: 'background 0.1s',
    userSelect: 'none',
  };

  return (
    <>
      <div
        style={rowStyle}
        onClick={() => isFile ? onSelect(node) : onToggle(node.key)}
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = c.isDark ? '#222222' : '#f0f0f0'; }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      >
        {!isFile && (
          <span style={{ color: mute, flexShrink: 0, width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isOpen ? <DownOutlined /> : <RightOutlined />}
          </span>
        )}
        {isFile
          ? <FileTextOutlined style={{ color: isActive ? primary : mute, flexShrink: 0 }} />
          : isOpen
            ? <FolderOpenOutlined style={{ color: '#fa8c16', flexShrink: 0 }} />
            : <FolderOutlined style={{ color: '#fa8c16', flexShrink: 0 }} />
        }
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.title}
        </span>
        {isPaired && (
          <CheckCircleOutlined style={{ color: c.isDark ? '#52c41a' : '#389e0d', flexShrink: 0 }} />
        )}
      </div>
      {!isFile && isOpen && (node.children || []).map(child => (
        <TreeItem
          key={child.key} node={child} depth={depth + 1}
          selected={selected} expanded={expanded}
          onSelect={onSelect} onToggle={onToggle}
          c={c} gameFolders={gameFolders}
        />
      ))}
    </>
  );
}

interface Props { isDarkMode: boolean; c: any; }

// ─── Main component ───────────────────────────────────────────────────────────
export default function StoryEditor({ isDarkMode, c }: Props) {
  const { border, panel, bg, text, textMute: mute, primary } = c;
  const cWithDark = { ...c, isDark: isDarkMode };

  const { width: leftW, startDrag: startLeftDrag } = useResize(240, 170, 400);
  const { width: rightW, startDrag: startRightDrag } = useResize(200, 150, 340);

  // File tree (left: models/, right: to_game/)
  const [modelTree,   setModelTree]   = useState<TreeNode[]>([]);
  const [gameFolders, setGameFolders] = useState<GameFolder[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());

  // Selection
  const [selected,   setSelected]   = useState<SelectedItem | null>(null);
  const [scenSearch, setScenSearch] = useState('');

  // Loaded data
  const [scenData,      setScenData]      = useState<any>(null);
  const [gameData,      setGameData]      = useState<any>(null);
  const [gameDraft,     setGameDraft]     = useState<any>(null);
  const [mapping,       setMapping]       = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Editing
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);

  // Converter
  const [healthVar,  setHealthVar]  = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Card Builder
  const [middleMode,      setMiddleMode]      = useState<'converter' | 'cards'>('converter');
  const [cardTypeFilter,  setCardTypeFilter]  = useState<'all' | 'env' | 'player'>('all');
  const [cardSearch,      setCardSearch]      = useState('');
  const [cards,           setCards]           = useState<CardFile[]>([]);
  const [cardsLoading,    setCardsLoading]    = useState(false);
  const [expandedCard,    setExpandedCard]    = useState<string | null>(null);
  const [cardDrafts,      setCardDrafts]      = useState<Record<string, any>>({});
  const [savingCard,      setSavingCard]      = useState<string | null>(null);

  // ── Colors ─────────────────────────────────────────────────────────────────
  const panelBg  = isDarkMode ? '#1a1a1a' : '#ffffff';
  const sideHd   = isDarkMode ? '#111111' : '#f5f5f5';
  const cardBg   = isDarkMode ? '#1e1e1e' : '#fafafa';
  const codeBg   = isDarkMode ? '#141414' : '#f5f5f5';

  const gameExists = !!selected && gameFolders.some(g => g.name === selected.matchKey);

  const outputVars = useMemo(() => {
    if (!scenData?.variables) return [];
    return Object.entries(scenData.variables)
      .filter(([, v]: [string, any]) => v.type === 'output' || v.type === 'state')
      .map(([k, v]: [string, any]) => ({
        value: k,
        label: `${k}${v.description ? ' — ' + v.description : ''}`,
      }));
  }, [scenData]);

  // ── Load file lists ─────────────────────────────────────────────────────────
  const loadList = useCallback(async (silent = false) => {
    if (!silent) setLoadingList(true);
    try {
      const d = await fetch('/api/files').then(r => r.json());
      if (!d.success) return;

      const modsNode = d.data.find((n: any) => n.key === 'mods');
      if (!modsNode) return;

      // Left: full scenarios tree
      const scenNode = modsNode.children?.find((n: any) => n.title === 'scenarios');
      setModelTree(apiNodeToTree(scenNode?.children || []));

      // Right: stories/ folders (converted game packages)
      const storiesNode = modsNode.children?.find((n: any) => n.title === 'stories');
      const gameList: GameFolder[] = [];
      for (const child of storiesNode?.children || []) {
        if (child.type === 'folder') {
          const hasGS = (child.children || []).some(
            (f: any) => f.title === 'game_story.yaml' || f.title === 'game_story.yml'
          );
          gameList.push({ name: child.title, hasGameStory: hasGS });
        }
      }
      setGameFolders(gameList);
    } catch { /* ignore */ }
    if (!silent) setLoadingList(false);
  }, []);

  function apiNodeToTree(nodes: any[]): TreeNode[] {
    return nodes.map((n: any): TreeNode => ({
      key:      n.key,
      title:    n.title,
      type:     n.type === 'folder' ? 'folder' : 'file',
      children: n.children ? apiNodeToTree(n.children) : undefined,
    }));
  }

  useEffect(() => {
    loadList();
    const timer = setInterval(() => loadList(true), 5000);
    return () => clearInterval(timer);
  }, [loadList]);

  // ── Load card files for selected story ──────────────────────────────────────
  const loadCards = useCallback(async (matchKey: string) => {
    setCardsLoading(true);
    setCards([]);
    try {
      const d = await fetch('/api/files').then(r => r.json());
      if (!d.success) return;
      const modsNode = d.data.find((n: any) => n.key === 'mods');
      const storiesNode = modsNode?.children?.find((n: any) => n.title === 'stories');
      // Find the story folder (may be nested in subfolders)
      const findStoryFolder = (nodes: any[]): any => {
        for (const n of nodes) {
          if (n.type === 'folder' && n.title === matchKey) return n;
          if (n.children) { const found = findStoryFolder(n.children); if (found) return found; }
        }
        return null;
      };
      const storyFolder = findStoryFolder(storiesNode?.children || []);
      const cardsFolder = storyFolder?.children?.find((n: any) => n.title === 'cards');
      if (!cardsFolder?.children) { setCardsLoading(false); return; }

      const cardFiles: CardFile[] = [];
      for (const f of cardsFolder.children) {
        if (f.type !== 'file') continue;
        try {
          const r = await fetch(`/api/file/${f.key}`).then(x => x.json());
          if (r.success && r.data?.content) {
            cardFiles.push({ key: f.title.replace(/\.ya?ml$/, ''), path: f.key, data: r.data.content });
          }
        } catch { /* skip */ }
      }
      setCards(cardFiles);
      // Initialize drafts
      const drafts: Record<string, any> = {};
      cardFiles.forEach(c => { drafts[c.key] = clone(c.data); });
      setCardDrafts(drafts);
    } catch { /* ignore */ }
    setCardsLoading(false);
  }, []);

  const saveCard = async (cardKey: string) => {
    const card = cards.find(c => c.key === cardKey);
    if (!card) return;
    setSavingCard(cardKey);
    try {
      const r = await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: card.path, content: cardDrafts[cardKey] }),
      });
      const d = await r.json();
      if (d.success) {
        message.success(`已保存 ${cardKey}`);
        setCards(prev => prev.map(c => c.key === cardKey ? { ...c, data: clone(cardDrafts[cardKey]) } : c));
      } else {
        message.error('保存失败: ' + (d.detail || ''));
      }
    } catch (e: any) { message.error(String(e)); }
    setSavingCard(null);
  };

  // ── Select a model file ─────────────────────────────────────────────────────
  async function selectNode(node: TreeNode) {
    if (node.type !== 'file') return;
    const matchKey = node.title.replace(/\.ya?ml$/, '');
    if (selected?.filePath === node.key) return;

    setSelected({ filePath: node.key, matchKey, name: node.title });
    setScenData(null);
    setGameData(null);
    setGameDraft(null);
    setMapping(null);
    setEditing(false);
    setHealthVar(null);
    setLoadingDetail(true);

    // Load model yaml
    try {
      const r = await fetch(`/api/file/${node.key}`).then(x => x.json());
      if (r.success && r.data?.content) setScenData(r.data.content);
    } catch { /* ignore */ }

    // Load game_story.yaml from stories/ (may not exist)
    try {
      const r = await fetch(`/api/file/stories/${matchKey}/game_story.yaml`).then(x => x.json());
      if (r.success && r.data?.content) {
        setGameData(r.data.content);
        setGameDraft(clone(r.data.content));
      }
    } catch { /* ignore */ }

    // Load _mapping.json from stories/ (may not exist)
    try {
      const r = await fetch(`/api/file-raw/stories/${matchKey}/_mapping.json`).then(x => x.json());
      if (r.success && r.text) {
        const m = JSON.parse(r.text);
        setMapping(m);
        if (m.health_mapping?.source_variable) setHealthVar(m.health_mapping.source_variable);
      }
    } catch { /* ignore */ }

    setLoadingDetail(false);
  }

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // ── Load cards when switching to card builder or when selection changes ──────
  useEffect(() => {
    if (middleMode === 'cards' && selected?.matchKey) {
      loadCards(selected.matchKey);
      setExpandedCard(null);
    }
  }, [middleMode, selected?.matchKey, loadCards]);

  // ── Filter tree by search ───────────────────────────────────────────────────
  function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
    if (!q) return nodes;
    const results: TreeNode[] = [];
    for (const n of nodes) {
      if (n.type === 'file') {
        if (n.title.toLowerCase().includes(q)) results.push(n);
      } else {
        const filtered = filterTree(n.children || [], q);
        if (filtered.length > 0) results.push({ ...n, children: filtered });
      }
    }
    return results;
  }

  const visibleTree = useMemo(
    () => filterTree(modelTree, scenSearch.toLowerCase()),
    [modelTree, scenSearch]
  );

  // ── Auto-generate ───────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!selected) return;
    if (!healthVar) { message.warning('请先选择 Health 变量映射'); return; }
    setGenerating(true);
    try {
      const r = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_path: selected.filePath,
          game_name:     selected.matchKey,
          health_variable: healthVar,
        }),
      });
      const d = await r.json();
      if (d.success) {
        message.success(`已生成：${d.env_cards} 张环境牌，${d.player_cards} 张玩家牌`);
        await loadList();
        // Reload game data
        const gr = await fetch(`/api/file/stories/${selected.matchKey}/game_story.yaml`).then(x => x.json());
        if (gr.success && gr.data?.content) {
          setGameData(gr.data.content);
          setGameDraft(clone(gr.data.content));
        }
        const mr = await fetch(`/api/file-raw/stories/${selected.matchKey}/_mapping.json`).then(x => x.json());
        if (mr.success && mr.text) setMapping(JSON.parse(mr.text));
      } else {
        message.error('生成失败: ' + (d.detail || d.error || ''));
      }
    } catch (e: any) { message.error(String(e)); }
    setGenerating(false);
  }

  // ── Save game story ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!gameDraft || !selected) return;
    setSaving(true);
    try {
      const r = await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: `stories/${selected.matchKey}/game_story.yaml`,
          content: gameDraft,
        }),
      });
      const d = await r.json();
      if (d.success) {
        message.success('已保存');
        setGameData(clone(gameDraft));
        setEditing(false);
      } else message.error('保存失败: ' + (d.detail || ''));
    } catch (e: any) { message.error(String(e)); }
    setSaving(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: bg }}>

      {/* ── Left: Model file tree ────────────────────────────── */}
      <div style={{
        width: leftW, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: panelBg, borderRight: `1px solid ${border}`,
      }}>
        <div style={{
          padding: '10px 12px 8px', background: sideHd,
          borderBottom: `1px solid ${border}`, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <div style={{
              fontWeight: 700, color: mute,
              textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1,
            }}>Scenarios</div>
            <Tooltip title="刷新文件列表">
              <button
                onClick={() => loadList()}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: mute, padding: '2px 4px', borderRadius: 4,
                  display: 'flex', alignItems: 'center',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = primary; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = mute; }}
              >
                {loadingList ? <LoadingOutlined /> : <ReloadOutlined />}
              </button>
            </Tooltip>
          </div>
          <Input size="small"
            prefix={<SearchOutlined style={{ color: mute }} />}
            placeholder="搜索场景…" value={scenSearch}
            onChange={e => setScenSearch(e.target.value)}
            style={{ background: bg, borderColor: border, color: text }}
          />
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {loadingList ? (
            <div style={{ padding: 20, textAlign: 'center' }}>
              <Spin indicator={<LoadingOutlined />} />
            </div>
          ) : visibleTree.length === 0 ? (
            <div style={{ padding: 16, color: mute, textAlign: 'center' }}>
              {scenSearch ? '无匹配结果' : '暂无模型'}
            </div>
          ) : visibleTree.map(node => (
            <TreeItem
              key={node.key} node={node} depth={0}
              selected={selected?.filePath ?? null}
              expanded={scenSearch ? new Set(getAllFolderKeys(visibleTree)) : expanded}
              onSelect={selectNode} onToggle={toggleExpand}
              c={cWithDark} gameFolders={gameFolders}
            />
          ))}
        </div>
      </div>

      {/* Left drag handle */}
      <div
        onMouseDown={startLeftDrag}
        style={{ width: 4, flexShrink: 0, cursor: 'col-resize', background: 'transparent' }}
        onMouseEnter={e => { e.currentTarget.style.background = primary + '55'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      />

      {/* ── Middle: Workspace ─────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {!selected ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: mute,
          }}>
            ← 从左侧选择一个 Scenario 文件开始
          </div>
        ) : (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontWeight: 600, color: text }}>
                {selected.matchKey}
              </span>
              <span style={{ color: mute, fontSize: 12 }}>{selected.filePath}</span>
              {gameExists && (
                <span style={{
                  padding: '1px 7px', borderRadius: 10,
                  background: isDarkMode ? '#1a3a22' : '#e8f5e9',
                  color: isDarkMode ? '#52c41a' : '#389e0d',
                  border: `1px solid ${isDarkMode ? '#52c41a44' : '#b7eb8f'}`,
                  marginLeft: 'auto', flexShrink: 0,
                }}>已生成</span>
              )}
            </div>

            {/* ── Sub-control row ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 0 10px', borderBottom: `1px solid ${border}`, marginBottom: 12,
              flexWrap: 'wrap',
            }}>
              <Segmented
                size="small"
                value={middleMode}
                onChange={v => setMiddleMode(v as 'converter' | 'cards')}
                options={[
                  { label: '转换器', value: 'converter' },
                  { label: <span><AppstoreOutlined style={{ marginRight: 4 }} />卡牌构建器</span>, value: 'cards' },
                ]}
              />
              {middleMode === 'cards' && (
                <>
                  <div style={{ width: 1, height: 16, background: border, flexShrink: 0 }} />
                  <Select
                    size="small"
                    value={cardTypeFilter}
                    onChange={v => setCardTypeFilter(v)}
                    style={{ width: 90 }}
                    options={[
                      { label: '全部', value: 'all' },
                      { label: '环境牌', value: 'env' },
                      { label: '玩家牌', value: 'player' },
                    ]}
                  />
                  <Input
                    size="small"
                    placeholder="搜索卡牌…"
                    value={cardSearch}
                    onChange={e => setCardSearch(e.target.value)}
                    prefix={<SearchOutlined style={{ color: mute }} />}
                    style={{ width: 160 }}
                    allowClear
                  />
                  <Button
                    size="small" type="dashed" icon={<ReloadOutlined />}
                    onClick={() => selected?.matchKey && loadCards(selected.matchKey)}
                    style={{ marginLeft: 'auto', color: mute, borderColor: border }}
                  />
                </>
              )}
            </div>

            {middleMode === 'cards' ? (
              /* ── Card Builder ── */
              <CardBuilder
                cards={cards} loading={cardsLoading}
                typeFilter={cardTypeFilter} search={cardSearch}
                expandedCard={expandedCard} setExpandedCard={setExpandedCard}
                cardDrafts={cardDrafts} setCardDrafts={setCardDrafts}
                savingCard={savingCard} onSave={saveCard}
                isDarkMode={isDarkMode} c={c} border={border}
                panelBg={panelBg} sideHd={sideHd}
              />
            ) : (

            /* ── Converter (original) ── */

            loadingDetail ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <Spin indicator={<LoadingOutlined />} />
              </div>
            ) : (
              <>
                {/* Dual card row */}
                <div style={{ display: 'flex', gap: 12, minHeight: 280 }}>

                  {/* Left card: Model summary (readonly) */}
                  <div style={{
                    flex: 1, borderRadius: 8, border: `1px solid ${border}`,
                    background: cardBg, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  }}>
                    <CardHeader
                      icon={<FileTextOutlined style={{ color: mute }} />}
                      title="Scenario 摘要" badge="只读"
                      bg={sideHd} border={border} text={text} mute={mute}
                    />
                    <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
                      {scenData
                        ? <ScenarioSummary data={scenData} c={c} codeBg={codeBg} border={border} />
                        : <span style={{ color: mute }}>加载失败或无内容</span>
                      }
                    </div>
                  </div>

                  {/* Right card: Game story */}
                  <div style={{
                    flex: 1, borderRadius: 8, border: `1px solid ${border}`,
                    background: cardBg, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '10px 14px', borderBottom: `1px solid ${border}`,
                      background: sideHd, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                    }}>
                      <SwapRightOutlined style={{ color: primary }} />
                      <span style={{ fontWeight: 600, color: text }}>Game Story</span>
                      {gameData && !editing && (
                        <button onClick={() => setEditing(true)} style={{
                          marginLeft: 'auto', background: 'none', border: 'none',
                          cursor: 'pointer', color: mute,
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                          <EditOutlined style={{  }} /> 编辑
                        </button>
                      )}
                      {editing && (
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => { setGameDraft(clone(gameData)); setEditing(false); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: mute }}
                          >
                            <CloseOutlined /> 取消
                          </button>
                          <button onClick={handleSave} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: primary, fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}>
                            <SaveOutlined /> {saving ? '保存中…' : '保存'}
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
                      {gameData ? (
                        <GameStorySummary
                          data={editing ? gameDraft : gameData}
                          editing={editing}
                          onChange={fn => setGameDraft((p: any) => { const d = clone(p); fn(d); return d; })}
                          c={c} codeBg={codeBg} border={border} isDarkMode={isDarkMode}
                        />
                      ) : (
                        <EmptyState mute={mute} />
                      )}
                    </div>
                  </div>
                </div>

                {/* Mapping + controls */}
                <div style={{
                  borderRadius: 8, border: `1px solid ${border}`,
                  background: cardBg, overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '10px 14px', borderBottom: `1px solid ${border}`,
                    background: sideHd, fontWeight: 600, color: text,
                  }}>
                    字段映射
                  </div>
                  <div style={{ padding: '14px' }}>
                    <FixedMappings c={c} />

                    {/* Health mapping (required) */}
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: mute, flexShrink: 0, width: 200 }}>
                        health ← 模型变量 <span style={{ color: '#f5222d' }}>*</span>
                      </span>
                      <Select
                        size="small" placeholder="选择对应 health 的变量"
                        style={{ flex: 1 }} value={healthVar}
                        onChange={v => setHealthVar(v)} options={outputVars}
                      />
                    </div>

                    {/* Variable rows */}
                    {scenData?.variables && (
                      <VariableMappingRows
                        variables={scenData.variables}
                        healthVar={healthVar}
                        mapping={mapping}
                        c={c} border={border}
                      />
                    )}

                    {/* Actions */}
                    <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <Button
                        size="small" type="primary"
                        icon={<SwapRightOutlined />}
                        loading={generating}
                        disabled={!scenData || !healthVar}
                        onClick={handleGenerate}
                        style={{ background: primary, borderColor: primary }}
                      >
                        → 自动生成
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )
            )}
          </div>
        )}
      </div>

      {/* Right drag handle */}
      <div
        onMouseDown={startRightDrag}
        style={{ width: 4, flexShrink: 0, cursor: 'col-resize', background: 'transparent' }}
        onMouseEnter={e => { e.currentTarget.style.background = primary + '55'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      />

      {/* ── Right: Game folders ───────────────────────────────── */}
      <div style={{
        width: rightW, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: panelBg, borderLeft: `1px solid ${border}`,
      }}>
        <div style={{
          padding: '10px 12px 8px', background: sideHd,
          borderBottom: `1px solid ${border}`, flexShrink: 0,
        }}>
          <div style={{
            fontWeight: 700, color: mute,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>Stories</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {gameFolders.length === 0 ? (
            <div style={{ padding: 16, color: mute, textAlign: 'center' }}>
              暂无 Game 文件夹
            </div>
          ) : gameFolders.map(g => {
            const isPaired = g.name === selected?.matchKey;
            return (
              <div key={g.name} style={{
                padding: '7px 14px',
                background: isPaired ? (isDarkMode ? '#2a2a2a' : '#ebebeb') : 'transparent',
                color: isPaired ? primary : text,
                borderLeft: `2px solid ${isPaired ? primary : 'transparent'}`,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <FolderOutlined style={{ color: isPaired ? primary : mute, flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.name}
                </span>
                {g.hasGameStory && (
                  <FileTextOutlined style={{ color: mute, flexShrink: 0 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Helper: collect all folder keys (for search expand-all) ──────────────────
function getAllFolderKeys(nodes: TreeNode[]): string[] {
  const keys: string[] = [];
  for (const n of nodes) {
    if (n.type === 'folder') {
      keys.push(n.key);
      keys.push(...getAllFolderKeys(n.children || []));
    }
  }
  return keys;
}

// ─── CardHeader ───────────────────────────────────────────────────────────────
function CardHeader({ icon, title, badge, bg, border, text, mute }: {
  icon: React.ReactNode; title: string; badge?: string;
  bg: string; border: string; text: string; mute: string;
}) {
  return (
    <div style={{
      padding: '10px 14px', borderBottom: `1px solid ${border}`,
      background: bg, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
    }}>
      {icon}
      <span style={{ fontWeight: 600, color: text }}>{title}</span>
      {badge && <span style={{ color: mute, marginLeft: 'auto' }}>{badge}</span>}
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
function EmptyState({ mute }: { mute: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 8, minHeight: 160,
    }}>
      <span style={{ fontSize: 28, opacity: 0.25 }}>📋</span>
      <span style={{ color: mute }}>待生成</span>
      <span style={{ color: mute }}>配置映射后点击「→ 自动生成」</span>
    </div>
  );
}

// ─── ScenarioSummary ──────────────────────────────────────────────────────────
function ScenarioSummary({ data, c, codeBg, border }: {
  data: any; c: any; codeBg: string; border: string;
}) {
  const { text, textMute: mute, primary } = c;
  const meta     = data.metadata || {};
  const vars     = data.variables || {};
  const formulas = data.formulas || {};
  const varCount = Object.keys(vars).length;
  const fmlCount = Object.keys(formulas).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontWeight: 600, color: text, marginBottom: 3 }}>{meta.name || '—'}</div>
        {meta.description && (
          <div style={{ color: mute, lineHeight: 1.55 }}>{meta.description}</div>
        )}
        {meta.tags?.length > 0 && (
          <div style={{ marginTop: 5, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {meta.tags.map((t: string, i: number) => (
              <span key={i} style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 8,
                background: codeBg, border: `1px solid ${border}`, color: mute,
              }}>{String(t)}</span>
            ))}
          </div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${border}`, paddingTop: 8 }}>
        <SectionLabel label={`变量 (${varCount})`} mute={mute} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {Object.entries(vars).slice(0, 10).map(([k, v]: [string, any]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                fontFamily: 'monospace', color: primary,
                background: codeBg, padding: '1px 5px', borderRadius: 3,
                border: `1px solid ${border}`, flexShrink: 0,
              }}>{k}</span>
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 8,
                background: codeBg, color: mute, flexShrink: 0,
              }}>{v.type || '?'}</span>
              <span style={{
                color: mute, flex: 1, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {v.description || v.unit || ''}
              </span>
            </div>
          ))}
          {varCount > 10 && <div style={{ color: mute }}>…还有 {varCount - 10} 个</div>}
        </div>
      </div>

      {fmlCount > 0 && (
        <div style={{ borderTop: `1px solid ${border}`, paddingTop: 8 }}>
          <SectionLabel label={`公式 (${fmlCount})`} mute={mute} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(formulas).slice(0, 5).map(([k, v]: [string, any]) => (
              <div key={k} style={{
                background: codeBg, border: `1px solid ${border}`,
                borderRadius: 4, padding: '4px 8px',
              }}>
                <div style={{ fontWeight: 600, color: text, marginBottom: 2 }}>{k}</div>
                {Object.entries(v.dynamics || {}).slice(0, 3).map(([vk, expr]: [string, any]) => (
                  <div key={vk} style={{ fontFamily: 'monospace', color: mute }}>
                    {vk}: {String(expr)}
                  </div>
                ))}
              </div>
            ))}
            {fmlCount > 5 && <div style={{ color: mute }}>…还有 {fmlCount - 5} 个</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GameStorySummary ─────────────────────────────────────────────────────────
function GameStorySummary({ data, editing, onChange, c, codeBg, border, isDarkMode }: {
  data: any; editing: boolean; onChange: (fn: (d: any) => void) => void;
  c: any; codeBg: string; border: string; isDarkMode: boolean;
}) {
  const { text, textMute: mute, primary } = c;
  if (!data) return null;
  const meta       = data.meta || {};
  const hm         = data.health_mapping || {};
  const turns      = data.turns || {};
  const envDeck    = data.env_deck || [];
  const playerDeck = data.player_deck || [];

  const inputSt: React.CSSProperties = {
    padding: '2px 6px', border: `1px solid ${border}`, borderRadius: 4,
    background: isDarkMode ? '#222222' : '#ffffff', color: text, outline: 'none', width: '100%',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <SectionLabel label="元信息" mute={mute} />
        <LabelRow label="名称" mute={mute}>
          {editing
            ? <input value={meta.name || ''} style={inputSt}
                onChange={e => onChange(d => { if (!d.meta) d.meta = {}; d.meta.name = e.target.value; })} />
            : <span style={{ color: text }}>{meta.name || '—'}</span>
          }
        </LabelRow>
        <LabelRow label="难度" mute={mute}>
          <span style={{ color: text }}>{meta.difficulty || '—'}</span>
        </LabelRow>
      </div>

      <div style={{ borderTop: `1px solid ${border}`, paddingTop: 8 }}>
        <SectionLabel label="Health 映射" mute={mute} />
        <LabelRow label="来源变量" mute={mute}>
          <span style={{ fontFamily: 'monospace', color: primary }}>{hm.source_variable || '—'}</span>
        </LabelRow>
        <LabelRow label="缩放" mute={mute}>
          <span style={{ color: mute, fontFamily: 'monospace' }}>
            {hm.scale ? `[${hm.scale.join(', ')}]` : '—'}
          </span>
        </LabelRow>
      </div>

      <div style={{ borderTop: `1px solid ${border}`, paddingTop: 8 }}>
        <SectionLabel label="回合配置" mute={mute} />
        <LabelRow label="总回合" mute={mute}>
          {editing
            ? <input type="number" value={turns.total ?? ''} style={{ ...inputSt, width: 70 }}
                onChange={e => onChange(d => { if (!d.turns) d.turns = {}; d.turns.total = Number(e.target.value); })} />
            : <span style={{ color: text }}>{turns.total ?? '—'}</span>
          }
        </LabelRow>
        <LabelRow label="手牌数" mute={mute}>
          <span style={{ color: text }}>{turns.player_hand_size ?? '—'}</span>
        </LabelRow>
      </div>

      <div style={{ borderTop: `1px solid ${border}`, paddingTop: 8 }}>
        <SectionLabel label="卡组" mute={mute} />
        <LabelRow label="环境牌" mute={mute}>
          <span style={{ color: text }}>{envDeck.length} 张</span>
        </LabelRow>
        <LabelRow label="玩家牌" mute={mute}>
          <span style={{ color: text }}>{playerDeck.length} 张</span>
        </LabelRow>
      </div>
    </div>
  );
}

function LabelRow({ label, mute, children }: { label: string; mute: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
      <span style={{ color: mute, width: 56, flexShrink: 0, paddingTop: 2 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function SectionLabel({ label, mute }: { label: string; mute: string }) {
  return (
    <div style={{
      fontWeight: 700, color: mute,
      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
    }}>{label}</div>
  );
}

// ─── FixedMappings ────────────────────────────────────────────────────────────
function FixedMappings({ c }: { c: any }) {
  const { text, textMute: mute } = c;
  const rows = [
    { from: 'metadata.name',        to: 'meta.name' },
    { from: 'metadata.description', to: 'meta.description' },
    { from: 'metadata.tags',        to: 'meta.tags' },
    { from: 'simulator.total_time', to: 'turns.total (换算)' },
  ];
  return (
    <div>
      <SectionLabel label="固定映射（自动）" mute={mute} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.map(r => (
          <div key={r.from} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'monospace', color: text, flex: 1 }}>{r.from}</span>
            <span style={{ color: mute }}>→</span>
            <span style={{ fontFamily: 'monospace', color: text, flex: 1 }}>{r.to}</span>
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 8,
              background: 'rgba(82,196,26,0.1)', color: '#52c41a', flexShrink: 0,
            }}>自动</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── VariableMappingRows ──────────────────────────────────────────────────────
function VariableMappingRows({ variables, healthVar, mapping, c, border }: {
  variables: Record<string, any>; healthVar: string | null;
  mapping: any; c: any; border: string;
}) {
  const { text, textMute: mute, primary } = c;
  const varToCard = mapping?.variable_to_card || {};
  const entries   = Object.entries(variables);
  if (entries.length === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <SectionLabel label="变量映射" mute={mute} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {entries.map(([k, v]) => {
          const isHealth = k === healthVar;
          const cardPath = varToCard[k];
          return (
            <div key={k} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              opacity: isHealth ? 0.5 : 1,
            }}>
              <span style={{
                fontFamily: 'monospace', color: primary,
                width: 160, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>{k}</span>
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 8,
                border: `1px solid ${border}`, color: mute, flexShrink: 0,
              }}>{v.type || '?'}</span>
              <span style={{ color: mute }}>→</span>
              <span style={{
                flex: 1, color: mute,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {isHealth ? '→ health（已选）' : cardPath || '待生成卡牌'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CardBuilder ──────────────────────────────────────────────────────────────
function CardBuilder({
  cards, loading, typeFilter, search,
  expandedCard, setExpandedCard,
  cardDrafts, setCardDrafts,
  savingCard, onSave,
  isDarkMode, c, border, panelBg, sideHd,
}: {
  cards: CardFile[];
  loading: boolean;
  typeFilter: 'all' | 'env' | 'player';
  search: string;
  expandedCard: string | null;
  setExpandedCard: (k: string | null) => void;
  cardDrafts: Record<string, any>;
  setCardDrafts: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  savingCard: string | null;
  onSave: (k: string) => void;
  isDarkMode: boolean; c: any; border: string; panelBg: string; sideHd: string;
}) {
  const { text, textMute: mute, primary } = c;
  const inputSt: React.CSSProperties = {
    padding: '3px 8px', border: `1px solid ${border}`, borderRadius: 4,
    background: isDarkMode ? '#222222' : '#ffffff', color: text,
    outline: 'none', width: '100%', boxSizing: 'border-box',
  };
  const textAreaSt: React.CSSProperties = { ...inputSt, resize: 'vertical', minHeight: 56, fontFamily: 'inherit' };

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <Spin indicator={<LoadingOutlined />} />
      <div style={{ color: mute, marginTop: 8 }}>加载卡牌…</div>
    </div>
  );

  if (cards.length === 0) return (
    <div style={{ padding: 40, textAlign: 'center', color: mute }}>
      <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>🃏</div>
      <div>暂无卡牌。请先在转换器中「→ 自动生成」。</div>
    </div>
  );

  // Filter
  const visible = cards.filter(card => {
    const type = card.data?.type;
    if (typeFilter === 'env' && type !== 'env') return false;
    if (typeFilter === 'player' && type !== 'player') return false;
    const name = (card.data?.display?.name || card.key).toLowerCase();
    if (search && !name.includes(search.toLowerCase()) && !card.key.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const updateDraft = (key: string, fn: (d: any) => void) => {
    setCardDrafts(prev => {
      const next = { ...prev };
      const d = JSON.parse(JSON.stringify(prev[key] || {}));
      fn(d);
      next[key] = d;
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Summary bar */}
      <div style={{ color: mute, fontSize: 12, marginBottom: 2 }}>
        {visible.length} 张卡牌
        {cards.filter(c => c.data?.type === 'env').length > 0 && (
          <span style={{ marginLeft: 8 }}>
            <EnvironmentOutlined style={{ marginRight: 3 }} />
            环境牌 {cards.filter(c => c.data?.type === 'env').length}
          </span>
        )}
        {cards.filter(c => c.data?.type === 'player').length > 0 && (
          <span style={{ marginLeft: 8 }}>
            <UserOutlined style={{ marginRight: 3 }} />
            玩家牌 {cards.filter(c => c.data?.type === 'player').length}
          </span>
        )}
      </div>

      {/* Card rows */}
      {visible.map(card => {
        const draft = cardDrafts[card.key] || card.data;
        const isEnv = card.data?.type === 'env';
        const isExpanded = expandedCard === card.key;
        const isDirty = JSON.stringify(draft) !== JSON.stringify(card.data);

        return (
          <div key={card.key} style={{
            border: `1px solid ${isExpanded ? primary : border}`,
            borderRadius: 6, background: panelBg, overflow: 'hidden',
            transition: 'border-color 0.15s',
          }}>
            {/* Row header */}
            <div
              onClick={() => setExpandedCard(isExpanded ? null : card.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', cursor: 'pointer',
                background: isExpanded ? (isDarkMode ? '#1e2e1e' : '#f0faf0') : 'transparent',
                userSelect: 'none',
              }}
            >
              {/* Icon */}
              <span style={{ fontSize: 18, flexShrink: 0 }}>{draft?.display?.icon || '🃏'}</span>

              {/* Name */}
              <span style={{ fontWeight: 600, color: text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {draft?.display?.name || card.key}
              </span>

              {/* Type badge */}
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 8, flexShrink: 0,
                background: isEnv ? (isDarkMode ? '#1a2a3a' : '#e6f4ff') : (isDarkMode ? '#1a3a22' : '#f6ffed'),
                color: isEnv ? (isDarkMode ? '#69b1ff' : '#1677ff') : (isDarkMode ? '#95de64' : '#52c41a'),
                border: `1px solid ${isEnv ? (isDarkMode ? '#1677ff44' : '#91caff') : (isDarkMode ? '#52c41a44' : '#b7eb8f')}`,
              }}>
                {isEnv ? '环境' : '玩家'}
              </span>

              {/* Cost (player only) */}
              {!isEnv && draft?.cost != null && (
                <span style={{ color: mute, fontSize: 12, flexShrink: 0 }}>费用 {draft.cost}</span>
              )}

              {/* Effects summary */}
              <span style={{ color: mute, fontSize: 11, flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(draft?.effects || []).map((ef: any) => `${ef.target}${ef.delta >= 0 ? '+' : ''}${ef.delta}`).join(', ')}
              </span>

              {/* Dirty dot */}
              {isDirty && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#faad14', flexShrink: 0 }} />}

              {/* Expand arrow */}
              <span style={{
                color: mute, fontSize: 9, flexShrink: 0,
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s',
              }}>▶</span>
            </div>

            {/* Expanded editor */}
            {isExpanded && (
              <div style={{ padding: '12px 14px', borderTop: `1px solid ${border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Row: Icon + Name */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ color: mute, fontSize: 11, marginBottom: 3 }}>图标</div>
                    <input value={draft?.display?.icon || ''} style={{ ...inputSt, width: 52, textAlign: 'center', fontSize: 18 }}
                      onChange={e => updateDraft(card.key, d => { if (!d.display) d.display = {}; d.display.icon = e.target.value; })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: mute, fontSize: 11, marginBottom: 3 }}>卡牌名称</div>
                    <input value={draft?.display?.name || ''} style={inputSt}
                      onChange={e => updateDraft(card.key, d => { if (!d.display) d.display = {}; d.display.name = e.target.value; })} />
                  </div>
                  {!isEnv && (
                    <div style={{ flexShrink: 0 }}>
                      <div style={{ color: mute, fontSize: 11, marginBottom: 3 }}>费用</div>
                      <input type="number" value={draft?.cost ?? ''} style={{ ...inputSt, width: 60 }}
                        onChange={e => updateDraft(card.key, d => { d.cost = Number(e.target.value); })} />
                    </div>
                  )}
                </div>

                {/* Description */}
                <div>
                  <div style={{ color: mute, fontSize: 11, marginBottom: 3 }}>描述</div>
                  <textarea value={draft?.display?.description || ''} style={textAreaSt}
                    onChange={e => updateDraft(card.key, d => { if (!d.display) d.display = {}; d.display.description = e.target.value; })} />
                </div>

                {/* Flavor */}
                <div>
                  <div style={{ color: mute, fontSize: 11, marginBottom: 3 }}>Flavor 文本</div>
                  <textarea value={draft?.display?.flavor || ''} style={{ ...textAreaSt, minHeight: 40 }}
                    onChange={e => updateDraft(card.key, d => { if (!d.display) d.display = {}; d.display.flavor = e.target.value; })} />
                </div>

                {/* Effects */}
                <div>
                  <div style={{ color: mute, fontSize: 11, marginBottom: 6 }}>效果</div>
                  {(draft?.effects || []).map((ef: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                      <input value={ef.target || ''} style={{ ...inputSt, width: 130 }}
                        placeholder="目标变量"
                        onChange={e => updateDraft(card.key, d => { if (!d.effects) d.effects = []; d.effects[i] = { ...d.effects[i], target: e.target.value }; })} />
                      <input type="number" value={ef.delta ?? ''} style={{ ...inputSt, width: 72 }}
                        placeholder="delta"
                        onChange={e => updateDraft(card.key, d => { if (!d.effects) d.effects = []; d.effects[i] = { ...d.effects[i], delta: Number(e.target.value) }; })} />
                      <input value={ef.condition || ''} style={{ ...inputSt, flex: 1 }}
                        placeholder="条件（可留空）"
                        onChange={e => updateDraft(card.key, d => { if (!d.effects) d.effects = []; d.effects[i] = { ...d.effects[i], condition: e.target.value || null }; })} />
                      <button
                        onClick={() => updateDraft(card.key, d => { d.effects = (d.effects || []).filter((_: any, j: number) => j !== i); })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4d4f', padding: '0 4px' }}
                      >
                        <DeleteOutlined />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => updateDraft(card.key, d => { if (!d.effects) d.effects = []; d.effects.push({ target: '', delta: 0, condition: null }); })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'none', border: `1px dashed ${border}`, borderRadius: 4,
                      color: mute, cursor: 'pointer', padding: '3px 10px', width: '100%', justifyContent: 'center',
                    }}
                  >
                    <PlusOutlined /> 添加效果
                  </button>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
                  <Button size="small"
                    onClick={() => setCardDrafts(prev => ({ ...prev, [card.key]: clone(card.data) }))}
                    disabled={!isDirty}
                    style={{ color: mute, borderColor: border }}
                  >
                    还原
                  </Button>
                  <Button size="small" type="primary"
                    loading={savingCard === card.key}
                    disabled={!isDirty}
                    onClick={() => onSave(card.key)}
                    icon={<SaveOutlined />}
                    style={{ background: primary, borderColor: primary }}
                  >
                    保存
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
