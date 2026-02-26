# -*- coding: utf-8 -*-
# 文件名: simulator_cli.py
# 描述: LifeMatters Simulator 模块的命令行接口，用于运行仿真和显示模型状态。
#       本脚本通过命令行参数处理用户输入，调用 SimulatorEngine 执行仿真任务，
#       并支持多语言输出和交互式暂停功能。

import argparse
import sys
import logging
import yaml
from typing import Dict, Any, Optional
from sim_engine.src.babel_manager import BabelLanguageManager
from sim_engine.src.simulator_engine import SimulatorEngine

# 初始化模块的日志记录器，用于记录信息、调试和错误消息。
logger = logging.getLogger(__name__)

class SimulatorCLI:
    """Simulator 命令行接口，调用 SimulatorEngine 运行仿真并显示状态。"""
    
    def __init__(self, mods_directory: str = "mods", language: str = "en"):
        """
        初始化命令行接口。
        :param mods_directory: 模型目录路径。
        :param language: 语言设置（如 "en", "zhhans"）。
        """
        # 初始化 LanguageManager 以支持多语言，默认使用指定语言。
        self.lang_manager = BabelLanguageManager(default_language=language)
        # 初始化 SimulatorEngine 用于执行仿真任务，指定模型目录和语言。
        self.engine = SimulatorEngine(mods_directory, language)
        # 配置日志设置。
        self.setup_logging()

    def setup_logging(self):
        """配置日志系统，设置标准格式并输出到标准输出。"""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[logging.StreamHandler(sys.stdout)]
        )

    def run_simulation(self, model_name: str, time_hours: float, 
                      folder: Optional[str] = None, pause_every: int = 0, 
                      interactive: bool = False, output_path: Optional[str] = None) -> Dict[str, Any]:
        """
        执行指定模型的仿真任务。
        :param model_name: 模型名称。
        :param time_hours: 仿真总时间（小时）。
        :param folder: 子文件夹名称。
        :param pause_every: 每隔多少步暂停。
        :param interactive: 是否启用交互式暂停。
        :param output_path: CSV 输出文件路径（可选）。
        :return: 仿真结果字典。
        """
        try:
            # 调用 SimulatorEngine 执行仿真。
            result = self.engine.run_simulation(
                model_name=model_name,
                time_hours=time_hours,
                folder=folder,
                pause_every=pause_every,
                interactive=interactive,
                output_path=output_path
            )
            
            # 如果仿真成功。
            if result["success"]:
                # 记录仿真完成日志。
                logger.info(f"仿真完成: {result['model_name']}, 步数: {result['steps']}")
                # 返回仿真结果。
                return result
            else:
                # 如果仿真失败，返回错误信息。
                return {
                    "success": False, 
                    "message": self.lang_manager.get_translation(
                        "simulation_failed", 
                        error=result.get("error", "未知错误")
                    )
                }
        except Exception as e:
            # 处理意外异常，记录错误并返回失败信息。
            error_msg = self.lang_manager.get_translation("simulation_failed", error=str(e))
            logger.error(error_msg)
            return {"success": False, "message": error_msg}

    def display_state(self, model_name: str, folder: Optional[str] = None, 
                     output_format: str = "table") -> Dict[str, Any]:
        """
        显示指定模型的当前状态。
        :param model_name: 模型名称。
        :param folder: 子文件夹名称。
        :param output_format: 输出格式（table/yaml）。
        :return: 状态字典。
        """
        try:
            # 加载指定模型。
            if not self.engine.load_models([model_name], folder):
                return {
                    "success": False, 
                    "message": self.lang_manager.get_translation(
                        "model_not_found", 
                        model_name=model_name
                    )
                }
            
            # 获取模型当前状态。
            state_result = self.engine.get_state()
            # 如果状态获取失败，返回错误信息。
            if not state_result["success"]:
                return state_result

            # 提取状态数据。
            state = state_result["state"]
            
            # 组织状态数据为表格格式。
            table_data = [
                {
                    "name": var_name,
                    "value": var_info["value"],
                    "unit": var_info.get("unit", "N/A"),
                    "description": var_info.get("description", "N/A")
                }
                for var_name, var_info in state.items()
            ]

            # 根据输出格式返回结果或打印表格。
            if output_format == "yaml":
                return {"success": True, "data": table_data, "format": "yaml"}
            else:
                # 打印状态表格头部。
                print(f"\n{self.lang_manager.get_translation('list_header', count=len(table_data))}")
                print(f"{'变量名':<30} {'值':<15} {'单位':<10} {'描述':<50}")
                print("-" * 105)
                # 打印每个变量的状态。
                for item in table_data:
                    print(f"{item['name']:<30} {item['value']:<15.4f} {item['unit']:<10} {item['description']:<50}")
                return {"success": True, "data": table_data, "format": "table"}
        except Exception as e:
            # 处理意外异常，记录错误并返回失败信息。
            logger.error(f"显示状态失败: {e}")
            return {
                "success": False, 
                "message": self.lang_manager.get_translation(
                    "display_state_failed", 
                    error=str(e)
                )
            }

