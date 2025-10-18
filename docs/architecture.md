---
target: architecture 架构系统整体
---
>[!question]+ Task
>```dataviewjs
>const {fan_task} = await cJS();
>fan_task.fn_single_page(dv, 0);
>```
# 系统架构概览
本文档描述了 `LifeMatters` 的整体系统架构，包括其主要组件、模块及其之间的交互。

## 设计原则
1. 极致简单
    1. 科研用户可能不会电脑，要让他们易于将科研成果做成mod包
        - 需要做一个模块来自动化验证常规地科研结论。
    2. 体验用户可能不会电脑，要让他们启动游戏一样地感受过程
        - 可以极客化脚本输入，正常运行时，输入变量保持不变，会有外部变量影响模型，比如魂斗罗走过来的敌人
        - 可以控制输入变量，比如运行时敌人在靠近，我可以攻击或者远离
        - 变量的输入方法有多种，设置开关可以选择切换：
            - 为专家：可以数据文件输入，设定好一份数据文件进行自动读取作为输入更新
            - 为用户：可以GUI输入，比如flet上面的一个0-100的数据滑块进行输入，或者一个txt对话框输入数值数据
            - 放弃内存port输入，放弃命令行输入，无需像ROS那样开启仿真系统的端口。专业角度是数据文件重要，科普角度是用户便利重要，这两种PC高级功能可以放弃，学者和用户，都不是计算机专家
## 核心模块
## 技术栈
- **编程语言**：Python 3.x
- **主要库**：[列出你的主要库，例如 Pygame, NumPy, Pandas 等]

# 数据流分析
本文档详细描述了 `LifeMatters` 内部主要数据流，包括数据的生成、处理、存储和消费。

- 主要思想：模块化，公用变量有限度更新
- Scenary模块：
    - 输入：读取参数配置
    - 输出：各个模块的参数，mods列表
- Load Mods模块
    - 输入：读取模块表，各个模块数据
    - 输出：组合动力学模型，初始组合变量表
- Generator
- Validator
- simulator模块
    - 输入：组合动力学模型，初始组合变量表，每步更新变量表
    - 输出：组合动力学模型，更新组合变量表
- Optimizer模块
    - 输入：组合动力学模型，初始组合变量表，待优化组合变量表
    - 输出：优化结果变量表，优化结果相关参数

## 核心数据类型

## 数据生命周期示例：资源生成与消耗
1.  初始化：从 `dataenvironmentbiomes.json` 加载生物群落数据。
2.  仿真步进：`srcsystemssimulation_system.py` 根据 `docsdata_specsresource_generation_spec.md` 中的规则计算资源生成量。
3.  用户交互：玩家消耗资源，更新 `SurvivalSimulator_UserDatausers[user_id]game_experiences[save_name]simulator_state.json`。
4.  数据持久化：游戏存档时，相关数据被序列化并存储到 `.sav` 文件中。

# 系统架构
## 🧩 核心模块
```mermaid
graph TD
    A[Collector] -->|组装模型| B(Simulator)
    B -->|生成数据| C(Optimizer)
    C -->|调参建议| B
    B -->|实时流| D(simulator)
```

## 📦 关键组件
| 模块        | 职责       | 接口文件             |
| --------- | -------- | ---------------- |
| Collector | 模型/参数组合  | src/collector.py |
| Simulator | 运行生命系统仿真 | src/simulator.py |
| Optimizer | 参数自动优化   | src/optimizer.py |


```mermaid
graph TD
    GUI[Web GUI<br/>用户GUI界面]
    CLI[Local CLI<br/>用户CLI指令]

    subgraph "Client Interface Layer"
        GUI_B[Generator GUI<br/>生成界面]
        GUI_H[Optimizer GUI<br/>验证与优化界面]
        GUI_V[Simulator GUI<br/>控制界面]
        GUI_L[Loader GUI<br/>读取界面]
    end

    subgraph "CLI Layer"
        CLI_L[Loader CLI<br/>lifematters-loader<br/>独立exe，执行完即退出]
        CLI_B[Generator CLI<br/>lifematters-Generator<br/>独立exe，执行完即退出]
        CLI_V[Simulator CLI<br/>lifematters-Simulator<br/>CLI + 后台服务]
        CLI_H[Optimizer CLI<br/>lifematters-Optimizer<br/>离线运行，调用Simulator引擎]
    end
    
    subgraph "Engine Layer"
        ENG_B[Generator Engine<br/>模板生成引擎]
        ENG_H[Optimizer Engine<br/>参数优化引擎<br/>内部调用Simulator引擎]
        ENG_V[Simulator Engine<br/>仿真引擎<br/>支持独立运行+被调用]
        ENG_L[Loader Engine<br/>模板读取引擎<br/>struct,merge,load]
        MOD[Mod Structure<br/>Mod模板结构]
    end

    %% subgraph "Storage Layer"
        FILE_V[仿真结果文件]
        FILE_H[优化结果文件]
        YAML[YAML Files<br/>mod配置文件<br/>通过loader.fetch访问]
    %% end
    
    GUI_H --> GUI_V --> GUI_L
    CLI --> CLI_B
    CLI --> CLI_L
    CLI --> CLI_V
    CLI --> CLI_H

    GUI --> GUI_B --> CLI_B --> ENG_B
    GUI --> GUI_L --> CLI_L --> ENG_L
    GUI --> GUI_V --> CLI_V --> ENG_V
    GUI --> GUI_H --> CLI_H --> ENG_H --> ENG_V

    ENG_B --> |生成| MOD
    ENG_V --> ENG_L
    ENG_L --> |读取、合并| MOD

    MOD --> YAML

    ENG_V --> FILE_V
    ENG_H --> FILE_H
    FILE_H --> ENG_V
    
    %% ENG_H --> PP{{NS论文}} --> CONNECT{{联系国外学者}} --> OUT{{国外工作}}
    %% PP --> GZ{{国自然申请}} --> SYSU{{中大转正}}

    %% %% 样式定义
    classDef CSS_B fill:#0000c9
    classDef CSS_V fill:#00ae00
    classDef CSS_H fill:#d100e9
    classDef CSS_C fill:#b20000
    
    %% %% 应用样式
    %% class GUI_B,CLI_B,ENG_B CSS_B
    %% class GUI_H,CLI_H CSS_H
    %% class GUI_V,CLI_V,ENG_V,GUI_L,CLI_L,ENG_L CSS_V
    %% class ENG_H CSS_C
```
