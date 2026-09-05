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

# Initialize the module's logger
logger = logging.getLogger(__name__)

class ModelStructure(Loader, Validator, Simulation):
    def __init__(self, models_directory: str = "models"):
        # Initialize metadata
        self.metadata = None
        # Initialize the variables dict
        self.variables = {}
        # Initialize the equations dict
        self.equations = {}
        # Initialize variable history
        self.variable_history = {}
        # Initialize the current simulation step count
        self.current_step = 0
        # Initialize the simulation time (in seconds)
        self.time = 0.0
        # Initialize the asteval interpreter
        self.asteval = Interpreter()
        # Initialize the asteval symbol table
        self._initialize_asteval()
        # Initialize the hooks dict
        self.hooks = {'pre_step': [], 'post_step': []}
        # Initialize simulator and optimizer
        self.simulator: Dict[str, Any] = {}
        self.optimizer: Dict[str, Any] = {}
        # self.plans: plan_id -> a List[dict] of raw schedule entries, used by apply_schedules
        # self.schedule_entries: the entry list of the currently active plan (set before run_simulation)
        self.plans: Dict[str, Any] = {}
        self.schedule_entries: list = []
        # The time unit (from YAML simulator.time_unit, default minute)
        self.time_unit: str = 'minute'
        # Tracks visited models, to guard against circular dependencies
        self.visited: Set[str] = set()
        self.models_directory = models_directory
        # The current filename (no extension), set by loader.py
        self.current_filename: str = None
    def _initialize_asteval(self):
        # Rebuild the Interpreter, letting asteval re-register all its built-in functions itself, without disturbing its internal state
        self.asteval = Interpreter()
        # Append time-unit constants (in absolute seconds, for internal computation reference)
        self.asteval.symtable['MINUTE'] = 60.0
        self.asteval.symtable['HOUR'] = 3600.0
        self.asteval.symtable['DAY'] = 86400.0
        self.asteval.symtable['WEEK'] = 604800.0
        self.asteval.symtable['MONTH'] = 2592000.0
        self.asteval.symtable['YEAR'] = 31536000.0
        # Inject model variables into the symbol table
        for var_name, var in self.variables.items():
            self.asteval.symtable[var_name] = var.value

    def split_model(self, output_dir: str):
        """
        Decomposes a model into independent per-equation files plus a remainder file, all generated under output_dir.
        :param output_dir: the output directory (e.g. models/splited/bcd/)
        """
        # Ensure the output directory exists
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        # Use self.current_filename as the prefix
        prefix = self.current_filename or 'unknown'

        # Extract each equation's dependency variables
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

        # Build the variable usage count
        var_usage: Dict[str, int] = {}
        for deps in equation_deps.values():
            for var in deps:
                var_usage[var] = var_usage.get(var, 0) + 1

        # Identify independent equations
        independent_equations = [
            eq_name for eq_name, deps in equation_deps.items()
            if all(var_usage.get(var, 0) == 1 for var in deps)
        ]

        # Generate a file per independent equation
        for eq_name in independent_equations:
            deps = equation_deps[eq_name]
            # Filter variables, excluding 'dt' if present // 'dt' is no longer excluded
            filtered_vars = {
                var: {
                    'description': self.variables[var].description,
                    'value': self.variables[var].value,
                    'type': self.variables[var].type.value,
                    'unit': self.variables[var].unit,
                    'bounds': self.variables[var].bounds
                } for var in deps if var in self.variables # Added filter condition: exclude 'dt' // 'dt' is no longer excluded
            }
            patch_data = {
                'metadata': {
                    'name': f"{prefix}_{eq_name}",
                    'version': self.metadata.version if self.metadata else '1.0.0',
                    'author': self.metadata.author if self.metadata else '',
                    'description': f"Split module for equation {eq_name}",
                },
                'variables': filtered_vars,  # use the filtered variables
                'equations': {
                    eq_name: {
                        'description': self.equations[eq_name].description,
                        'condition': self.equations[eq_name].condition,
                        'priority': self.equations[eq_name].priority,
                        'dynamics': self.equations[eq_name].dynamics
                    }
                }
            }
            # Generate the file directly under output_dir
            split_file_path = os.path.join(output_dir, f"{prefix}_{eq_name}.yaml")
            with open(split_file_path, 'w', encoding='utf-8') as f:
                yaml.safe_dump(patch_data, f, sort_keys=False, allow_unicode=True,
                            default_flow_style=False, indent=2)
            logger.info(f"Generated split file: {split_file_path}")

        # Generate the remainder model file
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

        # Filter remaining_vars, excluding 'dt' if present
        filtered_remaining_vars = {
            var: {
                'description': self.variables[var].description,
                'value': self.variables[var].value,
                'type': self.variables[var].type.value,
                'unit': self.variables[var].unit,
                'bounds': self.variables[var].bounds
            } for var in remaining_vars if var in self.variables # Added filter condition: exclude 'dt'
        }
        remaining_data = {
            'metadata': {
                'name': f"{prefix}_remaining",
                'version': self.metadata.version if self.metadata else '1.0.0',
                'author': self.metadata.author if self.metadata else '',
                'description': f"Remaining shared modules of {prefix}",
            },
            'variables': filtered_remaining_vars,  # use the filtered variables
            'equations': {
                k: {
                    'description': v.description,
                    'condition': v.condition,
                    'priority': v.priority,
                    'dynamics': v.dynamics
                } for k, v in remaining_equations.items()
            }
        }
        # Generate the file directly under output_dir
        remaining_path = os.path.join(output_dir, f"{prefix}_remaining.yaml")
        with open(remaining_path, 'w', encoding='utf-8') as f:
            yaml.safe_dump(remaining_data, f, sort_keys=False, allow_unicode=True,
                        default_flow_style=False, indent=2)
        logger.info(f"Generated remaining file: {remaining_path}")

    def export_to_yaml(self, file_path: str):
        # Export the model to a YAML file
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
            'optimization': self.optimizer
        }
        with open(file_path, 'w', encoding='utf-8') as f:
            yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True,
                        default_flow_style=False, indent=2)  # add indent=2
