// gui/src/components/views/registry.tsx
// The views of the main area are registered here. A view is a file in this folder named *View.tsx that
// exports `view: ViewDef`; the registry finds it at build time, so adding a view means adding that file and
// nothing else changes: not the shell, not the rail (ADR 0163). Bundle plugins (ADR 0157) are a second kind
// of view, hosted in an iframe, and are listed by the backend instead.

import type { ViewDef, ViewId } from './api';

export type { ViewDef, ViewId };

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

// The views that bring a module, in the order their hooks run.
export function listModuleViews(): ViewDef[] {
  return [...views.values()].filter(v => v.useModule).sort((a, b) => a.order - b.order);
}

const found = import.meta.glob<{ view?: ViewDef }>('./*View.tsx', { eager: true });
Object.values(found).forEach(mod => { if (mod.view) registerView(mod.view); });
