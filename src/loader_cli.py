# -*- coding: utf-8 -*-
#
# Copyright (c) 2024 Your Name/Organization
#
# This file is part of the LifeMatters simulation framework.
#
# Purpose:
# The `loader_cli.py` module serves as the command-line interface (CLI) for 
# the Loader tool. It handles user input, parses command-line arguments 
# (like --list, --merge-to, --folder), and formats output. It acts as a wrapper 
# around the `LoaderEngine`, translating user commands into calls to the core 
# logic for model scanning, merging, and splitting. This module is a "simple CLI 
# tool" that executes and then exits, as per the project's mixed-architecture design.
#
# For more information, please refer to the project README.md.
#
#-----------------------------------------------------------------------------

import argparse
import sys
import logging
from typing import Dict, Any, List, Optional
from loader_engine import LoaderEngine
from lang_manager import LanguageManager
from mod_structure import ModStructure, ModelMetadata, merge_dicts

# 配置日志记录器，以便在运行时输出信息和错误。
logger = logging.getLogger(__name__)

class LoaderCLI:
    """
    LifeMatters 模型加载器命令行接口。
    负责处理用户输入、调用加载引擎并格式化输出。
    """
    def __init__(self, mods_directory: str = "mods", language: str = "en"):
        """
        初始化 LoaderCLI 实例。
        :param mods_directory: 包含模型文件的目录路径。
        :param language: 命令行界面的显示语言。
        """
        # 初始化语言管理器，用于多语言支持。
        self.lang_manager = LanguageManager(default_language=language)
        # 初始化核心加载引擎。
        self.engine = LoaderEngine(mods_directory, language)
        # 设置日志记录器。
        self.setup_logging()

    def setup_logging(self):
        """
        配置日志系统，设置日志级别和输出格式。
        """
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[logging.StreamHandler(sys.stdout)]
        )

    def list_models(self, folders: Optional[List[str]] = None, files: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        列出可用的模型，并显示它们的详细信息。
        :param folders: 要扫描的子文件夹列表。
        :param files: 要列出的特定文件列表。
        :return: 包含成功状态和结果数据的字典。
        """
        try:
            # 如果指定了文件，则只处理这些文件
            if files:
                models = {}
                for file in files:
                    try:
                        model = self.engine.fetch(file, None)  # 加载指定文件（不需文件夹）
                        if model:
                            models[file] = {
                                "name": model.metadata.name,
                                "variables": len(model.variables),
                                "formulas": len(model.formulas),
                                "version": model.metadata.version,
                                "hooks": len(model.simulator.get('hooks', [])),
                                "optimizer_method": model.optimizer.get('method', 'N/A'),
                                "extra_deps": len(model.optimizer.get('python_envs', []))
                            }
                    except Exception as e:
                        logger.warning(f"跳过模型 {file} 因错误: {e}")  # 警告错误并跳过
                        continue
            else:
                # 否则，扫描多个文件夹
                models = self.engine.scan_models(folders)  # 调用扫描多个文件夹
            
            # 如果没有找到任何模型，返回错误信息
            if not models:
                return {"success": False, "message": self.lang_manager.get_translation("no_models_in_folder", folder=', '.join(folders) if folders else "root")}
            
            result_data = []
            # 遍历模型信息并获取更详细的数据。
            for name, info in models.items():
                try:
                    model = self.engine.fetch(name, folder)
                    if model:
                        result_data.append({
                            "name": info["name"],
                            "variables": info["variables"],
                            "formulas": info["formulas"],
                            "critical": sum(1 for formula in model.formulas.values() if formula.condition != True and not isinstance(formula.condition, bool)),
                            "version": info["version"],
                            "description": model.metadata.description,
                            # 更新：添加 simulator 和 optimizer 信息
                            "hooks": info["hooks"],
                            "optimizer_method": info["optimizer_method"],
                            "extra_deps": info["extra_deps"]
                        })
                except Exception as e:
                    logger.warning(f"跳过模型 {name} 因错误: {e}")
                    continue

            # 如果详细数据为空，返回错误信息。
            if not result_data:
                return {"success": False, "message": self.lang_manager.get_translation("no_models_in_folder", folder=folder or "root")}

            # 打印格式化的表格输出。
            print(f"\n{self.lang_manager.get_translation('list_header', count=len(result_data))}")
            print(f"{self.lang_manager.get_translation('table_name'):<30} "
                  f"{self.lang_manager.get_translation('table_variables'):<10} "
                  f"{self.lang_manager.get_translation('table_formulas'):<10} "
                  f"{self.lang_manager.get_translation('table_critical'):<10} "
                  f"{self.lang_manager.get_translation('table_version'):<10} "
                  f"{self.lang_manager.get_translation('table_hooks'):<10} "  # 更新：添加 hooks 列
                  f"{self.lang_manager.get_translation('table_optimizer'):<15} "  # 更新：添加 optimizer 方法列
                  f"{self.lang_manager.get_translation('table_deps'):<10} "  # 更新：添加额外依赖列
                  f"{self.lang_manager.get_translation('table_state'):<50}")
            print("-" * 150)
            for model in result_data:
                print(f"{model['name']:<30} {model['variables']:<10} {model['formulas']:<10} "
                      f"{model['critical']:<10} {model['version']:<10} {model['hooks']:<10} "
                      f"{model['optimizer_method']:<15} {model['extra_deps']:<10} {model['description']:<50}")
            
            return {"success": True, "data": result_data}

        except Exception as e:
            logger.error(f"列出模型失败: {e}")
            return {"success": False, "message": self.lang_manager.get_translation("list_models_failed", error=str(e))}
    
    def load_and_merge(self, folders: Optional[List[str]] = None, files: Optional[List[str]] = None, output_path: Optional[str] = None) -> Dict[str, Any]:
        """
        加载并合并指定文件夹和文件的模型。
        """
        try:
            if not folders and not files:
                return {"success": False, "error": "未提供任何模型或文件夹用于合并", "variables": 0, "formulas": 0}
            
            # 使用统一的合并方法
            result = self.engine.merge_models(model_names=files, folders=folders, output_path=output_path)
            
            if result["success"]:
                print(f"✓ 合并成功: 变量 {result['variables']}, 公式 {result['formulas']}, 输出到 {output_path or 'memory'}")
            else:
                print(f"✗ {result['error']}")
            
            return result
            
        except Exception as e:
            print(f"✗ 合并失败: {str(e)}")
            return {"success": False, "error": str(e)}

    def split_model(self, model_name: str, output_dir: str, folder: Optional[str] = None) -> Dict[str, Any]:
        """
        拆分模型并生成单一 patch 文件。
        :param model_name: 模型名称（文件或文件夹名）。
        :param output_dir: 输出目录（仅用于 --file 或 --folder 指定路径）。
        :param folder: 可选的子文件夹（用于 --folder）。
        :return: 包含拆分结果的字典。
        """
        try:
            result = self.engine.split_model(model_name, output_dir, folder)  # 调用引擎拆分
            if result["success"]:
                print(f"✓ {self.lang_manager.get_translation('split_success', output=result['data']['patch_file'], vars=result['data']['variables'], formulas=result['data']['formulas'])}")
            else:
                print(f"✗ {result['error']}")
            return result
        except Exception as e:
            print(f"✗ {self.lang_manager.get_translation('split_failed', error=str(e))}")
            logger.error(f"拆分失败: {e}")
            return {"success": False, "error": str(e)}
    
def create_parser() -> argparse.ArgumentParser:
    """
    创建并配置命令行参数解析器。
    :return: 配置好的 ArgumentParser 实例。
    """
    parser = argparse.ArgumentParser(
        description='LifeMatters Loader CLI - Load, merge, or split models.',  # 描述 CLI 功能
        epilog='''
Examples:
%(prog)s --list
%(prog)s --list --folder physiology cancer_models  # 支持多个文件夹
%(prog)s --folder physiology --merge-to merged.yaml  # 以 physiology.yaml 为根合并
%(prog)s --file physiology/obesity_diabetes physiology/obesity_diabetes_patch --merge-to combined.yaml
%(prog)s --folder physiology --file cancer_models/cancer --merge-to mixed.yaml  # 混合文件夹和文件
%(prog)s --file physiology/obesity_diabetes --split-to split_dir
        ''',
        formatter_class=argparse.RawDescriptionHelpFormatter  # 使用原始描述格式器
    )
    # 添加各种命令行参数
    parser.add_argument('--mods-dir', default='mods', help='模型目录 (默认: mods)')  # 模型根目录参数
    parser.add_argument('--lang', default='en', choices=['en', 'zh-Hans', 'zh-Hant', 'fr'], help='输出语言')  # 语言选择参数
    parser.add_argument('--folder', nargs='*', help='模型目录中的子文件夹（支持多个）')  # 修改为 nargs='*', 返回列表，支持0或多个
    parser.add_argument('--list', action='store_true', help='列出可用模型')  # 列出模型标志
    parser.add_argument('--file', nargs='+', help='加载和合并指定的模型（支持相对路径，如 physiology/obesity_diabetes）')  # 文件参数，支持多个
    parser.add_argument('--merge-to', help='合并模型的输出文件路径 (YAML 格式)')  # 合并输出路径
    parser.add_argument('--split-to', help='拆分模型的输出目录 (YAML 格式)')  # 拆分输出目录
    return parser

def main():
    """
    主函数，解析命令行参数并调用相应的 CLI 方法。
    """
    parser = create_parser()
    args = parser.parse_args()
    
    cli = LoaderCLI(args.mods_dir, args.lang)  # 创建 CLI 实例
    success = False
    
    try:
        if args.list:
            result = cli.list_models(args.folder, args.file)  # 列出模型
            success = result["success"]
            if not success:
                print(f"✗ {result['message']}")
        elif args.split_to:
            if args.file and args.folder:
                print(f"✗ {cli.lang_manager.get_translation('split_to_conflict')}")
                parser.print_help()
                success = False
            elif args.file and len(args.file) != 1:
                print(f"✗ {cli.lang_manager.get_translation('split_to_single_file_required')}")
                parser.print_help()
                success = False
            elif args.file:
                result = cli.split_model(args.file[0], args.split_to, None)  # 处理 --file
                success = result["success"]
            elif args.folder and len(args.folder) == 1:
                result = cli.split_model(args.folder[0], args.split_to, args.folder[0])  # 处理 --folder
                success = result["success"]
            else:
                print(f"✗ {cli.lang_manager.get_translation('split_to_input_required')}")
                parser.print_help()
                success = False
        elif args.file or args.folder:
            result = cli.load_and_merge(args.folder, args.file, args.merge_to)  # 合并模型
            success = result["success"]
        else:
            print(f"✗ {cli.lang_manager.get_translation('error_no_input')}")
            parser.print_help()
            success = False
    except Exception as e:
        print(f"✗ {cli.lang_manager.get_translation('unexpected_error', error=str(e))}")
        logger.error(f"意外错误: {e}")
        sys.exit(1)
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
