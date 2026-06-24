// useFileTree.ts — model file tree loading + selection
//
// Owns: treeLoading, selectedKey, runningModelKey
// Receives: storyTree setters/props from App, t
// Returns: tree/content loading + selection handlers
//
// Does NOT know about session/builder models (gui's "recently imported YAML"
// cache) — that's useBuilderState.ts, which consumes loadFileContent/setSelectedKey
// from here to resolve session-backed keys (navigateToRunning/reloadFromYAML).

import { useState } from 'react';
import { message } from 'antd';
import type { Dispatch, SetStateAction } from 'react';
import type { DataNode, ModelFile } from '../../types';
import { API_BASE, readSP } from '../sim_tab/simUtils';

interface UseFileTreeParams {
  storyTree: DataNode[];
  setStoryTree: (tree: DataNode[]) => void;
  setExpandedKeys: Dispatch<SetStateAction<React.Key[]>>;
  setLoadedModels: Dispatch<SetStateAction<Record<string, ModelFile>>>;
  setConfirmedModel: (model: ModelFile | null) => void;
  onModelSelect: (model: ModelFile | null) => void;
  setCenterTab: (tab: 'intro' | 'simulation' | 'optimization' | 'builder') => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function useFileTree({
  storyTree, setStoryTree, setExpandedKeys, setLoadedModels,
  setConfirmedModel, onModelSelect, setCenterTab, t,
}: UseFileTreeParams) {
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => readSP()?.selectedKey || null);
  const [runningModelKey, setRunningModelKey] = useState<string | null>(null);

  const loadFileTree = async () => {
    setTreeLoading(true);
    try {
      const result = await fetch(`${API_BASE}/files`).then(r => r.json());
      if (result.success) {
        const convert = (items: any[]): DataNode[] => items.map(item => {
          const titleStr = item.type === 'file' ? item.title.replace(/\.ya?ml$/, '') : item.title;
          if (item.type === 'folder' && item.children?.length === 1) {
            const child = item.children[0];
            if (child.type === 'file' && (child.title === 'model.yaml' || child.title === 'model.yml')) {
              return {
                key: child.key, isLeaf: true, ...child,
                title: item.title, titleStr: item.title,
              };
            }
          }
          return {
            title: item.type === 'file' ? titleStr : item.title,
            key: item.key,
            isLeaf: item.type === 'file',
            children: item.children ? convert(item.children) : undefined,
            titleStr,
          };
        });
        const modelsNode = result.data.find((n: any) => n.key === 'models');
        if (modelsNode?.children) {
          setStoryTree(convert(modelsNode.children));
        }
      }
    } catch (e: any) {
      message.error(`${t('sim.msg.load_failed')}: ${e.message}`);
    } finally {
      setTreeLoading(false);
    }
  };

  const loadFileContent = async (filePath: string, opts: { preserveTab?: boolean } = {}): Promise<ModelFile | null> => {
    setTreeLoading(true);
    try {
      const cleanPath = filePath.replace(/^models\//, '');
      const fileResult = await fetch(`${API_BASE}/file/${cleanPath}`).then(r => r.json());
      if (!fileResult.success) { message.error(`${t('sim.msg.read_failed')}: ${fileResult.error}`); return null; }
      const { content, path } = fileResult.data;
      const folder = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : undefined;
      const modelName = path.split('/').pop()?.replace(/\.ya?ml$/i, '') || content.metadata?.name || 'unknown';
      let resolvedContent = content;
      try {
        const qs = folder ? `?folder=${encodeURIComponent(folder)}` : '';
        const res = await fetch(`${API_BASE}/models/${encodeURIComponent(modelName)}${qs}`);
        const resolved = await res.json();
        if (resolved?.success && resolved.data) {
          resolvedContent = {
            ...content,
            ...resolved.data,
            metadata: { ...content.metadata, ...resolved.data.metadata },
          };
        } else if (!res.ok) {
          console.warn('Model resolution failed:', resolved?.detail || 'unknown error');
        }
      } catch (e) {
        console.warn('Resolved model load failed, using raw YAML', e);
      }
      const model: ModelFile = {
        key: filePath, title: resolvedContent.metadata?.name || modelName,
        path: filePath, type: resolvedContent.type, category: resolvedContent.category,
        content: resolvedContent, rawContent: content, metadata: resolvedContent.metadata, variables: resolvedContent.variables,
        formulas: resolvedContent.formulas, simulator: resolvedContent.simulator,
        optimizer: resolvedContent.optimizer, imports: resolvedContent.imports,
        provenance: resolvedContent.provenance,
        folder,
        validated: undefined, validationErrors: [],
      };
      setLoadedModels(prev => ({ ...prev, [filePath]: model }));
      setConfirmedModel(model);
      onModelSelect(model);
      if (!opts.preserveTab) setCenterTab('intro');
      return model;
    } catch (e: any) {
      message.error(`${t('sim.msg.load_failed')}: ${e.message}`);
      return null;
    } finally {
      setTreeLoading(false);
    }
  };

  const handleSelect = (keys: React.Key[]) => {
    if (!keys.length) return;
    const key = keys[0] as string;
    if (!key.endsWith('.yaml') && !key.endsWith('.yml')) return;
    if (key === selectedKey) return;
    setSelectedKey(key);
    loadFileContent(key, { preserveTab: true });
  };

  const toggleTreeNode = (key: React.Key) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return [...next];
    });
  };

  const handleTreeNodeClick = (_event: React.MouseEvent, node: DataNode) => {
    if (!node.isLeaf) toggleTreeNode(node.key);
  };

  const countLeaves = (nodes: DataNode[]): number => {
    let n = 0;
    nodes.forEach(node => { if (node.isLeaf) n++; else if (node.children) n += countLeaves(node.children); });
    return n;
  };
  const total = countLeaves(storyTree);

  return {
    treeLoading, selectedKey, setSelectedKey, runningModelKey, setRunningModelKey,
    loadFileTree, loadFileContent, handleSelect, handleTreeNodeClick,
    total,
  };
}
