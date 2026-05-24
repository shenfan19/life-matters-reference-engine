// GUI/src/types.ts
import React from 'react';

import type { DataNode as AntDataNode } from 'antd/es/tree';

export interface DataNode extends AntDataNode {
    titleStr?: string;
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

export interface SimPlan {
  id: string;
  label: string;
  color: string;
  inputEvents: InputEvent[];
}

export interface PlanResult {
  id: string;
  label: string;
  color: string;
  data: SimulationDataPoint[];
  runsData: SimulationDataPoint[][];
  running?: boolean;
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
    mcSeed: number | null;  // 用户设定的 MC seed（null=每次随机，整数=固定可复现）
    sessionSeed: number;    // 本次 session 实际使用的 seed（由 API 返回）
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
}

// Decision variable entry for the optimizer (T1–T4).
// Separate from InputEvent: has valueBounds instead of value, plus all Tier controls.
export interface OptInput {
  id: string;
  variable: string;
  label: string;
  // T1: value bounds (always required)
  valueBounds: [number, number];
  // Fixed time or T2 time window
  time: string;              // "HH:MM" default/fixed time
  timeEnabled: boolean;
  timeWindow?: string;       // T2: "HH:MM~HH:MM"
  optStep?: string;          // T2: "1h" | "15min"
  optimizeTime: boolean;     // T2 active
  // Fixed days or T3 pattern
  daysEnabled: boolean;
  days: boolean[];           // 7-element mask Mon–Sun
  daysOptions?: string[][];  // T3: candidate patterns
  optimizeDays: boolean;     // T3 active
  // Fixed valid range or T4 date window
  validRangeEnabled: boolean;
  validStart: string;
  validEnd: string;
  dateStartWindow?: string;  // T4: "YYYY-MM-DD~YYYY-MM-DD"
  optimizeDateStart: boolean;
  dateEndWindow?: string;    // T4b
  optimizeDateEnd: boolean;
}

// Per-model user session: preserved across model switches, persisted to localStorage.
// Covers everything the user edits after first load; NOT the YAML model structure itself.
export interface ModelSession {
  inputEvents: InputEvent[];
  plans: SimPlan[];
  activePlanId: string;
  simStartDate: string;
  simEndDate: string;
  stepValue: number;
  stepUnit: StepUnit;
  objectives: Array<{ variable: string; direction: 'minimize' | 'maximize' }>;
  constraints: Array<{ variable: string; op: '≤' | '≥'; value: number }>;
  optAlgo: 'NSGA-II' | 'MOEA/D' | 'l-bfgs-b' | 'nelder-mead';
  optPop: number;
  optGen: number;
  optResult: any;
  optInputs: OptInput[];        // decision variables for optimizer
  optBackgrounds: InputEvent[]; // fixed background inputs for optimizer evaluation
}

export interface OptimizerProps {
    selectedModel: ModelFile | null;
    state: OptimizerState;
    setState: React.Dispatch<React.SetStateAction<OptimizerState>>;
    isLocked: boolean;
    isDarkMode: boolean;
    fontSize?: number;
}
