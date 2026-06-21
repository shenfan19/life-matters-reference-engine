# src/models/loader.py
from .base import ModelMetadata, Variable, Formula, VariableType, Accumulator, WINDOW_SECONDS, TIME_UNIT_SECONDS
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
            # 获取 models 根目录（用于解析新格式的导入路径）
            # 若文件在配置的 models_directory 之外，从文件路径推断根目录，避免跨仓库 import 失败
            configured_dir = self.models_directory if hasattr(self, 'models_directory') else None
            models_root = None
            if configured_dir:
                configured_real = os.path.realpath(configured_dir)
                file_real = os.path.realpath(file_path)
                if file_real.startswith(configured_real + os.sep) or file_real == configured_real:
                    models_root = configured_dir
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
                merged_data = merge_dicts(merged_data, imp_data)

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
                bounds=var_data.get('bounds'),
                reference=var_data.get('reference')
            )
            self.variable_history[var_name] = [self.variables[var_name].value]

        # 应用 evidence：Loader 在加载阶段自动换算为 `_effective` 参数变量，
        # 换算逻辑见 docs/model.md「evidence 的 8 种子类型」。
        for ev_name, ev_data in data.get('evidence', {}).items():
            ev_type = ev_data.get('type')
            value = float(ev_data.get('value', 0.0))
            if ev_type in ('rr', 'ir', 'ard', 'beta', 'pk'):
                effective = value
            elif ev_type == 'or':
                p0 = float(ev_data.get('baseline_prevalence', 0.0))
                effective = value / ((1 - p0) + p0 * value)
            elif ev_type == 'cohens_d':
                sd = float(ev_data.get('population_sd', 1.0))
                effective = value * sd
            elif ev_type == 'hr':
                baseline_ref = ev_data.get('baseline_ref', '')
                baseline_val = float(data.get('evidence', {}).get(baseline_ref, {}).get('value', 0.0))
                effective = baseline_val * value
            else:
                logger.warning(f"未知 evidence 类型 '{ev_type}'（变量 {ev_name}），跳过 _effective 换算")
                continue

            eff_name = f"{ev_name}_effective"
            self.variables[eff_name] = Variable(
                description=ev_data.get('description', ''),
                value=effective,
                type=VariableType.parameter,
                unit=ev_data.get('unit'),
                reference=ev_data.get('reference'),
                evidence_type=ev_type,
                evidence_raw_value=value
            )
            self.variable_history[eff_name] = [effective]

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
                reference=form_data.get('reference'),
                step_unit=str(form_data.get('step_unit', '')).lower() or None,
            )
        
        # 合并 simulator 和 optimizer
        # 支持新的 'simulation' 字段（向后兼容 'simulator'）
        simulator_data = data.get('simulation', data.get('simulator', {}))

        # ── simulation.step_size 必填，读取执行步长 ──
        if 'start_date' in simulator_data and 'end_date' in simulator_data:
            sim_step = simulator_data.get('step_size', {})
            if isinstance(sim_step, dict) and 'unit' in sim_step:
                step_unit_raw = str(sim_step.get('unit', 'minute')).lower()
                raw_step = float(sim_step.get('value', 1))
            else:
                raise ValueError(
                    f"simulation.step_size 必填，格式：step_size: {{value: 1, unit: day}}"
                )
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

        # 跨步长 import：每条公式的 `step` 按公式自身声明的 step_unit 换算。
        # step_unit 是必填字段，validator 强制检查；此处直接读取。
        for form_name, form_data in data.get('formulas', {}).items():
            if form_name in self.formulas:
                formula_step_unit = str(form_data.get('step_unit', '')).lower()
                if formula_step_unit in TIME_UNIT_SECONDS:
                    self.formulas[form_name].step_size_sec = TIME_UNIT_SECONDS[formula_step_unit]

        # 解析 time_unit（默认 minute）
        time_unit_raw = str(simulator_data.get('time_unit', 'minute')).lower()
        if time_unit_raw not in TIME_UNIT_SECONDS:
            logger.warning(f"未知 time_unit '{time_unit_raw}'，回退为 'minute'")
            time_unit_raw = 'minute'
        self.time_unit = time_unit_raw

        # 应用计划表 (Schedules)
        # 唯一支持格式：simulation.plans[*].schedules（ADR 0076），每个 plan 是
        # [{variable, time_start:"HH:MM", time_end:"HH:MM"(可选), value, days:[...],
        #   date_range:["YYYY-MM-DD", "YYYY-MM-DD"](可选)}]
        # 不再支持旧版 simulation.schedules（扁平 list/dict）。
        # 所有 plans 解析为 schedule 兼容格式存入 self.plans[plan_id]（List[dict]）；
        # 第一个 plan 同时设为 self.schedule_entries，供 run_simulation 的
        # apply_schedules 路径使用（CLI/GUI 路径统一，支持 pulse 和 sustained）。
        self.plans = {}
        self.schedule_entries = []
        plans_raw = simulator_data.get('plans')
        if isinstance(plans_raw, list):
            for i, plan in enumerate(plans_raw):
                plan_id = plan.get('id') or f'plan_{i}'
                self.plans[plan_id] = self._parse_schedule_entries(
                    plan.get('schedules', []), simulator_data
                )
            if self.plans:
                first_plan_id = plans_raw[0].get('id') or 'plan_0'
                self.schedule_entries = self.plans[first_plan_id]

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

    def _parse_schedule_entries(self, entries: list, simulator_data: Dict[str, Any]) -> list:
        """将单个 plan 的 schedules 列表解析为 apply_schedules 兼容的 schedule list。

        每个条目生成一个 schedule dict，格式与 optimizer path 一致：
          {'variable': str, 'events': [{'time_start', 'time_end', 'value',
                                         'days'(可选), 'valid_start'/'valid_end'(可选)}]}
        time_start == time_end → pulse；不等 → sustained（由 apply_schedules 处理）。
        """
        if not isinstance(entries, list) or not entries:
            return []

        result = []
        for entry in entries:
            var_name = entry.get('variable')
            if not var_name:
                continue
            time_start = str(entry.get('time_start', '00:00'))
            time_end   = str(entry.get('time_end', time_start))
            value      = float(entry.get('value', 0.0))

            ev: Dict[str, Any] = {
                'time_start': time_start,
                'time_end':   time_end,
                'value':      value,
            }
            days_raw = entry.get('days')
            if days_raw:
                ev['days'] = list(days_raw)

            dr = entry.get('date_range')
            if isinstance(dr, list) and len(dr) == 2:
                ev['valid_start'] = str(dr[0])
                ev['valid_end']   = str(dr[1])

            label = entry.get('label')
            if label:
                ev['label'] = str(label)

            result.append({'variable': var_name, 'events': [ev]})

        return result

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
