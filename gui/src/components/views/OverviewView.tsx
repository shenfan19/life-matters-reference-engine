// gui/src/components/views/OverviewView.tsx
// The overview of the selected model. It has no state of its own: it shows the model, and the results of the
// simulation and optimization modules where they exist.

import React from 'react';
import SimIntroTab from '../sim_tab/SimIntroTab';
import type { ViewDef } from './api';
import type { Core } from '../Simulator/useCore';
import type { SimulationModule } from '../modules/simulation/useSimulationModule';
import type { OptimizationModule } from '../modules/optimization/useOptimizationModule';
import { svg } from './icons';
import { modelToolbarOf } from './toolbars';

const OverviewView: React.FC<{ core: Core }> = ({ core }) => {
  const { selectedModel, equations, provenance, introOpen, setIntroOpen, state, isDarkMode, c, t, fontSize } = core;
  const sim = core.modules.simulation as SimulationModule | undefined;
  const opt = core.modules.optimization as OptimizationModule | undefined;
  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {modelToolbarOf(core)}
      <SimIntroTab
        selectedModel={selectedModel} outputVars={sim?.outputVars ?? []}
        equations={equations} provenance={provenance}
        introOpen={introOpen} setIntroOpen={setIntroOpen}
        simulationData={sim?.effectiveSimData ?? []}
        inputParams={state.inputParams}
        simStartDate={state.simStartDate} simEndDate={state.simEndDate}
        stepValue={state.stepValue} stepUnit={state.stepUnit} batchSize={state.batchSize}
        objectives={opt?.objectives ?? []} constraints={opt?.constraints ?? []}
        optAlgo={opt?.optAlgo ?? 'NSGA-II'} optPop={opt?.optPop ?? 0} optGen={opt?.optGen ?? 0}
        optResult={opt?.optResult ?? null} optElapsed={opt?.optElapsed ?? 0} optMethod={opt?.optMethod ?? ''}
        isDarkMode={isDarkMode} c={c} t={t} fontSize={fontSize}
      />
    </div>
  );
};

export const view: ViewDef = {
  id: 'intro', labelKey: 'sim.tab.overview', order: 10, component: OverviewView,
  // an eye: look over the whole model
  icon: svg(<>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </>),
};
