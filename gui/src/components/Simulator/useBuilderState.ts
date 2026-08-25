// useBuilderState.ts — builder-mode dialogs (merge/new-file/upload/import) + session model cache
//
// Owns: builderCheckedFiles, builderSessionMetas, builderAutoEditKey, mergeDialogOpen,
//   mergeOutPath, newFileDialogOpen, newFilePath, merging, creatingFile, sessionModels
// Receives: builderOpen/setBuilderOpen + centerTab/prevTabRef (owned by parent, since
//   switchCenterTab needs builderOpen before this hook can run), file-tree handles
//   (loadFileTree/loadFileContent/setSelectedKey), session handles (clearSession/
//   sessionReadyRef/sessionEditedRef), export-import reset handles, scsMode, t
// Returns: builder dialog state + handlers, sessionModels, reloadFromYAML,
//   navigateToRunning, blockIfRunning, runningModelTitle

import { useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { message, Modal } from 'antd';
import type { ModelFile } from '../../types';
import type { ImportedSimRun } from './useExportImport';
import { API_BASE } from '../sim_tab/simUtils';

type CenterTab = 'intro' | 'simulation' | 'optimization' | 'builder';

interface UseBuilderStateParams {
  scsMode: boolean;
  centerTab: CenterTab;
  setCenterTab: (tab: CenterTab) => void;
  prevTabRef: MutableRefObject<CenterTab>;
  builderOpen: boolean;
  setBuilderOpen: (open: boolean) => void;
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;
  runningModelKey: string | null;
  loadedModels: Record<string, ModelFile>;
  setConfirmedModel: (model: ModelFile | null) => void;
  onModelSelect: (model: ModelFile | null) => void;
  loadFileTree: () => Promise<void>;
  loadFileContent: (filePath: string, opts?: { preserveTab?: boolean }) => Promise<ModelFile | null>;
  clearSession: (key: string) => void;
  sessionReadyRef: MutableRefObject<boolean>;
  sessionEditedRef: MutableRefObject<boolean>;
  setImportedSimRuns: Dispatch<SetStateAction<ImportedSimRun[]>>;
  simRunCounterRef: MutableRefObject<number>;
  importFileRef: MutableRefObject<HTMLInputElement | null>;
  builderUploadRef: MutableRefObject<HTMLInputElement | null>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const SESSION_KEY = 'lm_session_imports';

export function useBuilderState({
  scsMode, centerTab, setCenterTab, prevTabRef, builderOpen, setBuilderOpen,
  selectedKey, setSelectedKey, runningModelKey, loadedModels,
  setConfirmedModel, onModelSelect, loadFileTree, loadFileContent,
  clearSession, sessionReadyRef, sessionEditedRef,
  setImportedSimRuns, simRunCounterRef, importFileRef, builderUploadRef, t,
}: UseBuilderStateParams) {
  const [sessionModels, setSessionModels] = useState<ModelFile[]>(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || '[]'); } catch { return []; }
  });
  const saveSession = (models: ModelFile[]) => {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(models)); } catch {}
  };

  const [builderCheckedFiles, setBuilderCheckedFiles] = useState<string[]>([]);
  const [builderSessionMetas, setBuilderSessionMetas] = useState<Record<string, any>>({});
  const [builderAutoEditKey, setBuilderAutoEditKey] = useState<string | undefined>();
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeOutPath, setMergeOutPath] = useState('models/scenarios/merged.yaml');
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [merging, setMerging] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);
  const [splitting, setSplitting] = useState(false);

  const openBuilder = () => {
    prevTabRef.current = centerTab === 'builder' ? 'intro' : centerTab;
    setBuilderOpen(true);
    setCenterTab('builder');
  };

  const closeBuilder = () => {
    setBuilderOpen(false);
    setBuilderCheckedFiles([]);
    setCenterTab(prevTabRef.current);
    loadFileTree(); // reload tree after edits
  };

  const handleBuilderSessionUpdate = (key: string, content: any) => {
    const filename = key.replace(/^session\//, '');
    const modelName = content?.metadata?.name || filename.replace(/\.ya?ml$/i, '');
    const model: ModelFile = {
      key, title: modelName, path: key,
      type: content.type, category: content.category,
      content, rawContent: content,
      metadata: content.metadata, variables: content.variables,
      equations: content.equations, simulator: content.simulator,
      optimization: content.optimization, imports: content.imports,
      folder: 'session', validated: undefined, validationErrors: [],
    };
    setBuilderSessionMetas(p => ({ ...p, [key]: content }));
    setBuilderCheckedFiles(prev => prev.includes(key) ? prev : [...prev, key]);
    setBuilderAutoEditKey(key);
    setSessionModels(prev => {
      const next = [model, ...prev.filter(m => m.key !== key)].slice(0, 10);
      saveSession(next);
      return next;
    });
  };

  const uncheckBuilderFile = (key: string) => {
    setBuilderCheckedFiles(prev => prev.filter(k => k !== key));
  };

  const toggleBuilderFile = (key: string) => {
    setBuilderCheckedFiles(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      // For session keys, ensure content is in builderSessionMetas
      if (key.startsWith('session/')) {
        const sm = sessionModels.find(m => m.key === key);
        if (sm) setBuilderSessionMetas(p => ({ ...p, [key]: sm.rawContent || sm.content }));
      }
      return [...prev, key];
    });
  };

  const handleMerge = async () => {
    setMerging(true);
    try {
      const r = await fetch('/api/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: builderCheckedFiles, output_path: mergeOutPath }),
      });
      const d = await r.json();
      if (!d.success) { message.error(`${t('sim.msg.merge_failed')}: ${d.detail || d.error || ''}`); return; }

      if (d.scs_mode && d.raw) {
        // SCS mode: load merged content as a session model
        const raw = d.raw;
        const baseName = (mergeOutPath.trim() || 'merged').replace(/\.ya?ml$/i, '').replace(/[^a-zA-Z0-9_\-.]/g, '_');
        const filename = `${baseName}.yaml`;
        const modelKey = `session/${filename}`;
        const modelName = raw?.metadata?.name || filename.replace(/\.ya?ml$/i, '');
        const model: ModelFile = {
          key: modelKey, title: modelName, path: modelKey,
          type: raw.type, category: raw.category,
          content: raw, rawContent: raw,
          metadata: raw.metadata, variables: raw.variables,
          equations: raw.equations, simulator: raw.simulator,
          optimization: raw.optimization, imports: raw.imports,
          folder: 'session', validated: undefined, validationErrors: [],
        };
        setSelectedKey(modelKey);
        setBuilderSessionMetas(p => ({ ...p, [modelKey]: d.raw }));
        setBuilderCheckedFiles(prev => prev.includes(modelKey) ? prev : [...prev, modelKey]);
        setBuilderAutoEditKey(modelKey);
        openBuilder();
        setSessionModels(prev => {
          const next = [model, ...prev.filter(m => m.key !== modelKey)].slice(0, 10);
          saveSession(next);
          return next;
        });
        message.success(t('sim.msg.merge_done_editor'));
      } else {
        message.success(t('sim.msg.merge_done'));
        loadFileTree();
      }
      setMergeDialogOpen(false);
    } catch (e: any) { message.error(String(e)); }
    finally { setMerging(false); }
  };

  // Split a single selected file into its component YAML files
  // (backend /api/split, models/components/splitted_<name>/). Disabled in SCS
  // mode at the call site — the backend endpoint unconditionally 403s under
  // SCS_MODE (app_state.check_write()), unlike merge there is no "return raw
  // content for a session model" fallback because split fans out into N files,
  // not one, so there is nothing sensible to hand back to the browser.
  const handleSplit = async () => {
    if (builderCheckedFiles.length !== 1) return;
    setSplitting(true);
    try {
      const r = await fetch('/api/split', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: builderCheckedFiles[0] }),
      });
      const d = await r.json();
      if (!d.success) { message.error(`${t('sim.msg.split_failed')}: ${d.detail || d.error || ''}`); return; }
      message.success(t('sim.msg.split_done', { n: d.data?.files?.length ?? 0 }));
      loadFileTree();
    } catch (e: any) { message.error(String(e)); }
    finally { setSplitting(false); }
  };

  const handleCreateFile = async () => {
    if (!newFilePath.trim()) { message.warning(t('sim.msg.name_required')); return; }
    const rawName = newFilePath.trim();
    if (scsMode) {
      const safeName = rawName.replace(/[^a-zA-Z0-9_\-.]/g, '_').replace(/\.ya?ml$/i, '');
      const key = `session/${safeName}.yaml`;
      const template = {
        metadata: { name: safeName, version: '1.0', description: '', tags: [] },
        variables: {}, equations: {},
        simulation: { start_date: '', end_date: '' },
      };
      handleBuilderSessionUpdate(key, template);
      setBuilderAutoEditKey(key);
      openBuilder();
      setNewFileDialogOpen(false);
      setNewFilePath('');
      message.success(t('sim.msg.session_model_created'));
      return;
    }
    let path = rawName;
    if (!path.endsWith('.yaml') && !path.endsWith('.yml')) path += '.yaml';
    setCreatingFile(true);
    try {
      const r = await fetch('/api/file-new', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, template: 'model' }),
      });
      const d = await r.json();
      if (d.success) {
        message.success(t('sim.msg.file_created'));
        setNewFileDialogOpen(false);
        setNewFilePath('');
        loadFileTree();
      } else message.error(`${t('sim.msg.create_failed')}: ${d.detail || ''}`);
    } catch (e: any) { message.error(String(e)); }
    finally { setCreatingFile(false); }
  };

  const reloadFromYAML = () => {
    if (!selectedKey) return;
    clearSession(selectedKey);
    sessionReadyRef.current = false;
    sessionEditedRef.current = false;
    setImportedSimRuns([]);
    simRunCounterRef.current = 0;
    if (selectedKey.startsWith('session/')) {
      const sessModel = sessionModels.find(m => m.key === selectedKey);
      if (sessModel) { setConfirmedModel({ ...sessModel }); onModelSelect({ ...sessModel }); }
    } else {
      loadFileContent(selectedKey, { preserveTab: true });
    }
  };

  const handleBuilderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!builderUploadRef.current) return;
    builderUploadRef.current.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const resp = await fetch(`${API_BASE}/model/upload-temp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, filename: file.name }),
      });
      const data = await resp.json();
      if (!data.success) { message.error(data.error || t('sim.msg.upload_failed')); return; }
      const content = { ...data.raw, ...data.resolved };
      const key = `session/${data.filename}`;
      handleBuilderSessionUpdate(key, content);
      setBuilderAutoEditKey(key);
      openBuilder();
      message.success(t('sim.msg.uploaded_to_session', { name: data.filename }));
    } catch (err: any) { message.error(err.message || t('sim.msg.read_file_failed')); }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!importFileRef.current) return;
    importFileRef.current.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const resp = await fetch(`${API_BASE}/model/upload-temp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, filename: file.name }),
      });
      const data = await resp.json();
      if (!data.success) { message.error(data.error || t('sim.msg.import_failed')); return; }

      // Backend resolved imports inline and deleted the temp file.
      // Build ModelFile directly from response — no second server call needed.
      const raw = data.raw || {};
      const resolved = data.resolved || {};
      const content = { ...raw, ...resolved };
      const modelKey = `session/${data.filename}`;
      const modelName = content.metadata?.name || data.filename.replace(/\.ya?ml$/i, '');

      const model: ModelFile = {
        key: modelKey, title: modelName, path: modelKey,
        type: content.type, category: content.category,
        content, rawContent: raw,
        metadata: content.metadata, variables: content.variables,
        equations: content.equations, simulator: content.simulator,
        optimization: content.optimization, imports: content.imports,
        provenance: content.provenance,
        folder: 'session',
        validated: undefined, validationErrors: [],
      };

      const rawImports = raw?.imports;
      if (!resolved?.resolved && Array.isArray(rawImports) && rawImports.length > 0) {
        message.warning(t('sim.msg.import_unresolved'));
      }

      setSelectedKey(modelKey);
      setConfirmedModel(model);
      onModelSelect(model);
      setCenterTab('intro');
      setSessionModels(prev => {
        const next = [model, ...prev.filter(m => m.key !== modelKey)].slice(0, 10);
        saveSession(next);
        return next;
      });
      message.success(t('sim.msg.imported_file', { name: data.filename }));
    } catch (err: any) { message.error(err.message || t('sim.msg.read_file_failed')); }
  };

  const selectSessionModel = (model: ModelFile) => {
    if (builderOpen) {
      const content = model.rawContent || model.content;
      setBuilderSessionMetas(p => ({ ...p, [model.key]: content }));
      setBuilderCheckedFiles(prev => prev.includes(model.key) ? prev : [...prev, model.key]);
      setBuilderAutoEditKey(model.key);
    } else {
      setSelectedKey(model.key);
      setConfirmedModel(model);
      onModelSelect(model);
      setCenterTab('intro');
    }
  };

  const clearSessionModel = (key: string) => {
    setSessionModels(prev => {
      const next = prev.filter(m => m.key !== key);
      saveSession(next);
      return next;
    });
    if (selectedKey === key) { setSelectedKey(null); setConfirmedModel(null); onModelSelect(null); }
  };

  const runningModelTitle = runningModelKey
    ? (sessionModels.find(m => m.key === runningModelKey)?.title
      || loadedModels[runningModelKey]?.title
      || runningModelKey.split('/').pop()?.replace(/\.ya?ml$/i, '') || runningModelKey)
    : null;

  const navigateToRunning = () => {
    if (!runningModelKey) return;
    const sessModel = sessionModels.find(m => m.key === runningModelKey);
    if (sessModel) {
      setSelectedKey(sessModel.key);
      setConfirmedModel(sessModel);
      onModelSelect(sessModel);
      setCenterTab('intro');
    } else {
      setSelectedKey(runningModelKey);
      loadFileContent(runningModelKey, { preserveTab: true });
    }
  };

  const blockIfRunning = (): boolean => {
    if (!scsMode || !runningModelKey || runningModelKey === selectedKey) return false;
    Modal.confirm({
      title: t('sim.run.blocked_title'),
      content: t('sim.run.blocked_content'),
      okText: t('sim.run.goto_running'),
      cancelText: t('sim.control.cancel') || '取消',
      onOk: navigateToRunning,
    });
    return true;
  };

  return {
    sessionModels,
    builderCheckedFiles, builderSessionMetas, builderAutoEditKey,
    mergeDialogOpen, setMergeDialogOpen, mergeOutPath, setMergeOutPath,
    newFileDialogOpen, setNewFileDialogOpen, newFilePath, setNewFilePath,
    merging, creatingFile, splitting,
    openBuilder, closeBuilder, handleBuilderSessionUpdate, toggleBuilderFile, uncheckBuilderFile,
    handleMerge, handleSplit, handleCreateFile, handleBuilderUpload, handleImportFile,
    reloadFromYAML, navigateToRunning, blockIfRunning, runningModelTitle,
    selectSessionModel, clearSessionModel,
  };
}
