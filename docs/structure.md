# 基础数据
本目录包含 `Life Matters` 运行所需的所有核心数据。

这些数据以易于阅读和修改的`yaml`格式存储，是模拟器行为的基础。

## 目录结构
分为两个文件夹
* `default/`: 通用的身体、经济、医疗等数据模型
* `scenary/`: 特殊场景定义，作为一个单独仿真的包来管理和运行
    * 每个场景给出包括前面哪些通用数据模型。
    * 每个场景包含和平日常、战争、疾病、反人类杀害等单个事件模板。
    * 可以自定义场景对上述预设场景进行合并和删减进行仿真。

# MODs 目录
本目录用于存放 `Life Matters` 的第三方和社区制作的 MODs。每个 MOD 应该拥有一个独立的子文件夹。

## 如何安装 MOD
1.  将下载的 MOD 文件夹完整放置到本目录下。
2.  启动游戏/模拟器，MOD 将自动加载 (如果启用了 MOD 加载功能，具体取决于游戏设置)。

## 如何创建 MOD

## MOD 文件夹结构示例
```
mods/
├── system_diabetes/    # diabetes model
│   ├── readme.md       # MOD 的说明文件
│   ├── model.yaml      # MOD 的参数文件
│   └── theories.md     # MOD 的触发器文件
├── system_digest/      # digest model
└── ...
```

## `info`文件结构
```
123
```
 
## `parameters`文件结构
```
123
```

## `equations`文件结构
```
123
```

## `triggerss`文件结构
```
123
```

# 科学模型库
## 🛠️ 添加新模型
1. 在 theories/ 创建子目录
2. 提供必需文件：
   - model.json (模型结构)
   - equations.py (微分方程)

示例：
```json
{
  "name": "New Model",
  "variables": ["x", "y"],
  "parameters": {
    "k1": {"min": 0.1, "default": 1.0}
  }
}
```

> 🔍 AI Prompt:  
> "请根据[附件论文]的方程3-5，生成符合本项目标准的model.json和equations.py模板"
