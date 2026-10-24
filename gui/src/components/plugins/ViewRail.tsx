// gui/src/components/plugins/ViewRail.tsx
// A vertical strip between the model tree and the main area. Every view of the main area is a button on it:
// Overview, Simulation, Optimization, the model editor and each bundle plugin. The buttons can be dragged into
// any order, and a right-click on the strip lists them with a tick each to show or hide them. Both choices are
// kept in the browser. While the model library is being edited the other views are locked and the editor's
// button has a cross that closes it. A plugin button covers the whole main area while it is open.

import React, { useMemo, useState } from 'react';
import { Checkbox, Dropdown, Tooltip } from 'antd';
import {
  AppstoreOutlined, ApartmentOutlined, BarChartOutlined, CloseOutlined, ClusterOutlined,
  FileTextOutlined, LeftOutlined, PictureOutlined, RightOutlined, TableOutlined, UserOutlined,
} from '@ant-design/icons';
import type { getC } from '../../core/theme';
import type { BundlePlugin } from './usePlugins';

export type BuiltinView = string;

// The tips open to the right, over the toolbar of the main area. If the pointer could enter a tip it would stay open
// and take the click meant for the button below it, so the tips let the pointer through.
const NO_POINTER = { root: { pointerEvents: 'none' as const } };

// The order the user dragged the buttons into and the ones they switched off, kept in the browser.
// A button that is in neither list, such as a newly installed plugin, follows in its default order and is shown.
const ORDER_KEY = 'lm_rail_order';
const HIDDEN_KEY = 'lm_rail_hidden';

function readIds(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw.filter((x: unknown) => typeof x === 'string') : [];
  } catch { return []; }
}

function writeIds(key: string, ids: string[]) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* the choice is just not remembered */ }
}

// Icons a plugin manifest may name in ui.icon. An unknown name falls back to AppstoreOutlined.
const PLUGIN_ICONS: Record<string, React.ReactNode> = {
  ApartmentOutlined: <ApartmentOutlined />,
  AppstoreOutlined: <AppstoreOutlined />,
  BarChartOutlined: <BarChartOutlined />,
  ClusterOutlined: <ClusterOutlined />,
  FileTextOutlined: <FileTextOutlined />,
  PictureOutlined: <PictureOutlined />,
  TableOutlined: <TableOutlined />,
  UserOutlined: <UserOutlined />,
};

interface Props {
  // the views that ship with the engine, in default order: Overview, Simulation, Optimization, the model editor
  builtins: { key: BuiltinView; label: string; icon: React.ReactNode }[];
  plugins: BundlePlugin[];
  // the highlighted button: a view id or a plugin id
  activeId: string;
  onSelectBuiltin: (key: BuiltinView) => void;
  onSelectPlugin: (id: string) => void;
  // model library editing: while it is open the other views are locked and its button has a close cross
  builderOpen: boolean;
  builderCloseLabel: string;
  builderLockedTip: string;
  onCloseBuilder: () => void;
  // the model tree's collapse toggle
  treeCollapsed: boolean;
  onToggleTree: () => void;
  treeToggleLabel: string;
  // the right-click menu
  menuTitle: string;
  menuResetLabel: string;
  c: ReturnType<typeof getC>;
}

interface Item { id: string; label: string; icon: React.ReactNode; builtin: boolean }

