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
export type StepUnit = 'day' | 'hour' | 'minute';

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
    optStepValue: number;
    optStepUnit: StepUnit;
    batchSize: number;
    updateInterval: number;
    simRuns: number;        // Monte Carlo 运行条数 (1~50)
    mcSeed: number | null;  // 用户设定的 MC seed（null=每次随机，整数=固定可复现）
    sessionSeed: number;    // 本次 session 实际使用的 seed（由 API 返回）
    // Opt 内层鲁棒优化 MC（optimizer.mc.runs/seed）——与上面 simRuns/mcSeed（simulation.mc）
    // 是两个独立概念，不共用同一份状态：simRuns/mcSeed 控制 Sim tab 结果里画几条轨迹，
    // optMcRuns/optMcSeed 控制 Opt 每个候选解在优化搜索时要采样几次取平均。参照
    // optStepValue/optStepUnit 与 stepValue/stepUnit 分离的既有模式。
    optMcRuns: number;
    optMcSeed: number | null;
}


export interface SimulatorProps {
    selectedModel: ModelFile | null;
    state: SimulationState;
    setState: React.Dispatch<React.SetStateAction<SimulationState>>;
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
  // Unified pulse/sustained interval (ADR 0100): [timeStart, timeEnd).
  // timeStart === timeEnd => pulse (fires once); otherwise => sustained
  // (incl. "00:00"~"24:00" = full day, just the full-width value of the
  // same interval, not a separate state).
  timeStart: string;
  timeEnd: string;
  value: number;
  label: string;
  daysEnabled: boolean;
  days: boolean[];
  validRangeEnabled: boolean;
  validStart: string;
  validEnd: string;
  // Opt fields — optional; default false/inactive
  // T1: optimize value
  optimizeValue?: boolean;
  valueBounds?: [number, number];
  // T2: optimize time_start (window = [start, end] HH:MM strings).
  // 1-dim by default: time_end follows at a fixed offset (= timeEnd - timeStart).
  optimizeTime?: boolean;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  timeStep?: string;
  // T2 (2-dim, ADR 0100): also search time_end independently within its own window.
  optimizeTimeEnd?: boolean;
  timeEndWindowStart?: string;
  timeEndWindowEnd?: string;
  // T3: optimize days (backend freely combines from pool)
  optimizeDays?: boolean;
  daysPool?: string[];
  daysNMin?: number;
  daysNMax?: number;
  // T4: optimize date range ([[startLo,startHi],[endLo,endHi]])
  optimizeDateRange?: boolean;
  dateStartLo?: string;
  dateStartHi?: string;
  dateEndLo?: string;
  dateEndHi?: string;
}

// Per-model user session: preserved across model switches, persisted to localStorage.
// Covers everything the user edits after first load; NOT the YAML model structure itself.
export interface ModelSession {
  inputEvents: InputEvent[];
  optInputEvents: InputEvent[];
  plans: SimPlan[];
  activePlanId: string;
  simStartDate: string;
  simEndDate: string;
  stepValue: number;
  stepUnit: StepUnit;
  optStepValue: number;
  optStepUnit: StepUnit;
  simRuns: number;
  mcSeed: number | null;
  optMcRuns: number;
  optMcSeed: number | null;
  objectives: Array<{ variable: string; direction: 'minimize' | 'maximize' }>;
  constraints: Array<{ variable: string; op: '≤' | '≥'; value: number }>;
  optAlgo: 'NSGA-II' | 'MOEA/D' | 'l-bfgs-b' | 'nelder-mead';
  optPop: number;
  optGen: number;
  optSeed?: number;
  optResult: any;
  // Live-process snapshot from the last completed run, restored into the
  // Process panel (Gen/Eval/Front/Feasible/Mean CV cards + trend charts) when
  // switching back to this model — optResult alone only covers the Front/
  // Solutions section, not "how the run got there".
  optHistory?: any[];
  optTotalGen?: number;
  optElapsed?: number;
  optMethod?: string;
  optLogs?: Array<{ t: number; msg: string }>;
  userEdited?: boolean;
}

