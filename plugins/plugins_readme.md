# Plugins Directory Convention

## Structure rules
- Supports 1-2 levels of directories
- A plugin must include a `manifest.yaml`
- Anything beyond 2 levels deep is ignored

## Recommended categories
plugins/
├── preprocessors/    # preprocessing
├── optimizers/       # optimization algorithms
├── exporters/        # data export
└── visualizers/      # visualization

## Example
plugins/
└── optimizers/
    └── pymoo_plugin/
        ├── manifest.yaml
        ├── backend.py
        └── frontend.tsx
