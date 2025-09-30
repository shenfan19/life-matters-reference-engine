# -*- coding: utf-8 -*-
#
# Copyright (c) 2024 Your Name/Organization
#
# This file is part of the LifeMatters simulation framework.
#
# Purpose:
# This module, `lang_manager.py`, is a core component responsible for managing 
# the multi-language support for the entire LifeMatters framework. It loads 
# translation files, handles language switching, and provides a centralized 
# interface for fetching translated text strings, including support for 
# formatted placeholders. This ensures a consistent and user-friendly experience
# across all command-line interface (CLI) tools and other modules.
#
# For more information, please refer to the project README.md.
#
#-----------------------------------------------------------------------------

import logging
import os
import yaml
from typing import Dict

# 配置日志记录器，以便在运行时输出信息和错误。
logger = logging.getLogger(__name__)

class LanguageManager:
    """
    语言管理器，负责加载和提供多语言翻译，供 LifeMatters 模块使用。
    """
    def __init__(self, default_language: str = "en", translation_dir: str = "lang"):
        """
        初始化 LanguageManager 实例。
        :param default_language: 默认语言代码，例如 "en"（英语）或 "zh-Hans"（简体中文）。
        :param translation_dir: 包含外部翻译文件的目录路径。
        """
        # 设置当前语言为默认语言。
        self.current_language = default_language
        # 初始化翻译缓存，用于存储已格式化的翻译文本，避免重复处理。
        self._translation_cache = {}
        # 加载所有可用的翻译。
        self.translations = self._load_translations(translation_dir)
        # 记录初始化成功的日志信息。
        logger.info(f"Initialized LanguageManager with language {default_language}")

    @property
    def language(self):
        """
        获取当前设置的语言。
        """
        return self.current_language

    def _load_translations(self, translation_dir: str) -> Dict[str, Dict[str, str]]:
        """
        加载翻译文件。首先加载默认翻译，然后尝试从指定的目录加载外部翻译文件，并合并它们。
        :param translation_dir: 包含外部翻译文件的目录路径。
        :return: 一个嵌套字典，键是语言代码，值是包含翻译键值对的字典。
        """
        # 定义一个包含默认翻译的字典。
        default_translations = {
            "en": {
                "model_not_found": "Model {model_name} not found",
                "merge_success": "Merged {vars} variables and {formulas} formulas to {output}",
                "merge_no_export": "Merged {vars} variables and {formulas} formulas in memory",
                "list_header": "Available Models ({count}):",
                "table_name": "Name",
                "table_variables": "Variables",
                "table_formulas": "Formulas",
                "table_critical": "Critical",
                "table_version": "Version",
                "table_state": "Description",
                "error_output_required": "Error: --merge-to is required for merge operations",
                "error_no_input": "Error: Either --folder or --file must be specified",
                "folder_not_found": "Folder {folder} not found in mods directory",
                "no_models_in_folder": "No valid models found in folder {folder}",
                "simulation_start": "Starting simulation for {model_name}",
                "simulation_complete": "Simulation completed, results saved to {output}",
                "simulation_failed": "Simulation failed: {error}",
                "variable_state": "Variable {var_name}: {value} {unit}",
                "invalid_parameter": "Invalid parameter: {param}",
                "table_value": "Value",
                "table_unit": "Unit",
                "critical_conditions_header": "Critical Conditions Triggered",
                "event_applied": "Event applied successfully",
                "event_apply_failed": "Failed to apply event",
                "invalid_yaml_event": "Invalid YAML event format: {error}",
                "optimization_success": "Optimization successful: params={params}, value={value}",
                "optimization_failed": "Optimization failed: {error}",
                "app_title": "LifeMatters Simulation Framework",
                "welcome_message": "Welcome to LifeMatters",
                "no_templates_available": "No templates available",
                "list_templates_failed": "Error listing templates: {error}",
                "unknown_template": "Unknown template: {template_name}",
                "model_generated_success": "Model generated successfully at {output}",
                "model_generation_failed": "Failed to generate model: {error}",
                "list_models_failed": "Failed to list models: {error}",
                "merge_failed": "Failed to merge models: {error}",
                "display_state_failed": "Failed to display state: {error}",
                "model_loaded": "Model loaded: {model_name}",
                "saved_to": "Saved to: {output}",
                "unexpected_error": "Unexpected error: {error}"
            },
            "zh-Hans": {
                "model_not_found": "模型 {model_name} 未找到",
                "merge_success": "成功合并 {vars} 个变量和 {formulas} 个公式到 {output}",
                "merge_no_export": "在内存中合并 {vars} 个变量和 {formulas} 个公式",
                "list_header": "可用模型 ({count})：",
                "table_name": "名称",
                "table_variables": "变量",
                "table_formulas": "公式",
                "table_critical": "临界条件",
                "table_version": "版本",
                "table_state": "描述",
                "error_output_required": "错误：合并操作需要指定 --merge-to 参数",
                "error_no_input": "错误：必须指定 --folder 或 --file 参数",
                "folder_not_found": "文件夹 {folder} 在 mods 目录中未找到",
                "no_models_in_folder": "文件夹 {folder} 中未找到有效模型",
                "simulation_start": "开始为 {model_name} 运行仿真",
                "simulation_complete": "仿真完成，结果保存到 {output}",
                "simulation_failed": "仿真失败：{error}",
                "variable_state": "变量 {var_name}：{value} {unit}",
                "invalid_parameter": "无效参数：{param}",
                "table_value": "值",
                "table_unit": "单位",
                "critical_conditions_header": "触发的临界条件",
                "event_applied": "事件应用成功",
                "event_apply_failed": "事件应用失败",
                "invalid_yaml_event": "无效的 YAML 事件格式：{error}",
                "optimization_success": "优化成功：参数={params}，值={value}",
                "optimization_failed": "优化失败：{error}",
                "app_title": "LifeMatters 仿真框架",
                "welcome_message": "欢迎使用 LifeMatters",
                "no_templates_available": "无可用模板",
                "list_templates_failed": "列出模板失败：{error}",
                "unknown_template": "未知模板：{template_name}",
                "model_generated_success": "模型生成成功，保存到 {output}",
                "model_generation_failed": "模型生成失败：{error}",
                "list_models_failed": "列出模型失败：{error}",
                "merge_failed": "合并模型失败：{error}",
                "display_state_failed": "显示状态失败：{error}",
                "model_loaded": "模型加载成功：{model_name}",
                "saved_to": "保存到：{output}",
                "unexpected_error": "意外错误：{error}"
            }
        }

        try:
            # 检查外部翻译目录是否存在。
            if not os.path.exists(translation_dir):
                logger.warning(f"Translation directory {translation_dir} not found, using default translations")
                return default_translations

            external_translations = {}
            # 遍历翻译目录下的所有文件。
            for file_name in os.listdir(translation_dir):
                # 只处理以 .yaml 或 .yml 结尾的文件。
                if file_name.endswith(('.yaml', '.yml')):
                    # 提取语言代码作为文件名（不含扩展名）。
                    lang_code = os.path.splitext(file_name)[0]
                    file_path = os.path.join(translation_dir, file_name)
                    try:
                        # 尝试加载 YAML 文件。
                        with open(file_path, 'r', encoding='utf-8') as f:
                            trans_dict = yaml.safe_load(f)
                        if trans_dict:
                            # 如果加载成功且文件不为空，则添加到外部翻译字典。
                            external_translations[lang_code] = trans_dict
                            logger.info(f"Loaded translations from {file_path}")
                        else:
                            # 如果文件为空或无效，则发出警告。
                            logger.warning(f"Empty or invalid translation file: {file_path}")
                    except Exception as e:
                        # 记录加载文件失败的错误。
                        logger.error(f"Failed to load translation file {file_path}: {e}")

            # 如果没有找到有效的外部翻译文件，则只使用默认翻译。
            if not external_translations:
                logger.warning(f"No valid translation files found in {translation_dir}, using default translations")
                return default_translations

            # 将外部翻译合并到默认翻译中。
            for lang, trans_dict in external_translations.items():
                if lang not in default_translations:
                    default_translations[lang] = {}
                default_translations[lang].update(trans_dict)
            return default_translations

        except Exception as e:
            # 如果扫描目录失败，则发出错误并返回默认翻译。
            logger.error(f"Failed to scan translation directory {translation_dir}: {e}, using default translations")
            return default_translations

    def register_translations(self, translations: Dict[str, Dict[str, str]]) -> None:
        """
        动态注册新的翻译键值对。
        :param translations: 一个包含新翻译的字典，格式与 _load_translations 方法返回的字典相同。
        """
        for lang, trans_dict in translations.items():
            if lang not in self.translations:
                self.translations[lang] = {}
            self.translations[lang].update(trans_dict)
            logger.info(f"Registered translations for language {lang}")
            # 注册新翻译后，清空缓存以确保下次获取的是最新翻译。
            self._translation_cache.clear()

    def set_language(self, language: str) -> None:
        """
        设置当前语言。
        :param language: 目标语言代码。
        """
        if language in self.translations:
            self.current_language = language
            # 切换语言后，清空缓存。
            self._translation_cache.clear()
            logger.info(f"Language set to {language}")
        else:
            logger.warning(f"Unsupported language: {language}, keeping {self.current_language}")

    def get_translation(self, key: str, **kwargs) -> str:
        """
        根据给定的键和参数获取翻译文本。
        :param key: 翻译键。
        :param kwargs: 用于格式化翻译文本的关键字参数。
        :return: 格式化后的翻译文本。如果键不存在，则返回键本身。
        """
        # 为缓存创建一个唯一的键，包括翻译键和格式化参数。
        cache_key = (key, tuple(sorted(kwargs.items())))
        if cache_key not in self._translation_cache:
            # 获取当前语言的翻译字典，如果不存在则回退到英语。
            translation_dict = self.translations.get(self.current_language, self.translations.get("en", {}))
            # 获取翻译文本，如果键不存在则返回键本身。
            text = translation_dict.get(key, key)
            try:
                # 尝试用提供的参数格式化文本并存入缓存。
                self._translation_cache[cache_key] = text.format(**kwargs)
            except KeyError as e:
                # 如果格式化参数缺失，则发出警告并存储未格式化的文本。
                logger.warning(f"Missing format parameter for {key}: {e}")
                self._translation_cache[cache_key] = text
        return self._translation_cache[cache_key]