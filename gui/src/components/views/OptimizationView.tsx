// gui/src/components/views/OptimizationView.tsx
// The optimization view: the setup column, the result and the progress of a run. Its state and logic are in the
// optimization module. The plans it may import a start point from are the simulation module's.

import React from 'react';
import OptSetupTab from '../opt_tab/OptSetupTab';
import SimOptTab from '../sim_tab/SimOptTab';
import { WorkspacePage, ProgressStrip } from '../sim_tab/WorkspacePage';
import type { ViewDef } from './api';
import type { Core } from '../Simulator/useCore';
import { useOptimizationModule, optimizationOf } from '../modules/optimization/useOptimizationModule';
import type { SimulationModule } from '../modules/simulation/useSimulationModule';
import { svg } from './icons';
import { optControlsOf } from './toolbars';

const OptimizationView: React.FC<{ core: Core }> = ({ core }) => {
  const {
    inputVars, allVarNames, openSections, setOpenSections, isDarkMode, c, t, fontSize, selectedKey, session, runtime, state,
  } = core;
  const opt = optimizationOf(core);
  const sim = core.modules.simulation as SimulationModule | undefined;
  return (
    <WorkspacePage
      controls={optControlsOf(core, opt)}
      setup={
        <OptSetupTab
          inputEvents={opt.optInputEvents}
          addInputEvent={opt.addOptInputEvent}
          removeInputEvent={opt.removeOptInputEvent}
          plans={(sim?.plans ?? []).map(p => p.id === sim?.activePlanId ? { ...p, inputEvents: sim.inputEvents } : p)}
          onImportFromPlan={(events) => {
            session.markEdited();
            opt.setOptInputEvents(
              events.map(ev => ({
                ...ev,
                optimizeValue: false,
                optimizeTime: false,
                optimizeDays: false,
                optimizeDateRange: false,
              }))
            );
          }}
          updateInputEvent={opt.updateOptInputEvent}
          updateInputEventOpt={opt.updateOptInputEvent}
          inputVars={inputVars}
          allVarNames={allVarNames}
          openSections={openSections} setOpenSections={setOpenSections}
          simStartDate={state.simStartDate} simEndDate={state.simEndDate}
          objectives={opt.objectives} setObjectives={opt.setObjectivesEdited}
          constraints={opt.constraints} setConstraints={opt.setConstraintsEdited}
          optAlgo={opt.optAlgo} setOptAlgo={opt.setOptAlgoEdited}
          optPop={opt.optPop} setOptPop={opt.setOptPopEdited}
          optGen={opt.optGen} setOptGen={opt.setOptGenEdited}
          isDarkMode={isDarkMode} c={c} t={t}
        />
      }
      result={
        <SimOptTab
          optResult={opt.optResult} optRunning={opt.optRunning}
          optHistory={opt.optHistory} optCurGen={opt.optCurGen} optTotalGen={opt.optTotalGen}
          optElapsed={opt.optElapsed} optMethod={opt.optMethod} optLogs={opt.optLogs}
          objectives={opt.objectives} constraints={opt.constraints}
          isDarkMode={isDarkMode} c={c} t={t} fontSize={fontSize}
          onDownloadModel={opt.downloadModelYAML}
          hasExistingResults={opt.hasExistingResults}
          onSendToSim={opt.sendToSim}
          isActiveModel={!runtime.runningModelKey || runtime.runningModelKey === selectedKey}
          regroupXKey={opt.regroupXKey} regroupYKey={opt.regroupYKey} regroupGroupKey={opt.regroupGroupKey}
          onRegroupXKeyChange={opt.setRegroupXKey} onRegroupYKeyChange={opt.setRegroupYKey} onRegroupGroupKeyChange={opt.setRegroupGroupKey}
        />
      }
      progress={<ProgressStrip label="Optimization" percent={opt.optTotalGen ? (opt.optCurGen / opt.optTotalGen) * 100 : (opt.optResult ? 100 : 0)} detail={`gen ${opt.optCurGen}/${opt.optTotalGen || '-'} · ${opt.optRunning ? 'running' : opt.optResult ? 'completed' : 'idle'}`} active={opt.optRunning} c={c} />}
    />
  );
};

export const view: ViewDef = {
  id: 'optimization', labelKey: 'sim.tab.optimization', order: 30, component: OptimizationView,
  useModule: useOptimizationModule,
  // a target with an arrow: search for the best plan
  icon: svg(<>
    <circle cx="11" cy="13" r="8" />
    <circle cx="11" cy="13" r="4" />
    <circle cx="11" cy="13" r="1" fill="currentColor" />
    <path d="M21 3l-8 8M21 3h-4M21 3v4" />
  </>),
};
