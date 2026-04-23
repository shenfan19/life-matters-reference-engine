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
                time_hours: float = 720.0,
                opt_inner_runs: int = 5,
                opt_aggregation: str = 'mean',
                opt_verify_runs: int = 20) -> Dict[str, Any]:
        """
        执行优化任务（外环 Regimen/参数搜索，方案 B：每次迭代用 N_inner 条取期望）。
        :param mode: 优化模式 (real_time/full_inputs/full_params)。
        :param method: 优化方法 (grid/pymoo/rl)。
        :param time_hours: 优化时长（小时）。
        :param opt_inner_runs: 每次参数评估运行的 MC 仿真条数（方案 B）。
        :param opt_aggregation: 聚合方式：mean / min / median。
        :param opt_verify_runs: 优化完成后最终验证运行条数。
        :return: 优化结果字典。
        """
        if not self.current_model:
            return {"success": False, "error": "未加载模型"}

        if not self.simulator:
            return {"success": False, "error": "未注入 SimulatorEngine"}

        if 'targets' not in self.config or not self.config['targets']:
            return {"success": False, "error": "模型配置中未定义优化目标 (optimizer.targets)"}

        target = self.config['targets'][0]

        if 'method' in self.config and method == 'grid':
            method = self.config['method']

        self.iteration = 0
        self.history = []
        self.opt_inner_runs = max(1, opt_inner_runs)
        self.opt_aggregation = opt_aggregation
        self.opt_verify_runs = max(1, opt_verify_runs)

        if mode == 'real_time':
            return self._optimize_real_time(target, method, time_hours)
        elif mode == 'full_inputs':
            return self._optimize_full_inputs(target, method, time_hours)
        elif mode == 'full_params':
            return self._optimize_full_params(target, method, time_hours)
        else:
            return {"success": False, "error": f"不支持的优化模式: {mode}"}

    def _multi_eval_objective(self, params, time_hours: float) -> float:
        """
        方案 B：运行 opt_inner_runs 条仿真，聚合目标值。
        每条使用独立随机种子，使目标函数对随机参数分布取期望。
        同时记录进度到 history。
        """
        fitnesses = []
        for _ in range(self.opt_inner_runs):
            seed = int(np.random.randint(0, 2**31))
            f = self.simulator.fitness_func_with_seed(
                parameters=params.tolist() if isinstance(params, np.ndarray) else params,
                seed=seed,
                time_hours=time_hours,
            )
            fitnesses.append(f)

        arr = np.array(fitnesses)
        if self.opt_aggregation == 'min':
            agg = float(np.min(arr))
        elif self.opt_aggregation == 'median':
            agg = float(np.median(arr))
        else:
            agg = float(np.mean(arr))

        self.iteration += 1
        self.history.append({
            'iteration': self.iteration,
            'params': params.tolist() if isinstance(params, np.ndarray) else list(params),
            'fitness': agg,
            'fitness_std': float(np.std(arr)) if self.opt_inner_runs > 1 else 0.0,
        })
        return agg

    def _run_verification(self, best_params: list, time_hours: float) -> Dict[str, Any]:
        """
        优化完成后，用 opt_verify_runs 条仿真验证最优解，返回分布统计。
        """
        verify_fitnesses = []
        for _ in range(self.opt_verify_runs):
            seed = int(np.random.randint(0, 2**31))
            f = self.simulator.fitness_func_with_seed(
                parameters=best_params,
                seed=seed,
                time_hours=time_hours,
            )
            verify_fitnesses.append(f)
        arr = np.array(verify_fitnesses)
        return {
            'verify_runs': self.opt_verify_runs,
            'mean': float(np.mean(arr)),
            'std': float(np.std(arr)),
            'min': float(np.min(arr)),
            'max': float(np.max(arr)),
        }

    def _optimize_full_params(self, target: str, method: str, time_hours: float) -> Dict[str, Any]:
        """
        外环 parameters 定值优化（方案 B：每次评估运行 opt_inner_runs 条取期望）。
        """
        controllable_vars = self.current_model.get_controllable_variables()
        if not controllable_vars:
            return {"success": False, "error": "没有可优化的参数"}

        if 'bounds' in self.config:
            bounds = self.config['bounds']
        else:
            bounds = [
                (var.bounds if var.bounds else (0.0, 1.0))
                for var in controllable_vars.values()
            ]

        # 方案 B 目标函数：N_inner 次 MC 评估后聚合
        def objective(params):
            return self._multi_eval_objective(params, time_hours)

        if method == 'grid':
            result = self._grid_search(objective, bounds)
        elif method == 'pymoo':
            result = self._pymoo_optimize(objective, bounds, time_hours)
        elif method == 'rl':
            return {"success": False, "error": "RL 优化方法暂未实现"}
        else:
            return {"success": False, "error": f"不支持的优化方法: {method}"}

        # 最终验证（T3：N_verify 条触发 MC 验证展示）
        if result.get('success') and 'params' in result:
            verification = self._run_verification(result['params'], time_hours)
            result['verification'] = verification
            result['history'] = self.history
            logger.info(f"优化验证完成: mean={verification['mean']:.4f}, std={verification['std']:.4f}")

        return result

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
        
        def objective(flat_sequence):
            inputs_sequence = []
            for step_idx in range(sequence_length):
                step_inputs = {}
                for var_idx, var_name in enumerate(input_vars.keys()):
                    flat_idx = step_idx * len(input_vars) + var_idx
                    step_inputs[var_name] = flat_sequence[flat_idx]
                inputs_sequence.append(step_inputs)

            # 方案 B：N_inner 次评估聚合（full_inputs 模式下 seed 影响 parameter 采样）
            return self._multi_eval_objective(
                np.array([v for step in inputs_sequence for v in step.values()]),
                time_hours
            )
        
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