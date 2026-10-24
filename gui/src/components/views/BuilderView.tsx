// gui/src/components/views/BuilderView.tsx

import React from 'react';
import FileEditor from '../FileEditor';
import type { Workbench } from '../Simulator/useWorkbench';

const BuilderView: React.FC<{ wb: Workbench }> = ({ wb }) => {
  const {
    isDarkMode, c, scsMode, builderCheckedFiles, loadFileTree, uncheckBuilderFile, builderSessionMetas,
    handleBuilderSessionUpdate, builderAutoEditKey
  } = wb;
  return (

          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <FileEditor
              isDarkMode={isDarkMode} c={c}
              scsMode={scsMode}
              controlledFiles={builderCheckedFiles}
              onReloadTree={loadFileTree}
              onUncheckedFile={uncheckBuilderFile}
              preloadedMetas={builderSessionMetas}
              onSessionModelUpdate={handleBuilderSessionUpdate}
              autoEditKey={builderAutoEditKey}
            />
          </div>
        
  );
};

export default BuilderView;
