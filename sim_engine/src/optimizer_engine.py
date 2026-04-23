# -*- coding: utf-8 -*-
# 文件名: optimizer_engine.py
# 描述: LifeMatters 框架的优化引擎，负责模型参数优化，支持三种优化模式：
#       - real_time: 内环实时 input 优化
#       - full_inputs: 外环全程 input 序列优化
#       - full_params: 外环 parameters 定值优化
#       通过调用 SimulatorEngine 的 fitness_func 作为黑盒评估。

import logging
import numpy as np
from typing import Dict, Any, List, Optional, Union
from .loader_engine import LoaderEngine

# 初始化模块的日志记录器，用于记录优化过程中的信息和错误。
logger = logging.getLogger(__name__)

class OptimizerEngine:
    """优化引擎，负责参数优化，支持多种优化模式和方法。"""
    
    def __init__(self, mods_directory: str = "models", language: str = "en"):
        """
        初始化优化引擎。
        :param mods_directory: 模型目录路径。
        :param language: 语言设置（如 "en", "zhhans"）。
        """
        # 初始化 LoaderEngine 以加载模型。
        self.loader = LoaderEngine(mods_directory, language)
        # 初始化当前模型为 None。
        self.current_model = None
        # 初始化 SimulatorEngine 引用（外部注入）。
        self.simulator = None
        # 记录优化迭代次数。
        self.iteration = 0
        # 存储优化历史，包括每次迭代的参数和目标值。
        self.history = []
        # 初始化优化配置。
        self.config = {}

    def load_models(self, model_names: List[str], folder: Optional[str] = None) -> bool:
        """
        加载指定名称的模型。
        :param model_names: 模型名称列表。
        :param folder: 子文件夹名称。
        :return: 加载是否成功。
        """
        # 如果模型列表为空，返回失败。
        if not model_names:
            logger.error("load_models: 模型名称列表为空")
            return False
        
        # 如果只有一个模型，直接加载。
        if len(model_names) == 1:
            self.current_model = self.loader.fetch(model_names[0], folder)
        else:
            # 如果有多个模型，使用 merge_models 合并。
            result = self.loader.merge_models(model_names=model_names, folders=None)
            if result["success"]:
                self.current_model = result["data"]
            else:
                logger.error(f"合并模型失败: {result.get('error', '未知错误')}")
                return False
        
        # 如果模型加载成功，从模型的 optimizer 配置中读取优化参数。
        if self.current_model:
            self.config = self.current_model.optimizer
            logger.info(f"已加载模型并读取优化配置: {self.config.get('method', 'grid')}")
        
        # 返回加载是否成功的布尔值。
        return self.current_model is not None

    def set_simulator(self, simulator):
        """
        注入 SimulatorEngine 实例。
        :param simulator: SimulatorEngine 实例。
        """
        # 设置仿真器引用。
        self.simulator = simulator
        # 记录日志。
        logger.info("已注入 SimulatorEngine 实例")

    def optimize(self, mode: str = 'full_params', method: str = 'grid', 
                time_hours: float = 720.0) -> Dict[str, Any]:
        """
        执行优化任务。
        :param mode: 优化模式 (real_time/full_inputs/full_params)。
        :param method: 优化方法 (grid/pymoo/rl)。
        :param time_hours: 优化时长（小时）。
        :return: 优化结果字典。
        """
        # 检查是否已加载模型。
        if not self.current_model:
            return {"success": False, "error": "未加载模型"}
        
        # 检查是否已注入仿真器。
        if not self.simulator:
            return {"success": False, "error": "未注入 SimulatorEngine"}
        
        # 从模型配置中读取优化目标（必需）。
        if 'targets' not in self.config or not self.config['targets']:
            return {"success": False, "error": "模型配置中未定义优化目标 (optimizer.targets)"}
        target = self.config['targets'][0]
        
        # 从模型配置中读取优化方法（如果未指定）。
        if 'method' in self.config and method == 'grid':
            method = self.config['method']
        
        # 重置优化历史。
        self.iteration = 0
        self.history = []
        
        # 根据优化模式调用对应的优化方法。
        if mode == 'real_time':
            # 内环实时 input 优化。
            return self._optimize_real_time(target, method, time_hours)
        elif mode == 'full_inputs':
            # 外环全程 input 序列优化。
            return self._optimize_full_inputs(target, method, time_hours)
        elif mode == 'full_params':
            # 外环 parameters 定值优化。
            return self._optimize_full_params(target, method, time_hours)
        else:
            # 不支持的优化模式。
            return {"success": False, "error": f"不支持的优化模式: {mode}"}

    def _optimize_full_params(self, target: str, method: str, time_hours: float) -> Dict[str, Any]:
        """
        外环 parameters 定值优化。
        :param target: 优化目标。
        :param method: 优化方法。
        :param time_hours: 仿真时长（小时）。
        :return: 优化结果字典。
        """
        # 获取模型中可控制的变量（参数类型）。
        controllable_vars = self.current_model.get_controllable_variables()
        # 如果没有可控制变量，返回错误。
        if not controllable_vars:
            return {"success": False, "error": "没有可优化的参数"}
        
        # 从模型配置中读取参数边界。
        if 'bounds' in self.config:
            bounds = self.config['bounds']
        else:
            # 如果未配置边界，使用变量的默认边界。
            bounds = [
                (var.bounds if var.bounds else (0.0, 1.0)) 
                for var in controllable_vars.values()
            ]
        
        # 定义目标函数（黑盒评估）。
        def objective(params):
            """
            目标函数，调用 SimulatorEngine.fitness_func 评估参数组合。
            :param params: 参数值列表。
            :return: 适应度值。
            """
            # 调用仿真器的 fitness_func 评估参数。
            fitness = self.simulator.fitness_func(
                parameters=params.tolist() if isinstance(params, np.ndarray) else params,
                inputs_sequence=None,
                time_hours=time_hours
            )
            # 记录优化迭代。
            self.iteration += 1
            self.history.append({
                'iteration': self.iteration, 
                'params': params.tolist() if isinstance(params, np.ndarray) else params, 
                'fitness': fitness
            })
            # 返回适应度值。
            return fitness
        
        # 根据优化方法执行优化。
        if method == 'grid':
            # 使用网格搜索优化。
            return self._grid_search(objective, bounds)
        elif method == 'pymoo':
            # 使用 pymoo 多目标优化。
            return self._pymoo_optimize(objective, bounds, time_hours)
        elif method == 'rl':
            # 使用强化学习优化（暂未实现）。
            return {"success": False, "error": "RL 优化方法暂未实现"}
        else:
            # 不支持的优化方法。
            return {"success": False, "error": f"不支持的优化方法: {method}"}

    def _optimize_full_inputs(self, target: str, method: str, time_hours: float) -> Dict[str, Any]:
        """
        外环全程 input 序列优化。
        :param target: 优化目标。
        :param method: 优化方法。
        :param time_hours: 仿真时长（小时）。
        :return: 优化结果字典。
        """
        # 获取模型中输入类型的变量。
        from model_structure import VariableType
        input_vars = {
            name: var for name, var in self.current_model.variables.items() 
            if var.type == VariableType.input
        }
        # 如果没有输入变量，返回错误。
        if not input_vars:
            return {"success": False, "error": "没有输入变量可优化"}
        
        # 计算输入序列的长度（基于时间步长）。
        dt = self.current_model.simulator.get('step_size', 3600.0)
        sequence_length = int(time_hours * 3600.0 / dt)
        
        # 定义输入序列的边界（每个时间步的每个输入变量）。
        bounds = []
        for _ in range(sequence_length):
            for var in input_vars.values():
                bounds.append(var.bounds if var.bounds else (0.0, 1.0))
        
        # 定义目标函数（黑盒评估）。
        def objective(flat_sequence):
            """
            目标函数，将扁平化的序列转换为输入序列并评估。
            :param flat_sequence: 扁平化的输入序列。
            :return: 适应度值。
            """
            # 将扁平化序列转换为输入序列字典列表。
            inputs_sequence = []
            for step_idx in range(sequence_length):
                step_inputs = {}
                for var_idx, var_name in enumerate(input_vars.keys()):
                    # 计算当前变量在扁平化序列中的索引。
                    flat_idx = step_idx * len(input_vars) + var_idx
                    step_inputs[var_name] = flat_sequence[flat_idx]
                inputs_sequence.append(step_inputs)
            
            # 调用仿真器的 fitness_func 评估输入序列。
            fitness = self.simulator.fitness_func(
                parameters=None,
                inputs_sequence=inputs_sequence,
                time_hours=time_hours
            )
            # 记录优化迭代。
            self.iteration += 1
            self.history.append({
                'iteration': self.iteration, 
                'sequence': inputs_sequence[:5],  # 仅记录前 5 步
                'fitness': fitness
            })
            # 返回适应度值。
            return fitness
        
        # 根据优化方法执行优化（目前仅支持网格搜索）。
        if method == 'grid':
            # 由于输入序列维度过高，网格搜索不适用，返回错误。
            return {"success": False, "error": "输入序列优化不支持 grid 方法，请使用 pymoo 或 rl"}
        elif method == 'pymoo':
            # 使用 pymoo 多目标优化。
            return self._pymoo_optimize(objective, bounds, time_hours)
        elif method == 'rl':
            # 使用强化学习优化（暂未实现）。
            return {"success": False, "error": "RL 优化方法暂未实现"}
        else:
            # 不支持的优化方法。
            return {"success": False, "error": f"不支持的优化方法: {method}"}

    def _optimize_real_time(self, target: str, method: str, time_hours: float) -> Dict[str, Any]:
        """
        内环实时 input 优化（每步优化当前输入）。
        :param target: 优化目标。
        :param method: 优化方法。
        :param time_hours: 仿真时长（小时）。
        :return: 优化结果字典。
        """
        # 获取模型中输入类型的变量。
        from model_structure import VariableType
        input_vars = {
            name: var for name, var in self.current_model.variables.items() 
            if var.type == VariableType.input
        }
        # 如果没有输入变量，返回错误。
        if not input_vars:
            return {"success": False, "error": "没有输入变量可优化"}
        
        # 获取时间步长和总步数。
        dt = self.current_model.simulator.get('step_size', 3600.0)
        total_steps = int(time_hours * 3600.0 / dt)
        
        # 初始化仿真器的模型（与优化器使用同一模型）。
        self.simulator.current_model = self.current_model
        self.simulator.current_model.reset_simulation()
        
        # 存储每步的优化结果。
        step_results = []
        
        # 逐步执行仿真并优化当前步的输入。
        for step_idx in range(total_steps):
            # 定义单步目标函数。
            def step_objective(inputs):
                """
                单步目标函数，评估当前步的输入。
                :param inputs: 当前步的输入值列表。
                :return: 单步适应度值。
                """
                # 应用输入值到模型。
                for var_idx, var_name in enumerate(input_vars.keys()):
                    self.simulator.current_model.set_variable_value(var_name, inputs[var_idx])
                
                # 执行单步仿真。
                self.simulator.current_model.step(dt)
                
                # 计算单步目标值（基于当前状态）。
                step_fitness = self.simulator.current_model.get_objective(target)
                
                # 返回适应度值。
                return step_fitness
            
            # 定义输入边界。
            bounds = [
                (var.bounds if var.bounds else (0.0, 1.0)) 
                for var in input_vars.values()
            ]
            
            # 使用快速方法优化当前步（网格搜索，低分辨率）。
            if method in ['grid', 'pymoo']:
                result = self._grid_search(step_objective, bounds, n_points=3)
                if result["success"]:
                    # 记录当前步的优化结果。
                    step_results.append({
                        'step': step_idx,
                        'optimal_inputs': result['params'],
                        'fitness': result['value']
                    })
            else:
                # 不支持的方法，使用默认输入。
                logger.warning(f"实时优化不支持 {method} 方法，使用默认输入")
                step_results.append({
                    'step': step_idx,
                    'optimal_inputs': [var.value for var in input_vars.values()],
                    'fitness': step_objective([var.value for var in input_vars.values()])
                })
        
        # 返回实时优化结果。
        return {
            "success": True,
            "mode": "real_time",
            "step_results": step_results[:10],  # 仅返回前 10 步结果
            "total_steps": len(step_results),
            "final_state": self.simulator.current_model.get_current_state()
        }

    def _grid_search(self, objective, bounds, n_points: int = 10) -> Dict[str, Any]:
        """
        网格搜索优化方法。
        :param objective: 目标函数。
        :param bounds: 参数边界列表。
        :param n_points: 每个维度的网格点数。
        :return: 优化结果字典。
        """
        try:
            # 导入 SciPy 网格搜索函数。
            from scipy.optimize import brute
            
            # 执行网格搜索。
            result = brute(
                objective, 
                ranges=bounds, 
                Ns=n_points, 
                full_output=True,
                finish=None  # 不进行局部优化
            )
            
            # 返回优化结果。
            return {
                'success': True, 
                'params': result[0].tolist(), 
                'value': float(result[1]),
                'history': self.history
            }
        except Exception as e:
            # 记录优化失败错误。
            logger.error(f"网格搜索失败: {e}")
            # 返回错误信息。
            return {'success': False, 'error': str(e)}

    def _pymoo_optimize(self, objective, bounds, time_hours: float) -> Dict[str, Any]:
        """
        使用 pymoo 进行多目标优化。
        :param objective: 目标函数。
        :param bounds: 参数边界列表。
        :param time_hours: 优化时长（小时）。
        :return: 优化结果字典。
        """
        try:
            # 导入 pymoo 库。
            from pymoo.algorithms.soo.nonconvex.ga import GA
            from pymoo.dynamics.problem import Problem
            from pymoo.optimize import minimize
            
            # 定义优化问题类。
            class OptimizationProblem(Problem):
                def __init__(self):
                    # 初始化问题维度和边界。
                    super().__init__(
                        n_var=len(bounds),
                        n_obj=1,
                        xl=np.array([b[0] for b in bounds]),
                        xu=np.array([b[1] for b in bounds])
                    )
                
                def _evaluate(self, x, out, *args, **kwargs):
                    # 评估每个个体。
                    out["F"] = np.array([objective(xi) for xi in x])
            
            # 创建问题实例。
            problem = OptimizationProblem()
            
            # 从模型配置中读取种群大小和代数。
            pop_size = self.config.get('pop_size', 20)
            n_gen = self.config.get('n_gen', 50)
            
            # 初始化遗传算法。
            algorithm = GA(pop_size=pop_size)
            
            # 执行优化。
            res = minimize(
                problem,
                algorithm,
                ('n_gen', n_gen)
            )
            
            # 返回优化结果。
            return {
                'success': True,
                'params': res.X.tolist(),
                'value': float(res.F[0]),
                'history': self.history
            }
        except ImportError:
            # pymoo 库未安装。
            return {'success': False, 'error': 'pymoo 库未安装，请运行: pip install pymoo'}
        except Exception as e:
            # 记录优化失败错误。
            logger.error(f"pymoo 优化失败: {e}")
            # 返回错误信息。
            return {'success': False, 'error': str(e)}