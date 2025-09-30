# -*- coding: utf-8 -*-
# 文件名: player_cli.py
# 描述: LifeMatters Player 模块的命令行接口，用于运行仿真、显示模型状态和应用事件。
#       本脚本通过命令行参数处理用户输入，调用 PlayerEngine 执行仿真任务，并支持多语言输出和 YAML 格式结果保存。

import argparse
import sys
import logging
import yaml
from typing import Dict, Any, Optional
from lang_manager import LanguageManager
from player_engine import PlayerEngine
from mod_structure import ModStructure

# 初始化模块的日志记录器，用于记录信息、调试和错误消息。
logger = logging.getLogger(__name__)

# 示例调试命令：python player_cli.py --run diabetes --time 200 --dt 1 --pause-every 5 --target min_error --auto-adjust

class PlayerCLI:
    """Player 命令行接口，调用 PlayerEngine 运行仿真并显示状态。"""
    
    def __init__(self, mods_directory: str = "mods_med", language: str = "en"):
        # 初始化 LanguageManager 以支持多语言，默认使用指定语言。
        self.lang_manager = LanguageManager(default_language=language)
        # 初始化 PlayerEngine 用于执行仿真任务，指定模型目录和语言。
        self.engine = PlayerEngine(mods_directory, language)
        # 配置日志设置。
        self.setup_logging()

    def setup_logging(self):
        # 配置日志系统，设置标准格式并输出到标准输出。
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[logging.StreamHandler(sys.stdout)]
        )

    def run_simulation(self, model_name: str, time: int, output_path: Optional[str] = None, 
                   folder: Optional[str] = None, dt: float = 1.0, dt_unit: str = 'second', 
                   target: str = 'min_error', pause_every: int = 5, auto_adjust: bool = False) -> Dict[str, Any]:
        # 执行指定模型的仿真任务。
        try:
            # 定义时间单位转换因子，将时间步长转换为秒。
            unit_factors = {
                'second': 1.0,
                'minute': 60.0,
                'hour': 3600.0,
                'day': 86400.0
            }
            # 检查时间单位是否有效，若无效则返回错误。
            if dt_unit not in unit_factors:
                error_msg = self.lang_manager.get_translation("invalid_dt_unit", unit=dt_unit)
                logger.error(error_msg)
                return {"success": False, "message": error_msg}
            # 将时间步长按单位缩放为秒。
            scaled_dt = dt * unit_factors[dt_unit]
            # 调用 PlayerEngine 执行仿真。
            result = self.engine.run_simulation(model_name, time, scaled_dt, folder, target, pause_every, auto_adjust)
            # 如果仿真成功，获取临界条件并保存结果。
            if result["success"]:
                critical_conditions = self.engine.get_critical_conditions()
                result["critical_conditions"] = critical_conditions["triggered_conditions"]
                # 如果指定了输出路径，将结果保存为 YAML 文件。
                if output_path:
                    with open(output_path, 'w', encoding='utf-8') as f:
                        yaml.dump(result, f, allow_unicode=True, sort_keys=False)
                    logger.info(self.lang_manager.get_translation("simulation_complete", output=output_path))
                return result
            else:
                # 如果仿真失败，返回错误信息。
                return {"success": False, "message": self.lang_manager.get_translation("simulation_failed", error=result["error"])}
        except Exception as e:
            # 处理意外异常，记录错误并返回失败信息。
            error_msg = self.lang_manager.get_translation("simulation_failed", error=str(e))
            logger.error(error_msg)
            return {"success": False, "message": error_msg}

    def display_state(self, model_name: str, folder: Optional[str] = None, 
                     output_format: str = "table") -> Dict[str, Any]:
        # 显示指定模型的当前状态。
        try:
            # 加载指定模型。
            model = self.engine.loader.fetch(model_name, folder)
            # 如果模型加载失败，返回错误信息。
            if not model:
                return {"success": False, "message": self.lang_manager.get_translation("model_not_found", model_name=model_name)}
            
            # 获取模型当前状态。
            state = self.engine.get_state()
            # 如果状态获取失败，返回错误信息。
            if not state["success"]:
                return state

            # 组织状态数据为表格格式。
            table_data = [
                {
                    "name": var_name,
                    "value": var_info["value"],
                    "unit": var_info.get("unit", "N/A"),
                    "description": var_info.get("description", "N/A")
                }
                for var_name, var_info in state["state"].items()
            ]

            # 根据输出格式返回结果或打印表格。
            if output_format == "yaml":
                return {"success": True, "data": table_data, "format": "yaml"}
            else:
                # 打印状态表格，包括变量名、值、单位和描述。
                print(f"\n{self.lang_manager.get_translation('list_header', count=len(table_data))}")
                print(f"{self.lang_manager.get_translation('table_name'):<30} "
                      f"{self.lang_manager.get_translation('table_value'):<10} "
                      f"{self.lang_manager.get_translation('table_unit'):<10} "
                      f"{self.lang_manager.get_translation('table_state'):<50}")
                print("-" * 100)
                for item in table_data:
                    print(f"{item['name']:<30} {item['value']:<10.2f} {item['unit']:<10} {item['description']:<50}")
                return {"success": True, "data": table_data, "format": "table"}
        except Exception as e:
            # 处理意外异常，记录错误并返回失败信息。
            logger.error(f"Display state failed: {e}")
            return {"success": False, "message": self.lang_manager.get_translation("display_state_failed", error=str(e))}

