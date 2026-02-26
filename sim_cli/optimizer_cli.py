# -*- coding: utf-8 -*-
# 文件名: optimizer_cli.py
# 描述: LifeMatters Optimizer 模块的命令行接口，用于模型参数优化。
#       本脚本通过命令行参数处理用户输入，调用 OptimizerEngine 执行优化任务，
#       并支持多语言输出和多种优化模式（real_time/full_inputs/full_params）。

import argparse
import sys
import logging
import yaml
from typing import Dict, Any, List, Optional
from sim_engine.src.optimizer_engine import OptimizerEngine
from sim_engine.src.simulator_engine import SimulatorEngine
from sim_engine.src.babel_manager import BabelLanguageManager

# 初始化模块的日志记录器，用于记录信息、调试和错误消息。
logger = logging.getLogger(__name__)

class OptimizerCLI:
    """模型优化的命令行接口，调用 OptimizerEngine 进行参数优化。"""
    
    def __init__(self, mods_directory: str = "mods", language: str = "en"):
        """
        初始化命令行接口。
        :param mods_directory: 模型目录路径。
        :param language: 语言设置（如 "en", "zhhans"）。
        """
        # 初始化 LanguageManager 以支持多语言，默认使用指定的语言。
        self.lang_manager = BabelLanguageManager(default_language=language)
        # 初始化 OptimizerEngine 用于执行优化任务。
        self.optimizer = OptimizerEngine(mods_directory, language)
        # 初始化 SimulatorEngine 用于黑盒评估。
        self.simulator = SimulatorEngine(mods_directory, language)
        # 将仿真器注入到优化器中。
        self.optimizer.set_simulator(self.simulator)
        # 配置命令行接口的日志设置。
        self.setup_logging()

    def setup_logging(self):
        """配置日志系统，设置标准格式并输出到标准输出。"""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[logging.StreamHandler(sys.stdout)]
        )

    def run_optimization(self, model_names: List[str], mode: str, target: str, 
                        method: str, time_hours: float, folder: Optional[str] = None,
                        output_path: Optional[str] = None) -> Dict[str, Any]:
        """
        执行指定模型和参数的优化过程。
        :param model_names: 模型名称列表。
        :param mode: 优化模式（real_time/full_inputs/full_params）。
        :param target: 优化目标（如 min_error）。
        :param method: 优化方法（grid/pymoo/rl）。
        :param time_hours: 优化时长（小时）。
        :param folder: 子文件夹名称。
        :param output_path: 输出文件路径（YAML 格式）。
        :return: 优化结果字典。
        """
        try:
            # 加载模型到优化器。
            if not self.optimizer.load_models(model_names, folder):
                return {
                    "success": False, 
                    "error": self.lang_manager.get_translation(
                        "model_not_found", 
                        model_name=", ".join(model_names)
                    )
                }
            
            # 加载模型到仿真器（共享同一模型）。
            self.simulator.current_model = self.optimizer.current_model
            
            # 执行优化任务。
            result = self.optimizer.optimize(
                mode=mode,
                target=target,
                method=method,
                time_hours=time_hours
            )
            
            # 如果优化成功。
            if result["success"]:
                # 记录优化成功的日志。
                if mode == 'full_params':
                    logger.info(self.lang_manager.get_translation(
                        "optimization_success", 
                        params=result.get('params', []), 
                        value=result.get('value', 0)
                    ))
                elif mode == 'real_time':
                    logger.info(f"实时优化完成，总步数: {result.get('total_steps', 0)}")
                elif mode == 'full_inputs':
                    logger.info(f"输入序列优化完成")
                
                # 如果指定了输出路径，将结果保存为 YAML 文件。
                if output_path:
                    with open(output_path, 'w', encoding='utf-8') as f:
                        yaml.dump(result, f, allow_unicode=True, sort_keys=False)
                    logger.info(f"优化结果已保存到: {output_path}")
            else:
                # 如果优化失败，记录错误日志。
                logger.error(result.get("error", "未知错误"))
            
            # 返回优化结果字典。
            return result
        
        except Exception as e:
            # 如果优化过程中发生意外异常，记录错误并返回错误信息。
            error_msg = self.lang_manager.get_translation("optimization_failed", error=str(e))
            logger.error(error_msg)
            return {"success": False, "error": error_msg}

