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

# 设置日志记录器，用于在程序运行时输出信息和错误。
logger = logging.getLogger(__name__)

class LoaderEngine:
    """
    模型加载引擎，负责处理模型文件的查找、加载、合并、拆分等核心操作。
    它管理模型缓存，并处理模型间的导入关系。
    """
    def __init__(self, models_directory: str = "models"):
        """
        初始化 LoaderEngine 实例。
        :param models_directory: 存放模型文件的根目录。
        """
        self.models_directory = models_directory
        # 模型缓存，用于存储已加载的模型，避免重复加载。
        self.models_cache: Dict[tuple, ModelStructure] = {}
        # fetch() 失败时的详细原因（Loader/Validator 抛出的原始信息），供调用方展示。
        self.last_error: Optional[str] = None
    
    def find_model_file(self, model_name: str, folder: Optional[str] = None) -> Optional[str]:
        """
        在指定目录中查找模型的 YAML 文件路径。支持新的 models/, scenarios/ 和 stories/ 结构。
        :param model_name: 模型名称（可带路径，如 "models/interventions/diet/banana" 或 "banana"）。
        :param folder: 可选的子文件夹（用于向后兼容，如果 model_name 带路径则忽略）。
        :return: 找到的文件绝对路径，如果没有找到则返回 None。
        """
        # 如果 model_name 是绝对路径，直接检查是否存在
        if os.path.isabs(model_name):
            file_path = model_name if model_name.endswith('.yaml') else model_name + '.yaml'
            if os.path.exists(file_path) and os.path.isfile(file_path):
                return os.path.abspath(file_path)
            return None
        
        # 确定基础目录
        base_dir = self.models_directory
        
        if '/' in model_name or os.sep in model_name:
            # 标准化路径分隔符
            model_name_norm = model_name.replace('/', os.sep)
            
            # 1. 尝试直接作为相对于 models_directory 的路径 (适合 model_name 已包含 scenarios/, stories/ 或 models/ 的情况)
            file_path = os.path.join(base_dir, model_name_norm)
            if not file_path.endswith('.yaml'):
                file_path += '.yaml'
            if os.path.exists(file_path) and os.path.isfile(file_path):
                return os.path.abspath(file_path)
            
            # 2. 尝试拼上 folder (适合 api_server.py 拆分后的情况，如 folder='stories', model_name='examples/xxx')
            if folder:
                file_path = os.path.join(base_dir, folder.replace('/', os.sep), model_name_norm)
                if not file_path.endswith('.yaml'):
                    file_path += '.yaml'
                if os.path.exists(file_path) and os.path.isfile(file_path):
                    return os.path.abspath(file_path)
            
            # 3. 尝试提取文件名部分在指定目录中查找 (保持原有逻辑作为兜底)
            dir_path, base_name = os.path.split(model_name_norm)
            search_dir = os.path.join(base_dir, dir_path)
            file_name = base_name if base_name.endswith('.yaml') else base_name + '.yaml'
            file_path = os.path.join(search_dir, file_name)
            if os.path.exists(file_path) and os.path.isfile(file_path):
                return os.path.abspath(file_path)
            
            return None
        
        # 简单名称（无路径分隔符）：需要搜索
        target_file = model_name if model_name.endswith('.yaml') else model_name + '.yaml'
        
        # 如果指定了 folder，优先在该文件夹中查找（向后兼容）
        if folder:
            search_dir = os.path.join(base_dir, folder)
            if os.path.exists(search_dir):
                file_path = os.path.join(search_dir, target_file)
                if os.path.isfile(file_path):
                    return os.path.abspath(file_path)
        
        # 在新结构中搜索：models/, scenarios/ 和 stories/ 目录
        search_paths = [
            base_dir,  # 根目录（向后兼容）
            os.path.join(base_dir, 'models'),
            os.path.join(base_dir, 'scenarios'),
            os.path.join(base_dir, 'stories'),
        ]
        
        for search_root in search_paths:
            if not os.path.exists(search_root):
                continue
            
            # 递归搜索该目录树
            for root, dirs, files in os.walk(search_root):
                # 跳过特殊目录
                dirs[:] = [d for d in dirs if d not in ['merged', 'splited', 'output', '__pycache__', '.git', '_output']]
                
                if target_file in files:
                    file_path = os.path.join(root, target_file)
                    if os.path.isfile(file_path):
                        return os.path.abspath(file_path)
        
        return None

    
    def scan_models(self, folders: Optional[List[str]] = None) -> Dict[str, Dict[str, Any]]:
        """
        扫描模型文件并返回元数据。
        未指定 folders 时递归扫描整个 models 目录；指定时只扫该目录（非递归）。
        :param folders: 可选的子文件夹列表。
        :return: 一个字典，键是模型名称，值是包含模型元数据的字典。
        """
        models = {}
        base_dir = self.models_directory
        _skip = {'merged', 'splited', 'output', '__pycache__', '.git', '_output'}

        # 未指定文件夹时，递归收集整个 models 目录下的所有子目录
        if not folders:
            folders = [None]
            for root, dirs, _ in os.walk(base_dir):
                dirs[:] = [d for d in dirs if d not in _skip]
                for d in dirs:
                    rel = os.path.relpath(os.path.join(root, d), base_dir).replace('\\', '/')
                    folders.append(rel)

        # 遍历每个文件夹
        for folder in folders:
            search_dir = os.path.join(base_dir, folder) if folder else base_dir
            
            if not os.path.exists(search_dir):
                logger.error(f"Fail to find folder {search_dir}")
                continue
            
            # 只列出当前目录的文件，不递归
            files = [f for f in os.listdir(search_dir) if os.path.isfile(os.path.join(search_dir, f))]
            
            for file in files:
                if file.endswith('.yaml'):
                    model_name = os.path.splitext(file)[0]
                    try:
                        # 尝试加载模型以获取其元数据（使用新 find_model_file）
                        file_path = self.find_model_file(model_name, folder)
                        if file_path:
                            model = ModelStructure()  # 创建临时 ModelStructure 加载
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
                        logger.warning(f"跳过模型 {model_name} 因错误: {e}")
                        continue
        return models

    @staticmethod
    def _snapshot_mtimes(model: ModelStructure) -> Dict[str, float]:
        """记录本次加载涉及的所有文件（根文件 + 递归 imports）的 mtime，用于缓存失效判断。"""
        mtimes = {}
        for f in model.visited:
            try:
                mtimes[f] = os.path.getmtime(f)
            except OSError:
                pass
        return mtimes

    @staticmethod
    def _cache_entry_fresh(entry) -> bool:
        """缓存条目里记录的任一文件（根文件或其 imports）mtime 变化，都视为过期。
        覆盖手动编辑 YAML 后不经过 /api/save-file 等写接口的情况（写接口会直接清缓存）。
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
        递归地加载指定名称的模型及其所有导入项。
        :param model_name: 要加载的模型名称。
        :param folder: 可选的子文件夹。
        :param loaded_models: 用于检测循环依赖的集合。
        :param validate: 是否验证模型（默认 True）。
        :return: 加载并合并后的 ModelStructure 实例，或在失败时返回 None。
        """
        # 初始化已加载模型集合，用于检测循环依赖。
        self.last_error = None
        loaded_models = loaded_models or set()
        if model_name in loaded_models:
            self.last_error = f"检测到循环依赖: {model_name}"
            logger.error(self.last_error)
            return None
        loaded_models.add(model_name)

        # 检查缓存（同时校验 mtime，命中但文件已变更时视为未命中）。
        cache_key = (model_name, folder or "")
        entry = self.models_cache.get(cache_key)
        if use_cache and entry and self._cache_entry_fresh(entry):
            return entry[0]

        # 查找模型文件路径。
        file_path = self.find_model_file(model_name, folder)
        if not file_path:
            self.last_error = f"模型 {model_name} 在 {self.models_directory} 中未找到"
            logger.error(self.last_error)
            return None
        # 使用绝对路径作为缓存键
        cache_key = os.path.abspath(file_path)
        entry = self.models_cache.get(cache_key)
        if use_cache and entry and self._cache_entry_fresh(entry):
            return entry[0]

        try:
            model = ModelStructure(self.models_directory)
            # 加载主模型（会自动处理 imports）。
            model.load_model(file_path, model_name)

            # 验证合并后的模型（如果需要）。
            if validate:
                model.validate_model()

            # 将加载的模型存入缓存（同时用绝对路径和 (name,folder) 两种 key）。
            if use_cache:
                mtimes = self._snapshot_mtimes(model)
                self.models_cache[cache_key] = (model, mtimes)
                self.models_cache[(model_name, folder or "")] = (model, mtimes)
            return model

        except Exception as e:
            self.last_error = str(e)
            logger.error(f"加载模型 {model_name} 错误: {e}")
            return None

    def merge_models(self, 
                    model_names: Optional[List[str]] = None,
                    folders: Optional[List[str]] = None,
                    output_path: Optional[str] = None, 
                    merged_name: str = "MergedModel") -> Dict[str, Any]:
        """
        统一的模型合并方法。
        :param model_names: 要合并的模型文件列表（支持路径，如 "physiology/obesity_diabetes"）
        :param folders: 要合并的文件夹列表（每个文件夹以同名文件为根，包含 imports 和所有文件）
        :param output_path: 输出路径
        :param merged_name: 合并后的模型名称
        :return: 合并结果字典
        """
        try:
            if not model_names and not folders:
                return {
                    "success": False,
                    "error": "未提供任何模型或文件夹用于合并",
                    "variables": 0,
                    "equations": 0
                }
            
            merged_model = ModelStructure(self.models_directory)
            merged_model.visited.clear()  # 清空访问记录
            output_model_name = merged_name
            first_item_processed = False
            
            # 处理文件夹
            if folders:
                for folder in folders:
                    # 检查同名根文件
                    root_file_name = f"{folder}.yaml"
                    root_file_path = self.find_model_file(folder, folder)
                    
                    if not root_file_path:
                        return {
                            "success": False,
                            "error": f"未找到根模型文件 {root_file_name} 在文件夹 {folder}",
                            "variables": 0,
                            "equations": 0
                        }
                    
                    # 第一个文件夹：获取名称
                    if not first_item_processed:
                        with open(root_file_path, 'r', encoding='utf-8') as f:
                            data = safe_load(f) or {}
                            if 'metadata' in data and 'name' in data['metadata']:
                                output_model_name = data['metadata']['name']
                        first_item_processed = True
                    
                    # 加载根文件（包含 imports）
                    merged_model.append_model(root_file_path, folder, log_as_loaded=True, validate=False)
                    
                    # 加载文件夹中的其他文件
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
            
            # 处理文件
            if model_names:
                for model_name in model_names:
                    file_path = self.find_model_file(model_name, None)
                    if not file_path:
                        logger.warning(f"无法加载模型文件: {model_name}")
                        continue
                    
                    # 第一个文件：获取名称
                    if not first_item_processed:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            data = safe_load(f) or {}
                            if 'metadata' in data and 'name' in data['metadata']:
                                output_model_name = data['metadata']['name']
                        first_item_processed = True
                    
                    merged_model.append_model(file_path, model_name, log_as_loaded=True, validate=False)
            
            # 设置元数据
            source_desc = []
            if folders:
                source_desc.append(f"文件夹 {', '.join(folders)}")
            if model_names:
                source_desc.append(f"文件 {', '.join(model_names)}")
            
            merged_model.metadata = ModelMetadata(
                name=output_model_name,
                version="1.0.0",
                author="LoaderEngine",
                description=f"合并模型来自 {' 和 '.join(source_desc)}",
                conflicts=[],
                tags=[]
            )
                
            # 验证模型
            try:
                merged_model.validate_model()
            except ValueError as ve:
                return {
                    "success": False,
                    "error": str(ve),
                    "variables": len(merged_model.variables),
                    "equations": len(merged_model.equations)
                }
            
            # 只有指定了 output_path 才导出
            if output_path:
                # 确保目录存在
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

    # 保留向后兼容的包装方法
    def merge_models_by_names(self, model_names: List[str], output_path: Optional[str] = None, 
                            merged_name: str = "MergedModel", folder: Optional[str] = None) -> Dict[str, Any]:
        """向后兼容的方法"""
        return self.merge_models(model_names=model_names, output_path=output_path, merged_name=merged_name)

    def merge_models_by_folder(self, folders: List[str], output_path: Optional[str] = None, 
                            merged_name: str = "MergedModel") -> Dict[str, Any]:
        """向后兼容的方法"""
        if len(folders) != 1:
            raise ValueError("merge_models_by_folder 只支持单个文件夹，上层应分别调用")
        return self.merge_models(folders=folders, output_path=output_path, merged_name=merged_name)
    
    def split_model(self, model_name: str, output_dir: str, folder: Optional[str] = None) -> Dict[str, Any]:
        """
        拆分模型并生成多个文件，使用文件名而非 metadata.name。
        :param model_name: 模型名称（文件或文件夹名）。
        :param output_dir: 输出目录（完整路径，如 models/splited/bcd/）。
        :param folder: 可选的子文件夹（用于 --folder）。
        :return: 包含拆分结果的字典。
        """
        try:
            model = ModelStructure(models_directory=self.models_directory)
            
            if folder:
                # 处理 --folder：加载文件夹所有文件，以同名文件为根
                result = self.merge_models_by_folder([folder], None)
                if not result["success"]:
                    return {"success": False, "error": result["error"]}
                model = result["data"]
                model.current_filename = folder
            else:
                # 处理 --file：加载指定文件及其 imports
                model_path = self.find_model_file(model_name, folder)
                if not model_path:
                    return {"success": False, "error": f"未找到模型文件 {model_name}"}
                model.append_model(model_path, model_name, log_as_loaded=True, validate=False)
                base_name = os.path.splitext(os.path.basename(model_name))[0]
                model.current_filename = base_name
            
            # 确保输出目录存在
            os.makedirs(output_dir, exist_ok=True)
            
            # 调用 ModelStructure 的 split_model 方法，传入输出目录
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
            logger.error(f"拆分模型失败: {e}")
            return {"success": False, "error": str(e)}
