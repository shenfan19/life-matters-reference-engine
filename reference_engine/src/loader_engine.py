# -*- coding: utf-8 -*-
#
# Copyright (c) 2024 Your Name/Organization
#
# This file is part of the LifeMatters simulation framework.
#
# Purpose:
# The `loader_engine.py` module acts as an entry point for model-related operations in the LifeMatters framework. It provides high-level interfaces for locating, caching, merging, and splitting YAML-based models, while delegating the core logic—such as recursive loading, dependency resolution via imports, data merging, and structural validation—to the `ModelStructure` class. This separation enhances modularity, reusability, and maintainability across the framework's components, including Loader, Simulator, Generator, and Optimizer.
#
# For more information, please refer to the project README.md.
#
#-----------------------------------------------------------------------------

import os
import logging
from typing import Dict, Any, List, Optional, Set
from .model_structure import ModelStructure, ModelMetadata
from .yaml_io import safe_load

# Set up the logger, used to output info and errors while the program runs.
logger = logging.getLogger(__name__)

class LoaderEngine:
    """
    The model-loading engine, responsible for finding, loading, merging, and splitting model files.
    It manages the model cache and handles import relationships between models.
    """
    def __init__(self, models_directory: str = "models"):
        """
        Initializes a LoaderEngine instance.
        :param models_directory: the root directory holding model files.
        """
        self.models_directory = models_directory
        # The model cache, storing already-loaded models to avoid reloading.
        self.models_cache: Dict[tuple, ModelStructure] = {}
        # The detailed reason for a fetch() failure (the raw message raised by the Loader/Validator), for the caller to display.
        self.last_error: Optional[str] = None

    def find_model_file(self, model_name: str, folder: Optional[str] = None) -> Optional[str]:
        """
        Finds a model's YAML file path within the given directory. Supports the new models/, scenarios/, and stories/ structure.
        :param model_name: the model name (may include a path, e.g. "models/interventions/diet/banana" or "banana").
        :param folder: an optional subfolder (for backward compatibility; ignored if model_name already includes a path).
        :return: the absolute path of the file found, or None if not found.
        """
        # If model_name is an absolute path, check directly whether it exists
        if os.path.isabs(model_name):
            file_path = model_name if model_name.endswith('.yaml') else model_name + '.yaml'
            if os.path.exists(file_path) and os.path.isfile(file_path):
                return os.path.abspath(file_path)
            return None

        # Determine the base directory
        base_dir = self.models_directory

        if '/' in model_name or os.sep in model_name:
            # Normalize the path separator
            model_name_norm = model_name.replace('/', os.sep)

            # 1. Try it directly as a path relative to models_directory (suited to model_name already containing scenarios/, stories/, or models/)
            file_path = os.path.join(base_dir, model_name_norm)
            if not file_path.endswith('.yaml'):
                file_path += '.yaml'
            if os.path.exists(file_path) and os.path.isfile(file_path):
                return os.path.abspath(file_path)

            # 2. Try appending folder (suited to the case api_server.py splits into folder='stories', model_name='examples/xxx')
            if folder:
                file_path = os.path.join(base_dir, folder.replace('/', os.sep), model_name_norm)
                if not file_path.endswith('.yaml'):
                    file_path += '.yaml'
                if os.path.exists(file_path) and os.path.isfile(file_path):
                    return os.path.abspath(file_path)

            # 3. Try extracting the filename portion and searching within the given directory (kept as a fallback)
            dir_path, base_name = os.path.split(model_name_norm)
            search_dir = os.path.join(base_dir, dir_path)
            file_name = base_name if base_name.endswith('.yaml') else base_name + '.yaml'
            file_path = os.path.join(search_dir, file_name)
            if os.path.exists(file_path) and os.path.isfile(file_path):
                return os.path.abspath(file_path)

            return None

        # A plain name (no path separator): needs a search
        target_file = model_name if model_name.endswith('.yaml') else model_name + '.yaml'

        # If folder is given, search that folder first (backward compatible)
        if folder:
            search_dir = os.path.join(base_dir, folder)
            if os.path.exists(search_dir):
                file_path = os.path.join(search_dir, target_file)
                if os.path.isfile(file_path):
                    return os.path.abspath(file_path)

        # Search the new structure: the models/, scenarios/, and stories/ directories
        search_paths = [
            base_dir,  # the root directory (backward compatible)
            os.path.join(base_dir, 'models'),
            os.path.join(base_dir, 'scenarios'),
            os.path.join(base_dir, 'stories'),
        ]

        for search_root in search_paths:
            if not os.path.exists(search_root):
                continue

            # Recursively search this directory tree
            for root, dirs, files in os.walk(search_root):
                # Skip special directories
                dirs[:] = [d for d in dirs if d not in ['merged', 'splited', 'output', '__pycache__', '.git', '_output']]

                if target_file in files:
                    file_path = os.path.join(root, target_file)
                    if os.path.isfile(file_path):
                        return os.path.abspath(file_path)

        return None


    def scan_models(self, folders: Optional[List[str]] = None) -> Dict[str, Dict[str, Any]]:
        """
        Scans model files and returns their metadata.
        When folders is not given, recursively scans the whole models directory; when given, scans only that directory (non-recursive).
        :param folders: an optional list of subfolders.
        :return: a dict keyed by model name, whose values are dicts of model metadata.
        """
        models = {}
        base_dir = self.models_directory
        _skip = {'merged', 'splited', 'output', '__pycache__', '.git', '_output'}

        # When no folder is given, recursively collect every subdirectory under the whole models directory
        if not folders:
            folders = [None]
            for root, dirs, _ in os.walk(base_dir):
                dirs[:] = [d for d in dirs if d not in _skip]
                for d in dirs:
                    rel = os.path.relpath(os.path.join(root, d), base_dir).replace('\\', '/')
                    folders.append(rel)

        # Iterate over each folder
        for folder in folders:
            search_dir = os.path.join(base_dir, folder) if folder else base_dir

            if not os.path.exists(search_dir):
                logger.error(f"Fail to find folder {search_dir}")
                continue

            # List only the files directly in this directory, non-recursive
            files = [f for f in os.listdir(search_dir) if os.path.isfile(os.path.join(search_dir, f))]

            for file in files:
                if file.endswith('.yaml'):
                    model_name = os.path.splitext(file)[0]
                    try:
                        # Try loading the model to get its metadata (using the new find_model_file)
                        file_path = self.find_model_file(model_name, folder)
                        if file_path:
                            model = ModelStructure()  # create a temporary ModelStructure to load into
                            model.load_model(file_path, model_name)
                            models[model_name] = {
                                "name": model.metadata.name,
                                "variables": len(model.variables),
                                "equations": len(model.equations),
                                "version": model.metadata.version,
                                "hooks": len(model.simulator.get('hooks', [])),
                                "optimization_method": model.optimizer.get('method', 'N/A'),
                                "extra_deps": len(model.optimizer.get('python_envs', []))
                            }
                    except Exception as e:
                        logger.warning(f"Skipping model {model_name} due to error: {e}")
                        continue
        return models

    @staticmethod
    def _snapshot_mtimes(model: ModelStructure) -> Dict[str, float]:
        """Records the mtime of every file involved in this load (the root file plus recursive imports), used for cache-invalidation checks."""
        mtimes = {}
        for f in model.visited:
            try:
                mtimes[f] = os.path.getmtime(f)
            except OSError:
                pass
        return mtimes

    @staticmethod
    def _cache_entry_fresh(entry) -> bool:
        """A cache entry is considered stale if the mtime of any recorded file (the root file or any of its imports) has changed.
        Covers the case where a YAML is hand-edited outside of a write endpoint like /api/save-file (a write endpoint clears the cache directly).
        """
        _, mtimes = entry
        for f, cached_mtime in mtimes.items():
            try:
                if os.path.getmtime(f) != cached_mtime:
                    return False
            except OSError:
                return False
        return True

    def fetch(self, model_name: str, folder: Optional[str] = None, loaded_models: Optional[Set[str]] = None,
              validate: bool = True, use_cache: bool = True) -> Optional[ModelStructure]:
        """
        Recursively loads the named model and all of its imports.
        :param model_name: the name of the model to load.
        :param folder: an optional subfolder.
        :param loaded_models: a set used to detect circular dependencies.
        :param validate: whether to validate the model (default True).
        :return: the loaded and merged ModelStructure instance, or None on failure.
        """
        # Initialize the set of loaded models, used to detect circular dependencies.
        self.last_error = None
        loaded_models = loaded_models or set()
        if model_name in loaded_models:
            self.last_error = f"Circular dependency detected: {model_name}"
            logger.error(self.last_error)
            return None
        loaded_models.add(model_name)

        # Check the cache (also validating mtime; a hit whose file has since changed counts as a miss).
        cache_key = (model_name, folder or "")
        entry = self.models_cache.get(cache_key)
        if use_cache and entry and self._cache_entry_fresh(entry):
            return entry[0]

        # Find the model file's path.
        file_path = self.find_model_file(model_name, folder)
        if not file_path:
            self.last_error = f"Model {model_name} was not found in {self.models_directory}"
            logger.error(self.last_error)
            return None
        # Use the absolute path as the cache key
        cache_key = os.path.abspath(file_path)
        entry = self.models_cache.get(cache_key)
        if use_cache and entry and self._cache_entry_fresh(entry):
            return entry[0]

        try:
            model = ModelStructure(self.models_directory)
            # Load the primary model (imports are handled automatically).
            model.load_model(file_path, model_name)

            # Validate the merged model (if requested).
            if validate:
                model.validate_model()

            # Store the loaded model in the cache (under both the absolute-path key and the (name,folder) key).
            if use_cache:
                mtimes = self._snapshot_mtimes(model)
                self.models_cache[cache_key] = (model, mtimes)
                self.models_cache[(model_name, folder or "")] = (model, mtimes)
            return model

        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error loading model {model_name}: {e}")
            return None

    def merge_models(self,
                    model_names: Optional[List[str]] = None,
                    folders: Optional[List[str]] = None,
                    output_path: Optional[str] = None,
                    merged_name: str = "MergedModel") -> Dict[str, Any]:
        """
        The unified model-merging method.
        :param model_names: the list of model files to merge (supports a path, e.g. "physiology/obesity_diabetes")
        :param folders: the list of folders to merge (each folder is rooted at its same-named file, including its imports and every other file)
        :param output_path: the output path
        :param merged_name: the merged model's name
        :return: a dict of the merge result
        """
        try:
            if not model_names and not folders:
                return {
                    "success": False,
                    "error": "No model or folder was provided to merge",
                    "variables": 0,
                    "equations": 0
                }

            merged_model = ModelStructure(self.models_directory)
            merged_model.visited.clear()  # clear the visited record
            output_model_name = merged_name
            first_item_processed = False

            # Handle folders
            if folders:
                for folder in folders:
                    # Check for a same-named root file
                    root_file_name = f"{folder}.yaml"
                    root_file_path = self.find_model_file(folder, folder)

                    if not root_file_path:
                        return {
                            "success": False,
                            "error": f"Root model file {root_file_name} not found in folder {folder}",
                            "variables": 0,
                            "equations": 0
                        }

                    # For the first folder: get the name
                    if not first_item_processed:
                        with open(root_file_path, 'r', encoding='utf-8') as f:
                            data = safe_load(f) or {}
                            if 'metadata' in data and 'name' in data['metadata']:
                                output_model_name = data['metadata']['name']
                        first_item_processed = True

                    # Load the root file (including its imports)
                    merged_model.append_model(root_file_path, folder, log_as_loaded=True, validate=False)

                    # Load the other files in the folder
                    search_dir = os.path.join(self.models_directory, folder)
                    files = [f for f in os.listdir(search_dir)
                            if os.path.isfile(os.path.join(search_dir, f))
                            and f.endswith('.yaml')
                            and f != root_file_name]

                    for file in files:
                        model_name = os.path.splitext(file)[0]
                        file_path = self.find_model_file(model_name, folder)
                        if file_path:
                            merged_model.append_model(file_path, model_name, log_as_loaded=True, validate=False)

            # Handle files
            if model_names:
                for model_name in model_names:
                    file_path = self.find_model_file(model_name, None)
                    if not file_path:
                        logger.warning(f"Could not load model file: {model_name}")
                        continue

                    # For the first file: get the name
                    if not first_item_processed:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            data = safe_load(f) or {}
                            if 'metadata' in data and 'name' in data['metadata']:
                                output_model_name = data['metadata']['name']
                        first_item_processed = True

                    merged_model.append_model(file_path, model_name, log_as_loaded=True, validate=False)

            # Set the metadata
            source_desc = []
            if folders:
                source_desc.append(f"folders {', '.join(folders)}")
            if model_names:
                source_desc.append(f"files {', '.join(model_names)}")

            merged_model.metadata = ModelMetadata(
                name=output_model_name,
                version="1.0.0",
                author="LoaderEngine",
                description=f"A merged model from {' and '.join(source_desc)}",
                conflicts=[],
                tags=[]
            )

            # Validate the model
            try:
                merged_model.validate_model()
            except ValueError as ve:
                return {
                    "success": False,
                    "error": str(ve),
                    "variables": len(merged_model.variables),
                    "equations": len(merged_model.equations)
                }

            # Only export when output_path is given
            if output_path:
                # Ensure the directory exists
                output_dir = os.path.dirname(output_path)
                if output_dir:
                    os.makedirs(output_dir, exist_ok=True)

                merged_model.export_to_yaml(output_path)

            return {
                "success": True,
                "data": merged_model,
                "variables": len(merged_model.variables),
                "equations": len(merged_model.equations)
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "variables": 0,
                "equations": 0
            }

    # Backward-compatible wrapper methods
    def merge_models_by_names(self, model_names: List[str], output_path: Optional[str] = None,
                            merged_name: str = "MergedModel", folder: Optional[str] = None) -> Dict[str, Any]:
        """A backward-compatible method"""
        return self.merge_models(model_names=model_names, output_path=output_path, merged_name=merged_name)

    def merge_models_by_folder(self, folders: List[str], output_path: Optional[str] = None,
                            merged_name: str = "MergedModel") -> Dict[str, Any]:
        """A backward-compatible method"""
        if len(folders) != 1:
            raise ValueError("merge_models_by_folder supports only a single folder; the caller should invoke it separately per folder")
        return self.merge_models(folders=folders, output_path=output_path, merged_name=merged_name)

    def split_model(self, model_name: str, output_dir: str, folder: Optional[str] = None) -> Dict[str, Any]:
        """
        Splits a model and generates multiple files, using the filename rather than metadata.name.
        :param model_name: the model name (a file or folder name).
        :param output_dir: the output directory (a full path, e.g. models/splited/bcd/).
        :param folder: an optional subfolder (used for --folder).
        :return: a dict with the split result.
        """
        try:
            model = ModelStructure(models_directory=self.models_directory)

            if folder:
                # Handle --folder: load every file in the folder, rooted at the same-named file
                result = self.merge_models_by_folder([folder], None)
                if not result["success"]:
                    return {"success": False, "error": result["error"]}
                model = result["data"]
                model.current_filename = folder
            else:
                # Handle --file: load the given file and its imports
                model_path = self.find_model_file(model_name, folder)
                if not model_path:
                    return {"success": False, "error": f"Model file not found: {model_name}"}
                model.append_model(model_path, model_name, log_as_loaded=True, validate=False)
                base_name = os.path.splitext(os.path.basename(model_name))[0]
                model.current_filename = base_name

            # Ensure the output directory exists
            os.makedirs(output_dir, exist_ok=True)

            # Call ModelStructure's split_model method, passing in the output directory
            model.split_model(output_dir)

            generated_files = sorted(os.listdir(output_dir)) if os.path.isdir(output_dir) else []

            return {
                "success": True,
                "data": {
                    "output_dir": output_dir,
                    "variables": len(model.variables),
                    "equations": len(model.equations),
                    "files": generated_files
                }
            }
        except Exception as e:
            logger.error(f"Failed to split model: {e}")
            return {"success": False, "error": str(e)}
