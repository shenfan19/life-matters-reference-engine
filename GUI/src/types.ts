// GUI/src/types.ts
import React from 'react';

export interface ModelFile {
    key: string;
    title: string;
    name: string;
    path: string;
    folder?: string;
    content?: any;
    metadata?: any;
    variables?: any;
    formulas?: any;
    simulator?: any;
    optimizer?: any;
    validated?: boolean;
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
    subPage?: string;
    selectedModel?: ModelFile | null;
    state: SimulationState;
    setState: React.Dispatch<React.SetStateAction<SimulationState>>;
}

export interface OptimizerProps {
    subPage?: string;
    selectedModel?: ModelFile | null;
    state: OptimizerState;
    setState: React.Dispatch<React.SetStateAction<OptimizerState>>;
}
