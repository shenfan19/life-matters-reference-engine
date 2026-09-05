# -*- coding: utf-8 -*-
# reference_engine.py — model loading, CLI simulation (single/MC/all-plans).
# GUI session management → session_manager.py (SessionManagerMixin)
# Pulse schedule execution → schedule_runner.py
# MC distribution utilities + model cloning → mc_utils.py

import logging
import numpy as np
import csv
import os
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable, Tuple
from .model_structure import ModelStructure
from .loader_engine import LoaderEngine
from .session_manager import SessionManagerMixin
from .mc_utils import apply_parameter_sampling, collect_param_distributions, clone_model, derive_seed_list
from .schedule_runner import advance_steps, precompute_sustained_divisors
from .validation import validate_simulator_dates, validate_schedule_list
from . import run_logging
from . import paths
from time import time as _time

# Initialize the module's logger, used to record info and errors during simulation.
logger = logging.getLogger(__name__)

class ReferenceEngine(SessionManagerMixin):
    """The LM Reference Engine: runs and manages the simulation/optimization flow, exposing a black-box evaluation interface, supporting both the CLI and the GUI."""
    VALID_OUTPUT_TYPES = {'input', 'parameter', 'state'}

    def __init__(self, models_directory: str = "models"):
        """
        Initializes the simulation engine.
        :param models_directory: the path to the models directory.
        """
        # Initialize a LoaderEngine to load models, given the models directory.
        self.loader = LoaderEngine(models_directory)
        # Initialize the current model as None.
        self.current_model: Optional[ModelStructure] = None
        # Initialize the current simulation step count.
        self.current_step = 0
        # Initialize the simulation time (in seconds).
        self.time = 0.0

        # GUI session management
        self.sessions: Dict[str, Dict[str, Any]] = {}  # session_id -> session_data

    def _resolve_output_variables(self, model: ModelStructure) -> Tuple[List[str], List[str]]:
        sim = model.simulator or {}
        raw_vars = sim.get('output_variables')
        raw_types = sim.get('output_types')
        vars_selected = isinstance(raw_vars, list) and len(raw_vars) > 0
        types_selected = isinstance(raw_types, list) and len(raw_types) > 0
        warnings: List[str] = []
        output_variables: List[str] = []

        def add_var(name: str) -> None:
            if name not in output_variables:
                output_variables.append(name)

        if not vars_selected and not types_selected:
            return list(model.variables.keys()), warnings

        if vars_selected:
            for var_name in raw_vars:
                var_name = str(var_name)
                if var_name in model.variables:
                    add_var(var_name)
                else:
                    warnings.append(f"A variable in output_variables does not exist, skipped: {var_name}")

        if types_selected:
            selected_types = {str(t) for t in raw_types}
            invalid_types = sorted(selected_types - self.VALID_OUTPUT_TYPES)
            if invalid_types:
                warnings.append(f"output_types contains unknown types, ignored: {', '.join(invalid_types)}")
            selected_types &= self.VALID_OUTPUT_TYPES
            for name, var in model.variables.items():
                var_type = var.type.value if hasattr(var.type, 'value') else str(var.type)
                if var_type in selected_types:
                    add_var(name)

        return output_variables, warnings

    def load_models(self, model_names: List[str], folder: Optional[str] = None) -> bool:
        """
        Loads the model with the given name.
        :param model_names: a list of model names (only the first is used).
        :param folder: a subfolder name.
        :return: whether the load succeeded.
        """
        # Load the first model via LoaderEngine's fetch method.
        self.current_model = self.loader.fetch(model_names[0], folder, use_cache=False)
        # Return whether the load succeeded.
        return self.current_model is not None

    # ==================== The original CLI functionality (kept compatible) ====================

    def run_simulation(self, model_name: str, time_hours: float, folder: Optional[str] = None,
                      output_path: Optional[str] = None,
                      log_cb: Optional[Callable[[str], None]] = None) -> Dict[str, Any]:
        """
        The main simulation-running function (used by the CLI).
        :param model_name: the model name.
        :param time_hours: the total simulation time (in hours).
        :param folder: a subfolder name.
        :param output_path: the CSV output file path (optional).
        :param log_cb: an optional callback receiving run-info text lines (model size / output variables /
            warnings / timing stats); shares run_logging.py's content-generation logic with the GUI's session
            log panel (session_manager.py), only differing in the output channel (ADR 0119). When not
            provided, these messages are not produced (backward compatible).
        :return: the simulation result dict.
        """
        # If a model name was given but loading fails, return an error.
        if model_name and not self.load_models([model_name], folder):
            return {"success": False, "error": self.loader.last_error or f"Failed to load model: {model_name}"}
        # If no model is currently loaded, return an error.
        if not self.current_model:
            return {"success": False, "error": "No model loaded"}

        # Upfront validation of date/time field formats, so a format error isn't silently defaulted deep in the logic
        # (validation.py is shared between the CLI and GUI, so the error message is consistent).
        try:
            validate_simulator_dates(
                self.current_model.simulator.get('start_date'),
                self.current_model.simulator.get('end_date'),
            )
            validate_schedule_list(getattr(self.current_model, 'schedule_entries', []))
        except ValueError as e:
            logger.error(f"Input validation failed: {e}")
            return {"success": False, "error": str(e)}

        # Reset the simulation step count and time.
        self.current_step = 0
        self.time = 0.0

        # Get the time step size (in seconds) from the model's simulator config.
        step_size = self.current_model.simulator.get('step_size', 3600.0)  # default: 1 hour
        # Compute the total simulation time (in seconds).
        total_time = time_hours * 3600.0
        # Compute the total step count.
        total_steps = int(total_time / step_size)

        # Get the list of variables to output
        output_variables, output_warnings = self._resolve_output_variables(self.current_model)

        # Prepare CSV data storage
        csv_data = []
        csv_headers = ['step', 'time'] + output_variables

        # Build the schedule list from schedule_entries (supporting time_start/time_end, pulse/sustained)
        start_date = self.current_model.simulator.get('start_date', '')
        raw_entries = getattr(self.current_model, 'schedule_entries', [])
        schedules = precompute_sustained_divisors(
            list(raw_entries), step_size
        ) if raw_entries else []

        if log_cb:
            schedule_vars = [s.get('variable', '') for s in raw_entries if s.get('variable')]
            run_logging.build_initial_logs(
                self.current_model, model_name or self.current_model.metadata.name,
                total_steps, step_size, output_variables, output_warnings,
                schedule_vars, n_runs=1, session_seed=0, log_cb=log_cb,  # allow-const: a deterministic single simulation, no MC concept here, n_runs/session_seed are always 1/0
            )
        input_var_names = run_logging.input_variable_names(self.current_model, output_variables)
        hits: Dict[str, int] = {}
        warned: set = set()
        run_start_time = _time()

        try:
            # Run the simulation, sharing the core advance_steps (the CLI and GUI batch_steps share the same loop body, see ADR 0113).
            rows, self.current_step, self.time = advance_steps(
                self.current_model, schedules, step_size, total_steps,
                self.current_step, self.time, output_variables, start_date,
            )
            for row in rows:
                csv_data.append([row['step'], row['time']] + [row[v] for v in output_variables])
            if log_cb:
                run_logging.check_value_warnings(self.current_model, rows, output_variables, warned, log_cb)
                run_logging.accumulate_hits(rows, input_var_names, hits)

            # Write the CSV file
            csv_output_path = output_path
            if not csv_output_path:
                # Default output to reference_engine's own OUTPUT_DIR (paths.py, LM_OUTPUT_PATH),
                # never into the models/ directory — see paths.py for the .env override.
                output_dir = str(paths.OUTPUT_DIR)
                os.makedirs(output_dir, exist_ok=True)
                csv_output_path = os.path.join(output_dir, f"{self.current_model.metadata.name}_simulation.csv")

            with open(csv_output_path, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.writer(csvfile)
                writer.writerow(csv_headers)
                writer.writerows(csv_data)

            if log_cb:
                run_logging.log_completion(_time() - run_start_time, self.current_step, hits, log_cb)

            # Return the simulation result, including the model name, current state, step count, time, and CSV path.
            return {
                "success": True,
                "model_name": self.current_model.metadata.name,
                "state": self.current_model.get_current_state(),
                "steps": self.current_step,
                "time": self.time,
                "csv_output": csv_output_path,
                "output_variables": output_variables,
                "warnings": output_warnings,
            }
        except Exception as e:
            # Log the simulation failure.
            logger.error(f"Simulation execution failed: {e}")
            # Return the error.
            return {"success": False, "error": str(e)}

    def run_simulation_mc(self, model_name: Optional[str], time_hours: float,
                          folder: Optional[str] = None, n_runs: int = 1,
                          seed: Optional[int] = None,
                          output_path_fn: Optional[Callable[[int], Optional[str]]] = None,
                          log_cb: Optional[Callable[[str], None]] = None) -> Dict[str, Any]:
        """
        Runs the simulation n_runs times (Monte Carlo, used by the CLI), corresponding to the GUI's
        sim_runs>1 path (session_manager.py's batch_steps multi-run branch). Each run samples its
        distribution parameters using an independent seed derived from the same master seed
        (derive_seed_list); when n_runs==1, no sampling occurs (ADR 0045's deterministic mode),
        matching run_simulation's behavior.
        :param output_path_fn: an optional callback (run_idx) -> a CSV path; when not provided, no CSV is written.
        :param log_cb: same as run_simulation()'s log_cb (ADR 0119); only outputs warnings/completion
            stats for run 0, matching the GUI batch_steps multi-run branch's choice of run0 as the representative.
        :return: {"success", "model_name", "session_seed", "runs": [...], "error"?}
        """
        if model_name and not self.load_models([model_name], folder):
            return {"success": False, "error": self.loader.last_error or f"Failed to load model: {model_name}"}
        if not self.current_model:
            return {"success": False, "error": "No model loaded"}

        base_model = self.current_model
        try:
            validate_simulator_dates(
                base_model.simulator.get('start_date'),
                base_model.simulator.get('end_date'),
            )
            validate_schedule_list(getattr(base_model, 'schedule_entries', []))

            param_distributions = collect_param_distributions(base_model)
            base_model.param_distributions = param_distributions

            step_size = base_model.simulator.get('step_size', 3600.0)
            total_steps = int((time_hours * 3600.0) / step_size)
            output_variables, output_warnings = self._resolve_output_variables(base_model)

            start_date = base_model.simulator.get('start_date', '')
            raw_entries = getattr(base_model, 'schedule_entries', [])
            schedules = precompute_sustained_divisors(
                list(raw_entries), step_size
            ) if raw_entries else []

            n_runs = max(1, int(n_runs))
            session_seed = int(seed) if seed is not None else int(np.random.randint(0, 2**31))
            seed_list = derive_seed_list(session_seed, n_runs)

            if log_cb:
                schedule_vars = [s.get('variable', '') for s in raw_entries if s.get('variable')]
                run_logging.build_initial_logs(
                    base_model, model_name or base_model.metadata.name,
                    total_steps, step_size, output_variables, output_warnings,
                    schedule_vars, n_runs, session_seed, log_cb=log_cb,
                )
            run_start_time = _time()

            # Clone + sample every run model from the still-pristine base_model
            # BEFORE advancing any of them (matches start_session's ordering) —
            # advancing run 0 in-place first would mutate base_model and make
            # later clones start from run 0's end state instead of the initial one.
            run_models = []
            for run_idx in range(n_runs):
                run_model = base_model if run_idx == 0 else clone_model(base_model)
                if param_distributions and n_runs > 1:
                    run_rng = np.random.default_rng(seed_list[run_idx])
                    apply_parameter_sampling(run_model, param_distributions, rng=run_rng)
                run_models.append(run_model)

            run_results = []
            for run_idx, run_model in enumerate(run_models):
                rows, end_step, end_time = advance_steps(
                    run_model, schedules, step_size, total_steps,
                    0, 0.0, output_variables, start_date,
                )

                csv_output_path = output_path_fn(run_idx) if output_path_fn else None
                if csv_output_path:
                    with open(csv_output_path, 'w', newline='', encoding='utf-8') as csvfile:
                        writer = csv.writer(csvfile)
                        writer.writerow(['step', 'time'] + output_variables)
                        for row in rows:
                            writer.writerow([row['step'], row['time']] + [row[v] for v in output_variables])

                if log_cb and run_idx == 0:
                    run_logging.check_value_warnings(run_model, rows, output_variables, set(), log_cb)
                    hits = run_logging.input_variable_hits(run_model, output_variables, rows)
                    run_suffix = f" × {n_runs} runs" if n_runs > 1 else ''
                    run_logging.log_completion(_time() - run_start_time, end_step, hits, log_cb, run_suffix)

                run_results.append({
                    "run_idx": run_idx,
                    "seed": seed_list[run_idx],
                    "steps": end_step,
                    "time": end_time,
                    "csv_output": csv_output_path,
                    "state": run_model.get_current_state(),
                })

            return {
                "success": True,
                "model_name": base_model.metadata.name,
                "session_seed": session_seed,
                "runs": run_results,
                "output_variables": output_variables,
                "warnings": output_warnings,
            }
        except Exception as e:
            logger.error(f"MC simulation execution failed: {e}")
            return {"success": False, "error": str(e)}

    def run_simulation_all_plans(self, model_name: str, time_hours: float, folder: Optional[str] = None,
                                  output_path_fn: Optional[Callable[[str, int], str]] = None,
                                  n_runs: int = 1, seed: Optional[int] = None,
                                  log_cb: Optional[Callable[[str], None]] = None) -> Dict[str, Any]:
        """
        Runs a simulation for each plan in simulation.plans in turn (used by the CLI).
        Each plan runs on an independently loaded model copy (so their initial states don't affect each other).
        :param output_path_fn: an optional callback (plan_id, plan_index) -> a CSV path;
            when not provided, no CSV is written, only the result is returned.
        :param n_runs: when >1, each plan is run via run_simulation_mc instead (each run gets a CSV with a
            `__run{i}` suffix); when =1, behavior is exactly as before.
        :param log_cb: forwarded to run_simulation()/run_simulation_mc() (ADR 0119).
        :return: {"success": bool, "plans": [{"plan_id", "result"}], "error"?}
        """
        if not self.load_models([model_name], folder):
            return {"success": False, "error": self.loader.last_error or f"Failed to load model: {model_name}"}

        # When the model doesn't define simulation.plans, run it as a single "default" plan
        # (i.e. no schedules applied, matching a plain simulation without --all-plans).
        plan_ids = list(self.current_model.plans.keys()) or ["default"]

        n_runs = max(1, int(n_runs))
        results = []
        for i, plan_id in enumerate(plan_ids):
            output_path = output_path_fn(plan_id, i) if output_path_fn else None
            self.current_model = self.loader.fetch(model_name, folder, use_cache=False)
            self.current_model.schedule_entries = self.current_model.plans.get(plan_id, [])

            if n_runs == 1:
                result = self.run_simulation(None, time_hours, output_path=output_path, log_cb=log_cb)
            else:
                def _run_path_fn(run_idx: int, _base=output_path) -> Optional[str]:
                    if not _base:
                        return None
                    base = Path(_base)
                    return str(base.with_name(f'{base.stem}__run{run_idx}{base.suffix}'))
                result = self.run_simulation_mc(None, time_hours, n_runs=n_runs, seed=seed,
                                                output_path_fn=_run_path_fn, log_cb=log_cb)

            results.append({"plan_id": plan_id, "result": result})
            if not result.get("success"):
                return {"success": False, "error": result.get("error"), "plans": results}

        return {"success": True, "plans": results}

    # GUI session methods (start_session / batch_steps / pause_session /
    # resume_session / reset_session / export_session_csv / get_session_info)
    # are provided by SessionManagerMixin — no duplication needed here.

    # ==================== Model cloning / distribution-parameter tools ====================
    # clone_model(), collect_param_distributions(), apply_parameter_sampling() → mc_utils.py
