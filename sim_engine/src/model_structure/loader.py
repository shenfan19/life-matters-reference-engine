# src/models/loader.py
from .base import ModelMetadata, Variable, Formula, VariableType, InputSchedule, SchedulePoint, Accumulator, WINDOW_SECONDS, TIME_UNIT_SECONDS
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
                # 尝试从文件路径推断 models 根目录
                # 假设文件在 models/ 或 models/components/ 或 models/stories/ 下
                path_parts = os.path.normpath(file_path).split(os.sep)
                if 'models' in path_parts:
                    mods_idx = path_parts.index('models')
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
                
                # 简单名称：先找当前目录（向后兼容），找不到再递归搜索 mods 树
                else:
                    local_path = os.path.join(current_dir, imp_name + '.yaml' if not imp_name.endswith('.yaml') else imp_name)
                    if os.path.exists(local_path):
                        imp_path = local_path
                    elif mods_root:
                        # fallback：在整个 mods 树中递归查找
                        target = imp_name if imp_name.endswith('.yaml') else imp_name + '.yaml'
                        for walk_root, _, walk_files in os.walk(mods_root):
                            if target in walk_files:
                                imp_path = os.path.join(walk_root, target)
                                break
                    if not imp_path:
                        imp_path = local_path  # 保留原路径用于报错

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
            self.accumulators.clear()
            self.current_step = 0
            self.time = 0.0
        
        # 确保 _param_dist_raw 字典存在（保存分布表达式原始字符串）
        if not hasattr(self, '_param_dist_raw'):
            self._param_dist_raw: dict = {}

        # 应用变量
        import re as _re
        _DIST_RE = _re.compile(
            r'^\s*(normal|uniform|lognormal)\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)\s*$'
        )
        for var_name, var_data in data.get('variables', {}).items():
            if not clear_existing and var_name in self.variables:
                logger.warning(f"覆盖变量 (从 {module_name}): {var_name}")

            value = var_data.get('value', var_data.get('default', 0.0))
            if isinstance(value, str):
                m = _DIST_RE.match(value)
                if m:
                    # 分布表达式：保存原始字符串，用均值（第一参数）作为运行时初始值
                    self._param_dist_raw[var_name] = value
                    try:
                        value = float(m.group(2))
                    except ValueError:
                        value = 0.0
                else:
                    try:
                        value = float(value)
                    except ValueError:
                        pass  # 非分布、非数字字符串保留原样（验证器会报错）

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

        # ── 新格式：start_date / end_date / step / step_unit → 转换为内部字段 ──
        if 'start_date' in simulator_data and 'end_date' in simulator_data:
            step_unit_raw = str(simulator_data.get('step_unit', 'hour')).lower()
            if step_unit_raw not in TIME_UNIT_SECONDS:
                step_unit_raw = 'hour'
            unit_sec = TIME_UNIT_SECONDS[step_unit_raw]
            raw_step  = float(simulator_data.get('step', 1))
            step_sec  = raw_step * unit_sec  # 换算为秒

            # 计算 total_time（秒数）= end_date - start_date
            # 仅做前端展示用，引擎实际用 API 传入的 time_hours
            from datetime import date as _date
            try:
                sd = simulator_data['start_date']
                ed = simulator_data['end_date']
                # 处理 0228-03-01 这类古代日期（Python date 不支持年份 < 1，但可支持到 1 年）
                sy, sm, sdd = [int(x) for x in str(sd).split('-')]
                ey, em, edd = [int(x) for x in str(ed).split('-')]
                # 近似计算天数
                total_days = (ey - sy) * 365 + (em - sm) * 30 + (edd - sdd)
                total_sec = max(0, total_days * 86400)
            except Exception:
                total_sec = 86400  # fallback 1 day

            # 注入兼容字段，让 SimulatorEngine 直接使用
            simulator_data = dict(simulator_data)
            simulator_data['step_size'] = step_sec
            simulator_data['time_unit'] = step_unit_raw
            simulator_data['total_time'] = total_sec / step_sec if step_sec > 0 else 1

        self.simulator = merge_dicts(self.simulator, simulator_data)
        self.optimizer = merge_dicts(self.optimizer, data.get('optimizer', {}))

        # 解析 time_unit（默认 second，保持向后兼容）
        time_unit_raw = str(simulator_data.get('time_unit', 'second')).lower()
        if time_unit_raw not in TIME_UNIT_SECONDS:
            logger.warning(f"未知 time_unit '{time_unit_raw}'，回退为 'second'")
            time_unit_raw = 'second'
        self.time_unit = time_unit_raw

        # 应用计划表 (Schedules)
        schedules_raw = data.get('schedules', {})
        for var_name, sched_data in schedules_raw.items():
            points = []
            for pt in sched_data.get('points', []):
                points.append(SchedulePoint(time=float(pt['time']), value=float(pt['value'])))

            self.schedules[var_name] = InputSchedule(
                variable=var_name,
                points=sorted(points, key=lambda p: p.time),
                interpolation=sched_data.get('interpolation', 'step')
            )

        # 应用每日输入 (daily_inputs) — 转换为 schedules，day 从 1 开始
        daily_inputs_raw = data.get('daily_inputs', {})
        for var_name, di_data in daily_inputs_raw.items():
            points = []
            for pt in di_data.get('values', []):
                time_sec = (float(pt['day']) - 1.0) * 86400.0
                points.append(SchedulePoint(time=time_sec, value=float(pt['value'])))
            if points:
                self.schedules[var_name] = InputSchedule(
                    variable=var_name,
                    points=sorted(points, key=lambda p: p.time),
                    interpolation=di_data.get('interpolation', 'step')
                )

        # 应用累积器 (accumulators)
        accumulators_raw = data.get('accumulators', {})
        for acc_name, acc_data in accumulators_raw.items():
            window_str = acc_data.get('window', 'day').lower()
            if window_str not in WINDOW_SECONDS:
                logger.warning(f"未知累积窗口 '{window_str}'，跳过累积器 '{acc_name}'")
                continue
            operation = acc_data.get('operation', 'sum').lower()
            if operation not in ('sum', 'mean'):
                logger.warning(f"未知累积操作 '{operation}'，跳过累积器 '{acc_name}'")
                continue
            self.accumulators[acc_name] = Accumulator(
                variable=acc_name,
                source=acc_data['source'],
                window=window_str,
                operation=operation,
                unit=acc_data.get('unit'),
                description=acc_data.get('description', ''),
                running_sum=0.0,
                window_start_time=0.0
            )
            # 如果输出变量不存在，自动创建为 state 类型
            if acc_name not in self.variables:
                self.variables[acc_name] = Variable(
                    description=acc_data.get('description',
                        f"Accumulated {acc_data['source']} per {window_str}"),
                    value=0.0,
                    type=VariableType.state,
                    unit=acc_data.get('unit'),
                    bounds=None
                )
                self.variable_history[acc_name] = [0.0]

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
