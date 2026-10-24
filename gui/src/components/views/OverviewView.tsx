// gui/src/components/views/OverviewView.tsx

import React from 'react';
import SimIntroTab from '../sim_tab/SimIntroTab';
import type { Workbench } from '../Simulator/useWorkbench';
import type { ViewDef } from './registry';
import { svg } from './icons';
import { buildToolbars } from './toolbars';

const OverviewView: React.FC<{ wb: Workbench }> = ({ wb }) => {
  const {
    selectedModel, outputVars, equations, provenance, introOpen, setIntroOpen, effectiveSimData,
    inputParams, simStartDate, simEndDate, stepValue, stepUnit, batchSize, objectives, constraints,
    optAlgo, optPop, optGen, optResult, optElapsed, optMethod, isDarkMode, c, t, fontSize
  } = wb;
  const { ModelToolbar } = buildToolbars(wb);
  return (

          <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {ModelToolbar()}
            <SimIntroTab
              selectedModel={selectedModel} outputVars={outputVars}
              equations={equations} provenance={provenance}
              introOpen={introOpen} setIntroOpen={setIntroOpen}
              simulationData={effectiveSimData}
              inputParams={inputParams}
              simStartDate={simStartDate} simEndDate={simEndDate}
              stepValue={stepValue} stepUnit={stepUnit} batchSize={batchSize}
              objectives={objectives} constraints={constraints}
              optAlgo={optAlgo} optPop={optPop} optGen={optGen}
              optResult={optResult} optElapsed={optElapsed} optMethod={optMethod}
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
