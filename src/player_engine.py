# -*- coding: utf-8 -*-
# 文件名: player_engine.py
# 描述: LifeMatters 框架的仿真控制器，负责加载模型、运行仿真、管理仿真状态以及处理事件和优化建议。
#       本模块通过与 LoaderEngine 和 OptimizerEngine 交互，执行动态仿真并支持暂停、继续和参数调整。

import logging
from typing import Dict, Any, List, Optional
from mod_structure import ModStructure
from loader_engine import LoaderEngine
from optimizer_engine import OptimizerEngine

# 初始化模块的日志记录器，用于记录仿真过程中的信息和错误。
logger = logging.getLogger(__name__)

class PlayerEngine:
    """仿真控制器，负责运行和管理仿真流程。"""
    
    def __init__(self, mods_directory: str = "mods", language: str = "en"):
        # 初始化 LoaderEngine 以加载模型，指定模型目录和语言。
        self.loader = LoaderEngine(mods_directory, language)
        # 初始化当前模型为 None。
        self.current_model: Optional[ModStructure] = None
        # 初始化当前仿真步数。
        self.current_step = 0
        # 初始化仿真时间。
        self.time = 0.0
        # 初始化仿真运行状态。
        self.running = False
        # 初始化批处理模式标志，可通过 CLI 参数控制。
        self.batch_mode = False  # 可通过 CLI 参数控制

    def load_models(self, model_names: List[str], folder: Optional[str] = None) -> bool:
        """加载模型。"""
        # 使用 LoaderEngine 加载指定模型名称的模型。
        self.current_model = self.loader.fetch(model_names[0], folder)
        # 返回加载是否成功的布尔值。
        return self.current_model is not None

    def run_simulation(self, model_name: str, time: int, output_path: Optional[str] = None, 
                   folder: Optional[str] = None, dt: float = 1.0, dt_unit: str = 'second', 
                   target: str = 'min_error', pause_every: int = 5, auto_adjust: bool = False) -> Dict[str, Any]:
        """运行仿真。"""
        # 如果指定了模型名称但加载失败，返回错误信息。
        if model_name and not self.load_models([model_name], folder):
            return {"success": False, "error": f"无法加载模型：{model_name}"}
        # 如果当前未加载模型，返回错误信息。
        if not self.current_model:
            return {"success": False, "error": "未加载模型"}
        # 设置仿真运行状态为 True。
        self.running = True
        # 重置仿真步数和时间。
        self.current_step = 0
        self.time = 0.0
        # 如果处于批处理模式，直接运行所有步数。
        if self.batch_mode:
            self.current_model.run_steps(time / dt, dt)
            self.current_step = time / dt
            self.time = time * dt
        else:
            # 逐步运行仿真，直到达到指定步数或停止。
            while self.current_step < time / dt and self.running:
                self.current_model.step(dt)
                self.current_step += 1
                self.time += dt
                # 每 10 步记录优化建议。
                if self.current_step % 10 == 0:
                    suggestions = self.get_suggestions()
                    logger.info(f"优化建议：参数={suggestions['suggestions']}, 目标值={suggestions['value']}")
        # 设置仿真运行状态为 False。
        self.running = False
        # 返回仿真结果，包括模型名称、当前状态、步数和时间。
        return {
            "success": True,
            "model_name": self.current_model.metadata.name,
            "state": self.current_model.get_current_state(),
            "steps": self.current_step,
            "time": self.time
        }

    def apply_event(self, event: Dict[str, Any]) -> bool:
        """应用事件，修改变量值。"""
        # 如果未加载模型，返回 False。
        if not self.current_model:
            return False
        # 遍历事件中的变量，设置模型变量值。
        for var_name, value in event.get("variables", {}).items():
            self.current_model.set_variable_value(var_name, value)
        # 记录事件应用成功的日志。
        logger.info("Event applied successfully")
        # 返回 True 表示事件应用成功。
        return True

    def get_state(self) -> Dict[str, Any]:
        """获取当前状态。"""
        # 如果未加载模型，返回错误信息。
        if not self.current_model:
            return {"success": False, "error": "未加载模型"}
        # 返回当前模型的状态。
        return {"success": True, "state": self.current_model.get_current_state()}

    def get_critical_conditions(self) -> Dict[str, Any]:
        """检查临界条件。"""
        # 如果未加载模型，返回错误信息。
        if not self.current_model:
            return {"success": False, "error": "未加载模型"}
        triggered = []
        # 遍历模型公式，检查哪些公式的条件被触发。
        for form_name, formula in self.current_model.formulas.items():
            if self.current_model.asteval.eval(formula.condition):
                triggered.append({"formula": form_name, "description": formula.description})
        # 返回触发的临界条件列表。
        return {"success": True, "triggered_conditions": triggered}

    def get_suggestions(self, target: str = 'min_error') -> Dict[str, Any]:
        """获取优化建议。"""
        # 如果未加载模型，返回默认建议（空建议和无穷大目标值）。
        if not self.current_model:
            return {"suggestions": [], "value": float('inf')}
        # 初始化 OptimizerEngine 以获取优化建议。
        optimizer = OptimizerEngine(self.current_model, target)
        # 执行优化，使用默认初始参数和边界。
        result = optimizer.optimize(initial_params=[0.5] * len(self.current_model.get_controllable_variables()), 
                                  bounds=[(0, 1)] * len(self.current_model.get_controllable_variables()), 
                                  method='scipy-grid')
        # 返回优化建议的参数和目标值。
        return {"suggestions": result['params'], "value": result['value']}

    def pause_simulation(self):
        """暂停仿真。"""
        # 设置仿真运行状态为 False，暂停仿真。
        self.running = False

    def resume_simulation(self, time: int = 3600, dt: float = 1.0):
        """继续仿真。"""
        # 调用 run_simulation 继续仿真，使用指定的步数和时间步长。
        return self.run_simulation(time=time, dt=dt)