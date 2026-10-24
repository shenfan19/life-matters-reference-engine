// gui/src/components/plugins/ViewRail.tsx
// A vertical strip between the model tree and the main area. It holds every view of the
// main area as a button: Overview, Simulation and Optimization on top, then a line, then
// one button for each bundle plugin. While the model library is being edited a fourth
// built-in button appears above the line. A plugin button covers the whole main area
// while it is open.

import React, { useMemo, useState } from 'react';
import { Tooltip } from 'antd';
import {
  AppstoreOutlined, ApartmentOutlined, BarChartOutlined, BuildOutlined, CloseOutlined, ClusterOutlined,
  FileTextOutlined, LeftOutlined, PictureOutlined, RightOutlined, TableOutlined, UserOutlined,
} from '@ant-design/icons';
import type { getC } from '../../core/theme';
import type { BundlePlugin } from './usePlugins';

export type BuiltinView = string;

// The tips open to the right, over the toolbar of the main area. If the pointer could enter a tip it would stay open
// and take the click meant for the button below it, so the tips let the pointer through.
const NO_POINTER = { root: { pointerEvents: 'none' as const } };

// The order the user dragged the plugin buttons into, kept in the browser. Plugins that are not in
// the saved list, such as a newly installed one, follow in the order their manifests ask for.
const ORDER_KEY = 'lm_plugin_button_order';

function readSavedOrder(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x: unknown) => typeof x === 'string') : [];
  } catch { return []; }
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
  builtins: { key: BuiltinView; label: string; icon: React.ReactNode }[];
  plugins: BundlePlugin[];
  // the highlighted button: a built-in view, 'builder', or a plugin id
  activeId: string;
  onSelectBuiltin: (key: BuiltinView) => void;
  onSelectPlugin: (id: string) => void;
  // model library editing: its button shows only while it is open and locks the built-in views
  builderOpen: boolean;
  builderLabel: string;
  builderCloseLabel: string;
  builderLockedTip: string;
  onCloseBuilder: () => void;
  // the model tree's collapse toggle
  treeCollapsed: boolean;
  onToggleTree: () => void;
  treeToggleLabel: string;
  c: ReturnType<typeof getC>;
}

const ViewRail: React.FC<Props> = ({
  builtins, plugins, activeId, onSelectBuiltin, onSelectPlugin,
  builderOpen, builderLabel, builderCloseLabel, builderLockedTip, onCloseBuilder,
  treeCollapsed, onToggleTree, treeToggleLabel, c,
}) => {
  const [savedOrder, setSavedOrder] = useState<string[]>(readSavedOrder);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropBefore, setDropBefore] = useState<string | null>(null);

  const ordered = useMemo(() => {
    const byId = new Map(plugins.map(p => [p.id, p]));
    const first = savedOrder.filter(id => byId.has(id)).map(id => byId.get(id)!);
    const rest = plugins.filter(p => !savedOrder.includes(p.id));
    return [...first, ...rest];
  }, [plugins, savedOrder]);

  const moveBefore = (id: string, beforeId: string) => {
    if (id === beforeId) return;
    const ids = ordered.map(p => p.id).filter(x => x !== id);
    const at = ids.indexOf(beforeId);
    ids.splice(at < 0 ? ids.length : at, 0, id);
    setSavedOrder(ids);
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(ids)); } catch { /* order is just not remembered */ }
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

  return (
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

      {builtins.map(b => button({
        key: b.key, label: b.label, icon: b.icon,
        active: activeId === b.key, locked: builderOpen,
        tip: builderOpen ? builderLockedTip : b.label,
        onClick: () => onSelectBuiltin(b.key),
        testId: `center-tab-${b.key}`,
      }))}

      {builderOpen && (
        <div style={{ position: 'relative' }}>
          {button({ key: 'builder', label: builderLabel, icon: <BuildOutlined />, active: activeId === 'builder' })}
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
        </div>
      )}

      {plugins.length > 0 && (
        <div role="separator" style={{ height: 0, margin: '6px 10px', borderTop: `1px solid ${c.border}` }} />
      )}

      {ordered.map(p => (
        <div
          key={p.id}
          draggable={!builderOpen}
          data-testid={`plugin-rail-slot-${p.id}`}
          onDragStart={e => { setDragId(p.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); }}
          onDragOver={e => { if (dragId && dragId !== p.id) { e.preventDefault(); setDropBefore(p.id); } }}
          onDrop={e => { e.preventDefault(); if (dragId) moveBefore(dragId, p.id); setDragId(null); setDropBefore(null); }}
          onDragEnd={() => { setDragId(null); setDropBefore(null); }}
          style={{
            opacity: dragId === p.id ? 0.4 : 1,
            borderTop: `2px solid ${dropBefore === p.id && dragId ? c.primary : 'transparent'}`,
          }}
        >
          {button({
            key: p.id, label: p.title,
            icon: (p.icon && PLUGIN_ICONS[p.icon]) || <AppstoreOutlined />,
            active: activeId === p.id, onClick: () => onSelectPlugin(p.id),
            locked: builderOpen, tip: builderOpen ? builderLockedTip : p.title,
            testId: `plugin-rail-${p.id}`,
          })}
        </div>
      ))}
      {/* Dropping below the last button moves the dragged one to the end. */}
      {dragId && (
        <div
          data-testid="plugin-rail-end"
          onDragOver={e => { e.preventDefault(); setDropBefore('__end__'); }}
          onDrop={e => { e.preventDefault(); moveBefore(dragId, '__end__'); setDragId(null); setDropBefore(null); }}
          style={{ flex: 1, minHeight: 24, borderTop: `2px solid ${dropBefore === '__end__' ? c.primary : 'transparent'}` }}
        />
      )}
    </div>
  );
};

export default ViewRail;
