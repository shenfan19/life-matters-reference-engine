// src/frontend/src/core/types.ts
// Plugin-system type definitions

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  category: string;
  author?: string;
  description?: string;
  ui: {
    type: 'none' | 'schema' | 'component';
    schema?: SchemaDefinition;
    component_path?: string;
  };
  backend?: {
    entry: string;
    class: string;
  };
}

export interface SchemaDefinition {
  title?: string;
  inputs?: SchemaField[];
  outputs?: SchemaField[];
}

export interface SchemaField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'checkbox' | 'select' | 'textarea';
  required?: boolean;
  default?: any;
  options?: string[];
}

export interface PluginRunRequest {
  inputs: Record<string, any>;
  config?: Record<string, any>;
}

export interface PluginRunResponse {
  success: boolean;
  outputs?: Record<string, any>;
  ui_data?: Record<string, any>;
  error?: string;
}