// GUI/src/types.ts
import React from 'react';

import type { DataNode as AntDataNode } from 'antd/es/tree';

export interface DataNode extends AntDataNode {
    titleStr?: string;
    model_type?: string;
    path?: string;
    isLeaf?: boolean;
    displayTitle?: string;
}

export interface LoaderProps {
    subPage: string;
    onModelSelect: (model: ModelFile | null) => void;
    confirmedModel: ModelFile | null;
    setConfirmedModel: (model: ModelFile | null) => void;
    modelTree: DataNode[];
    setModelTree: (tree: DataNode[]) => void;
    storyTree: DataNode[];
    setStoryTree: (tree: DataNode[]) => void;
    expandedKeys: React.Key[];
    setExpandedKeys: React.Dispatch<React.SetStateAction<React.Key[]>>;
    modelViewMode: 'tree' | 'list';
    setModelViewMode: (mode: 'tree' | 'list') => void;
    storyViewMode: 'tree' | 'list';
    setStoryViewMode: (mode: 'tree' | 'list') => void;
    modelFilter: string;
    setModelFilter: (filter: string) => void;
    storyFilter: string;
    setStoryFilter: (filter: string) => void;
    modelSort: 'name' | 'type';
    setModelSort: (sort: 'name' | 'type') => void;
    storySort: 'name' | 'type';
    setStorySort: (sort: 'name' | 'type') => void;
    checkedModelKeys: React.Key[];
    setCheckedModelKeys: (keys: React.Key[]) => void;
    manualCheckedModelKeys: React.Key[];
    setManualCheckedModelKeys: (keys: React.Key[]) => void;
    checkedStoryKeys: React.Key[];
    setCheckedStoryKeys: (keys: React.Key[]) => void;
    loadedModels: Record<string, ModelFile>;
    setLoadedModels: (models: Record<string, ModelFile>) => void;
    isSimulating: boolean;
    isLocked: boolean;
    setIsLocked: (locked: boolean) => void;
    isDarkMode: boolean;
}

export interface ModelFile {
    key: string;
    title: string;
    path: string;
    type?: string;
    category?: string;
    metadata?: any;
    variables?: Record<string, any>;
    formulas?: Record<string, any>;
    simulator?: any;
    optimizer?: any;
    imports?: string[];
    validated?: boolean;
    validationErrors?: string[];
    patchFile?: string;
    content?: any;
    rawContent?: any;
    provenance?: any;
    folder?: string;
}

export type DurationUnit = 'year' | 'month' | 'day' | 'hour';
export type StepUnit = 'day' | 'hour' | 'minute' | 'second';

export interface SimulationDataPoint {
    step: number;
    time: number;
    [key: string]: number;
}

export interface SimulationState {
    status: 'idle' | 'running' | 'paused' | 'completed';
    progress: number;
    currentStep: number;
    totalSteps: number;
    simulationData: SimulationDataPoint[];
    dataPerRun: SimulationDataPoint[][];   // per-run trajectories for MC display
    inputParams: Record<string, number>;
    stateVariables: Record<string, number>;
    sessionId: string;
    simStartDate: string;   // 'YYYY-MM-DD'
    simEndDate: string;     // 'YYYY-MM-DD'
    stepValue: number;
    stepUnit: StepUnit;
    batchSize: number;
    updateInterval: number;
    simRuns: number;        // Monte Carlo 运行条数 (1~50)
    sessionSeed: number;    // session seed for reproducibility display
}

export interface OptimizerState {
    status: 'idle' | 'running' | 'paused' | 'completed';
    progress: number;
    currentStep: number;
    totalSteps: number;
    optimizationData: any[];
    inputParams: Record<string, number>;
    stateVariables: Record<string, number>;
    sessionId: string;
    simStartDate: string;
    simEndDate: string;
    stepValue: number;
    stepUnit: StepUnit;
    batchSize: number;
    updateInterval: number;
}

export interface SimulatorProps {
    selectedModel: ModelFile | null;
    state: SimulationState;
    setState: React.Dispatch<React.SetStateAction<SimulationState>>;
    isLocked: boolean;
    setIsLocked: (locked: boolean) => void;
    isDarkMode: boolean;
    // loader props (lifted from App)
    storyTree: DataNode[];
    setStoryTree: (tree: DataNode[]) => void;
    expandedKeys: React.Key[];
    setExpandedKeys: React.Dispatch<React.SetStateAction<React.Key[]>>;
    storyViewMode: 'tree' | 'list';
    setStoryViewMode: (mode: 'tree' | 'list') => void;
    storyFilter: string;
    setStoryFilter: (filter: string) => void;
    loadedModels: Record<string, ModelFile>;
    setLoadedModels: (models: Record<string, ModelFile> | ((prev: Record<string, ModelFile>) => Record<string, ModelFile>)) => void;
    setConfirmedModel: (model: ModelFile | null) => void;
    onModelSelect: (model: ModelFile | null) => void;
    simMode: 'sim' | 'opt';
    onSimModeChange: (mode: 'sim' | 'opt') => void;
    fontSize: number;
}

export interface InputEvent {
  id: string;
  variable: string;
  time: string;
  timeEnabled: boolean;
  value: number;
  label: string;
  daysEnabled: boolean;
  days: boolean[];
  validRangeEnabled: boolean;
  validStart: string;
  validEnd: string;
  optimizeValue: boolean;
  valueBounds: [number, number];
}

// ── Run history types ──────────────────────────────────────────────────────────

export interface RunMeta {
  id: string;
  type: 'sim' | 'opt';
  model_name: string;
  model_key: string;
  created_at: string;   // ISO 8601
  status: string;       // 'completed' | 'interrupted'
  label: string;
  sim_result_summary?: { n_points: number; n_runs: number; output_vars: string[] };
  opt_result_summary?: { n_solutions: number; method: string; elapsed: number };
  // sim_config is also present in meta (no large arrays)
  sim_config?: {
    start_date: string; end_date: string;
    step_value: number; step_unit: StepUnit;
    sim_runs: number; session_seed: number;
    input_events: InputEvent[];
  };
  opt_config?: {
    input_events: InputEvent[];
    objectives: Array<{ variable: string; direction: 'minimize' | 'maximize' }>;
    constraints: Array<{ variable: string; op: '≤' | '≥'; value: number }>;
    optimizer_override: any;
  };
}

export interface RunRecord extends RunMeta {
  sim_result?: {
    data: SimulationDataPoint[];
    data_per_run: SimulationDataPoint[][];
    output_vars: string[];
  };
  opt_result?: any;   // same shape as optResult state in Simulator
}

export interface OptimizerProps {
    selectedModel: ModelFile | null;
    state: OptimizerState;
    setState: React.Dispatch<React.SetStateAction<OptimizerState>>;
    isLocked: boolean;
    isDarkMode: boolean;
    fontSize?: number;
}
