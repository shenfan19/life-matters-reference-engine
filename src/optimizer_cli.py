# -*- coding: utf-8 -*-
# 文件名: optimizer_cli.py
# 描述: LifeMatters HealthTuner 模块的命令行接口，用于模型参数优化，调用 OptimizerEngine 执行优化任务。
#       本脚本通过命令行参数或 YAML 配置文件处理用户输入，执行优化过程，并以 YAML 格式输出结果。
#       支持多语言输出，并与 LoaderEngine 集成以加载模型。

import argparse
import sys
import logging
import yaml
from typing import List, Tuple, Dict, Any, Optional
from lang_manager import LanguageManager
from optimizer_engine import OptimizerEngine
from loader_engine import LoaderEngine
from mod_structure import ModStructure

# 初始化模块的日志记录器，用于记录信息、调试和错误消息。
logger = logging.getLogger(__name__)

class OptimizerCLI:
    """模型优化的命令行接口，调用 OptimizerEngine 进行参数优化。"""
    
    def __init__(self, mods_directory: str = "mods", language: str = "en"):
        # 初始化 LanguageManager 以支持多语言，默认使用指定的语言。
        self.lang_manager = LanguageManager(default_language=language)
        # 初始化 LoaderEngine 以从指定目录加载和合并模型。
        self.loader = LoaderEngine(mods_directory, language)
        # 配置命令行接口的日志设置。
        self.setup_logging()

    def setup_logging(self):
        # 配置日志系统，设置标准格式并输出到标准输出。
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[logging.StreamHandler(sys.stdout)]
        )

    def run_optimization(self, model_names: List[str], target: str, initial_params: List[float], 
                        bounds: List[Tuple[float, float]], method: str, folder: Optional[str] = None) -> Dict[str, Any]:
        # 执行指定模型和参数的优化过程。
        try:
            # 使用 LoaderEngine 合并指定模型。
            model = self.loader.merge_models_by_names(model_names, folder=folder)
            # 检查模型加载是否成功，若失败则返回错误信息。
            if not model["success"]:
                return {"success": False, "error": self.lang_manager.get_translation("model_not_found", model_name=", ".join(model_names))}
            
            # 使用合并后的模型数据和优化目标初始化 OptimizerEngine。
            optimizer = OptimizerEngine(model["data"], target=target)
            # 使用指定的优化方法、初始参数和边界执行优化。
            result = optimizer.optimize(initial_params, bounds, method=method)
            # 如果优化成功，记录优化成功的日志，包含优化的参数和目标值。
            if result["success"]:
                logger.info(self.lang_manager.get_translation("optimization_success", params=result['params'], value=result['value']))
            # 如果优化失败，记录错误日志。
            else:
                logger.error(result["error"])
            # 返回优化结果字典。
            return result
        except Exception as e:
            # 如果优化过程中发生意外异常，记录错误并返回错误信息。
            logger.error(f"Optimization failed: {e}")
            return {"success": False, "error": self.lang_manager.get_translation("optimization_failed", error=str(e))}

def create_parser() -> argparse.ArgumentParser:
    # 创建并配置命令行参数解析器，用于处理用户输入。
    parser = argparse.ArgumentParser(
        description='LifeMatters Optimizer CLI - Optimize model parameters using SciPy.',
        epilog='''
Examples:
  %(prog)s --optimize digestive diabetes --target min_error --params '[0.5,1.0]' --bounds '[(0,1),(0,2)]' --method scipy-grid --lang zh-Hans
  %(prog)s --config opt_config.yaml
        ''',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    # 定义命令行参数，包括模型目录、语言和优化参数。
    parser.add_argument('--mods-dir', default='mods', help='Models directory (default: mods)')
    parser.add_argument('--lang', default='en', choices=['en', 'zh-Hans', 'zh-Hant', 'fr'], help='Language for output')
    parser.add_argument('--folder', help='Subfolder in mods directory')
    parser.add_argument('--verbose', '-v', action='store_true', help='Enable verbose logging')
    parser.add_argument('--quiet', '-q', action='store_true', help='Suppress non-error output')
    parser.add_argument('--config', help='Optimization config file (YAML format)')
    parser.add_argument('--optimize', nargs='+', help='Models to optimize')
    parser.add_argument('--target', default='min_error', help='Optimization target (e.g., min_error, max_lifespan)')
    parser.add_argument('--params', default='[0.5,1.0]', help='Initial parameters (JSON format)')
    parser.add_argument('--bounds', default='[(0,1),(0,2)]', help='Parameter bounds (JSON format)')
    parser.add_argument('--method', default='scipy-grid', choices=['scipy-grid', 'scipy-nelder'], help='Optimization method')
    # 返回配置好的解析器。
    return parser

def main():
    # 脚本的主入口函数。
    # 使用定义的解析器解析命令行参数。
    parser = create_parser()
    args = parser.parse_args()

    # 根据 verbose 或 quiet 标志调整日志级别。
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    elif args.quiet:
        logging.getLogger().setLevel(logging.ERROR)

    # 使用指定的模型目录和语言初始化 OptimizerCLI。
    cli = OptimizerCLI(args.mods_dir, args.lang)
    success = False

    try:
        # 初始化空的配置字典。
        config = {}
        # 如果提供了配置文件，则加载 YAML 配置文件。
        if args.config:
            with open(args.config, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)
            # 如果配置文件中存在相应字段，则覆盖命令行参数。
            args.optimize = config.get('models', args.optimize)
            args.folder = config.get('folder', args.folder)
            args.target = config.get('target', args.target)
            args.params = config.get('initial_params', args.params)
            args.bounds = config.get('bounds', args.bounds)
            args.method = config.get('method', args.method)

        # 如果指定了模型名称，则执行优化。
        if args.optimize:
            import json
            # 从 JSON 字符串解析初始参数和边界。
            initial_params = json.loads(args.params)
            bounds = json.loads(args.bounds)
            # 使用指定参数和模型运行优化过程。
            result = cli.run_optimization(args.optimize, args.target, initial_params, bounds, args.method, args.folder)
            # 如果优化成功，以 YAML 格式输出结果；否则打印错误信息。
            if result["success"]:
                print(yaml.dump(result, allow_unicode=True, sort_keys=False))
                success = True
            else:
                print(f"✗ {result.get('error', 'Unknown error')}")
                success = False
        else:
            # 如果未指定模型，打印错误信息和帮助信息。
            print(f"✗ {cli.lang_manager.get_translation('error_no_input')}")
            parser.print_help()
            success = False
    except Exception as e:
        # 处理意外错误，打印错误信息，记录日志，并以失败状态码退出。
        print(f"✗ {cli.lang_manager.get_translation('unexpected_error', error=str(e))}")
        logger.error(f"Unexpected error: {e}")
        sys.exit(1)

    # 根据优化成功或失败退出程序，返回相应的状态码。
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    # 检查脚本是否直接运行，确保仅在直接执行时运行主函数。
    main()