const ViewRail: React.FC<Props> = ({
  builtins, plugins, activeId, onSelectBuiltin, onSelectPlugin,
  builderOpen, builderCloseLabel, builderLockedTip, onCloseBuilder,
  treeCollapsed, onToggleTree, treeToggleLabel, menuTitle, menuResetLabel, c,
}) => {
  const [savedOrder, setSavedOrder] = useState<string[]>(() => readIds(ORDER_KEY));
  const [hidden, setHidden] = useState<string[]>(() => readIds(HIDDEN_KEY));
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropBefore, setDropBefore] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // every button there could be, in the order the user chose
  const all = useMemo<Item[]>(() => {
    const defaults: Item[] = [
      ...builtins.map(b => ({ id: b.key, label: b.label, icon: b.icon, builtin: true })),
      ...plugins.map(p => ({
        id: p.id, label: p.title, icon: (p.icon && PLUGIN_ICONS[p.icon]) || <AppstoreOutlined />, builtin: false,
      })),
    ];
    const byId = new Map(defaults.map(i => [i.id, i]));
    const first = savedOrder.filter(id => byId.has(id)).map(id => byId.get(id)!);
    const rest = defaults.filter(i => !savedOrder.includes(i.id));
    return [...first, ...rest];
  }, [builtins, plugins, savedOrder]);

  // the editor stays on the rail while it is open, so it can always be closed
  const shown = all.filter(i => !hidden.includes(i.id) || (i.id === 'builder' && builderOpen));

  const moveBefore = (id: string, beforeId: string) => {
    if (id === beforeId) return;
    const ids = all.map(i => i.id).filter(x => x !== id);
    const at = ids.indexOf(beforeId);
    ids.splice(at < 0 ? ids.length : at, 0, id);
    setSavedOrder(ids);
    writeIds(ORDER_KEY, ids);
  };

  const toggleHidden = (id: string) => {
    const next = hidden.includes(id) ? hidden.filter(x => x !== id) : [...hidden, id];
    setHidden(next);
    writeIds(HIDDEN_KEY, next);
  };

  const resetLayout = () => {
    setSavedOrder([]); setHidden([]);
    writeIds(ORDER_KEY, []); writeIds(HIDDEN_KEY, []);
  };

  const button = (opts: {
    key: string; label: string; icon: React.ReactNode; active: boolean;
    onClick?: () => void; locked?: boolean; tip?: string; testId?: string;
  }) => {
    const { key, label, icon, active, onClick, locked, tip, testId } = opts;
    const color = locked ? c.textMute : (active ? c.primary : c.textSec);
    return (
      <Tooltip key={key} title={tip ?? label} placement="right" styles={NO_POINTER}>
        <button
          onClick={() => { if (!locked && onClick) onClick(); }}
          aria-label={label}
          aria-pressed={active}
          aria-disabled={locked || undefined}
          data-testid={testId ?? `view-rail-${key}`}
          style={{
            width: '100%', padding: '7px 2px 6px', border: 'none', outline: 'none',
            cursor: locked ? 'not-allowed' : (onClick ? 'pointer' : 'default'),
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            color, opacity: locked ? 0.6 : 1,
            background: active ? c.activeBg : 'transparent',
            borderLeft: `2px solid ${active ? c.primary : 'transparent'}`,
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 0, display: 'flex' }}>{icon}</span>
          <span style={{
            fontSize: 11, lineHeight: 1.15, maxWidth: '100%', padding: '0 2px', boxSizing: 'border-box',
            overflow: 'hidden', textAlign: 'center', overflowWrap: 'anywhere',
            display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
            fontWeight: active ? 600 : 400,
          }}>{label}</span>
        </button>
      </Tooltip>
    );
  };

  const menuItems = [
    {
      key: '__title', label: menuTitle, type: 'group' as const,
      children: all.map(i => ({
        key: i.id,
        label: (
          <span data-testid={`rail-menu-${i.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Checkbox checked={!hidden.includes(i.id)} />
            <span style={{ display: 'flex', fontSize: 15 }}>{i.icon}</span>
            <span>{i.label}</span>
          </span>
        ),
      })),
    },
    { type: 'divider' as const },
    { key: '__reset', label: <span data-testid="rail-menu-reset">{menuResetLabel}</span> },
  ];

  return (
    <Dropdown
      trigger={['contextMenu']}
      open={menuOpen}
      onOpenChange={(open, info) => { if (!open && info?.source === 'menu') return; setMenuOpen(open); }}
      menu={{
        items: menuItems,
        selectable: false,
        onClick: ({ key }) => { if (key === '__reset') resetLayout(); else if (key !== '__title') toggleHidden(key); },
      }}
    >
      <div
        data-testid="view-rail"
        style={{
          width: 84, flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto',
          background: c.panel, borderLeft: `1px solid ${c.border}`, borderRight: `1px solid ${c.border}`,
        }}
      >
        <Tooltip title={treeToggleLabel} placement="right" styles={NO_POINTER}>
          <button
            onClick={onToggleTree}
            aria-label={treeToggleLabel}
            data-testid="view-rail-tree-toggle"
            style={{ width: '100%', height: 24, padding: 0, border: 'none', outline: 'none', cursor: 'pointer', background: 'transparent', color: c.textMute, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {treeCollapsed ? <RightOutlined style={{ fontSize: 11 }} /> : <LeftOutlined style={{ fontSize: 11 }} />}
          </button>
        </Tooltip>

        {shown.map(i => {
          const isBuilder = i.id === 'builder';
          const locked = builderOpen && !isBuilder;
          return (
            <div
              key={i.id}
              draggable
              data-testid={`rail-slot-${i.id}`}
              onDragStart={e => { setDragId(i.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', i.id); }}
              onDragOver={e => { if (dragId && dragId !== i.id) { e.preventDefault(); setDropBefore(i.id); } }}
              onDrop={e => { e.preventDefault(); if (dragId) moveBefore(dragId, i.id); setDragId(null); setDropBefore(null); }}
              onDragEnd={() => { setDragId(null); setDropBefore(null); }}
              style={{
                position: 'relative',
                opacity: dragId === i.id ? 0.4 : 1,
                borderTop: `2px solid ${dropBefore === i.id && dragId ? c.primary : 'transparent'}`,
              }}
            >
              {button({
                key: i.id, label: i.label, icon: i.icon,
                active: activeId === i.id,
                onClick: () => (i.builtin ? onSelectBuiltin(i.id) : onSelectPlugin(i.id)),
                locked, tip: locked ? builderLockedTip : i.label,
                testId: i.builtin ? (isBuilder ? 'view-rail-builder' : `center-tab-${i.id}`) : `plugin-rail-${i.id}`,
              })}
              {isBuilder && builderOpen && (
                <Tooltip title={builderCloseLabel} placement="right" styles={NO_POINTER}>
                  <button
                    onClick={onCloseBuilder}
                    aria-label={builderCloseLabel}
                    data-testid="view-rail-builder-close"
                    style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, padding: 0, border: 'none', outline: 'none', cursor: 'pointer', borderRadius: 4, background: 'transparent', color: c.textMute, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <CloseOutlined style={{ fontSize: 10 }} />
                  </button>
                </Tooltip>
              )}
            </div>
          );
        })}
        {/* Dropping below the last button moves the dragged one to the end; the empty rest of the rail is also where a right-click lands. */}
        <div
          data-testid="plugin-rail-end"
          onDragOver={e => { if (dragId) { e.preventDefault(); setDropBefore('__end__'); } }}
          onDrop={e => { e.preventDefault(); if (dragId) moveBefore(dragId, '__end__'); setDragId(null); setDropBefore(null); }}
          style={{ flex: 1, minHeight: 24, borderTop: `2px solid ${dropBefore === '__end__' && dragId ? c.primary : 'transparent'}` }}
        />
      </div>
    </Dropdown>
  );
};

export default ViewRail;
