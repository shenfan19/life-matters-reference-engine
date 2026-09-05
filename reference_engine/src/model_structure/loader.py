# src/models/loader.py
from .base import ModelMetadata, Variable, Equation, VariableType, TIME_UNIT_SECONDS
from .utils import merge_dicts
from ..schedule_runner import resolve_time_interval
from ..yaml_io import safe_load
from typing import Dict, Set, Any, List
from asteval import Interpreter
import os
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

    def _load_model_data(self, file_path: str, module_name: str, _loading_chain: tuple = ()) -> Dict[str, Any]:
        """
        A pure data-loading function: recursively loads a YAML file and its imports,
        returning the merged data dict. Supports the new import path format
        (e.g. models/interventions/diet/banana). Does not mutate self state.

        _loading_chain records the sequence of file paths "currently loading" on this
        recursive call stack, used to distinguish a true circular import (file_path
        appears on the current call stack) from a diamond dependency (file_path was
        already fully loaded earlier, but is not on the current call stack) — both hit
        self.visited, but only the former should raise an error.
        """
        if file_path in _loading_chain:
            chain_desc = ' → '.join(
                self._source_label(p) for p in (*_loading_chain, file_path)
            )
            raise ValueError(f"Circular import detected: {chain_desc}")

        # A diamond dependency: already fully loaded earlier (not on the current call stack), skip the duplicate merge
        if file_path in self.visited:
            logger.debug(f"Skipping already-loaded model: {file_path}")
            return {}
        self.visited.add(file_path)
        _loading_chain = (*_loading_chain, file_path)

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = safe_load(f) or {}

            if not isinstance(data, dict):
                logger.error(f"Invalid YAML format: {file_path}")
                raise ValueError(f"Invalid YAML file: {file_path}")

            # Handle imports
            merged_data = {}
            imports = data.get('imports', [])
            if isinstance(imports, str):
                imports = [imports]
            elif imports is None:
                imports = []
            elif not isinstance(imports, list):
                raise ValueError("imports must be a string or a list of strings")
            current_dir = os.path.dirname(file_path)
            source_label = self._source_label(file_path)
            merged_sources: Dict[str, Any] = {
                'variables': {},
                'equations': {},
                'simulation': {},
                'optimization': {},
                'imports': [],
            }
            # Determine the models root directory (used to resolve the new import-path format)
            # If the file is outside the configured models_directory, infer the root from the file's own path, so a cross-repository import doesn't fail
            configured_dir = self.models_directory if hasattr(self, 'models_directory') else None
            models_root = None
            if configured_dir:
                configured_real = os.path.realpath(configured_dir)
                file_real = os.path.realpath(file_path)
                if file_real.startswith(configured_real + os.sep) or file_real == configured_real:
                    models_root = configured_dir
            if not models_root:
                # Try to infer the models root directory from the file's own path
                # Assumes the file is under models/, models/components/, or models/stories/
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
                        f"Imported model {imp_name} uses an absolute filesystem path. "
                        "Use a models-root-relative path (e.g. papers/paper2/foo) or a relative path (./foo, ../foo)."
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
                        f"Imported model {imp_name} is not an explicit path. "
                        "Write it as a models-root-relative path (e.g. papers/paper2/foo) or a relative path (./foo, ../foo)."
                    )

                if imp_path and models_root:
                    root_real = os.path.realpath(models_root)
                    imp_real = os.path.realpath(imp_path)
                    if not imp_real.startswith(root_real + os.sep) and imp_real != root_real:
                        raise ValueError(f"Imported model {imp_name} is outside the models directory. Resolved path: {imp_path}")

                if not imp_path or not os.path.exists(imp_path):
                    raise FileNotFoundError(
                        f"Imported model {imp_name} was not found. Use a relative path or a models-root-relative path (e.g. papers/paper2/foo). "
                        f"Path tried: {imp_path}"
                    )

                imp_data = self._load_model_data(imp_path, imp_name, _loading_chain)  # recursive load
                imp_sources = imp_data.get('_sources', {})
                if isinstance(imp_sources, dict):
                    merged_sources = self._merge_sources(merged_sources, imp_sources)
                imp_label = self._source_label(imp_path)
                if imp_label not in merged_sources['imports']:
                    merged_sources['imports'].append(imp_label)
                merged_data = merge_dicts(merged_data, imp_data)

            # The root model overrides the imported content
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
            for eq_name in (data.get('equations') or {}).keys():
                merged_sources['equations'][eq_name] = source_label
            if isinstance(local_sim, dict):
                for key in local_sim.keys():
                    merged_sources['simulation'][key] = source_label
            local_optimizer = data.get('optimization') or {}
            if isinstance(local_optimizer, dict):
                for key in local_optimizer.keys():
                    merged_sources['optimization'][key] = source_label
            merged_data['_sources'] = merged_sources

            logger.debug(f"Loaded data from {file_path}")
            return merged_data

        except Exception as e:
            logger.error(f"Failed to load model data from {file_path}: {e}")
            raise

    def _apply_model_data(self, data: Dict[str, Any], module_name: str, clear_existing: bool = True):
        """
        Applies data onto self state.
        :param data: the model data dict
        :param module_name: the module name
        :param clear_existing: whether to clear existing data first (True=replace, False=append/overwrite)
        """
        if clear_existing:
            self.variables.clear()
            self.equations.clear()
            self.variable_history.clear()
            self.simulator.clear()
            self.optimizer.clear()
            self.provenance = {}
            self.current_step = 0
            self.time = 0.0
        self.provenance = data.get('_sources', {})

        # Ensure the _param_dist_raw dict exists (holds the raw distribution-expression strings)
        if not hasattr(self, '_param_dist_raw'):
            self._param_dist_raw: dict = {}

        # Applying variables: type expresses only the role (state/input/parameter). If evidence_type
        # is declared, the variable's value is a raw literature effect size (OR/HR/RR/Cohen's d, etc.),
        # and the Loader converts it in place here into a coefficient usable in an equation (same name,
        # no suffix added); the pre-conversion raw value is kept in evidence_raw_value. The conversion
        # logic is in docs/model.md, "The 8 evidence subtypes". A variable declaring evidence_type must
        # have role parameter (the conversion result itself is a mechanistic coefficient).
        import re as _re
        _DIST_RE = _re.compile(
            r'^\s*(normal|uniform|lognormal)\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)\s*$'
        )
        variables_data = data.get('variables', {})
        for var_name, var_data in variables_data.items():
            if not clear_existing and var_name in self.variables:
                logger.warning(f"Overwriting variable (from {module_name}): {var_name}")

            evidence_type = var_data.get('evidence_type')
            if evidence_type:
                var_role = VariableType(var_data.get('type', 'parameter'))
                if var_role != VariableType.parameter:
                    raise ValueError(
                        f"Variable '{var_name}' declares evidence_type='{evidence_type}', "
                        f"but type='{var_role.value}' — an evidence conversion result can only have role parameter, "
                        "please change it to type: parameter"
                    )
                raw_value = float(var_data.get('value', 0.0))
                if evidence_type in ('rr', 'ir', 'ard', 'beta', 'pk'):
                    effective = raw_value
                elif evidence_type == 'or':
                    p0 = float(var_data.get('baseline_prevalence', 0.0))
                    effective = raw_value / ((1 - p0) + p0 * raw_value)
                elif evidence_type == 'cohens_d':
                    sd = float(var_data.get('population_sd', 1.0))
                    effective = raw_value * sd
                elif evidence_type == 'hr':
                    baseline_ref = var_data.get('baseline_ref', '')
                    baseline_val = float(variables_data.get(baseline_ref, {}).get('value', 0.0))
                    effective = baseline_val * raw_value
                else:
                    logger.warning(f"Unknown evidence_type '{evidence_type}' (variable {var_name}), skipping conversion")
                    continue

                self.variables[var_name] = Variable(
                    description=var_data.get('description', ''),
                    value=effective,
                    type=VariableType.parameter,
                    unit=var_data.get('unit'),
                    reference=var_data.get('reference'),
                    locator=var_data.get('locator'),
                    evidence_type=evidence_type,
                    evidence_raw_value=raw_value
                )
                self.variable_history[var_name] = [effective]
                continue

            value = var_data.get('value', var_data.get('default', 0.0))
            if isinstance(value, str):
                m = _DIST_RE.match(value)
                if m:
                    # A distribution expression: keep the raw string, use the mean (the first argument) as the runtime initial value
                    self._param_dist_raw[var_name] = value
                    try:
                        value = float(m.group(2))
                    except ValueError:
                        value = 0.0
                else:
                    try:
                        value = float(value)
                    except ValueError:
                        pass  # Neither a distribution nor a numeric string, keep it as-is (the validator will flag it)

            self.variables[var_name] = Variable(
                description=var_data.get('description', ''),
                value=value,
                type=VariableType(var_data.get('type', 'state')),
                unit=var_data.get('unit'),
                bounds=var_data.get('bounds'),
                reference=var_data.get('reference'),
                locator=var_data.get('locator')
            )
            self.variable_history[var_name] = [self.variables[var_name].value]

        # applies_to: optional, automatically wires an ir/ard/hr/rr/or conversion result into some state
        # variable's dynamics. cohens_d/beta/pk are not supported (the application is not a single fixed
        # form and must be hand-written). See the design rationale in docs/model.md, "Automatically wiring
        # into dynamics", and home/decisions/2026-06-22_evidence-to-dynamics-discussion-notes.md.
        # This is its own loop (not merged into the conversion loop above), so that baseline_ref already
        # exists in self.variables regardless of declaration order.
        #
        # A rate's "natural time unit" (rate_unit, e.g. year for an annual incidence rate) and an
        # equation's step_unit (the validator only accepts minute|hour|day) are two independent
        # quantities; their ratio is computed as a numeric factor written directly into the generated
        # dynamics expression, without relying on Equation.step_unit to express year/week/month.
        applies_to_targets: Dict[str, str] = {}
        valid_equation_step_units = {'minute', 'hour', 'day'}
        for var_name, var_data in variables_data.items():
            applies_to = var_data.get('applies_to')
            if not applies_to:
                continue
            evidence_type = var_data.get('evidence_type')
            if not evidence_type:
                raise ValueError(
                    f"Variable '{var_name}' declares applies_to but not evidence_type — "
                    "applies_to is only for automatically wiring an evidence conversion result into some "
                    "state variable's dynamics; remove applies_to or add evidence_type"
                )
            if evidence_type in ('cohens_d', 'beta', 'pk'):
                raise ValueError(
                    f"evidence '{var_name}' (evidence_type: {evidence_type}) does not support automatic applies_to wiring into dynamics — "
                    "this subtype's application is not a single fixed form (the transition form / regression structure / PK model structure varies), "
                    "remove applies_to and hand-write dynamics instead"
                )
            if applies_to not in self.variables:
                raise ValueError(
                    f"evidence '{var_name}''s applies_to target '{applies_to}' is not declared in variables"
                )
            if applies_to in applies_to_targets:
                raise ValueError(
                    f"Target state '{applies_to}' has applies_to declared by more than one evidence entry ('{applies_to_targets[applies_to]}' and "
                    f"'{var_name}') — how to combine multiple factors (multiplicative/additive) requires a modeling judgment call, "
                    "remove applies_to and hand-write dynamics instead"
                )
            step_unit = str(var_data.get('step_unit', '')).lower()
            if step_unit not in valid_equation_step_units:
                raise ValueError(
                    f"evidence '{var_name}' must declare a valid step_unit when using applies_to "
                    f"(one of {'/'.join(sorted(valid_equation_step_units))}, consistent with the equations.step_unit rule)"
                )

            if evidence_type in ('rr', 'or'):
                baseline_ref = var_data.get('baseline_ref')
                baseline_entry = variables_data.get(baseline_ref) if baseline_ref else None
                if not baseline_ref or baseline_ref not in self.variables or baseline_entry is None:
                    raise ValueError(
                        f"evidence '{var_name}' (evidence_type: {evidence_type}) must declare baseline_ref when using applies_to, "
                        "and it must point to an ir/ard-type evidence entry in the same file"
                    )
                rate_unit = str(baseline_entry.get('rate_unit', '')).lower()
                expr_template = f"{applies_to} + {baseline_ref} * {var_name} * {{factor}} * step"
            elif evidence_type == 'hr':
                baseline_ref = var_data.get('baseline_ref', '')
                baseline_entry = variables_data.get(baseline_ref, {})
                rate_unit = str(baseline_entry.get('rate_unit', '')).lower()
                expr_template = f"{applies_to} + {var_name} * {{factor}} * step"
            else:  # ir / ard: is itself the baseline rate
                rate_unit = str(var_data.get('rate_unit', '')).lower()
                expr_template = f"{applies_to} + {var_name} * {{factor}} * step"

            if rate_unit not in TIME_UNIT_SECONDS:
                raise ValueError(
                    f"evidence '{var_name}' must be able to determine a rate_unit when using applies_to "
                    f"(one of {'/'.join(TIME_UNIT_SECONDS.keys())}) — ir/ard declare it on their own entry, "
                    "hr/rr/or declare it on the ir/ard entry their baseline_ref points to"
                )
            factor = TIME_UNIT_SECONDS[step_unit] / TIME_UNIT_SECONDS[rate_unit]
            expr = expr_template.format(factor=repr(factor))

            applies_to_targets[applies_to] = var_name
            self.equations[f"_auto_evidence_{var_name}"] = Equation(
                description=f"Auto-generated: evidence '{var_name}' wired into '{applies_to}' (applies_to)",
                dynamics={applies_to: expr},
                step_unit=step_unit,
                step_size_sec=TIME_UNIT_SECONDS[step_unit],
            )

        # Applying equations
        for eq_name, form_data in data.get('equations', {}).items():
            if not clear_existing and eq_name in self.equations:
                logger.warning(f"Overwriting equation (from {module_name}): {eq_name}")

            condition = form_data.get('condition', True)
            self.equations[eq_name] = Equation(
                description=form_data.get('description', ''),
                condition=condition,
                priority=form_data.get('priority', 0),
                dynamics=form_data.get('dynamics', {}),
                reference=form_data.get('reference'),
                locator=form_data.get('locator'),
                step_unit=str(form_data.get('step_unit', '')).lower() or None,
            )

        # Merging simulator and optimizer
        # Supports the new 'simulation' field (backward compatible with 'simulator')
        simulator_data = data.get('simulation', data.get('simulator', {}))

        # ── simulation.step_size is required; read the execution step size ──
        if 'start_date' in simulator_data and 'end_date' in simulator_data:
            sim_step = simulator_data.get('step_size', {})
            if isinstance(sim_step, dict) and 'unit' in sim_step:
                step_unit_raw = str(sim_step.get('unit', 'minute')).lower()
                raw_step = float(sim_step.get('value', 1))
            else:
                raise ValueError(
                    f"simulation.step_size is required, in the format: step_size: {{value: 1, unit: day}}"
                )
            if step_unit_raw not in TIME_UNIT_SECONDS:
                step_unit_raw = 'minute'
            unit_sec = TIME_UNIT_SECONDS[step_unit_raw]
            step_sec  = raw_step * unit_sec  # convert to seconds

            # Compute total_time (in seconds) = end_date - start_date
            # For frontend display only; the engine actually uses time_hours passed in via the API
            from datetime import date as _date
            try:
                sd = simulator_data['start_date']
                ed = simulator_data['end_date']
                # Handle an ancient date like 0228-03-01 (Python's date doesn't support year < 1, but supports down to year 1)
                sy, sm, sdd = [int(x) for x in str(sd).split('-')]
                ey, em, edd = [int(x) for x in str(ed).split('-')]
                if sy >= 1 and ey >= 1:
                    total_days = (_date(ey, em, edd) - _date(sy, sm, sdd)).days
                else:
                    # An ancient date (year < 1), unsupported by Python's date, use an approximation
                    total_days = (ey - sy) * 365 + (em - sm) * 30 + (edd - sdd)
                total_sec = max(0, total_days * 86400)
            except Exception:
                total_sec = 86400  # fallback: 1 day

            # Inject compatibility fields for ReferenceEngine to use directly
            simulator_data = dict(simulator_data)
            simulator_data['step_size'] = step_sec
            simulator_data['time_unit'] = step_unit_raw
            simulator_data['total_time'] = total_sec / step_sec if step_sec > 0 else 1

        self.simulator = merge_dicts(self.simulator, simulator_data)
        self.optimizer = merge_dicts(self.optimizer, data.get('optimization', {}))

        # Cross-step-size import: each equation's `step` is converted according to that equation's own declared step_unit.
        # step_unit is a required field, enforced by the validator; read it directly here.
        for eq_name, form_data in data.get('equations', {}).items():
            if eq_name in self.equations:
                equation_step_unit = str(form_data.get('step_unit', '')).lower()
                if equation_step_unit in TIME_UNIT_SECONDS:
                    self.equations[eq_name].step_size_sec = TIME_UNIT_SECONDS[equation_step_unit]

        # Resolve time_unit (default minute)
        time_unit_raw = str(simulator_data.get('time_unit', 'minute')).lower()
        if time_unit_raw not in TIME_UNIT_SECONDS:
            logger.warning(f"Unknown time_unit '{time_unit_raw}', falling back to 'minute'")
            time_unit_raw = 'minute'
        self.time_unit = time_unit_raw

        # Applying schedules (Regimens)
        # The only supported format: simulation.plans[*].regimens (ADR 0076, field names per ADR 0117), each plan is a
        # [{variable, time_start:"HH:MM", time_end:"HH:MM"(optional), value, days:[...],
        #   date_range:["YYYY-MM-DD", "YYYY-MM-DD"](optional), delivery:"level"(optional, ADR 0132)}]
        # The legacy simulation.schedules (a flat list/dict) is no longer supported.
        # All plans are parsed into the schedule-compatible format and stored in self.plans[plan_id] (List[dict]);
        # the first plan is also set as self.schedule_entries, for run_simulation's
        # apply_schedules path to use (unifying the CLI/GUI paths, supporting both pulse and sustained).
        self.plans = {}
        self.schedule_entries = []
        plans_raw = simulator_data.get('plans')
        if isinstance(plans_raw, list):
            for i, plan in enumerate(plans_raw):
                plan_id = plan.get('id') or f'plan_{i}'
                self.plans[plan_id] = self._parse_schedule_entries(
                    plan.get('regimens', []), simulator_data
                )
            if self.plans:
                first_plan_id = plans_raw[0].get('id') or 'plan_0'
                self.schedule_entries = self.plans[first_plan_id]

        # Update metadata (if in clear mode)
        if clear_existing:
            self.metadata = ModelMetadata(
                name=data.get('metadata', {}).get('name', module_name),
                version=data.get('metadata', {}).get('version', '1.0.0'),
                author=data.get('metadata', {}).get('author', ''),
                description=data.get('metadata', {}).get('description', ''),
                conflicts=data.get('metadata', {}).get('conflicts', []),
                tags=data.get('metadata', {}).get('tags', [])
            )

        # Update the symbol table
        self._initialize_asteval()

    def _parse_schedule_entries(self, entries: list, simulator_data: Dict[str, Any]) -> list:
        """Parses a single plan's regimens list into an apply_schedules-compatible schedule list.

        Each entry generates one schedule dict, in the same format as the optimizer path:
          {'variable': str, 'events': [{'time_start', 'time_end', 'value',
                                         'days'(optional), 'valid_start'/'valid_end'(optional),
                                         'delivery'(optional, 'level' or omitted)}]}
        time_start == time_end -> a single-step window; unequal -> a multi-step window (handled by apply_schedules).
        The two share the same numeric semantics (the same rule as ADR 0099); the window width is resolved by
        resolve_time_interval per the ADR 0127 default rule: neither given -> spread across the whole day; only
        time_start given -> a single step; both given -> an explicit interval.
        With `delivery: level` (ADR 0132), value is a constant level, delivered directly on each matched step
        with no division by N_steps; the default ('total') is the existing behavior — a window's/matched day's
        total is spread across N_steps.
        """
        if not isinstance(entries, list) or not entries:
            return []

        result = []
        for entry in entries:
            var_name = entry.get('variable')
            if not var_name:
                continue
            time_start, time_end = resolve_time_interval(entry)
            value = float(entry.get('value', 0.0))

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

            if entry.get('delivery') == 'level':
                ev['delivery'] = 'level'

            label = entry.get('label')
            if label:
                ev['label'] = str(label)

            result.append({'variable': var_name, 'events': [ev]})

        return result

    def load_model(self, file_path: str, module_name: str):
        """
        Loads a single model file (replace mode): clears existing content, loads the new model and its imports.
        Used for: an initial load, fetching a single model
        """
        self.current_filename = os.path.splitext(os.path.basename(file_path))[0]
        self.visited.clear()  # reset the visited record

        # Load the data
        data = self._load_model_data(file_path, module_name)

        # Apply the data (clear mode)
        self._apply_model_data(data, module_name, clear_existing=True)

        logger.info(f"Loaded model from {file_path}")

    def append_model(self, file_path: str, module_name: str, log_as_loaded: bool = False, validate: bool = True):
        """
        Appends a model file (append mode): does not clear existing content, appends/overwrites variables and equations.
        Used for: merging multiple models
        Note: visited is not cleared here, it's managed by the caller
        """
        self.current_filename = os.path.splitext(os.path.basename(file_path))[0]

        try:
            # Load the data (including imports)
            data = self._load_model_data(file_path, module_name)

            # Apply the data (append mode)
            self._apply_model_data(data, module_name, clear_existing=False)

            if log_as_loaded:
                log_message = f"Load model from: {file_path}"
            else:
                log_message = f"Append model from: {file_path}"

            logger.info(log_message)

        except Exception as e:
            logger.error(f"Failed to append model from {file_path}: {e}")
            raise
