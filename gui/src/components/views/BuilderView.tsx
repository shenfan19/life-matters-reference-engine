// gui/src/components/views/BuilderView.tsx
// The model editor. It works on the model library the core holds: the files ticked in the tree, the models of the
// session, and the call that reloads the tree after an edit.

import React from 'react';
import FileEditor from '../FileEditor';
import type { ViewDef } from './api';
import type { Core } from '../Simulator/useCore';
import { BuildOutlined } from '@ant-design/icons';

const BuilderView: React.FC<{ core: Core }> = ({ core }) => {
  const {
    isDarkMode, c, scsMode, builderCheckedFiles, loadFileTree, uncheckBuilderFile, builderSessionMetas,
    handleBuilderSessionUpdate, builderAutoEditKey,
  } = core;
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

export const view: ViewDef = {
  id: 'builder', labelKey: 'sim.builder.label', order: 40, component: BuilderView,
  icon: <BuildOutlined />,
};