def create_parser() -> argparse.ArgumentParser:
    # 创建并配置命令行参数解析器。
    parser = argparse.ArgumentParser(
        description='LifeMatters Player CLI - Run simulations and display states.',
        epilog='''
Examples:
  %(prog)s --run digestive --time 100 --dt 1.0 --output result.yaml --folder physiology --lang zh-Hans
  %(prog)s --state digestive --format yaml --folder physiology
  %(prog)s --event 'variables: {blood_glucose: 100}' --folder physiology
        ''',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    # 定义命令行参数，包括模型目录、语言、仿真参数等。
    parser.add_argument('--mods-dir', default='mods_med', help='Models directory (default: mods_med)')
    parser.add_argument('--lang', default='en', choices=['en', 'zh-Hans', 'zh-Hant', 'fr'], help='Language for output')
    parser.add_argument('--folder', help='Subfolder in mods directory')
    parser.add_argument('--verbose', '-v', action='store_true', help='Enable verbose logging')
    parser.add_argument('--quiet', '-q', action='store_true', help='Suppress non-error output')
    # 定义互斥参数组，确保运行、状态显示或事件应用之一被选择。
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--run', help='Run simulation for the specified model')
    group.add_argument('--state', help='Display current state of the model')
    group.add_argument('--event', help='Apply an event (YAML string)')
    parser.add_argument('--time', type=int, default=3600, help='Full time for simulation in seconds (default: 3600)')
    parser.add_argument('--dt', type=float, default=1.0, help='Time step for simulation')
    parser.add_argument('--format', choices=['table', 'yaml'], default='table', help='Output format')
    parser.add_argument('--output', help='Output file for simulation results (YAML format)')
    parser.add_argument('--pause-every', type=int, default=5, help='Pause every N steps for input (default: 5)')
    parser.add_argument('--target', default='min_error', help='Optimization target for suggestions')
    parser.add_argument('--auto-adjust', action='store_true', help='Enable automatic Optimizer adjustments')
    # 返回配置好的解析器。
    return parser

def main():
    # 脚本的主入口函数。
    # 解析命令行参数。
    parser = create_parser()
    args = parser.parse_args()

    # 根据 verbose 或 quiet 标志调整日志级别。
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    elif args.quiet:
        logging.getLogger().setLevel(logging.ERROR)

    # 初始化 PlayerCLI，指定模型目录和语言。
    cli = PlayerCLI(args.mods_dir, args.lang)
    success = False

    try:
        # 如果指定了运行仿真，执行仿真任务。
        if args.run:
            result = cli.run_simulation(args.run, args.time, args.output, args.folder, args.dt, args.target, args.pause_every, args.auto_adjust)
            # 如果仿真成功，根据格式输出结果。
            if result["success"]:
                if args.format == "yaml":
                    print(yaml.dump(result, allow_unicode=True, sort_keys=False))
                else:
                    cli.display_state(args.run, args.folder, args.format)
                    # 如果存在临界条件，打印临界条件信息。
                    if result.get("critical_conditions"):
                        print(f"\n{cli.lang_manager.get_translation('critical_conditions_header')}")
                        for condition in result["critical_conditions"]:
                            print(f"- {condition['description']}")
                success = True
            else:
                # 如果仿真失败，打印错误信息。
                print(f"✗ {result['message']}")
                success = False
        # 如果指定了显示状态，显示模型状态。
        elif args.state:
            result = cli.display_state(args.state, args.folder, args.format)
            if args.format == "yaml":
                print(yaml.dump(result["data"], allow_unicode=True, sort_keys=False))
            success = result["success"]
            if not success:
                print(f"✗ {result['message']}")
        # 如果指定了应用事件，解析并应用事件。
        elif args.event:
            try:
                event = yaml.safe_load(args.event)
                # 应用事件并输出结果。
                if cli.engine.apply_event(event):
                    print(f"✓ {cli.lang_manager.get_translation('event_applied')}")
                    success = True
                else:
                    print(f"✗ {cli.lang_manager.get_translation('event_apply_failed')}")
                    success = False
            except yaml.YAMLError as e:
                # 如果事件 YAML 格式无效，打印错误信息。
                print(f"✗ {cli.lang_manager.get_translation('invalid_yaml_event', error=str(e))}")
                success = False
    except Exception as e:
        # 处理意外错误，打印错误信息，记录日志，并以失败状态码退出。
        print(f"✗ {cli.lang_manager.get_translation('unexpected_error', error=str(e))}")
        logger.error(f"Unexpected error: {e}")
        sys.exit(1)

    # 根据操作成功或失败退出程序，返回相应的状态码。
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    # 检查脚本是否直接运行，确保仅在直接执行时运行主函数。
    main()