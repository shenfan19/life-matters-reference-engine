// gui/src/components/views/SimulationView.tsx

import React from 'react';
import SimSetupTab from '../sim_tab/SimSetupTab';
import SimPlotTab from '../sim_tab/SimPlotTab';
import { PLAN_COLORS } from '../sim_tab/simUtils';
import { WorkspacePage, ProgressStrip } from '../sim_tab/WorkspacePage';
import type { Workbench } from '../Simulator/useWorkbench';
import { buildToolbars } from './toolbars';

const SimulationView: React.FC<{ wb: Workbench }> = ({ wb }) => {
  const {
    inputEvents, addInputEvent, updateInputEvent, removeInputEvent, inputVars, openSections,
    setOpenSections, SECTION_H, simStartDate, simEndDate, isDarkMode, c, t, plans, activePlanId,
    selectPlan, addPlan, removePlan, simulationData, dataPerRun, outputVars, outputWarnings, selectedModel,
    selectedKey, status, stepValue, stepUnit, simRuns, sessionSeed, fontSize, importedSimRuns,
    simRunCounterRef, comparedPlans, removeImportedRun, simLogs, progress, currentStep, totalSteps
  } = wb;
  const { SimControls } = buildToolbars(wb);
  return (

          <WorkspacePage
            controls={SimControls}
            setup={
              <SimSetupTab
                inputEvents={inputEvents}
                addInputEvent={addInputEvent}
                updateInputEvent={updateInputEvent}
                removeInputEvent={removeInputEvent}
                inputVars={inputVars}
                openSections={openSections} setOpenSections={setOpenSections}
                SECTION_H={SECTION_H}
                simStartDate={simStartDate} simEndDate={simEndDate}
                isDarkMode={isDarkMode} c={c} t={t}
                plans={plans} activePlanId={activePlanId}
                onSelectPlan={selectPlan} onAddPlan={addPlan} onRemovePlan={removePlan}
              />
            }
            result={
              <SimPlotTab
                simulationData={simulationData} dataPerRun={dataPerRun}
                outputVars={outputVars} outputWarnings={outputWarnings}
                inputVars={inputVars}
                selectedModel={selectedModel}
                selectedKey={selectedKey} mode="sim" status={status}
                simStartDate={simStartDate} simEndDate={simEndDate}
                stepValue={stepValue} stepUnit={stepUnit}
                simRuns={simRuns} sessionSeed={sessionSeed}
                isDarkMode={isDarkMode} c={c} t={t} fontSize={fontSize}
                comparedPlans={[
                  // Include current run as a named plan when there are other runs to compare
                  ...(simulationData.length > 0 && importedSimRuns.length > 0 ? [{
                    id: 'current-sim',
                    label: (status === 'running' || status === 'paused') ? t('sim.tab.running') : t('sim.tab.current'),
                    color: PLAN_COLORS[simRunCounterRef.current % PLAN_COLORS.length],
                    data: simulationData, runsData: dataPerRun,
                    running: status === 'running',
                  }] : []),
                  ...comparedPlans,
                  ...importedSimRuns.map(r => ({
                    id: r.key, label: r.label, color: r.color,
                    data: r.data, runsData: [] as any[][], running: false,
                  })),
                ]}
                onRemovePlan={removeImportedRun}
                simLogs={simLogs}
              />
            }
            progress={<ProgressStrip label="Simulation" percent={progress} detail={`step ${currentStep}/${totalSteps || '-'} · ${status}`} active={status === 'running'} c={c} />}
          />
        
  );
};

export default SimulationView;
