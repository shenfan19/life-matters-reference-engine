# 用户数据目录
本目录包含 `Life_Matters` 中所有注册用户的独立数据。每个子文件夹代表一个用户档案，以用户的唯一 ID 或名称命名。

## 目录结构示例
users/
├── user_sample/
│   ├── user_settings.json       # 该用户通用设置
│   ├── simulation/        # 游戏体验存档
│   │   ├── [存档名称_1]/           # 例如：my_first_game, hardcore_run
│   │   │   ├── save_data.sav        # 游戏存档二进制/JSON文件
│   │   │   ├── player_state.json    # 玩家角色当前状态 (库存、技能、位置等)
│   │   │   ├── game_config.json     # 该存档的特定游戏设置 (例如：难度、世界种子、MOD列表)
│       │   ├── input_scenario.json        # 仿真输入场景或初始条件定义
│       │   ├── output_data/               # 仿真输出原始数据 (时间序列、事件日志)
│       │   ├── simulation_metadata.json   # 仿真运行的元数据 (时间、参数快照、模型版本)
│       │   └── reports/                   # 仿真报告 (PDF、HTML 或其他可视化输出)
│   │   └── [存档名称_2]/
│   │       └── ...
│   ├── optimization/      # 参数优化任务数据
│   │   ├── [任务名称_1]/           # 例如：resource_efficiency_opt, population_growth_opt
│   │   │   ├── input_params.json         # 优化任务的输入参数定义
│   │   │   ├── output_results/           # 优化结果 (图表数据、统计报告等)
│   │   │   ├── simulation_logs/          # 优化过程中每次仿真的详细日志
│   │   │   └── run_configs/              # 每次优化运行的具体配置快照
│   │   └── [任务名称_2]/
│   │       └── ...
└── user_player/
└── ...

### 管理用户数据
* **切换用户**：在应用程序内部的用户管理界面中，您可以选择或登录不同的用户档案。
* **备份/删除用户数据**：可以直接复制或删除对应的 `user_[user_id]` 文件夹来备份或删除该用户的所有数据。
* **重置用户设置**：删除 `user_[user_id]/user_settings.json` 文件将导致该用户的设置恢复为默认值。

**警告**：请勿直接手动修改此目录下的文件，除非您完全了解其结构和作用，否则可能导致数据损坏或丢失。

## 额外提示
* **占位符替换**：记得将 `[应用程序名称]`、`[版本号]`、`[你的GitHub用户名]`、`[许可证类型]` 以及所有 `链接到你的 Issue Tracker` 等占位符替换为你的实际项目信息。
* **`requirements.txt`**：在 `dev_setup.md` 中提到了 `requirements.txt`。确保在项目根目录创建此文件，列出所有 Python 依赖：
    ```
    # requirements.txt
    pygame
    numpy
    pandas
    # ... 其他项目依赖
    ```
* **README 的动态性**：这些 README 只是初稿。随着项目的发展，你可能需要不断更新它们，以反映最新的功能、变化和最佳实践。
* **MOD API**：`mods/example_mod_1/mod.py` 中的 `game_api` 只是一个概念。你需要在 `src/mods/mod_loader.py` 或 `src/core/mod_api.py` 中实际实现这些 `add_item`、`add_recipe` 等接口，供 MOD 调用。

# 用户工作区
## ⚙️ 典型工作流
1. 复制模板：
   ```bash
   cp -r users/template users/my_study
   ```
2. 修改参数：
   ```json
   {
     "model": "black_death",
     "params": {"infection_rate": 0.3}
   }
   ```
