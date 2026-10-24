// gui/src/components/views/toolbars.tsx
// The model toolbar and the two control bars (simulation, optimization) that the built-in views share.

import React from 'react';
import { message } from 'antd';
import { PLAN_COLORS } from '../sim_tab/simUtils';
import { SimControlBar } from '../sim_tab/SimControlBar';
import { OptControlBar } from '../opt_tab/OptControlBar';
import { GlobalModelToolbar } from '../sim_tab/GlobalModelToolbar';
import { ReportButton } from '../sim_tab/ReportButton';
import type { Workbench } from '../Simulator/useWorkbench';

export function buildToolbars(wb: Workbench) {
  const {
    reloadModel, selectedModel, outputVars, equations, effectiveSimData, inputParams, simStartDate,
    simEndDate, stepValue, stepUnit, batchSize, objectives, constraints, optAlgo, optPop, optGen,
    optResult, optElapsed, optMethod, reportIsMultiPlan, reportActivePlans, fontSize, t, c,
    resetSimulation, selectedKey, isOtherRunning, simRunningOrPaused, optRunning, downloadModelYAML,
    scsMode, autoSaveLocal, setAutoSaveLocal, status, sessionSeed, plans, simRuns, mcSeed, otherRunningTip,
    simulationData, simRunCounterRef, setImportedSimRuns, sessionEditedRef, startSimulation,
    pauseSimulation, resumeSimulation, runAllPlans, comparedPlans, importedSimRuns, handleExportSimCSV,
    importSimCSV, setEdited, optCurGen, optTotalGen, warmStartEnabled, warmStartDirty, hasExistingResults,
    currentFront, storedOptResult, optStepValue, optStepUnit, optMcRuns, optMcSeed, startOptimization,
    cancelOptimization, setWarmStartEnabled, exportOptCSV, importParetoFromCSV, setOptResult
  } = wb;


  const reportButton = selectedModel ? (
    <ReportButton
      selectedModel={selectedModel} outputVars={outputVars} equations={equations}
      simulationData={effectiveSimData} inputParams={inputParams}
      simStartDate={simStartDate} simEndDate={simEndDate}
      stepValue={stepValue} stepUnit={stepUnit} batchSize={batchSize}
      objectives={objectives} constraints={constraints}
      optAlgo={optAlgo} optPop={optPop} optGen={optGen}
      optResult={optResult} optElapsed={optElapsed} optMethod={optMethod}
      planDatasets={reportIsMultiPlan ? reportActivePlans : undefined}
      fontSize={fontSize} t={t} c={c as any}
    />
  ) : undefined;

  const copyModelLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link)
      .then(() => message.success(t('sim.ctrl.copy_link_done')))
      .catch(() => message.error(link));
  };


  const ModelToolbar = (rightContent?: React.ReactNode) => (
    <GlobalModelToolbar
      onCopyLink={selectedKey && !selectedKey.startsWith('session/') ? copyModelLink : undefined}
      selectedModel={selectedModel} isOtherRunning={isOtherRunning}
      simRunning={simRunningOrPaused} optRunning={optRunning} hasOptResult={!!optResult}
      onDownload={(opts) => downloadModelYAML(opts.flattenImports, opts.withResults)}
      onReload={reloadModel}
      rightContent={rightContent}
      scsMode={scsMode} autoSaveLocal={autoSaveLocal} onAutoSaveLocalChange={setAutoSaveLocal}
      t={t} c={c as any}
    />
  );

  const SimControls = ModelToolbar(
    <SimControlBar
      status={status} sessionSeed={sessionSeed}
      plans={plans} simStartDate={simStartDate} simEndDate={simEndDate}
      stepValue={stepValue} stepUnit={stepUnit} simRuns={simRuns} mcSeed={mcSeed}
      selectedModel={selectedModel} isOtherRunning={isOtherRunning} otherRunningTip={otherRunningTip ?? ''}
      onStart={() => {
        // Snapshot current completed run before overwriting with new run
        if (simulationData.length > 0 && status === 'completed') {
          const color = PLAN_COLORS[simRunCounterRef.current % PLAN_COLORS.length];
          simRunCounterRef.current += 1;
          const label = `Sim ${simStartDate} · ${stepValue}${stepUnit[0]}`;
          setImportedSimRuns(prev => [...prev, { key: `run-${Date.now()}`, label, color, data: simulationData }]);
        }
        sessionEditedRef.current = true;
        startSimulation();
      }} onPause={pauseSimulation} onResume={resumeSimulation}
      onReset={resetSimulation} onRunAllPlans={runAllPlans}
      hasSimData={simulationData.length > 0 || comparedPlans.some(p => p.data.length > 0) || importedSimRuns.length > 0}
      onExportCSV={handleExportSimCSV}
      onImportCSV={importSimCSV}
      onSimStartDateChange={v => setEdited('simStartDate', v)}
      onSimEndDateChange={v => setEdited('simEndDate', v)}
      onStepValueChange={v => setEdited('stepValue', v)}
      onStepUnitChange={v => setEdited('stepUnit', v)}
      onSimRunsChange={v => setEdited('simRuns', v)}
      onMcSeedChange={v => setEdited('mcSeed', v)}
      reportButton={reportButton}
      t={t} c={c as any}
    />
  );
  const OptControls = ModelToolbar(
    <OptControlBar
      optRunning={optRunning} optCurGen={optCurGen} optTotalGen={optTotalGen}
      warmStartEnabled={warmStartEnabled} warmStartDirty={warmStartDirty} hasExistingResults={hasExistingResults}
      currentFrontCount={currentFront?.length ?? 0}
      optResult={optResult} storedOptResult={storedOptResult}
      simStartDate={simStartDate} simEndDate={simEndDate}
      stepValue={optStepValue} stepUnit={optStepUnit} simRuns={optMcRuns} mcSeed={optMcSeed}
      selectedModel={selectedModel} isOtherRunning={isOtherRunning} otherRunningTip={otherRunningTip ?? ''}
      onStart={() => { sessionEditedRef.current = true; startOptimization(); }} onCancel={cancelOptimization}
      onWarmStartChange={setWarmStartEnabled}
      onSimStartDateChange={v => setEdited('simStartDate', v)}
      onSimEndDateChange={v => setEdited('simEndDate', v)}
      onStepValueChange={v => setEdited('optStepValue', v)}
      onStepUnitChange={v => setEdited('optStepUnit', v)}
      onSimRunsChange={v => setEdited('optMcRuns', v)}
      onMcSeedChange={v => setEdited('optMcSeed', v)}
      onExportCSV={exportOptCSV}
      onImportCSV={importParetoFromCSV}
      scsMode={scsMode}
      setOptResult={setOptResult}
      reportButton={reportButton}
      t={t} c={c as any}
    />
  );
  return { ModelToolbar, SimControls, OptControls, reportButton };
}
