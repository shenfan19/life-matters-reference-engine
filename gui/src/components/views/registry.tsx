// gui/src/components/views/registry.tsx
// The views of the main area are registered here, the same way for the ones that ship with the
// engine and for any that are added later. The shell asks the registry which view to draw and the
// view rail asks it which buttons to show, so a view is added by registering it and nothing else
// has to change (ADR 0163). Bundle plugins (ADR 0157) are a second kind of view, hosted in an iframe.

import React from 'react';
import type { Workbench } from '../Simulator/useWorkbench';
import OverviewView from './OverviewView';
import SimulationView from './SimulationView';
import OptimizationView from './OptimizationView';
import BuilderView from './BuilderView';

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

// Own icons for the built-in views, drawn on a 24 by 24 grid in the current color.
const svg = (children: React.ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

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

registerView({
  id: 'intro', labelKey: 'sim.tab.overview', order: 10, component: OverviewView,
  // an eye: look over the whole model
  icon: svg(<>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </>),
});
registerView({
  id: 'simulation', labelKey: 'sim.tab.simulation', order: 20, component: SimulationView,
  // a trajectory: follow the model forward in time
  icon: svg(<path d="M2.5 17c2.5-9 5.5-9 8 0s5.5 9 8 0" />),
});
registerView({
  id: 'optimization', labelKey: 'sim.tab.optimization', order: 30, component: OptimizationView,
  // a target with an arrow: search for the best plan
  icon: svg(<>
    <circle cx="11" cy="13" r="8" />
    <circle cx="11" cy="13" r="4" />
    <circle cx="11" cy="13" r="1" fill="currentColor" />
    <path d="M21 3l-8 8M21 3h-4M21 3v4" />
  </>),
});
// The model editor has no button of its own: the rail shows one while the library is being edited.
registerView({ id: 'builder', labelKey: 'sim.builder.label', order: 40, component: BuilderView });
