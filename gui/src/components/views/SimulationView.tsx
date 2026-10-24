// gui/src/components/views/SimulationView.tsx
// The simulation view: the setup column, the plot and the progress of a run. Its state and logic are in the
// simulation module.

import React from 'react';
import SimSetupTab from '../sim_tab/SimSetupTab';
import SimPlotTab from '../sim_tab/SimPlotTab';
import { PLAN_COLORS } from '../sim_tab/simUtils';
import { WorkspacePage, ProgressStrip } from '../sim_tab/WorkspacePage';
import type { ViewDef } from './api';
import type { Core } from '../Simulator/useCore';
import { useSimulationModule, simulationOf } from '../modules/simulation/useSimulationModule';
import { svg } from './icons';
import { simControlsOf } from './toolbars';

const SimulationView: React.FC<{ core: Core }> = ({ core }) => {
  const { inputVars, openSections, setOpenSections, SECTION_H, isDarkMode, c, t, fontSize, selectedModel, selectedKey, state } = core;
  const {
    simStartDate, simEndDate, stepValue, stepUnit, simRuns, sessionSeed, status, progress, currentStep, totalSteps,
    simulationData, dataPerRun,
  } = state;
  const sim = simulationOf(core);
  return (
    <WorkspacePage
      controls={simControlsOf(core, sim)}
      setup={
        <SimSetupTab
          inputEvents={sim.inputEvents}
          addInputEvent={sim.addInputEvent}
          updateInputEvent={sim.updateInputEvent}
          removeInputEvent={sim.removeInputEvent}
          inputVars={inputVars}
          openSections={openSections} setOpenSections={setOpenSections}
          SECTION_H={SECTION_H}
          simStartDate={simStartDate} simEndDate={simEndDate}
          isDarkMode={isDarkMode} c={c} t={t}
          plans={sim.plans} activePlanId={sim.activePlanId}
          onSelectPlan={sim.selectPlan} onAddPlan={sim.addPlan} onRemovePlan={sim.removePlan}
        />
      }
      result={
        <SimPlotTab
          simulationData={simulationData} dataPerRun={dataPerRun}
          outputVars={sim.outputVars} outputWarnings={sim.outputWarnings}
          inputVars={inputVars}
          selectedModel={selectedModel}
          selectedKey={selectedKey} mode="sim" status={status}
          simStartDate={simStartDate} simEndDate={simEndDate}
          stepValue={stepValue} stepUnit={stepUnit}
          simRuns={simRuns} sessionSeed={sessionSeed}
          isDarkMode={isDarkMode} c={c} t={t} fontSize={fontSize}
          comparedPlans={[
            // Include the current run as a named plan when there are other runs to compare
            ...(simulationData.length > 0 && sim.importedSimRuns.length > 0 ? [{
              id: 'current-sim',
              label: (status === 'running' || status === 'paused') ? t('sim.tab.running') : t('sim.tab.current'),
              color: PLAN_COLORS[sim.simRunCounterRef.current % PLAN_COLORS.length],
              data: simulationData, runsData: dataPerRun,
              running: status === 'running',
            }] : []),
            ...sim.comparedPlans,
            ...sim.importedSimRuns.map(r => ({
              id: r.key, label: r.label, color: r.color,
              data: r.data, runsData: [] as any[][], running: false,
            })),
          ]}
          onRemovePlan={sim.removeImportedRun}
          simLogs={sim.simLogs}
        />
      }
      progress={<ProgressStrip label="Simulation" percent={progress} detail={`step ${currentStep}/${totalSteps || '-'} · ${status}`} active={status === 'running'} c={c} />}
    />
  );
};

export const view: ViewDef = {
  id: 'simulation', labelKey: 'sim.tab.simulation', order: 20, component: SimulationView,
  useModule: useSimulationModule,
  // a trajectory: follow the model forward in time
  icon: svg(<path d="M2.5 17c2.5-9 5.5-9 8 0s5.5 9 8 0" />),
};
