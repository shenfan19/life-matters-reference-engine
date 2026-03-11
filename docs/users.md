# Users 模块说明 (User Data & Saves)

## 功能说明
`users/` 目录是 `LifeMatters` 中各用户的个人工作区，存放用户个人设置、游戏存档以及优化任务历史数据。设计保证了多用户环境下数据互相隔离。

## 目录结构

```
users/
├── template/                          # 创建新用户时复制此模板
│   ├── user_settings.json
│   ├── simulation/
│   └── optimization/
│
├── user_sample/                       # 示例用户（内含演示存档）
│   ├── user_settings.json             # 用户级别设置（语言、图表偏好等）
│   ├── simulation/                    # 游戏体验存档
│   │   ├── [存档名称_1]/              # 例如：my_first_game, hardcore_run
│   │   │   ├── simulator_state.json   # 当前状态（变量快照、回合数、手牌）
│   │   │   ├── game_config.json       # 该存档的游戏设置（MOD 列表、难度）
│   │   │   ├── input_scenario.json    # 仿真初始条件定义
│   │   │   ├── output_data/           # 仿真输出原始数据（时间序列、事件日志）
│   │   │   └── reports/              # 仿真报告（HTML 或图表输出）
│   │   └── [存档名称_2]/
│   │       └── ...
│   ├── optimization/                  # 参数优化任务数据
│   │   ├── [任务名称_1]/              # 例如：resource_efficiency_opt
│   │   │   ├── input_params.json      # 优化任务的输入参数定义
│   │   │   ├── output_results/        # 优化结果（图表数据、统计报告）
│   │   │   ├── simulation_logs/       # 优化过程中每次仿真的详细日志
│   │   │   └── run_configs/           # 每次运行的配置快照
│   │   └── [任务名称_2]/
│   │       └── ...
│
└── user_simulator/                    # 后台批量仿真专用（无存档，只跑结果）
```

## 关键文件说明

### user_settings.json
```json
{
  "language": "zhhans",
  "theme": "dark",
  "default_output_format": "csv",
  "chart_preferences": {
    "x_axis": "time",
    "variables_shown": ["health", "money"]
  }
}
```

### simulator_state.json（存档格式）
```json
{
  "story_id": "stories/marie_curie",
  "turn": 12,
  "timestamp": "2026-03-11T14:00:00Z",
  "state_variables": {
    "health": 72.5,
    "money": 130.0,
    "radiation": 45.0,
    "research_progress": 88.0
  },
  "hand": ["rest", "grant_application"]
}
```

## 典型工作流

```bash
# 1. 从模板创建新研究/游戏区
cp -r users/template users/my_study

# 2. 修改初始条件（可选）
# 编辑 users/my_study/simulation/run1/input_scenario.json

# 3. 运行仿真（CLI 方式）
python sim_engine/src/simulator_cli.py --user my_study --story marie_curie --save run1

# 4. 查看结果
# 打开 users/my_study/simulation/run1/reports/
```

## 注意事项
- **版本控制**：`users/` 目录（除 `template/`）应加入 `.gitignore`，保护用户隐私。
- **Web 多用户**：每个登录账号对应 `users/` 下一个子目录，由后端鉴权隔离。
- **数据安全**：请勿直接手动修改存档文件，否则可能导致仿真状态不一致。
