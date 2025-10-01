# -*- coding: utf-8 -*-
# src/models/core.py
from .loader import Loader
from .validator import Validator
from .simulation import Simulation
from .base import ModelMetadata, Variable, Formula
from lang_manager import LanguageManager
from typing import Dict, Any, Set
from asteval import Interpreter
import logging
import os
import yaml

# 初始化模块的日志记录器
logger = logging.getLogger(__name__)

class ModStructure(Loader, Validator, Simulation):
    def __init__(self, mods_directory: str = "mods", language: str = "en"):
        # 初始化元数据
        self.metadata = None
        # 初始化变量字典
        self.variables = {}
        # 初始化公式字典
        self.formulas = {}
        # 初始化变量历史记录
        self.variable_history = {}
        # 初始化 asteval 解释器
        self.asteval = Interpreter()
        # 初始化 asteval 符号表
        self._initialize_asteval()
        # 初始化钩子字典
        self.hooks = {'pre_step': [], 'post_step': []}
        # 初始化 simulator 和 optimizer
        self.simulator: Dict[str, Any] = {}
        self.optimizer: Dict[str, Any] = {}
        # 跟踪已访问模型，防止循环依赖
        self.visited: Set[str] = set()
        self.mods_directory = mods_directory
        # 当前文件名（无扩展名），由 loader.py 设置
        self.current_filename: str = None
        self.lang_manager = LanguageManager(default_language=language)  # + 初始化 LanguageManager，用于国际化消息
    def _initialize_asteval(self):
        # 清空符号表
        self.asteval.symtable.clear()
        # 定义时间单位常量（秒为基单位）
        self.asteval.symtable['SECOND'] = 1.0
        self.asteval.symtable['MINUTE'] = 60.0
        self.asteval.symtable['HOUR'] = 3600.0
        self.asteval.symtable['DAY'] = 86400.0
        self.asteval.symtable['WEEK'] = 604800.0
        self.asteval.symtable['MONTH'] = 2592000.0
        self.asteval.symtable['YEAR'] = 31536000.0
        # 注入变量到符号表
        for var_name, var in self.variables.items():
            self.asteval.symtable[var_name] = var.value

    def split_model(self, output_dir: str):
        """将模型分解为独立公式文件和剩余文件，文件生成在output_dir（--file同级目录，--folder在文件夹内）"""
        # 确保输出目录存在
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        # 使用self.current_filename作为前缀，fallback到'unknown'
        prefix = self.current_filename or 'unknown'

        # 提取公式依赖变量
        formula_deps: Dict[str, Set[str]] = {}
        for form_name, formula in self.formulas.items():
            deps = set()
            if isinstance(formula.condition, str):
                deps.update(self._extract_vars_from_expr(formula.condition))
            for var, expr in formula.dynamics.items():
                if isinstance(expr, (int, float)):
                    expr = str(expr)
                deps.update(self._extract_vars_from_expr(expr))
                if var in self.variables:
                    deps.add(var)
            formula_deps[form_name] = deps

        # 构建变量使用计数
        var_usage: Dict[str, int] = {}
        for deps in formula_deps.values():
            for var in deps:
                var_usage[var] = var_usage.get(var, 0) + 1

        # 识别独立公式
        independent_formulas = [
            form_name for form_name, deps in formula_deps.items()
            if all(var_usage.get(var, 0) == 1 for var in deps)
        ]

        # 生成独立公式文件
        for form_name in independent_formulas:
            deps = formula_deps[form_name]
            patch_data = {
                'metadata': {
                    'name': f"{prefix}_{form_name}",
                    'version': self.metadata.version,
                    'author': self.metadata.author,
                    'description': f"Split module for formula {form_name}",
                },
                'variables': {
                    var: {
                        'description': self.variables[var].description,
                        'value': self.variables[var].value,
                        'type': self.variables[var].type.value,
                        'unit': self.variables[var].unit,
                        'bounds': self.variables[var].bounds
                    } for var in deps if var in self.variables
                },
                'formulas': {
                    form_name: {
                        'description': self.formulas[form_name].description,
                        'condition': self.formulas[form_name].condition,
                        'priority': self.formulas[form_name].priority,
                        'dynamics': self.formulas[form_name].dynamics
                    }
                }
            }
            # 直接使用output_dir生成文件路径（如physiology/或mods/physiology/）
            # patch_path2 = os.path.join(output_dir, "patch")
            patch_path = os.path.join(output_dir, f"{prefix}_{form_name}.yaml")
            with open(patch_path, 'w', encoding='utf-8') as f:
                yaml.safe_dump(patch_data, f, sort_keys=False, allow_unicode=True)
            logger.info(f"Generated split file: {patch_path}")

        # 生成剩余模型文件
        remaining_formulas = {k: v for k, v in self.formulas.items() if k not in independent_formulas}
        remaining_vars = set()
        for formula in remaining_formulas.values():
            if isinstance(formula.condition, str):
                remaining_vars.update(self._extract_vars_from_expr(formula.condition))
            for var, expr in formula.dynamics.items():
                if isinstance(expr, (int, float)):
                    expr = str(expr)
                remaining_vars.update(self._extract_vars_from_expr(expr))
                if var in self.variables:
                    remaining_vars.add(var)
        remaining_data = {
            'metadata': {
                'name': f"{prefix}_remaining",
                'version': self.metadata.version,
                'author': self.metadata.author,
                'description': f"Remaining shared modules of {prefix}",
            },
            'variables': {
                var: {
                    'description': self.variables[var].description,
                    'value': self.variables[var].value,
                    'type': self.variables[var].type.value,
                    'unit': self.variables[var].unit,
                    'bounds': self.variables[var].bounds
                } for var in remaining_vars if var in self.variables
            },
            'formulas': {
                k: {
                    'description': v.description,
                    'condition': v.condition,
                    'priority': v.priority,
                    'dynamics': v.dynamics
                } for k, v in remaining_formulas.items()
            }
        }
        # 直接使用output_dir生成文件路径
        remaining_path = os.path.join(output_dir, f"{prefix}_remaining.yaml")
        with open(remaining_path, 'w', encoding='utf-8') as f:
            yaml.safe_dump(remaining_data, f, sort_keys=False, allow_unicode=True)
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
            'formulas': {
                form_name: {
                    'description': form.description,
                    'condition': form.condition,
                    'priority': form.priority,
                    'dynamics': form.dynamics,
                    'formula': form.formula
                } for form_name, form in self.formulas.items()
            },
            'simulator': self.simulator,
            'optimizer': self.optimizer
        }
        with open(file_path, 'w', encoding='utf-8') as f:
            yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)
