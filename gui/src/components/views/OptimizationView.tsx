// gui/src/components/views/OptimizationView.tsx

import React from 'react';
import OptSetupTab from '../opt_tab/OptSetupTab';
import SimOptTab from '../sim_tab/SimOptTab';
import { WorkspacePage, ProgressStrip } from '../sim_tab/WorkspacePage';
import type { Workbench } from '../Simulator/useWorkbench';
import type { ViewDef } from './registry';
import { svg } from './icons';
import { buildToolbars } from './toolbars';

const OptimizationView: React.FC<{ wb: Workbench }> = ({ wb }) => {
  const {
    optInputEvents, addOptInputEvent, removeOptInputEvent, plans, activePlanId, inputEvents,
    sessionEditedRef, setOptInputEvents, updateOptInputEvent, inputVars, allVarNames, openSections,
    setOpenSections, simStartDate, simEndDate, objectives, setObjectivesEdited, constraints,
    setConstraintsEdited, optAlgo, setOptAlgoEdited, optPop, setOptPopEdited, optGen, setOptGenEdited,
    isDarkMode, c, t, optResult, optRunning, optHistory, optCurGen, optTotalGen, optElapsed, optMethod,
    optLogs, fontSize, downloadModelYAML, hasExistingResults, addPlansFromOpt, runningModelKey,
    selectedKey, regroupXKey, regroupYKey, regroupGroupKey, setRegroupXKey, setRegroupYKey,
    setRegroupGroupKey
  } = wb;
  const { OptControls } = buildToolbars(wb);
  return (

          <WorkspacePage
            controls={OptControls}
            setup={
              <OptSetupTab
                inputEvents={optInputEvents}
                addInputEvent={addOptInputEvent}
                removeInputEvent={removeOptInputEvent}
                plans={plans.map(p => p.id === activePlanId ? { ...p, inputEvents } : p)}
                onImportFromPlan={(events) => {
                  sessionEditedRef.current = true;
                  setOptInputEvents(
                    events.map(ev => ({
                      ...ev,
                      optimizeValue: false,
                      optimizeTime: false,
                      optimizeDays: false,
                      optimizeDateRange: false,
                    }))
                  );
                }}
                updateInputEvent={updateOptInputEvent}
                updateInputEventOpt={updateOptInputEvent}
                inputVars={inputVars}
                allVarNames={allVarNames}
                openSections={openSections} setOpenSections={setOpenSections}
                simStartDate={simStartDate} simEndDate={simEndDate}
                objectives={objectives} setObjectives={setObjectivesEdited}
                constraints={constraints} setConstraints={setConstraintsEdited}
                optAlgo={optAlgo} setOptAlgo={setOptAlgoEdited}
                optPop={optPop} setOptPop={setOptPopEdited}
                optGen={optGen} setOptGen={setOptGenEdited}
                isDarkMode={isDarkMode} c={c} t={t}
              />
            }
            result={
              <SimOptTab
                optResult={optResult} optRunning={optRunning}
                optHistory={optHistory} optCurGen={optCurGen} optTotalGen={optTotalGen}
                optElapsed={optElapsed} optMethod={optMethod} optLogs={optLogs}
                objectives={objectives} constraints={constraints}
                isDarkMode={isDarkMode} c={c} t={t} fontSize={fontSize}
                onDownloadModel={downloadModelYAML}
                hasExistingResults={hasExistingResults}
                onSendToSim={addPlansFromOpt}
                isActiveModel={!runningModelKey || runningModelKey === selectedKey}
                regroupXKey={regroupXKey} regroupYKey={regroupYKey} regroupGroupKey={regroupGroupKey}
                onRegroupXKeyChange={setRegroupXKey} onRegroupYKeyChange={setRegroupYKey} onRegroupGroupKeyChange={setRegroupGroupKey}
              />
            }
            progress={<ProgressStrip label="Optimization" percent={optTotalGen ? (optCurGen / optTotalGen) * 100 : (optResult ? 100 : 0)} detail={`gen ${optCurGen}/${optTotalGen || '-'} · ${optRunning ? 'running' : optResult ? 'completed' : 'idle'}`} active={optRunning} c={c} />}
          />
        
  );
};

export const view: ViewDef = {
  id: 'optimization', labelKey: 'sim.tab.optimization', order: 30, component: OptimizationView,
  // a target with an arrow: search for the best plan
  icon: svg(<>
    <circle cx="11" cy="13" r="8" />
    <circle cx="11" cy="13" r="4" />
    <circle cx="11" cy="13" r="1" fill="currentColor" />
    <path d="M21 3l-8 8M21 3h-4M21 3v4" />
  </>),
};
