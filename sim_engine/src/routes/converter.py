import re
import yaml
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import app_state

router = APIRouter()
logger = logging.getLogger(__name__)


class ConvertRequest(BaseModel):
    scenario_path: str      # path relative to models/
    game_name: str          # basename for stories/to_game/{game_name}/
    health_variable: str


def _detect_pattern(expr: str):
    """简单公式模式识别，返回 (pattern, delta_int)"""
    s = str(expr).strip()
    if re.fullmatch(r'-?\d+(\.\d+)?', s):
        return "P1", round(float(s))
    if re.fullmatch(r'0\.\d+', s):
        return "P5", max(-50, round(-float(s) * 100))
    if re.search(r'\*\s*0\.', s) or re.search(r'0\.\d+\s*\*', s):
        return "P6", -5
    if any(kw in s for kw in ('if ', 'else', '>', '<', '>=', '<=')):
        return "P4", -10
    if '+=' in s or re.search(r'\+\s*\d', s):
        return "P2", -3
    return "P3", -8


@router.post("/api/convert")
async def convert_scenario(request: ConvertRequest):
    """将 scenario 自动转换为 game story 文件夹结构"""
    import json
    from datetime import date

    scenario_path = request.scenario_path.lstrip('/')
    game_name = request.game_name
    health_var = request.health_variable

    scen_file = app_state.PROJECT_ROOT / "models" / scenario_path
    if not scen_file.exists():
        raise HTTPException(status_code=404, detail=f"Model file not found: {scenario_path}")
    if not str(scen_file.resolve()).startswith(str((app_state.PROJECT_ROOT / "models").resolve())):
        raise HTTPException(status_code=400, detail="Path outside models/")

    with open(scen_file, 'r', encoding='utf-8') as f:
        scenario = yaml.safe_load(f) or {}

    metadata = scenario.get("metadata", {})
    variables = scenario.get("variables", {})
    formulas = scenario.get("formulas", {})
    simulator = scenario.get("simulator", {})

    total_time = simulator.get("total_time", 365)
    total_turns = max(1, round(total_time / 30)) if isinstance(total_time, (int, float)) else 12

    out_dir = app_state.PROJECT_ROOT / "models" / "stories" / game_name
    cards_dir = out_dir / "cards"
    out_dir.mkdir(parents=True, exist_ok=True)
    cards_dir.mkdir(parents=True, exist_ok=True)

    env_cards = []
    player_cards = []
    variable_to_card = {}
    formula_patterns = {}

    var_formula_map: dict = {}
    for fml_key, fml_data in formulas.items():
        for vname, expr in (fml_data.get("dynamics") or {}).items():
            var_formula_map.setdefault(vname, []).append((fml_key, str(expr) if expr is not None else ""))

    for var_name, var_data in variables.items():
        if var_name == health_var:
            continue
        var_type = var_data.get("type", "state")
        display_name = var_data.get("description") or var_name

        if var_type == "input":
            card_id = f"player_{var_name}"
            card_file = f"cards/{card_id}.yaml"
            card = {
                "id": card_id, "type": "player", "category": "action",
                "display": {"name": display_name, "description": "", "flavor": "", "icon": ""},
                "cost": 2,
                "effects": [{"target": "health", "delta": 5, "condition": None}],
                "channel": "social", "tags": [], "weight": 100,
                "source": {"variable": var_name, "formula": "", "pattern_detected": "P1"},
            }
            with open(cards_dir / f"{card_id}.yaml", 'w', encoding='utf-8') as f:
                yaml.safe_dump(card, f, allow_unicode=True, default_flow_style=False, indent=2)
            player_cards.append({"path": card_file})
            variable_to_card[var_name] = card_file

        elif var_type in ("state", "parameter"):
            pattern = "P1"
            delta = -5
            formula_expr = ""
            if var_name in var_formula_map:
                fml_key, formula_expr = var_formula_map[var_name][0]
                pattern, delta = _detect_pattern(formula_expr)
                formula_patterns[formula_expr] = pattern
            card_id = f"env_{var_name}"
            card_file = f"cards/{card_id}.yaml"
            card = {
                "id": card_id, "type": "env", "category": "state",
                "display": {"name": display_name, "description": "", "flavor": "", "icon": ""},
                "pattern": pattern,
                "effects": [{"target": "health", "delta": delta, "condition": None}],
                "debuff": None,
                "channel": "medical", "tags": [], "weight": 100,
                "source": {"variable": var_name, "formula": formula_expr, "pattern_detected": pattern},
            }
            with open(cards_dir / f"{card_id}.yaml", 'w', encoding='utf-8') as f:
                yaml.safe_dump(card, f, allow_unicode=True, default_flow_style=False, indent=2)
            env_cards.append({"path": card_file, "weight": 100})
            variable_to_card[var_name] = card_file

    hv_data = variables.get(health_var, {})
    bounds = hv_data.get("bounds", [0, 1])
    h_min = bounds[0] if len(bounds) > 0 else 0
    h_max = bounds[1] if len(bounds) > 1 else 1

    game_story = {
        "meta": {
            "name": metadata.get("name", game_name),
            "description": metadata.get("description", ""),
            "difficulty": metadata.get("difficulty", "medium"),
            "tags": metadata.get("tags", []),
            "author": metadata.get("author", ""),
            "version": "0.1",
            "source_scenario": game_name,
            "source_path": scenario_path,
        },
        "initial_state": {"health": 100, "money": 10, "status": 1},
        "health_mapping": {
            "source_variable": health_var,
            "scale": [h_min, h_max, 0, 100],
            "display": "生命值",
        },
        "turns": {
            "total": total_turns,
            "time_per_turn": "1 month",
            "env_cards_per_turn": 2,
            "player_hand_size": 5,
            "action_points": 3,
        },
        "win_condition": {"type": "survive", "description": f"撑过 {total_turns} 个回合"},
        "lose_condition": {"type": "health_zero", "description": "生命值归零"},
        "endings": [
            {"grade": "S", "condition": "health >= 50", "title": "优秀"},
            {"grade": "A", "condition": "health > 0", "title": "幸存"},
            {"grade": "D", "condition": "health <= 0", "title": "失败"},
        ],
        "env_deck": env_cards,
        "player_deck": player_cards,
        "generic_cards": {"inject": ["rest", "labor", "interrupt"]},
    }

    with open(out_dir / "game_story.yaml", 'w', encoding='utf-8') as f:
        yaml.safe_dump(game_story, f, allow_unicode=True, default_flow_style=False, indent=2)

    mapping_data = {
        "version": "1.0",
        "source_scenario": game_name,
        "source_path": scenario_path,
        "generated_at": str(date.today()),
        "updated_at": str(date.today()),
        "health_mapping": {"source_variable": health_var, "scale": [h_min, h_max, 0, 100]},
        "auto_mappings": {
            "metadata.name": "meta.name",
            "metadata.description": "meta.description",
            "metadata.tags": "meta.tags",
            "simulator.total_time": "turns.total",
        },
        "variable_to_card": variable_to_card,
        "formula_patterns": formula_patterns,
        "manual_overrides": {},
    }

    with open(out_dir / "_mapping.json", 'w', encoding='utf-8') as f:
        json.dump(mapping_data, f, ensure_ascii=False, indent=2)

    logger.info(f"Converted {game_name} (from {scenario_path}): {len(env_cards)} env cards, {len(player_cards)} player cards")
    return {
        "success": True,
        "env_cards": len(env_cards),
        "player_cards": len(player_cards),
        "message": f"生成完成：{len(env_cards)} 张环境牌，{len(player_cards)} 张玩家牌",
    }
