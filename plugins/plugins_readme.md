# Plugins 目录规范

## 结构规则
- 支持1-2层目录
- 插件必须包含 `manifest.yaml`
- 超过2层会被忽略

## 推荐分类
plugins/
├── preprocessors/    # 预处理
├── optimizers/       # 优化算法
├── exporters/        # 数据导出
└── visualizers/      # 可视化

## 示例
plugins/
└── optimizers/
    └── pymoo_plugin/
        ├── manifest.yaml
        ├── backend.py
        └── frontend.tsx
