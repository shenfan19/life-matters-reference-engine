// gui/src/components/plugins/ViewRail.tsx
// A vertical strip between the model tree and the main area. It holds every view of the
// main area as a button: Overview, Simulation and Optimization on top, then a line, then
// one button for each bundle plugin. While the model library is being edited a fourth
// built-in button appears above the line. A plugin button covers the whole main area
// while it is open.

import React from 'react';
import { Tooltip } from 'antd';
import {
  AppstoreOutlined, ApartmentOutlined, BarChartOutlined, BuildOutlined, CloseOutlined,
  FileTextOutlined, LeftOutlined, PictureOutlined, RightOutlined, TableOutlined,
} from '@ant-design/icons';
import type { getC } from '../../core/theme';
import type { BundlePlugin } from './usePlugins';

export type BuiltinView = 'intro' | 'simulation' | 'optimization';

// Own icons for the three built-in views, drawn on a 24 by 24 grid in the current color.
const svg = (children: React.ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const BUILTIN_ICONS: Record<BuiltinView, React.ReactNode> = {
  // an eye: look over the whole model
  intro: svg(<>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </>),
  // a trajectory: follow the model forward in time
  simulation: svg(
    <path d="M2.5 17c2.5-9 5.5-9 8 0s5.5 9 8 0" />
  ),
  // a target with an arrow: search for the best plan
  optimization: svg(<>
    <circle cx="11" cy="13" r="8" />
    <circle cx="11" cy="13" r="4" />
    <circle cx="11" cy="13" r="1" fill="currentColor" />
    <path d="M21 3l-8 8M21 3h-4M21 3v4" />
  </>),
};

// Icons a plugin manifest may name in ui.icon. An unknown name falls back to AppstoreOutlined.
const PLUGIN_ICONS: Record<string, React.ReactNode> = {
  ApartmentOutlined: <ApartmentOutlined />,
  AppstoreOutlined: <AppstoreOutlined />,
  BarChartOutlined: <BarChartOutlined />,
  FileTextOutlined: <FileTextOutlined />,
  PictureOutlined: <PictureOutlined />,
  TableOutlined: <TableOutlined />,
};

interface Props {
  builtins: { key: BuiltinView; label: string }[];
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
  const button = (opts: {
    key: string; label: string; icon: React.ReactNode; active: boolean;
    onClick?: () => void; locked?: boolean; tip?: string; testId?: string;
  }) => {
    const { key, label, icon, active, onClick, locked, tip, testId } = opts;
    const color = locked ? c.textMute : (active ? c.primary : c.textSec);
    return (
      <Tooltip key={key} title={tip ?? label} placement="right">
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
        width: 64, flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto',
        background: c.panel, borderLeft: `1px solid ${c.border}`, borderRight: `1px solid ${c.border}`,
      }}
    >
      <Tooltip title={treeToggleLabel} placement="right">
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
        key: b.key, label: b.label, icon: BUILTIN_ICONS[b.key],
        active: activeId === b.key, locked: builderOpen,
        tip: builderOpen ? builderLockedTip : b.label,
        onClick: () => onSelectBuiltin(b.key),
        testId: `center-tab-${b.key}`,
      }))}

      {builderOpen && (
        <div style={{ position: 'relative' }}>
          {button({ key: 'builder', label: builderLabel, icon: <BuildOutlined />, active: activeId === 'builder' })}
          <Tooltip title={builderCloseLabel} placement="right">
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

      {plugins.map(p => button({
        key: p.id, label: p.title,
        icon: (p.icon && PLUGIN_ICONS[p.icon]) || <AppstoreOutlined />,
        active: activeId === p.id, onClick: () => onSelectPlugin(p.id),
        locked: builderOpen, tip: builderOpen ? builderLockedTip : p.title,
        testId: `plugin-rail-${p.id}`,
      }))}
    </div>
  );
};

export default ViewRail;
