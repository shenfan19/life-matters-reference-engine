import argparse
import sys
import logging
from typing import Dict, Any
from sim_engine.src.generator_engine import GeneratorEngine
from sim_engine.src.babel_manager import BabelLanguageManager

logger = logging.getLogger(__name__)

class GeneratorCLI:
    """模型生成命令行接口，基于 GeneratorEngine 生成 YAML 模型文件。"""
    def __init__(self, mods_directory: str = "models", language: str = "en"):
        self.lang_manager = BabelLanguageManager(default_language=language)
        self.engine = GeneratorEngine(mods_directory)
        self.setup_logging()

    def setup_logging(self):
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[logging.StreamHandler(sys.stdout)]
        )

    def list_templates(self) -> Dict[str, Any]:
        try:
            templates = self.engine.available_templates
            if not templates:
                return {"success": False, "data": [], "message": self.lang_manager.get_translation("no_templates_available")}
            return {"success": True, "data": templates}
        except Exception as e:
            logger.error(f"List templates failed: {e}")
            return {"success": False, "data": [], "message": self.lang_manager.get_translation("list_templates_failed", error=str(e))}

    def generate_model(self, template_name: str, output_path: str, params: dict) -> Dict[str, Any]:
        try:
            if template_name not in self.engine.available_templates:
                return {"success": False, "message": self.lang_manager.get_translation("unknown_template", template_name=template_name)}
            success = self.engine.generate_from_template(template_name, output_path, params)
            if success:
                return {"success": True, "message": self.lang_manager.get_translation("model_generated_success", output=output_path)}
            else:
                return {"success": False, "message": self.lang_manager.get_translation("model_generation_failed")}
        except Exception as e:
            logger.error(f"Generate model failed: {e}")
            return {"success": False, "message": self.lang_manager.get_translation("model_generation_failed", error=str(e))}

def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description='LifeMatters Model Generator CLI - Create new model YAML files from templates',
        epilog='''
Examples:
  %(prog)s --list-templates
  %(prog)s --generate risk_increase model.yaml --param risk_name=lung_cancer risk_factor=smoking_status disease_risk=lung_cancer_risk increase_rate=0.05
  %(prog)s --generate epidemic_spread covid.yaml --param epidemic_name=covid beta_rate=0.3 recovery_rate=0.1 total_population=1000 initial_infected=10
        ''',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument('--mods-dir', default='models', help='Models directory (default: models)')
    parser.add_argument('--lang', default='en', choices=['en', 'zhhans', 'zhhant', 'fr'], help='Language for output')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--list-templates', action='store_true', help='List available templates')
    group.add_argument('--generate', nargs=2, metavar=('TEMPLATE', 'OUTPUT'), 
                       help='Generate model from TEMPLATE to OUTPUT file')
    parser.add_argument('--param', nargs='*', help='Parameters in key=value format (e.g., increase_rate=0.05)')
    return parser

def main():
    parser = create_parser()
    args = parser.parse_args()

    cli = GeneratorCLI(args.mods_dir, args.lang)
    success = False
    result = None

    try:
        if args.list_templates:
            result = cli.list_templates()
            if result["success"]:
                print(f"\n{cli.lang_manager.get_translation('list_header', count=len(result['data']))}")
                print(f"{cli.lang_manager.get_translation('table_name'):<30}")
                print("-" * 30)
                for template in result["data"]:
                    print(f"{template:<30}")
                success = True
            else:
                print(f"✗ {result['message']}")
                success = False
        elif args.generate:
            template_name, output_path = args.generate
            params = {}
            if args.param:
                for p in args.param:
                    key, value = p.split('=', 1)
                    try:
                        if value.lower() in ('true', 'false'):
                            params[key] = value.lower() == 'true'
                        elif '.' in value or 'e' in value.lower():
                            params[key] = float(value)
                        else:
                            params[key] = int(value)
                    except ValueError:
                        params[key] = value
            result = cli.generate_model(template_name, output_path, params)
            print(f"{'✓' if result['success'] else '✗'} {result['message']}")
            success = result["success"]
    except Exception as e:
        print(f"✗ {cli.lang_manager.get_translation('unexpected_error', error=str(e))}")
        logger.error(f"Unexpected error: {e}")
        sys.exit(1)

    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()