// gui/src/components/views/toolbars.tsx
// The chrome the built-in views share: the model toolbar above every view, the report button, and the control bars
// of the simulation and the optimization. They read the core and, by id, the modules of those two views. A module
// that is not there is treated as idle, so the toolbar works with either view removed.

import React from 'react';
import { message } from 'antd';
import { PLAN_COLORS } from '../sim_tab/simUtils';
import { SimControlBar } from '../sim_tab/SimControlBar';
import { OptControlBar } from '../opt_tab/OptControlBar';
import { GlobalModelToolbar } from '../sim_tab/GlobalModelToolbar';
import { ReportButton } from '../sim_tab/ReportButton';
import type { Core } from '../Simulator/useCore';
import type { SimulationModule } from '../modules/simulation/useSimulationModule';
import type { OptimizationModule } from '../modules/optimization/useOptimizationModule';

const peers = (core: Core) => ({
  sim: core.modules.simulation as SimulationModule | undefined,
  opt: core.modules.optimization as OptimizationModule | undefined,
});

export function reportButtonOf(core: Core) {
  const { sim, opt } = peers(core);
  const { selectedModel, equations, state, fontSize, t, c } = core;
  if (!selectedModel) return undefined;
  return (
    <ReportButton
      selectedModel={selectedModel} outputVars={sim?.outputVars ?? []} equations={equations}
      simulationData={sim?.effectiveSimData ?? []} inputParams={state.inputParams}
      simStartDate={state.simStartDate} simEndDate={state.simEndDate}
      stepValue={state.stepValue} stepUnit={state.stepUnit} batchSize={state.batchSize}
      objectives={opt?.objectives ?? []} constraints={opt?.constraints ?? []}
      optAlgo={opt?.optAlgo ?? 'NSGA-II'} optPop={opt?.optPop ?? 0} optGen={opt?.optGen ?? 0}
      optResult={opt?.optResult ?? null} optElapsed={opt?.optElapsed ?? 0} optMethod={opt?.optMethod ?? ''}
      planDatasets={sim?.isMultiPlan ? sim.activePlanDatasets : undefined}
      fontSize={fontSize} t={t} c={c as any}
    />
  );
}

// The model toolbar with `rightContent` on its right (the control bar of the open view).
export function modelToolbarOf(core: Core, rightContent?: React.ReactNode) {
  const { sim, opt } = peers(core);
  const { selectedModel, selectedKey, t, c, scsMode, autoSaveLocal, setAutoSaveLocal, runtime, reloadModel } = core;
  const copyModelLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link)
      .then(() => message.success(t('sim.ctrl.copy_link_done')))
      .catch(() => message.error(link));
  };
  return (
    <GlobalModelToolbar
      onCopyLink={selectedKey && !selectedKey.startsWith('session/') ? copyModelLink : undefined}
      selectedModel={selectedModel} isOtherRunning={runtime.isOtherRunning}
      simRunning={!!sim?.simRunningOrPaused} optRunning={!!opt?.optRunning} hasOptResult={!!opt?.optResult}
      onDownload={(o) => opt?.downloadModelYAML(o.flattenImports, o.withResults)}
      onReload={reloadModel}
      rightContent={rightContent}
      scsMode={scsMode} autoSaveLocal={autoSaveLocal} onAutoSaveLocalChange={setAutoSaveLocal}
      t={t} c={c as any}
    />
  );
}

export function simControlsOf(core: Core, sim: SimulationModule) {
  const { selectedModel, state, setEdited, session, runtime, t, c } = core;
  const { status, sessionSeed, simStartDate, simEndDate, stepValue, stepUnit, simRuns, mcSeed, simulationData } = state;
  return modelToolbarOf(core,
    <SimControlBar
      status={status} sessionSeed={sessionSeed}
      plans={sim.plans} simStartDate={simStartDate} simEndDate={simEndDate}
      stepValue={stepValue} stepUnit={stepUnit} simRuns={simRuns} mcSeed={mcSeed}
      selectedModel={selectedModel} isOtherRunning={runtime.isOtherRunning} otherRunningTip={runtime.otherRunningTip ?? ''}
      onStart={() => {
        // Snapshot current completed run before overwriting with new run
        if (simulationData.length > 0 && status === 'completed') {
          const color = PLAN_COLORS[sim.simRunCounterRef.current % PLAN_COLORS.length];
          sim.simRunCounterRef.current += 1;
          const label = `Sim ${simStartDate} · ${stepValue}${stepUnit[0]}`;
          sim.setImportedSimRuns(prev => [...prev, { key: `run-${Date.now()}`, label, color, data: simulationData }]);
        }
        session.markEdited();
        sim.startSimulation();
      }} onPause={sim.pauseSimulation} onResume={sim.resumeSimulation}
      onReset={sim.resetSimulation} onRunAllPlans={sim.runAllPlans}
      hasSimData={simulationData.length > 0 || sim.comparedPlans.some(p => p.data.length > 0) || sim.importedSimRuns.length > 0}
      onExportCSV={sim.handleExportSimCSV}
      onImportCSV={sim.importSimCSV}
      onSimStartDateChange={v => setEdited('simStartDate', v)}
      onSimEndDateChange={v => setEdited('simEndDate', v)}
      onStepValueChange={v => setEdited('stepValue', v)}
      onStepUnitChange={v => setEdited('stepUnit', v)}
      onSimRunsChange={v => setEdited('simRuns', v)}
      onMcSeedChange={v => setEdited('mcSeed', v)}
      reportButton={reportButtonOf(core)}
      t={t} c={c as any}
    />
  );
}

export function optControlsOf(core: Core, opt: OptimizationModule) {
  const { selectedModel, state, setEdited, session, runtime, scsMode, t, c } = core;
  const { simStartDate, simEndDate, optStepValue, optStepUnit, optMcRuns, optMcSeed } = state;
  return modelToolbarOf(core,
    <OptControlBar
      optRunning={opt.optRunning} optCurGen={opt.optCurGen} optTotalGen={opt.optTotalGen}
      warmStartEnabled={opt.warmStartEnabled} warmStartDirty={opt.warmStartDirty} hasExistingResults={opt.hasExistingResults}
      currentFrontCount={opt.currentFront?.length ?? 0}
      optResult={opt.optResult} storedOptResult={opt.storedOptResult}
      simStartDate={simStartDate} simEndDate={simEndDate}
      stepValue={optStepValue} stepUnit={optStepUnit} simRuns={optMcRuns} mcSeed={optMcSeed}
      selectedModel={selectedModel} isOtherRunning={runtime.isOtherRunning} otherRunningTip={runtime.otherRunningTip ?? ''}
      onStart={() => { session.markEdited(); opt.startOptimization(); }} onCancel={opt.cancelOptimization}
      onWarmStartChange={opt.setWarmStartEnabled}
      onSimStartDateChange={v => setEdited('simStartDate', v)}
      onSimEndDateChange={v => setEdited('simEndDate', v)}
      onStepValueChange={v => setEdited('optStepValue', v)}
      onStepUnitChange={v => setEdited('optStepUnit', v)}
      onSimRunsChange={v => setEdited('optMcRuns', v)}
      onMcSeedChange={v => setEdited('optMcSeed', v)}
      onExportCSV={opt.exportOptCSV}
      onImportCSV={opt.importParetoFromCSV}
      scsMode={scsMode}
      setOptResult={opt.setOptResult}
      reportButton={reportButtonOf(core)}
      t={t} c={c as any}
    />
  );
}
