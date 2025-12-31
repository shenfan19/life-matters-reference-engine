export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  category: string;
  ui: {
    type: 'none' | 'schema' | 'component';
    schema?: any;
    component_path?: string;
  };
}