def create_parser() -> argparse.ArgumentParser:
    """
    创建并配置命令行参数解析器。
    :return: 配置好的参数解析器。
    """
    parser = argparse.ArgumentParser(
        description='LifeMatters Simulator CLI - 运行仿真和显示模型状态',
        epilog='''
示例命令:
  %(prog)s --file models/medical/dynamics/digestive --time 1000 --lang zhhans --interactive
  %(prog)s --file models/medical/dynamics/obesity_diabetes --time 500
  %(prog)s --state models/medical/dynamics/digestive --format yaml
  %(prog)s --file models/medical/dynamics/digestive --time 8760 --output results/simulation.csv
        ''',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    # 定义通用参数。
    parser.add_argument('--mods-dir', default='mods', 
                       help='模型目录（默认: mods）')
    parser.add_argument('--lang', default='en', 
                       choices=['en', 'zhhans', 'zhhant', 'fr'], 
                       help='输出语言')
    
    # 定义互斥参数组（运行仿真或显示状态）。
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--file', 
                      help='运行指定模型的仿真')
    group.add_argument('--folder', 
                       help='模型子文件夹（如 physiology）')
    group.add_argument('--state', 
                      help='显示指定模型的当前状态')
    
    # 定义仿真相关参数。
    parser.add_argument('--time', type=float, default=8760.0, 
                       help='仿真总时间（小时，默认: 8760 = 1 年）')
    parser.add_argument('--pause-every', type=int, default=0, 
                       help='每隔多少步暂停（默认: 0，不暂停）')
    parser.add_argument('--interactive', action='store_true', 
                       help='启用交互式暂停（CLI 输入）')
    parser.add_argument('--output', 
                       help='CSV 输出文件路径（默认: mods/output/<model_name>_simulation.csv）')
    
    # 定义状态显示相关参数。
    parser.add_argument('--format', choices=['table', 'yaml'], default='table', 
                       help='输出格式（默认: table）')
    
    # 返回配置好的解析器。
    return parser

def main():
    """脚本的主入口函数。"""
    # 解析命令行参数。
    parser = create_parser()
    args = parser.parse_args()

    # 初始化 SimulatorCLI，指定模型目录和语言。
    cli = SimulatorCLI(args.mods_dir, args.lang)
    success = False

    try:
        # 如果指定了运行仿真。
        if args.file:
            # 执行仿真任务。
            result = cli.run_simulation(
                model_name=args.file,
                time_hours=args.time,
                folder=args.folder,
                pause_every=args.pause_every,
                interactive=args.interactive,
                output_path=args.output
            )
            # 如果仿真成功。
            if result["success"]:
                # 显示仿真完成信息。
                print(f"\n✓ 仿真完成")
                print(f"  模型: {result['model_name']}")
                print(f"  步数: {result['steps']}")
                print(f"  时间: {result['time']/3600:.2f} 小时")
                print(f"  CSV 输出: {result['csv_output']}")
                print(f"  输出变量: {', '.join(result['output_variables'])}")
                # 显示部分状态变量。
                print(f"\n最终状态（前 5 个变量）:")
                for var_name, var_info in list(result['state'].items())[:5]:
                    print(f"  {var_name}: {var_info['value']:.4f} {var_info.get('unit', '')}")
                success = True
            else:
                # 如果仿真失败，打印错误信息。
                print(f"✗ {result.get('message', '仿真失败')}")
                success = False
        
        # 如果指定了显示状态。
        elif args.state:
            # 显示模型状态。
            result = cli.display_state(args.state, args.folder, args.format)
            # 如果格式为 YAML，输出 YAML 格式数据。
            if args.format == "yaml" and result["success"]:
                print(yaml.dump(result["data"], allow_unicode=True, sort_keys=False))
            success = result["success"]
            # 如果显示失败，打印错误信息。
            if not success:
                print(f"✗ {result.get('message', '显示状态失败')}")
    
    except KeyboardInterrupt:
        # 处理用户中断（Ctrl+C）。
        print("\n✗ 用户中断仿真")
        sys.exit(1)
    except Exception as e:
        # 处理意外错误，打印错误信息，记录日志，并以失败状态码退出。
        print(f"✗ 意外错误: {str(e)}")
        logger.error(f"意外错误: {e}")
        sys.exit(1)

    # 根据操作成功或失败退出程序，返回相应的状态码。
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    # 检查脚本是否直接运行，确保仅在直接执行时运行主函数。
    main()