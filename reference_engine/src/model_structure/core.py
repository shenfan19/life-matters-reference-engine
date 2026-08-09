# -*- coding: utf-8 -*-
# src/models/core.py
from .loader import Loader
from .validator import Validator
from .simulation import Simulation
from .base import ModelMetadata, Variable, Equation, TIME_UNIT_SECONDS
from typing import Dict, Any, Set
from asteval import Interpreter
import logging
import os
import yaml

# 初始化模块的日志记录器
logger = logging.getLogger(__name__)

class ModelStructure(Loader, Validator, Simulation):
    def __init__(self, models_directory: str = "models"):
        # 初始化元数据
        self.metadata = None
        # 初始化变量字典
        self.variables = {}
        # 初始化方程字典
        self.equations = {}
        # 初始化变量历史记录
        self.variable_history = {}
        # 初始化当前仿真步数
        self.current_step = 0
        # 初始化仿真时间（秒）
        self.time = 0.0
        # 初始化 asteval 解释器
        self.asteval = Interpreter()
        # 初始化 asteval 符号表
        self._initialize_asteval()
        # 初始化钩子字典
        self.hooks = {'pre_step': [], 'post_step': []}
        # 初始化 simulator 和 optimizer
        self.simulator: Dict[str, Any] = {}
        self.optimizer: Dict[str, Any] = {}
        # self.plans: plan_id → List[dict] 原始 schedule 条目，供 apply_schedules 使用
        # self.schedule_entries: 当前激活 plan 的条目列表（run_simulation 前设置）
        self.plans: Dict[str, Any] = {}
        self.schedule_entries: list = []
        # 时间单位（来自 YAML simulator.time_unit，默认分钟）
        self.time_unit: str = 'minute'
        # 跟踪已访问模型，防止循环依赖
        self.visited: Set[str] = set()
        self.models_directory = models_directory
        # 当前文件名（无扩展名），由 loader.py 设置
        self.current_filename: str = None
    def _initialize_asteval(self):
        # 重建 Interpreter，让 asteval 自己注册所有内置函数，不破坏其内部状态
        self.asteval = Interpreter()
        # 追加时间单位常量（以秒为绝对值，供内部计算参考）
        self.asteval.symtable['MINUTE'] = 60.0
        self.asteval.symtable['HOUR'] = 3600.0
        self.asteval.symtable['DAY'] = 86400.0
        self.asteval.symtable['WEEK'] = 604800.0
        self.asteval.symtable['MONTH'] = 2592000.0
        self.asteval.symtable['YEAR'] = 31536000.0
        # 注入模型变量到符号表
        for var_name, var in self.variables.items():
            self.asteval.symtable[var_name] = var.value
    
    def split_model(self, output_dir: str):
        """
        将模型分解为独立方程文件和剩余文件，所有文件生成在 output_dir 目录下。
        :param output_dir: 输出目录（如 models/splited/bcd/）
        """
        # 确保输出目录存在
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        # 使用 self.current_filename 作为前缀
        prefix = self.current_filename or 'unknown'

        # 提取方程依赖变量
        equation_deps: Dict[str, Set[str]] = {}
        for eq_name, equation in self.equations.items():
            deps = set()
            if isinstance(equation.condition, str):
                deps.update(self.extract_vars_from_expr(equation.condition))
            for var, expr in equation.dynamics.items():
                if isinstance(expr, (int, float)):
                    expr = str(expr)
                deps.update(self.extract_vars_from_expr(expr))
                if var in self.variables:
                    deps.add(var)
            equation_deps[eq_name] = deps

        # 构建变量使用计数
        var_usage: Dict[str, int] = {}
        for deps in equation_deps.values():
            for var in deps:
                var_usage[var] = var_usage.get(var, 0) + 1

        # 识别独立方程
        independent_equations = [
            eq_name for eq_name, deps in equation_deps.items()
            if all(var_usage.get(var, 0) == 1 for var in deps)
        ]

        # 生成独立方程文件
        for eq_name in independent_equations:
            deps = equation_deps[eq_name]
            # 过滤 variables，排除 'dt' 如果存在 // dt不再排除
            filtered_vars = {
                var: {
                    'description': self.variables[var].description,
                    'value': self.variables[var].value,
                    'type': self.variables[var].type.value,
                    'unit': self.variables[var].unit,
                    'bounds': self.variables[var].bounds
                } for var in deps if var in self.variables # 添加过滤条件：排除 'dt' // dt不再排除
            }
            patch_data = {
                'metadata': {
                    'name': f"{prefix}_{eq_name}",
                    'version': self.metadata.version if self.metadata else '1.0.0',
                    'author': self.metadata.author if self.metadata else '',
                    'description': f"Split module for equation {eq_name}",
                },
                'variables': filtered_vars,  # 使用过滤后的 variables
                'equations': {
                    eq_name: {
                        'description': self.equations[eq_name].description,
                        'condition': self.equations[eq_name].condition,
                        'priority': self.equations[eq_name].priority,
                        'dynamics': self.equations[eq_name].dynamics
                    }
                }
            }
            # 直接在 output_dir 下生成文件
            split_file_path = os.path.join(output_dir, f"{prefix}_{eq_name}.yaml")
            with open(split_file_path, 'w', encoding='utf-8') as f:
                yaml.safe_dump(patch_data, f, sort_keys=False, allow_unicode=True,
                            default_flow_style=False, indent=2)
            logger.info(f"Generated split file: {split_file_path}")

        # 生成剩余模型文件
        remaining_equations = {k: v for k, v in self.equations.items() if k not in independent_equations}
        remaining_vars = set()
        for equation in remaining_equations.values():
            if isinstance(equation.condition, str):
                remaining_vars.update(self.extract_vars_from_expr(equation.condition))
            for var, expr in equation.dynamics.items():
                if isinstance(expr, (int, float)):
                    expr = str(expr)
                remaining_vars.update(self.extract_vars_from_expr(expr))
                if var in self.variables:
                    remaining_vars.add(var)
        
        # 过滤 remaining_vars，排除 'dt' 如果存在
        filtered_remaining_vars = {
            var: {
                'description': self.variables[var].description,
                'value': self.variables[var].value,
                'type': self.variables[var].type.value,
                'unit': self.variables[var].unit,
                'bounds': self.variables[var].bounds
            } for var in remaining_vars if var in self.variables # 添加过滤条件：排除 'dt'
        }
        remaining_data = {
            'metadata': {
                'name': f"{prefix}_remaining",
                'version': self.metadata.version if self.metadata else '1.0.0',
                'author': self.metadata.author if self.metadata else '',
                'description': f"Remaining shared modules of {prefix}",
            },
            'variables': filtered_remaining_vars,  # 使用过滤后的 variables
            'equations': {
                k: {
                    'description': v.description,
                    'condition': v.condition,
                    'priority': v.priority,
                    'dynamics': v.dynamics
                } for k, v in remaining_equations.items()
            }
        }
        # 直接在 output_dir 下生成文件
        remaining_path = os.path.join(output_dir, f"{prefix}_remaining.yaml")
        with open(remaining_path, 'w', encoding='utf-8') as f:
            yaml.safe_dump(remaining_data, f, sort_keys=False, allow_unicode=True,
                        default_flow_style=False, indent=2)
        logger.info(f"Generated remaining file: {remaining_path}")
        
    def export_to_yaml(self, file_path: str):
        # 导出模型为 YAML 文件
        data = {
            'metadata': {
                'name': self.metadata.name if self.metadata else '',
                'version': self.metadata.version if self.metadata else '1.0.0',
                'author': self.metadata.author if self.metadata else '',
                'description': self.metadata.description if self.metadata else '',
                'conflicts': self.metadata.conflicts if self.metadata else [],
                'tags': self.metadata.tags if self.metadata else []
            },
            'imports': [],
            'variables': {
                var_name: {
                    'description': var.description,
                    'value': var.value,
                    'type': var.type.value,
                    'unit': var.unit,
                    'bounds': var.bounds
                } for var_name, var in self.variables.items()
            },
            'equations': {
                eq_name: {
                    'description': form.description,
                    'condition': form.condition,
                    'priority': form.priority,
                    'dynamics': form.dynamics,
                } for eq_name, form in self.equations.items()
            },
            'simulator': self.simulator,
            'optimizer': self.optimizer
        }
        with open(file_path, 'w', encoding='utf-8') as f:
            yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True, 
                        default_flow_style=False, indent=2)  # 添加 indent=2
