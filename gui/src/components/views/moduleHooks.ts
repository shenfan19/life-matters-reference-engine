// gui/src/components/views/moduleHooks.ts
// Hooks the shell and the modules use around the core (ADR 0163).

import { useEffect, useRef } from 'react';
import type { ModelSession } from '../../types';
import type { Core } from '../Simulator/useCore';
import { listModuleViews } from './registry';

// Runs the hook of every module, in the order of the views, and puts what each returns into `core.modules`.
// The list of modules is fixed when the page is built, so the hooks are called in the same order every render.
export function useModules(core: Core) {
  for (const def of listModuleViews()) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    core.modules[def.id] = def.useModule!(core);
  }
}

// Called by the shell after the modules, so it runs after their effects: the model is initialised and the
// session may be saved from now on.
export function useSessionGate(core: Core) {
  useEffect(() => {
    if (!core.selectedModel?.content?.variables) return;
    core.session.readyRef.current = true;
  }, [core.selectedModel]); // eslint-disable-line react-hooks/exhaustive-deps
}

// A module keeps a slice of the saved session of every model. `init` is given the saved session of the model
// that was just selected, or undefined on the first visit, and sets the module's state from it or from the file.
// `slice` returns what to store, and is stored again when one of `deps` changes.
export function useSessionSlice(core: Core, id: string, opts: {
  init: (saved: ModelSession | undefined) => void;
  slice: () => Partial<ModelSession>;
  deps: unknown[];
}) {
  const sliceRef = useRef(opts.slice);
  sliceRef.current = opts.slice;
  core.session.register(id, () => sliceRef.current());

  useEffect(() => {
    const model = core.selectedModel;
    if (!model?.content?.variables) return;
    opts.init(core.session.modelSessionsRef.current[model.key]);
  }, [core.selectedModel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    core.session.save();
  }, [core.selectedKey, ...opts.deps]); // eslint-disable-line react-hooks/exhaustive-deps
}
