// GUI/src/types.ts
import React from 'react';

import type { DataNode as AntDataNode } from 'antd/es/tree';

export interface DataNode extends AntDataNode {
    titleStr?: string;
    mod_type?: string;
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
    setExpandedKeys: (keys: React.Key[]) => void;
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
    loadedMods: Record<string, ModelFile>;
    setLoadedMods: (mods: Record<string, ModelFile>) => void;
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
    inputParams: Record<string, number>;
    stateVariables: Record<string, number>;
    sessionId: string;
    timeValue: number;
    timeUnit: DurationUnit;
    stepValue: number;
    stepUnit: StepUnit;
    batchSize: number;
    updateInterval: number;
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
    timeValue: number;
    timeUnit: DurationUnit;
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
    setExpandedKeys: (keys: React.Key[]) => void;
    storyViewMode: 'tree' | 'list';
    setStoryViewMode: (mode: 'tree' | 'list') => void;
    storyFilter: string;
    setStoryFilter: (filter: string) => void;
    loadedMods: Record<string, ModelFile>;
    setLoadedMods: (mods: Record<string, ModelFile> | ((prev: Record<string, ModelFile>) => Record<string, ModelFile>)) => void;
    setConfirmedModel: (model: ModelFile | null) => void;
    onModelSelect: (model: ModelFile | null) => void;
    simMode: 'sim' | 'opt';
    onSimModeChange: (mode: 'sim' | 'opt') => void;
}

export interface OptimizerProps {
    selectedModel: ModelFile | null;
    state: OptimizerState;
    setState: React.Dispatch<React.SetStateAction<OptimizerState>>;
    isLocked: boolean;
    isDarkMode: boolean;
}