def create_parser() -> argparse.ArgumentParser:
    """
    创建并配置命令行参数解析器，用于处理用户输入。
    :return: 配置好的参数解析器。
    """
    parser = argparse.ArgumentParser(
        description='LifeMatters Optimizer CLI - 优化模型参数',
        epilog='''
示例命令:
  %(prog)s --folder models/medical/dynamics --file digestive,diabetes --mode full_params --method pymoo --time 12000 --lang zhhans
  %(prog)s --file models/medical/dynamics/digestive --mode real_time --method grid --time 720
  %(prog)s --file models/medical/dynamics/obesity_diabetes --mode full_inputs --method pymoo --time 8640 --output result.yaml
        ''',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    # 定义通用参数。
    parser.add_argument('--mods-dir', default='mods', 
                       help='模型目录（默认: mods）')
    parser.add_argument('--lang', default='en', 
                       choices=['en', 'zhhans', 'zhhant', 'fr'], 
                       help='输出语言')
    parser.add_argument('--folder', 
                       help='模型子文件夹（如 physiology）')
    
    # 定义优化相关参数。
    parser.add_argument('--file', 
                       help='优化模型名称（逗号分隔，如 digestive,diabetes）')
    parser.add_argument('--mode', default='full_params', 
                       choices=['real_time', 'full_inputs', 'full_params'], 
                       help='优化模式（默认: full_params）')
    parser.add_argument('--method', default='grid', 
                       choices=['grid', 'pymoo', 'rl'], 
                       help='优化方法（默认: grid）')
    parser.add_argument('--time', type=float, default=24*30*12, 
                       help='优化时长（小时，默认: 8640 = 1 年）')
    parser.add_argument('--target', default='min_error',
                       help='优化目标（如 min_error，默认: min_error）')
    parser.add_argument('--output', 
                       help='优化结果保存路径 (YAML 格式)')
    
    # 返回配置好的解析器。
    return parser

def main():
    """脚本的主入口函数。"""
    # 使用定义的解析器解析命令行参数。
    parser = create_parser()
    args = parser.parse_args()

    # 使用指定的模型目录和语言初始化 OptimizerCLI。
    cli = OptimizerCLI(args.mods_dir, args.lang)
    success = False

    try:
        # 初始化配置变量。
        model_names = []
        mode = args.mode
        method = args.method
        time_hours = args.time
        target = args.target
        output_path = args.output
        folder = args.folder
        
        # 如果指定了 --file 参数，解析模型名称列表。
        if args.file:
            model_names = [name.strip() for name in args.file.split(',')]
        
        # 如果没有指定模型名称，打印错误信息和帮助信息。
        if not model_names:
            print(f"✗ {cli.lang_manager.get_translation('error_no_input')}")
            parser.print_help()
            sys.exit(1)
        
        # 执行优化任务。
        result = cli.run_optimization(
            model_names=model_names,
            mode=mode,
            target=target,
            method=method,
            time_hours=time_hours,
            folder=folder,
            output_path=output_path
        )
        
        # 如果优化成功。
        if result["success"]:
            # 根据优化模式输出结果。
            if mode == 'full_params':
                print(f"\n✓ 优化完成 (模式: {mode})")
                print(f"  最优参数: {result.get('params', [])}")
                print(f"  目标值: {result.get('value', 0):.6f}")
                print(f"  迭代次数: {len(result.get('history', []))}")
            elif mode == 'real_time':
                print(f"\n✓ 实时优化完成")
                print(f"  总步数: {result.get('total_steps', 0)}")
                print(f"  前 5 步优化结果:")
                for step_result in result.get('step_results', [])[:5]:
                    print(f"    步数 {step_result['step']}: 输入 = {step_result['optimal_inputs']}, 适应度 = {step_result['fitness']:.6f}")
            elif mode == 'full_inputs':
                print(f"\n✓ 输入序列优化完成")
                print(f"  最优适应度: {result.get('value', 0):.6f}")
                print(f"  迭代次数: {len(result.get('history', []))}")
            
            # 如果未指定输出路径但需要查看详细结果，输出 YAML 格式。
            if not output_path:
                print("\n详细结果:")
                print(yaml.dump(result, allow_unicode=True, sort_keys=False))
            
            success = True
        else:
            # 如果优化失败，打印错误信息。
            print(f"✗ 优化失败: {result.get('error', '未知错误')}")
            success = False
    
    except KeyboardInterrupt:
        # 处理用户中断（Ctrl+C）。
        print("\n✗ 用户中断优化")
        sys.exit(1)
    except Exception as e:
        # 处理意外错误，打印错误信息，记录日志，并以失败状态码退出。
        print(f"✗ {cli.lang_manager.get_translation('unexpected_error', error=str(e))}")
        logger.error(f"意外错误: {e}")
        sys.exit(1)

    # 根据优化成功或失败退出程序，返回相应的状态码。
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    # 检查脚本是否直接运行，确保仅在直接执行时运行主函数。
    main()