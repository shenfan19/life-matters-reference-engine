// gui/src/components/views/OverviewView.tsx

import React from 'react';
import SimIntroTab from '../sim_tab/SimIntroTab';
import type { Workbench } from '../Simulator/useWorkbench';
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

export default OverviewView;
