// frontend/src/types.ts
// LifeMatters 前端共享类型定义
// 创建日期: 2025-01-XX
// 作用: 统一前端组件间的类型定义，避免重复和类型不一致

// ==================== 模型相关类型 ====================

export interface ModelMetadata {
  name: string;
  version: string;
  author: string;
  description: string;
  tags: string[];
  conflicts: string[];
}

export interface Variable {
  description: string;
  value: number;
  unit?: string;
  type: 'state' | 'input' | 'parameter';
  bounds?: [number, number];
}

export interface Formula {
  description: string;
  condition?: string | boolean;
  priority: number;
  dynamics: Record<string, string>;
  formula?: string;
}

export interface SimulatorConfig {
  dt_unit?: string;
  step_size: number;      // 时间步长(秒)
  total_time: number;     // 总仿真时间(秒)
  output_format?: string;
  output_variables: string[];
  monitor_conditions?: string[];
  pause_every?: number;
}

export interface OptimizerConfig {
  method: string;
  targets_of_optimization: string[];
  variables_to_optimize: string[];
  duration?: number;
  pop_size?: number;
  n_gen?: number;
}

export interface ModelContent {
  metadata: ModelMetadata;
  variables: Record<string, Variable>;
  formulas: Record<string, Formula>;
  simulator?: SimulatorConfig;
  optimizer?: OptimizerConfig;
  imports?: string[];
}

export interface ModelFile {
  key: string;
  title: string;
  path: string;
  content?: ModelContent;  // Loader 确认后才有
  folder?: string;
  validated?: boolean;
  validationErrors?: string[];
  patchFile?: string;
}

// ==================== 仿真相关类型 ====================

export interface SimulationParams {
  model_name: string;
  folder?: string;
  time_hours: number;
  step_size: number;
  input_params: Record<string, number>;
  session_id?: string;
}

export interface VariableState {
  value: number;
  unit?: string;
  description?: string;
  type: string;
}

export interface SimulationSession {
  session_id: string;
  model_name: string;
  step_size: number;
  total_time: number;
  total_steps: number;
  initial_state: Record<string, VariableState>;
  output_variables: string[];
}

export interface SimulationDataPoint {
  step: number;
  time: number;
  [key: string]: number;  // 动态的输出变量
}

export interface SimulationStepResult {
  current_step: number;
  current_time: number;
  state: Record<string, VariableState>;
  output: SimulationDataPoint;
  formula_results?: Record<string, any>;
  completed: boolean;
  progress: number;
}

export interface SimulationRunResult {
  model_name: string;
  steps: number;
  time: number;
  csv_output: string;
  output_variables: string[];
  final_state: Record<string, VariableState>;
  simulation_data?: SimulationDataPoint[];
}

// ==================== API 响应类型 ====================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ==================== 组件 Props 类型 ====================

export interface LoaderProps {
  subPage: string;
  onModelSelect?: (model: ModelFile | null) => void;
}

export interface SimulatorProps {
  subPage: string;
  selectedModel: ModelFile | null;
}

export interface OptimizerProps {
  subPage: string;
  selectedModel: ModelFile | null;
}

export interface GeneratorProps {
  subPage: string;
}

// ==================== 合并/拆分相关类型 ====================

export interface MergeParams {
  model_names: string[];
  output_name: string;
}

export interface MergeResult {
  output_path: string;
  variables: number;
  formulas: number;
  message: string;
}

export interface SplitParams {
  file_path: string;
  output_dir: string;
}

export interface SplitResult {
  output_dir: string;
  files: string[];
  patch_file?: string;
  variables: number;
  formulas: number;
}

// ==================== 验证相关类型 ====================

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  patch_file?: string;
}
