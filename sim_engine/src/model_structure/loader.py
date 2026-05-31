# src/models/loader.py
from .base import ModelMetadata, Variable, Formula, VariableType, InputSchedule, SchedulePoint, Accumulator, WINDOW_SECONDS, TIME_UNIT_SECONDS
from .utils import merge_dicts
from typing import Dict, Set, Any, List
from asteval import Interpreter
import os
import yaml
import logging

logger = logging.getLogger(__name__)

class Loader:
    @staticmethod
    def _yaml_path_candidates(path: str) -> List[str]:
        if path.lower().endswith(('.yaml', '.yml')):
            return [path]
        return [path + '.yaml', path + '.yml']

    def _source_label(self, file_path: str) -> str:
        models_root = self.models_directory if hasattr(self, 'models_directory') else None
        try:
            if models_root:
                rel = os.path.relpath(file_path, models_root).replace(os.sep, '/')
            else:
                rel = os.path.basename(file_path)
        except ValueError:
            rel = os.path.basename(file_path)
        return rel.rsplit('.', 1)[0] if rel.lower().endswith(('.yaml', '.yml')) else rel

    @staticmethod
    def _append_unique(items: List[str], values: Any) -> None:
        if not isinstance(values, list):
            return
        for value in values:
            value = str(value)
            if value not in items:
                items.append(value)

    def _merge_sources(self, base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
        merged = merge_dicts(base, override)
        base_imports = list(base.get('imports', [])) if isinstance(base.get('imports'), list) else []
        override_imports = override.get('imports', []) if isinstance(override.get('imports'), list) else []
        for item in override_imports:
            if item not in base_imports:
                base_imports.append(item)
        if base_imports:
            merged['imports'] = base_imports
        return merged

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
            if isinstance(imports, str):
                imports = [imports]
            elif imports is None:
                imports = []
            elif not isinstance(imports, list):
                raise ValueError("imports 必须是字符串或字符串列表")
            current_dir = os.path.dirname(file_path)
            source_label = self._source_label(file_path)
            merged_sources: Dict[str, Any] = {
                'variables': {},
                'formulas': {},
                'simulation': {},
                'optimizer': {},
                'imports': [],
            }
            imported_output_variables: List[str] = []
            imported_output_types: List[str] = []
            
            # 获取 models 根目录（用于解析新格式的导入路径）
            models_root = self.models_directory if hasattr(self, 'models_directory') else None
            if not models_root:
                # 尝试从文件路径推断 models 根目录
                # 假设文件在 models/ 或 models/components/ 或 models/stories/ 下
                path_parts = os.path.normpath(file_path).split(os.sep)
                if 'models' in path_parts:
                    models_idx = path_parts.index('models')
                    models_root = os.sep.join(path_parts[:models_idx + 1])
            
            for imp_name in imports:
                imp_path = None
                imp_name = str(imp_name)
                imp_name_normalized = imp_name.replace('\\', '/')
                
                # Rooted model path: relative to the models/ directory.
                # Accept both "papers/foo" and legacy "models/papers/foo".
                if os.path.isabs(imp_name) or imp_name_normalized.startswith('/'):
                    raise ValueError(
                        f"导入模型 {imp_name} 使用了文件系统绝对路径。"
                        "请使用 models 根路径（如 papers/paper2/foo）或相对路径（./foo, ../foo）。"
                    )

                if imp_name_normalized.startswith('.'):
                    imp_base_path = os.path.normpath(os.path.join(current_dir, imp_name_normalized.replace('/', os.sep)))
                    imp_candidates = self._yaml_path_candidates(imp_base_path)
                    imp_path = next((candidate for candidate in imp_candidates if os.path.exists(candidate)), imp_candidates[0])

                elif models_root and '/' in imp_name_normalized:
                    if imp_name_normalized.startswith('models/'):
                        imp_name_normalized = imp_name_normalized[len('models/'):]
                    imp_base_path = os.path.join(models_root, imp_name_normalized.replace('/', os.sep))
                    imp_candidates = self._yaml_path_candidates(imp_base_path)
                    imp_path = next((candidate for candidate in imp_candidates if os.path.exists(candidate)), imp_candidates[0])

                else:
                    raise ValueError(
                        f"导入模型 {imp_name} 不是显式路径。"
                        "请写成 models 根路径（如 papers/paper2/foo）或相对路径（./foo, ../foo）。"
                    )

                if imp_path and models_root:
                    root_real = os.path.realpath(models_root)
                    imp_real = os.path.realpath(imp_path)
                    if not imp_real.startswith(root_real + os.sep) and imp_real != root_real:
                        raise ValueError(f"导入模型 {imp_name} 超出 models 目录。解析路径: {imp_path}")

                if not imp_path or not os.path.exists(imp_path):
                    raise FileNotFoundError(
                        f"导入模型 {imp_name} 未找到。支持相对路径或 models 根路径（如 papers/paper2/foo）。"
                        f"尝试路径: {imp_path}"
                    )

                imp_data = self._load_model_data(imp_path, imp_name)  # 递归加载
                imp_sources = imp_data.get('_sources', {})
                if isinstance(imp_sources, dict):
                    merged_sources = self._merge_sources(merged_sources, imp_sources)
                imp_label = self._source_label(imp_path)
                if imp_label not in merged_sources['imports']:
                    merged_sources['imports'].append(imp_label)
                imp_sim = imp_data.get('simulation') or imp_data.get('simulator') or {}
                self._append_unique(imported_output_variables, imp_sim.get('output_variables'))
                self._append_unique(imported_output_types, imp_sim.get('output_types'))
                merged_data = merge_dicts(merged_data, imp_data)

            if imported_output_variables or imported_output_types:
                sim_key = 'simulation' if 'simulation' in merged_data or 'simulation' in data else 'simulator'
                merged_data.setdefault(sim_key, {})
                if imported_output_variables:
                    merged_data[sim_key]['output_variables'] = imported_output_variables
                if imported_output_types:
                    merged_data[sim_key]['output_types'] = imported_output_types
            
            # 根模型覆盖导入的内容
            merged_data = merge_dicts(merged_data, data)
            local_sim = data.get('simulation') or data.get('simulator') or {}
            if isinstance(local_sim, dict) and (
                'output_variables' in local_sim or 'output_types' in local_sim
            ):
                sim_key = 'simulation' if 'simulation' in merged_data else 'simulator'
                if isinstance(merged_data.get(sim_key), dict):
                    for output_key in ('output_variables', 'output_types'):
                        if output_key not in local_sim:
                            merged_data[sim_key].pop(output_key, None)
            for var_name in (data.get('variables') or {}).keys():
                merged_sources['variables'][var_name] = source_label
            for form_name in (data.get('formulas') or {}).keys():
                merged_sources['formulas'][form_name] = source_label
            if isinstance(local_sim, dict):
                for key in local_sim.keys():
                    merged_sources['simulation'][key] = source_label
            local_optimizer = data.get('optimizer') or {}
            if isinstance(local_optimizer, dict):
                for key in local_optimizer.keys():
                    merged_sources['optimizer'][key] = source_label
            merged_data['_sources'] = merged_sources
            
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
            self.provenance = {}
            self.current_step = 0
            self.time = 0.0
        self.provenance = data.get('_sources', {})
        
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

        # ── 新格式：start_date / end_date，步长从 metadata.step_size 读取 ──
        # 优先级：metadata.step_size > simulation.step_unit/step（向后兼容）
        if 'start_date' in simulator_data and 'end_date' in simulator_data:
            meta_step = data.get('metadata', {}).get('step_size', {})
            if isinstance(meta_step, dict) and 'unit' in meta_step:
                step_unit_raw = str(meta_step.get('unit', 'minute')).lower()
                raw_step = float(meta_step.get('value', 1))
            else:
                step_unit_raw = str(simulator_data.get('step_unit', 'minute')).lower()
                raw_step = float(simulator_data.get('step', 1))
            if step_unit_raw not in TIME_UNIT_SECONDS:
                step_unit_raw = 'minute'
            unit_sec = TIME_UNIT_SECONDS[step_unit_raw]
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
                if sy >= 1 and ey >= 1:
                    total_days = (_date(ey, em, edd) - _date(sy, sm, sdd)).days
                else:
                    # 古代日期（年份 < 1），Python date 不支持，用近似算法
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

        # 应用计划表 (Schedules) — 从 simulation.schedules 读取
        # 支持两种格式：
        #   新格式（list）：[{variable, time:"HH:MM", value, days:[...], date_range:["YYYY-MM-DD", "YYYY-MM-DD"]}]
        #   旧格式（dict）：{var_name: {interpolation, points:[{time:秒数, value}]}}
        schedules_raw = simulator_data.get('schedules', {})

        if isinstance(schedules_raw, list):
            from datetime import date as _sdate, timedelta as _std
            from collections import defaultdict as _dd
            _DAY_MAP = {'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5, 'Sun': 6}

            sd_str = str(simulator_data.get('start_date', '2000-01-01'))
            ed_str = str(simulator_data.get('end_date', sd_str))
            try:
                sy, sm, sdd = [int(x) for x in sd_str.split('-')]
                ey, em, edd = [int(x) for x in ed_str.split('-')]
                sim_start = _sdate(sy, sm, sdd)
                sim_end   = _sdate(ey, em, edd)
            except Exception:
                logger.warning("新格式 schedules 需要 start_date/end_date，跳过展开")
                sim_start = sim_end = None

            if sim_start is not None:
                var_points_map = _dd(list)
                for entry in schedules_raw:
                    var_name = entry.get('variable')
                    if not var_name:
                        continue
                    time_str = str(entry.get('time', '00:00'))
                    hh, mm = [int(x) for x in time_str.split(':')]
                    tod_sec = hh * 3600 + mm * 60
                    value = float(entry.get('value', 0.0))

                    days_raw = entry.get('days')
                    valid_days = (
                        {_DAY_MAP[d] for d in days_raw if d in _DAY_MAP}
                        if days_raw else set(range(7))
                    )

                    dr = entry.get('date_range')
                    if dr and isinstance(dr, list) and len(dr) == 2:
                        rs, re_ = str(dr[0]), str(dr[1])
                        ry, rm, rd = [int(x) for x in rs.split('-')]
                        ry2, rm2, rd2 = [int(x) for x in re_.split('-')]
                        range_start = max(sim_start, _sdate(ry, rm, rd))
                        range_end   = min(sim_end,   _sdate(ry2, rm2, rd2))
                    else:
                        range_start, range_end = sim_start, sim_end

                    cur = range_start
                    while cur <= range_end:
                        if cur.weekday() in valid_days:
                            offset_sec = (cur - sim_start).days * 86400 + tod_sec
                            var_points_map[var_name].append(
                                SchedulePoint(time=float(offset_sec), value=value)
                            )
                        cur += _std(days=1)

                for var_name, pts in var_points_map.items():
                    self.schedules[var_name] = InputSchedule(
                        variable=var_name,
                        points=sorted(pts, key=lambda p: p.time),
                        interpolation='pulse'
                    )
        else:
            # 旧格式（dict）
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
