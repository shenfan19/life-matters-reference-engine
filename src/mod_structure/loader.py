# src/models/loader.py
from .base import ModelMetadata, Variable, Formula, VariableType
from .utils import merge_dicts
from typing import Dict, Set, Any
from asteval import Interpreter
import os
import yaml
import logging

logger = logging.getLogger(__name__)

class Loader:
    # Loader
    def load_model(self, file_path: str, module_name: str) -> Dict[str, Any]:
        """
        从 YAML 文件加载模型内容，支持递归导入，并更新模型状态。
        :param file_path: 要加载的 YAML 文件路径。
        :param module_name: 模块名称，用于日志。
        :return: 合并后的模型数据字典（供上层合并）。
        """
        # 2025-09-29 begin 避免重复加载导入文件，减少覆盖警告
        if file_path in self.visited:
            logger.debug(f"跳过已加载的模型: {file_path}")
            return {}
        self.visited.add(file_path)  # 标记为已访问
        # 2025-09-29 end 避免重复加载导入文件，减少覆盖警告

        self.current_filename = os.path.splitext(os.path.basename(file_path))[0] #设置current_filename
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f) or {}  # 加载 YAML 文件内容
            if not isinstance(data, dict):
                logger.error(f"模型 {file_path} 的 YAML 文件格式无效")  # 检查数据类型
                raise ValueError(f"无效的 YAML 文件: {file_path}")
            
            merged_data = {}  # 初始化合并数据
            imports = data.get('imports', [])  # 获取 imports 字段
            current_dir = os.path.dirname(file_path)  # 获取当前文件目录
            for imp_name in imports:
                if os.sep in imp_name or os.path.isabs(imp_name):
                    imp_path = imp_name if imp_name.endswith('.yaml') else imp_name + '.yaml'
                else:
                    imp_path = os.path.join(current_dir, imp_name + '.yaml' if not imp_name.endswith('.yaml') else imp_name)
                if not os.path.exists(imp_path):
                    raise FileNotFoundError(f"导入模型 {imp_name} 未找到在 {current_dir}")
                imp_data = self.load_model(imp_path, imp_name)  # 递归加载
                merged_data = merge_dicts(merged_data, imp_data)  # 合并导入数据
            
            merged_data = merge_dicts(merged_data, data)  # 根覆盖子
            
            self.variables.clear()  # 清空变量
            self.formulas.clear()  # 清空公式
            self.variable_history.clear()  # 清空历史
            self.simulator.clear()  # 清空 simulator
            self.optimizer.clear()  # 清空 optimizer
            
            for var_name, var_data in merged_data.get('variables', {}).items():
                self.variables[var_name] = Variable(  # 创建 Variable 对象
                    description=var_data.get('description', ''),
                    value=var_data.get('value', 0.0),
                    type=VariableType(var_data.get('type', 'state')),
                    unit=var_data.get('unit'),
                    bounds=var_data.get('bounds')
                )
                self.variable_history[var_name] = [self.variables[var_name].value]  # 初始化历史
            for form_name, form_data in merged_data.get('formulas', {}).items():
                condition = form_data.get('condition', True)  # 获取条件
                self.formulas[form_name] = Formula(  # 创建 Formula 对象
                    description=form_data.get('description', ''),
                    condition=condition,
                    priority=form_data.get('priority', 0),
                    dynamics=form_data.get('dynamics', {}),
                    formula=form_data.get('formula')
                )
            self.simulator = merge_dicts(self.simulator, merged_data.get('simulator', {}))  # 合并 simulator
            self.optimizer = merge_dicts(self.optimizer, merged_data.get('optimizer', {}))  # 合并 optimizer
            self.metadata = ModelMetadata(  # 创建元数据
                name=merged_data.get('metadata', {}).get('name', module_name),
                version=merged_data.get('metadata', {}).get('version', '1.0.0'),
                author=merged_data.get('metadata', {}).get('author', ''),
                description=merged_data.get('metadata', {}).get('description', ''),
                conflicts=merged_data.get('metadata', {}).get('conflicts', []),
                tags=merged_data.get('metadata', {}).get('tags', [])
            )
            
            self._initialize_asteval()  # 初始化符号表
            # self.validate_model()  # 验证模型：关闭，考虑到imports，仅在完全读取完后验证
            logger.info(f"加载模型从 {file_path}")  # 记录加载日志
            return merged_data  # 返回合并数据
        except Exception as e:
            # logger.error(f"加载模型失败从 {file_path}: {e}")  # 记录错误日志
            raise
        
    def append_model(self, file_path: str, module_name: str, log_as_loaded: bool = False, validate: bool = True):
        """
        从 YAML 文件追加模型内容，支持递归导入。
        :param file_path: YAML 文件路径。
        :param module_name: 模块名称。
        :param log_as_loaded: 是否记录为加载。
        :param validate: 是否验证模型。
        """
        self.current_filename = os.path.splitext(os.path.basename(file_path))[0]  # 修改：设置current_filename
        try:
            loaded_data = self.load_model(file_path, module_name)  # 加载数据，包括 imports
            for var_name, var_data in loaded_data.get('variables', {}).items():
                if var_name in self.variables:
                    logger.warning(f"覆盖变量: {var_name}")  # 警告覆盖
                self.variables[var_name] = Variable(  # 创建或覆盖 Variable 对象
                    description=var_data.get('description', ''),
                    value=var_data.get('value', 0.0),
                    type=VariableType(var_data.get('type', 'state')),
                    unit=var_data.get('unit'),
                    bounds=var_data.get('bounds')
                )
                self.variable_history[var_name] = [self.variables[var_name].value]  # 更新历史
            for form_name, form_data in loaded_data.get('formulas', {}).items():
                if form_name in self.formulas:
                    logger.warning(f"覆盖公式: {form_name}")  # 警告覆盖
                condition = form_data.get('condition', True)  # 获取条件
                self.formulas[form_name] = Formula(  # 创建或覆盖 Formula 对象
                    description=form_data.get('description', ''),
                    condition=condition,
                    priority=form_data.get('priority', 0),
                    dynamics=form_data.get('dynamics', {}),
                    formula=form_data.get('formula')
                )
            self.simulator = merge_dicts(self.simulator, loaded_data.get('simulator', {}))  # 合并 simulator
            self.optimizer = merge_dicts(self.optimizer, loaded_data.get('optimizer', {}))  # 合并 optimizer
            
            self._initialize_asteval()  # 更新符号表
            # if validate:
            #     self.validate_model()  # 验证合并后模型：目前关闭，仅在imports完成后验证
            # log_message = f"{'加载' if log_as_loaded else '追加'} 模型从 {file_path}"  # 准备日志消息
            # logger.info(log_message)  # 记录日志
        except Exception as e:
            logger.error(f"追加模型失败从 {file_path}: {e}")  # 错误日志
            raise
