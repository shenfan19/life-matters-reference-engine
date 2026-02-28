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
    def _load_model_data(self, file_path: str, module_name: str) -> Dict[str, Any]:
        """
        纯数据加载函数：递归加载 YAML 文件及其 imports，返回合并后的数据字典。
        支持新的导入路径格式（如 models/interventions/diet/banana）。
        不修改 self 状态。
        """
        # 避免循环依赖
        if file_path in self.visited:
            logger.debug(f"跳过已加载的模型: {file_path}")
            return {}
        self.visited.add(file_path)

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f) or {}
            
            if not isinstance(data, dict):
                logger.error(self.lang_manager.get_translation("invalid_yaml_format", file_path=file_path))
                raise ValueError(self.lang_manager.get_translation("invalid_yaml_file", file_path=file_path))
            
            # 处理 imports
            merged_data = {}
            imports = data.get('imports', [])
            current_dir = os.path.dirname(file_path)
            
            # 获取 mods 根目录（用于解析新格式的导入路径）
            mods_root = self.mods_directory if hasattr(self, 'mods_directory') else None
            if not mods_root:
                # 尝试从文件路径推断 mods 根目录
                # 假设文件在 mods/ 或 mods/models/ 或 mods/stories/ 下
                path_parts = os.path.normpath(file_path).split(os.sep)
                if 'mods' in path_parts:
                    mods_idx = path_parts.index('mods')
                    mods_root = os.sep.join(path_parts[:mods_idx + 1])
            
            for imp_name in imports:
                imp_path = None
                
                # 新格式：models/xxx/yyy, scenarios/xxx/yyy 或 stories/xxx/yyy（从 mods 根目录解析）
                if ('models/' in imp_name or 'scenarios/' in imp_name or 'stories/' in imp_name or 
                    imp_name.startswith('models\\') or imp_name.startswith('scenarios\\') or imp_name.startswith('stories\\')):
                    if mods_root:
                        # 标准化路径分隔符
                        imp_name_normalized = imp_name.replace('/', os.sep)
                        imp_path = os.path.join(mods_root, imp_name_normalized)
                        if not imp_path.endswith('.yaml'):
                            imp_path += '.yaml'
                
                # 绝对路径或包含路径分隔符
                elif os.sep in imp_name or '/' in imp_name or os.path.isabs(imp_name):
                    # 如果是绝对路径，直接使用
                    if os.path.isabs(imp_name):
                        imp_path = imp_name
                    else:
                        # 相对于当前文件目录（向后兼容）
                        imp_path = os.path.join(current_dir, imp_name.replace('/', os.sep))
                    
                    if not imp_path.endswith('.yaml'):
                        imp_path += '.yaml'
                
                # 简单名称：相对于当前文件目录（向后兼容）
                else:
                    imp_path = os.path.join(current_dir, imp_name + '.yaml' if not imp_name.endswith('.yaml') else imp_name)
                
                if not os.path.exists(imp_path):
                    raise FileNotFoundError(f"导入模型 {imp_name} 未找到。尝试路径: {imp_path}")
                
                imp_data = self._load_model_data(imp_path, imp_name)  # 递归加载
                merged_data = merge_dicts(merged_data, imp_data)
            
            # 根模型覆盖导入的内容
            merged_data = merge_dicts(merged_data, data)
            
            logger.debug(f"加载数据从 {file_path}")
            return merged_data
            
        except Exception as e:
            logger.error(f"加载模型数据失败从 {file_path}: {e}")
            raise

    def _apply_model_data(self, data: Dict[str, Any], module_name: str, clear_existing: bool = True):
        """
        将数据应用到 self 状态。
        :param data: 模型数据字典
        :param module_name: 模块名称
        :param clear_existing: 是否清空现有数据（True=替换，False=追加/覆盖）
        """
        if clear_existing:
            self.variables.clear()
            self.formulas.clear()
            self.variable_history.clear()
            self.simulator.clear()
            self.optimizer.clear()
            self.current_step = 0
            self.time = 0.0
        
        # 应用变量
        for var_name, var_data in data.get('variables', {}).items():
            if not clear_existing and var_name in self.variables:
                logger.warning(f"覆盖变量 (从 {module_name}): {var_name}")
            
            value = var_data.get('value', var_data.get('default', 0.0))
            if isinstance(value, str):
                try:
                    value = float(value)
                except ValueError:
                    pass

            self.variables[var_name] = Variable(
                description=var_data.get('description', ''),
                value=value,
                type=VariableType(var_data.get('type', 'state')),
                unit=var_data.get('unit'),
                bounds=var_data.get('bounds')
            )
            self.variable_history[var_name] = [self.variables[var_name].value]
        
        # 应用公式
        for form_name, form_data in data.get('formulas', {}).items():
            if not clear_existing and form_name in self.formulas:
                logger.warning(f"覆盖公式 (从 {module_name}): {form_name}")
            
            condition = form_data.get('condition', True)
            self.formulas[form_name] = Formula(
                description=form_data.get('description', ''),
                condition=condition,
                priority=form_data.get('priority', 0),
                dynamics=form_data.get('dynamics', {}),
                formula=form_data.get('formula')
            )
        
        # 合并 simulator 和 optimizer
        # 支持新的 'simulation' 字段（向后兼容 'simulator'）
        simulator_data = data.get('simulation', data.get('simulator', {}))
        self.simulator = merge_dicts(self.simulator, simulator_data)
        self.optimizer = merge_dicts(self.optimizer, data.get('optimizer', {}))
        
        # 更新元数据（如果是清空模式）
        if clear_existing:
            self.metadata = ModelMetadata(
                name=data.get('metadata', {}).get('name', module_name),
                version=data.get('metadata', {}).get('version', '1.0.0'),
                author=data.get('metadata', {}).get('author', ''),
                description=data.get('metadata', {}).get('description', ''),
                conflicts=data.get('metadata', {}).get('conflicts', []),
                tags=data.get('metadata', {}).get('tags', [])
            )
        
        # 更新符号表
        self._initialize_asteval()

    def load_model(self, file_path: str, module_name: str):
        """
        加载单个模型文件（替换模式）：清空现有内容，加载新模型及其 imports。
        适用于：初次加载、fetch 单个模型
        """
        self.current_filename = os.path.splitext(os.path.basename(file_path))[0]
        self.visited.clear()  # 重置访问记录
        
        # 加载数据
        data = self._load_model_data(file_path, module_name)
        
        # 应用数据（清空模式）
        self._apply_model_data(data, module_name, clear_existing=True)
        
        logger.info(f"加载模型从 {file_path}")

    def append_model(self, file_path: str, module_name: str, log_as_loaded: bool = False, validate: bool = True):
        """
        追加模型文件（追加模式）：不清空现有内容，追加/覆盖变量和公式。
        适用于：合并多个模型
        注意：visited 不会被清空，由调用者管理
        """
        self.current_filename = os.path.splitext(os.path.basename(file_path))[0]
        
        try:
            # 加载数据（包括 imports）
            data = self._load_model_data(file_path, module_name)
            
            # 应用数据（追加模式）
            self._apply_model_data(data, module_name, clear_existing=False)
            
            if log_as_loaded:
                log_message = self.lang_manager.get_translation("load_model_from", file_path=file_path)
            else:
                log_message = self.lang_manager.get_translation("append_model_from", file_path=file_path)
            
            logger.info(log_message)
            
        except Exception as e:
            logger.error(f"追加模型失败从 {file_path}: {e}")
            raise
