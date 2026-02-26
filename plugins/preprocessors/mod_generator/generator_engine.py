import logging
from typing import Dict, Any, Optional
from sim_engine.src.mod_structure import ModStructure
from sim_engine.src.loader.loader_engine import LoaderEngine

logger = logging.getLogger(__name__)

class GeneratorEngine:
    """模型生成引擎，负责从通用医学模板生成 ModStructure 模型。"""
    def __init__(self, mods_directory: str = "mods"):
        self.mods_dir = mods_directory
        self.loader = LoaderEngine(mods_directory)
        self.available_templates = [
            "risk_increase",
            "intervention_reduction",
            "epidemic_spread",
            "time_prediction",
            "dose_response",
            "behavior_change"
        ]

    def generate_from_template(self, template_name: str, output_path: str, params: Dict[str, Any]) -> bool:
        """根据模板生成 ModStructure 模型并保存。"""
        logger.info(f"Generating model '{template_name}' to {output_path}")
        try:
            if template_name not in self.available_templates:
                logger.error(f"Unknown template: {template_name}")
                return False

            model = None
            if template_name == "risk_increase":
                model = self._create_risk_increase_model(params)
            elif template_name == "intervention_reduction":
                model = self._create_intervention_reduction_model(params)
            elif template_name == "epidemic_spread":
                model = self._create_epidemic_spread_model(params)
            elif template_name == "time_prediction":
                model = self._create_time_prediction_model(params)
            elif template_name == "dose_response":
                model = self._create_dose_response_model(params)
            elif template_name == "behavior_change":
                model = self._create_behavior_change_model(params)

            if model is None:
                logger.error(f"Failed to generate model data for {template_name}")
                return False

            model.export_to_yaml(output_path)
            logger.info(f"Model '{template_name}' successfully generated to {output_path}")
            self.loader.scan_models()
            return True
        except Exception as e:
            logger.error(f"Failed to generate model: {e}")
            return False

    def _create_risk_increase_model(self, params: Dict[str, Any]) -> ModStructure:
        """生成风险因素增加模型。"""
        risk_name = params.get('risk_name', 'risk_increase')
        risk_factor = params.get('risk_factor', 'risk_factor')
        disease_risk = params.get('disease_risk', 'disease_risk')
        increase_rate = params.get('increase_rate', 0.05)
        initial_value = params.get('initial_value', 0.0)

        model = ModStructure()
        model.metadata = ModelMetadata(
            name=f"{risk_name}_model",
            version="1.0.0",
            author="GeneratorEngine",
            description=f"Model for {risk_factor} increasing {disease_risk} by {increase_rate*100}%.",
            file_path="",
        )
        model.variables = {
            risk_factor: Variable(
                description=f"{risk_factor}状态 (0=无, 1=有)",
                value=initial_value,
                type=VariableType.input
            ),
            disease_risk: Variable(
                description=f"{disease_risk}风险指数",
                value=0.01,
                unit="风险指数",
                type=VariableType.state,
                bounds=[0.0, 1.0]
            )
        }
        model.formulas = {
            "risk_increase": Formula(
                description=f"{risk_factor}导致{disease_risk}风险增加",
                condition=f"{risk_factor} > 0",
                priority=100,
                dynamics={disease_risk: f"{disease_risk} + {increase_rate} * step_size"}
            )
        }
        model._initialize_asteval()
        model.validate_model()
        return model

    def _create_intervention_reduction_model(self, params: Dict[str, Any]) -> ModStructure:
        """生成干预降低疾病严重度模型。"""
        intervention_name = params.get('intervention_name', 'intervention')
        intervention_status = params.get('intervention_status', 'intervention_status')
        disease_severity = params.get('disease_severity', 'disease_severity')
        efficacy_rate = params.get('efficacy_rate', 0.1)
        initial_status = params.get('initial_status', 0.0)

        model = ModStructure()
        model.metadata = ModelMetadata(
            name=f"{intervention_name}_model",
            version="1.0.0",
            author="GeneratorEngine",
            description=f"Model for {intervention_name} reducing {disease_severity}.",
            file_path="",
        )
        model.variables = {
            intervention_status: Variable(
                description=f"{intervention_name}状态 (0=无, 1=有)",
                value=initial_status,
                type=VariableType.input
            ),
            disease_severity: Variable(
                description=f"{disease_severity}严重度",
                value=1.0,
                unit="严重度指数",
                type=VariableType.state,
                bounds=[0.0, 1.0]
            )
        }
        model.formulas = {
            "intervention_effect": Formula(
                description=f"{intervention_name}降低{disease_severity}",
                condition=f"{intervention_status} > 0",
                priority=100,
                dynamics={disease_severity: f"{disease_severity} - {efficacy_rate} * {disease_severity} * step_size"}
            )
        }
        model._initialize_asteval()
        model.validate_model()
        return model

    def _create_epidemic_spread_model(self, params: Dict[str, Any]) -> ModStructure:
        """生成传染病传播模型（SIR）。"""
        epidemic_name = params.get('epidemic_name', 'epidemic')
        beta_rate = params.get('beta_rate', 0.3)
        recovery_rate = params.get('recovery_rate', 0.1)
        total_population = params.get('total_population', 1000.0)
        initial_infected = params.get('initial_infected', 10.0)

        model = ModStructure()
        model.metadata = ModelMetadata(
            name=f"{epidemic_name}_model",
            version="1.0.0",
            author="GeneratorEngine",
            description=f"SIR model for {epidemic_name} with beta={beta_rate}, gamma={recovery_rate}.",
            file_path="",
        )
        model.variables = {
            "susceptible": Variable(
                description="易感人群",
                value=total_population - initial_infected,
                type=VariableType.state,
                bounds=[0.0, total_population]
            ),
            "infected": Variable(
                description="感染人群",
                value=initial_infected,
                type=VariableType.state,
                bounds=[0.0, total_population]
            ),
            "recovered": Variable(
                description="恢复人群",
                value=0.0,
                type=VariableType.state,
                bounds=[0.0, total_population]
            )
        }
        model.formulas = {
            "infection_spread": Formula(
                description="感染传播",
                condition="infected > 0 and susceptible > 0",
                priority=100,
                dynamics={
                    "susceptible": f"susceptible - {beta_rate} * susceptible * infected / {total_population} * step_size",
                    "infected": f"infected + {beta_rate} * susceptible * infected / {total_population} * step_size - {recovery_rate} * infected * step_size",
                    "recovered": f"recovered + {recovery_rate} * infected * step_size"
                }
            )
        }
        model._initialize_asteval()
        model.validate_model()
        return model

    def _create_time_prediction_model(self, params: Dict[str, Any]) -> ModStructure:
        """生成时间依赖预测模型。"""
        outcome_prediction = params.get('outcome_prediction', 'prediction')
        trend_rate = params.get('trend_rate', 0.2)
        decay_rate = params.get('decay_rate', 0.05)
        initial_value = params.get('initial_value', 50.0)

        model = ModStructure()
        model.metadata = ModelMetadata(
            name=f"{outcome_prediction}_model",
            version="1.0.0",
            author="GeneratorEngine",
            description=f"Time-dependent model predicting {outcome_prediction}.",
            file_path="",
        )
        model.variables = {
            "time_factor": Variable(
                description="时间因素",
                value=0.0,
                type=VariableType.state
            ),
            outcome_prediction: Variable(
                description=f"{outcome_prediction}预测值",
                value=initial_value,
                unit="指数",
                type=VariableType.state,
                bounds=[0.0, 100.0]
            )
        }
        model.formulas = {
            "time_prediction": Formula(
                description="时间依赖预测",
                condition="true",
                priority=100,
                dynamics={outcome_prediction: f"{outcome_prediction} + {trend_rate} * step_size - {decay_rate} * {outcome_prediction} * step_size"}
            )
        }
        model._initialize_asteval()
        model.validate_model()
        return model

    def _create_dose_response_model(self, params: Dict[str, Any]) -> ModStructure:
        """生成剂量响应模型。"""
        dose_response = params.get('dose_response', 'dose_response')
        efficacy_rate = params.get('efficacy_rate', 0.15)
        clearance_rate = params.get('clearance_rate', 0.05)
        initial_dose = params.get('initial_dose', 1.0)

        model = ModStructure()
        model.metadata = ModelMetadata(
            name=f"{dose_response}_model",
            version="1.0.0",
            author="GeneratorEngine",
            description=f"Dose-response model for {dose_response}.",
            file_path="",
        )
        model.variables = {
            "dose_level": Variable(
                description="剂量水平",
                value=initial_dose,
                type=VariableType.input
            ),
            "treatment_effect": Variable(
                description=f"{dose_response}效果",
                value=0.0,
                unit="效果指数",
                type=VariableType.state,
                bounds=[0.0, 1.0]
            )
        }
        model.formulas = {
            "dose_response": Formula(
                description="剂量响应效果",
                condition="dose_level > 0",
                priority=100,
                dynamics={"treatment_effect": f"treatment_effect + {efficacy_rate} * dose_level * step_size - {clearance_rate} * treatment_effect * step_size"}
            )
        }
        model._initialize_asteval()
        model.validate_model()
        return model

    def _create_behavior_change_model(self, params: Dict[str, Any]) -> ModStructure:
        """生成行为改变模型。"""
        behavior_change = params.get('behavior_change', 'behavior_change')
        change_rate = params.get('change_rate', 0.2)
        habit_decay = params.get('habit_decay', 0.1)
        initial_level = params.get('initial_level', 0.0)

        model = ModStructure()
        model.metadata = ModelMetadata(
            name=f"{behavior_change}_model",
            version="1.0.0",
            author="GeneratorEngine",
            description=f"Behavior change model for {behavior_change}.",
            file_path="",
        )
        model.variables = {
            "intervention_level": Variable(
                description="干预水平",
                value=initial_level,
                type=VariableType.input
            ),
            "behavior_index": Variable(
                description=f"{behavior_change}改变指数",
                value=0.0,
                unit="指数",
                type=VariableType.state,
                bounds=[0.0, 1.0]
            )
        }
        model.formulas = {
            "behavior_change": Formula(
                description="干预导致行为改变",
                condition="intervention_level > 0",
                priority=100,
                dynamics={"behavior_index": f"behavior_index + {change_rate} * intervention_level * step_size - {habit_decay} * behavior_index * step_size"}
            )
        }
        model._initialize_asteval()
        model.validate_model()
        return model