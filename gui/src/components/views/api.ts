// gui/src/components/views/api.ts
// What a view of the main area is, and what the core offers it.
//
// The core (Simulator/useCore.ts) owns what every view needs and none of them should own alone: the model
// library and the selected model, the theme and language, the settings of a run that simulation and optimization
// share, the saved session of a model, the lock that lets one job run at a time, navigation between views and a
// small event bus. A view is a module that brings its own state and logic (`useModule`) and a component. It reads
// the core and, where it needs them, the exports of other modules by their id (`core.modules`). Nothing else is
// shared, so a view can be taken out, replaced or added without touching the others (ADR 0163).

import type React from 'react';
import type { ModelSession } from '../../types';
import type { Core } from '../Simulator/useCore';

export type ViewId = string;

// A module reads and writes one slice of the saved session of a model (the fields it owns).
// `init` runs when a model has been selected, with the saved session of that model or undefined on the first
// visit; `slice` is what to store, called again whenever `deps` change.
export interface ModuleSession {
  init: (saved: ModelSession | undefined) => void;
  slice: () => Partial<ModelSession>;
  deps: unknown[];
}

export interface ViewDef<M = unknown> {
  id: ViewId;
  // locale key of the label on the rail button
  labelKey: string;
  // the button on the rail; undefined for a view that has no button of its own
  icon?: React.ReactNode;
  // smaller comes first on the rail, and the hooks of the modules run in this order, so a module can read the
  // exports of the modules with a smaller order
  order: number;
  // State and logic of the view. It runs in the shell on every render, so what it holds survives switching to
  // another view. What it returns is what other modules may read as `core.modules[id]`.
  useModule?: (core: Core) => M;
  component: React.ComponentType<{ core: Core }>;
}
