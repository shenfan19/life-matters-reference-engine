// gui/src/components/views/registry.tsx
// The views of the main area are registered here. A view is a file in this folder named *View.tsx that
// exports `view: ViewDef`; the registry finds it at build time, so adding a view means adding that file and
// nothing else changes: not the shell, not the rail (ADR 0163). Bundle plugins (ADR 0157) are a second kind
// of view, hosted in an iframe, and are listed by the backend instead.

import React from 'react';
import type { Workbench } from '../Simulator/useWorkbench';

export type ViewId = string;

export interface ViewDef {
  id: ViewId;
  // locale key of the label on the rail button
  labelKey: string;
  // the button on the rail; undefined for a view that has no button of its own, like the model editor
  icon?: React.ReactNode;
  // smaller comes first on the rail
  order: number;
  component: React.ComponentType<{ wb: Workbench }>;
}

const views = new Map<ViewId, ViewDef>();

export function registerView(def: ViewDef): void {
  views.set(def.id, def);
}

export function getView(id: ViewId): ViewDef | undefined {
  return views.get(id);
}

// The views that have a rail button, in rail order.
export function railViews(): ViewDef[] {
  return [...views.values()].filter(v => v.icon).sort((a, b) => a.order - b.order);
}

const found = import.meta.glob<{ view?: ViewDef }>('./*View.tsx', { eager: true });
Object.values(found).forEach(mod => { if (mod.view) registerView(mod.view); });
