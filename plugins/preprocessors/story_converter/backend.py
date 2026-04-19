"""
LifeMatters Scenario Converter: Model YAML → game_story.yaml

Implements Type 1-6 + D1/D2/D3 classification from task_5_converter.md.

Classification taxonomy
  Type 1  Constant Flux          → always_active env card, fixed delta
  Type 2  State Multiplier       → piecewise-linear approximation env card
  Type 3  Accumulated State      → counter-driven env card (with delta cap)
  Type 4  Threshold Trigger      → condition env card
  Type 5  Stochastic             → probability env card
  Type 6  ODE System             → discretise → fallback classify as Type 1-5
  D1      PDE / spatial          → forced → Type 4 + human review warning
  D2      High-dim coupled       → forced → reduce variables + Type 4
  D3      SDE / continuous noise → forced → Type 5
"""

import math
import re
import yaml
from pathlib import Path
from typing import Any


# ──────────────────────────────────────────────────────────────────────────────
# Plugin entry point
# ──────────────────────────────────────────────────────────────────────────────

class ScenarioConverterPlugin:
    """
    Input keys:
        model_path   str  — relative to mods/  e.g. "models/medical/dynamics/banister_fitness_fatigue.yaml"
        scenario_id  str  — output folder name (optional, derived from model name)
        turns        int  — override max game turns
        ap_per_turn  int  — action points per turn (default 3)

    Output:
        game_story.yaml saved to mods/scenarios/to_game/<scenario_id>/game_story.yaml
    """

    def __init__(self, context):
        self.context = context
        self.mods_dir = Path("mods")

    def run(self, inputs: dict) -> dict:
        model_path = inputs.get("model_path")
        if not model_path:
            return {"success": False, "error": "Missing model_path"}

        model_full = self.mods_dir / model_path
        if not model_full.exists():
            return {"success": False, "error": f"Model not found: {model_path}"}

        try:
            with open(model_full, "r", encoding="utf-8") as f:
                model = yaml.safe_load(f)
        except Exception as e:
            return {"success": False, "error": f"Failed to parse YAML: {e}"}

        try:
            story, notes = _convert(model, inputs)
        except Exception as e:
            import traceback
            return {"success": False, "error": f"Conversion failed: {e}",
                    "traceback": traceback.format_exc()}

        meta = model.get("metadata", model.get("meta", {}))
        model_name = meta.get("name", Path(model_path).stem)
        scenario_id = inputs.get("scenario_id") or _slug(model_name)

        out_dir = self.mods_dir / "stories" / "to_game" / scenario_id
        out_dir.mkdir(parents=True, exist_ok=True)

        files_written = _save_new_format(story, out_dir, model_path, meta)

        return {
            "success": True,
            "output_path": str(out_dir / "game_story.yaml"),
            "message": f"Converted → {out_dir} ({len(files_written)} files)",
            "converter_notes": notes,
            "files": files_written,
        }


# ──────────────────────────────────────────────────────────────────────────────
# Core conversion pipeline
# ──────────────────────────────────────────────────────────────────────────────

def _convert(model: dict, inputs: dict) -> tuple[dict, list[str]]:
    meta_src  = model.get("metadata", model.get("meta", {}))
    vars_src  = model.get("variables", {})
    forms_src = model.get("formulas", {})
    simulator = model.get("simulator") or model.get("simulation") or {}
    optimizer = model.get("optimizer", {})

    # ── User overrides from frontend ──────────────────────────────────────
    var_config_in     = inputs.get("var_config",     {})   # {key: {role, asCard, asIndicator}}
    formula_config_in = inputs.get("formula_config", {})   # {fname: {overrideType, enabled}}
    conditions_in     = inputs.get("conditions",     [])   # [{variable, op, threshold, outcome, message}]

    notes: list[str] = []

    # 1. Separate variables by type
    state_vars = {k: v for k, v in vars_src.items() if v.get("type") == "state"}
    input_vars = {k: v for k, v in vars_src.items() if v.get("type") == "input"}

    # 2. Determine game variables respecting user role selections
    #    role = 'game' → include as game variable
    #    role = 'observe' | 'exclude' → skip
    all_state_keys = list(state_vars.keys())
    if var_config_in:
        game_var_keys = [
            k for k in all_state_keys
            if var_config_in.get(k, {}).get("role", "game") == "game"
        ]
        if not game_var_keys:
            game_var_keys = _select_game_vars(state_vars, optimizer)
    else:
        game_var_keys = _select_game_vars(state_vars, optimizer)

    if len(state_vars) > 5 and not var_config_in:
        notes.append(
            f"D2: {len(state_vars)} state variables reduced to {len(game_var_keys)} "
            "game variables (core-variable principle). Human review recommended."
        )

    game_vars = _build_game_vars(game_var_keys, state_vars)

    # 3. Time scaling — normalize total_time to days for turn estimation
    step_size  = float(simulator.get("step_size", 1))
    total_time = float(simulator.get("total_time", 90))
    time_unit  = str(simulator.get("time_unit", "day")).lower()
    _UNIT_TO_DAYS = {"minute": 1/1440, "hour": 1/24, "day": 1, "week": 7, "month": 30, "year": 365}
    unit_factor    = _UNIT_TO_DAYS.get(time_unit, 1.0)
    step_days      = step_size * unit_factor
    total_days     = total_time * step_days          # total simulation in days
    total_steps    = total_time / step_size if step_size > 0 else total_time
    turn_days      = _estimate_turn_length(total_days)
    raw_turns      = max(8, min(20, int(total_days / turn_days)))

    ap_per_turn = int(inputs.get("ap_per_turn", 3))
    max_turns   = int(inputs.get("turns") or raw_turns)
    steps_per_turn = total_steps / max_turns if max_turns > 0 else 1.0

    # 4. Classify formulas → env cards OR input-driven player card effects
    #    Key rule: if a formula's condition references an input variable,
    #    it is NOT an env event — it IS the mechanism behind a player card.
    #    We separate these two sets here, then use input_formula_map in step 5.
    env_cards: list[dict] = []
    input_formula_map: dict[str, list[dict]] = {}   # input_key → [formula_defs]
    type_log: list[str] = []

    for fname, fdef in forms_src.items():
        fui = formula_config_in.get(fname, {})
        if fui and not fui.get("enabled", True):
            type_log.append(f"{fname}→(disabled)")
            continue

        # Check whether condition directly mentions an input variable
        cond_raw = str(fdef.get("condition", "true"))
        driving_input = next(
            (k for k in input_vars if re.search(rf"\b{re.escape(k)}\b", cond_raw)),
            None,
        )
        if driving_input:
            # This formula is driven by a player input → record for player card effects
            input_formula_map.setdefault(driving_input, []).append(fdef)
            type_log.append(f"{fname}→player({driving_input})")
            continue

        ftype, card = _classify_formula(
            fname, fdef, state_vars, input_vars,
            game_var_keys, game_vars, steps_per_turn,
            type_override=fui.get("overrideType") or None,
        )
        type_log.append(f"{fname}→{ftype}")
        if card:
            env_cards.append(card)
        if ftype in ("D1", "D2", "D3"):
            notes.append(
                f"{ftype}: formula '{fname}' required forced simplification. "
                "Review effects manually."
            )

    # 5. Player cards — derive effects from formula dynamics, not hardcoded heuristics
    active_inputs = {
        k: v for k, v in input_vars.items()
        if var_config_in.get(k, {}).get("asCard", v.get("optimizable", False)) is not False
    }
    if not var_config_in:
        active_inputs = input_vars

    player_cards = _build_player_cards(
        active_inputs, game_var_keys, game_vars, steps_per_turn, optimizer,
        input_formula_map,
    )

    # 5b. System cards — auto-selected by scenario params, overridable by UI config
    system_cards_config_in = inputs.get("system_cards_config", {})
    neg_env_count = sum(
        1 for c in env_cards if any(e.get("delta", 0) < 0 for e in c.get("effects", []))
    )
    system_cards = _select_system_cards(
        ap=ap_per_turn,
        turns=max_turns,
        hand_size=min(5, max(3, len(player_cards))),
        neg_env_count=neg_env_count,
        n_vars=len(game_var_keys),
        config=system_cards_config_in,
    )
    player_cards = player_cards + system_cards

    # 6. Win / lose conditions — use user-defined if provided, else auto
    if conditions_in:
        lose_conds = [
            {"condition": f"{c['variable']} {c['op']} {c['threshold']}",
             "message":   c.get("message") or f"{c['variable']}{c['op']}{c['threshold']}"}
            for c in conditions_in if c.get("outcome") == "lose" and c.get("variable")
        ]
        win_conds = [
            {"condition": f"{c['variable']} {c['op']} {c['threshold']}",
             "message":   c.get("message") or f"{c['variable']}{c['op']}{c['threshold']}"}
            for c in conditions_in if c.get("outcome") == "win" and c.get("variable")
        ]
        # Fallback if either list is empty
        if not lose_conds or not win_conds:
            auto_lose, auto_win = _build_conditions(game_var_keys, game_vars, optimizer)
            lose_conds = lose_conds or auto_lose
            win_conds  = win_conds  or auto_win
    else:
        lose_conds, win_conds = _build_conditions(game_var_keys, game_vars, optimizer)

    # 7. Science note
    refs = meta_src.get("references", [])
    ref_text = "来源：" + "；".join(r.split(".")[0] for r in refs[:3]) if refs else ""
    science_note = (
        ((meta_src.get("description") or "").strip()[:300] + "\n" + ref_text).strip()
        + f"\n[Converter: {'; '.join(type_log)}]"
    )

    # 8. Attach model references to every generated card
    for card in env_cards:
        if card:
            card["references"] = refs
    for card in player_cards:
        card["references"] = refs

    # 9. Assemble
    story: dict[str, Any] = {
        "meta": {
            "id": _slug(meta_src.get("name", "converted")),
            "name": meta_src.get("name", "Converted Scenario"),
            "description": (meta_src.get("description") or "").strip()[:200],
            "science_note": science_note.strip()[:800],
            "tags": meta_src.get("tags", []),
            "difficulty": _estimate_difficulty(env_cards),
        },
        "variables": {
            k: {kk: vv for kk, vv in v.items() if not kk.startswith("_")}
            for k, v in game_vars.items()
        },
        "game": {
            "ap_per_turn": ap_per_turn,
            "max_turns": max_turns,
            "hand_size": min(6, max(3, ap_per_turn + 2)),
        },
        "lose_conditions": lose_conds,
        "win_conditions": win_conds,
        "player_cards": player_cards,
        "environment_cards": [c for c in env_cards if c],
    }

    return story, notes


# ──────────────────────────────────────────────────────────────────────────────
# Variable selection & scaling
# ──────────────────────────────────────────────────────────────────────────────

def _select_game_vars(state_vars: dict, optimizer: dict) -> list[str]:
    """Pick 3-5 narrative-relevant state variables, preferring optimizer targets."""
    targets = optimizer.get("targets_of_optimization", [])
    keys = list(targets)
    for k in state_vars:
        if k not in keys:
            keys.append(k)
    return keys[:5]


def _build_game_vars(keys: list[str], state_vars: dict) -> dict:
    """Scale raw state variables to game range [0, 100]."""
    COLORS = ["#52c41a", "#1677ff", "#faad14", "#722ed1", "#f5222d"]
    result = {}
    for i, k in enumerate(keys):
        v = state_vars.get(k, {})
        bounds = v.get("bounds", [0, 100])
        lo, hi = float(bounds[0]), float(bounds[-1])
        raw = float(v.get("value", (lo + hi) / 2))
        rng = hi - lo or 100.0
        scaled = max(0.0, min(100.0, (raw - lo) / rng * 100))
        unit = v.get("unit", "")
        result[k] = {
            "label": _short_label(k, unit),
            "value": round(scaled, 1),
            "max": 100,
            "color": COLORS[i % len(COLORS)],
            "description": (v.get("description") or "").strip()[:100],
            # Private: used during conversion, stripped before output
            "_raw_lo": lo,
            "_raw_hi": hi,
            "_raw_val": raw,
            "_unit": unit,
        }
    return result


def _short_label(key: str, unit: str = "") -> str:
    KNOWN = {
        "fitness_component": "适应", "fatigue_component": "疲劳",
        "performance": "表现", "gfr": "GFR", "bun": "BUN",
        "muscle_mass": "肌肉量", "systolic_bp": "收缩压",
        "uric_acid": "尿酸", "body_weight": "体重",
        "goal_score": "综合评分",
    }
    if key in KNOWN:
        return KNOWN[key]
    label = key.replace("_", " ").title()
    if unit and len(label) < 10:
        label += f"({unit})"
    return label[:12]


# ──────────────────────────────────────────────────────────────────────────────
# Formula classification (Type 1-6, D1-D3)
# ──────────────────────────────────────────────────────────────────────────────

def _classify_formula(
    fname: str, fdef: dict,
    state_vars: dict, input_vars: dict,
    game_var_keys: list[str], game_vars: dict,
    steps_per_turn: float,
    type_override: str | None = None,
) -> tuple[str, dict | None]:
    dynamics = fdef.get("dynamics", {})
    if not dynamics:
        return "skip", None

    affected = [k for k in dynamics if k in game_var_keys]
    if not affected:
        return "skip", None

    priority = fdef.get("priority", 5)
    condition_raw = fdef.get("condition", True)

    # Derived/scoring formulas (low priority, condition always true) → skip
    # (unless user explicitly overrides)
    if not type_override and priority <= 2 and condition_raw is True:
        return "derived", None

    expr_text = " ".join(str(v) for v in dynamics.values())

    # Use user override if provided, else auto-detect
    ftype = type_override or _detect_type(condition_raw, expr_text, state_vars, input_vars)

    card = _make_env_card(
        fname, fdef, ftype, affected, game_vars,
        state_vars, steps_per_turn, condition_raw
    )
    return ftype, card


def _detect_type(condition, expr: str, state_vars: dict, input_vars: dict) -> str:
    """Heuristic type detection from condition and dynamics expression."""

    # D1: spatial / PDE keywords
    if any(kw in expr for kw in ("nabla", "laplacian", "grad", "pde", "spatial")):
        return "D1"

    # D3: stochastic / SDE keywords
    if any(kw in expr for kw in ("wiener", "brownian", "noise", "dW", "stochastic")):
        return "D3"

    # Type 4: condition is a runtime expression (not just True/False)
    if isinstance(condition, str) and condition.lower() not in ("true", "false"):
        return "Type4"
    if isinstance(condition, bool) and not condition:
        return "Type4"

    all_var_keys = list(state_vars) + list(input_vars)

    # Type 2: expression contains state*state or state/state multiplication
    for k in state_vars:
        pat_mul = rf"\b{k}\b\s*[*/]"
        pat_div = rf"[*/]\s*\b{k}\b"
        if re.search(pat_mul, expr) or re.search(pat_div, expr):
            # Ignore "/ tau" or "/ 365" patterns which are just ODE constants
            if not re.search(rf"/\s*\b{k}\b\s*[\+\-\)\s]", expr):
                return "Type2"

    # Type 6: ODE-style discretised equation
    if "step_size" in expr:
        # Sub-classify into Type 1 if the bracketed term is constant (no var dep)
        bracketed = re.findall(r"\((.+?)\)\s*\*\s*step_size", expr)
        for inner in bracketed:
            if not any(re.search(rf"\b{k}\b", inner) for k in all_var_keys):
                return "Type1"
        return "Type6"

    # Type 1: pure constant arithmetic
    if not any(re.search(rf"\b{k}\b", expr) for k in all_var_keys):
        return "Type1"

    return "Type6"


def _make_env_card(
    fname: str, fdef: dict, ftype: str, affected: list[str],
    game_vars: dict, state_vars: dict, steps_per_turn: float, condition_raw
) -> dict | None:
    dynamics = fdef.get("dynamics", {})
    description = ((fdef.get("description") or fname).strip()[:120])
    name = _formula_display_name(fname)
    emoji = _formula_emoji(fname, ftype)

    effects = []
    for vk in affected:
        expr = str(dynamics.get(vk, ""))
        delta = _estimate_delta(vk, expr, game_vars, state_vars, steps_per_turn)
        if delta != 0:
            effects.append({"variable": vk, "delta": delta})

    if not effects:
        return None

    science_tag = {
        "Type1": "[Type1] 每回合固定变化（常数流）",
        "Type2": "[Type2] 状态乘数 → 分段线性近似（已简化）",
        "Type3": "[Type3] 累积状态驱动伤害（计数器机制）",
        "Type4": "[Type4] 阈值条件触发",
        "Type5": "[Type5] 概率随机事件",
        "Type6": "[Type6] ODE离散化（每回合）",
        "D1":    "[D1] 空间方程强制退化为阈值触发 — 需人工审核",
        "D2":    "[D2] 高维耦合强制降维 — 需人工审核",
        "D3":    "[D3] 随机过程 → 概率触发",
    }.get(ftype, f"[{ftype}]")

    card: dict = {
        "id": fname,
        "name": name,
        "emoji": emoji,
        "description": f"[{ftype}] {description}",
        "science": science_tag,
        "effects": effects,
    }

    if ftype == "Type1":
        card["always_active"] = True

    elif ftype == "Type2":
        # Represent piecewise linear as always_active (simplified)
        card["always_active"] = True
        card["description"] += "（状态乘数已线性化）"

    elif ftype == "Type3":
        card["always_active"] = True  # counter accumulates every turn

    elif ftype == "Type4":
        cond_str = str(condition_raw)
        game_cond = _translate_condition(cond_str, game_vars, state_vars)
        if game_cond:
            card["condition"] = game_cond
        else:
            # Fallback: trigger when primary var is low
            first = next(iter(game_vars), None)
            if first:
                card["condition"] = f"{first} < 40"

    elif ftype in ("Type5", "D3"):
        card["probability"] = 0.35

    elif ftype == "Type6":
        card["always_active"] = True

    elif ftype in ("D1", "D2"):
        first = next(iter(game_vars), None)
        card["condition"] = f"{first} < 50" if first else "false"

    return card


_SAFE_MATH = {
    "min": min, "max": max, "abs": abs,
    "sqrt": math.sqrt, "exp": math.exp, "log": math.log,
    "floor": math.floor, "ceil": math.ceil,
    "__builtins__": {},
}


def _build_eval_ctx(game_vars: dict, state_vars: dict, extra: dict | None = None) -> dict:
    """Build a representative numeric context for formula evaluation (variable midpoints).

    game_vars entries have _raw_lo/_raw_hi from build step; state_vars have raw `bounds`.
    game_vars wins on overlap so its processed metadata is preserved.
    """
    ctx: dict = {}
    # First pass: raw state_vars using bounds
    for k, v in state_vars.items():
        bounds = v.get("bounds", [0.0, 100.0])
        lo = float(bounds[0]) if bounds else 0.0
        hi = float(bounds[-1]) if bounds else 100.0
        ctx[k] = (lo + hi) / 2.0
    # Second pass: game_vars overwrite with _raw_lo/_raw_hi
    for k, v in game_vars.items():
        lo = v.get("_raw_lo", 0.0)
        hi = v.get("_raw_hi", 100.0)
        ctx[k] = (lo + hi) / 2.0
    if extra:
        ctx.update(extra)
    return ctx


def _estimate_delta(
    var_key: str, expr: str,
    game_vars: dict, state_vars: dict, steps_per_turn: float,
    extra_ctx: dict | None = None,
) -> int:
    """
    Estimate per-turn delta for env cards in game units [0, 100].

    Primary strategy: numerically evaluate the expression at representative midpoint
    values and subtract the variable's current value to find the per-step change.
    Fallback: regex coefficient extraction for step_size / annual-rate patterns.
    """
    gv = game_vars.get(var_key, {})
    raw_lo  = gv.get("_raw_lo", 0.0)
    raw_hi  = gv.get("_raw_hi", 100.0)
    raw_rng = max(raw_hi - raw_lo, 1.0)

    ctx = _build_eval_ctx(game_vars, state_vars, extra_ctx)
    current_val = ctx.get(var_key, (raw_lo + raw_hi) / 2.0)

    raw_delta_per_step: float = 0.0
    used_numerical = False

    # Try evaluation at multiple quantiles; use the largest-magnitude non-zero result.
    # This handles threshold formulas (e.g. radiation_damage only triggers above 60)
    # where the midpoint falls exactly on the threshold giving delta=0.
    for quantile in (0.5, 0.75, 0.25):
        probe_ctx = {k: gv2.get("_raw_lo", 0.0) + (gv2.get("_raw_hi", 100.0) - gv2.get("_raw_lo", 0.0)) * quantile
                     for k, gv2 in game_vars.items()}
        probe_ctx.update({k: v for k, v in ctx.items() if k not in probe_ctx})
        probe_current = probe_ctx.get(var_key, current_val)
        try:
            safe = {**_SAFE_MATH, **probe_ctx}
            new_val = float(eval(expr, {"__builtins__": {}}, safe))  # noqa: S307
            candidate = new_val - probe_current
            if abs(candidate) > abs(raw_delta_per_step):
                raw_delta_per_step = candidate
                used_numerical = True
        except Exception:
            pass

    if not used_numerical:
        # Fallback regex patterns
        coeffs = re.findall(r"([\+\-]?\s*[\d]+(?:\.[\d]+)?)\s*\*\s*step_size", expr)
        if coeffs:
            for c in coeffs:
                try:
                    raw_delta_per_step += float(c.replace(" ", ""))
                except ValueError:
                    pass
        else:
            m = re.search(r"([\d\.]+)\s*/\s*365", expr)
            if m:
                raw_delta_per_step = -(float(m.group(1)) / 365.0)
            else:
                raw_delta_per_step = -raw_rng * 0.003

    raw_delta_per_turn = raw_delta_per_step * steps_per_turn
    game_delta = raw_delta_per_turn / raw_rng * 100.0

    if abs(game_delta) < 0.3:
        return 0
    rounded = int(round(game_delta))
    if rounded == 0:
        rounded = 1 if game_delta > 0 else -1
    return max(-30, min(30, rounded))


def _eval_input_delta(
    state_var: str, expr: str,
    input_var: str, step_raw: float,
    game_vars: dict, state_vars: dict,
    input_vars: dict,
    steps_per_turn: float,
) -> int:
    """
    For a player card that increases `input_var` by `step_raw`, estimate the marginal
    per-turn change in `state_var` by numerical evaluation:
      delta = eval(expr, input_var=step_raw) - eval(expr, input_var=0)

    Uses midpoint values for all other variables to get a representative estimate.
    """
    gv = game_vars.get(state_var, {})
    raw_lo  = gv.get("_raw_lo", 0.0)
    raw_hi  = gv.get("_raw_hi", 100.0)
    raw_rng = max(raw_hi - raw_lo, 1.0)

    # Build context with midpoints; include input variable defaults/midpoints
    ctx = _build_eval_ctx(game_vars, state_vars)
    for k, v in input_vars.items():
        lo = float((v.get("bounds") or [0, 1])[0])
        hi = float((v.get("bounds") or [0, 1])[-1])
        default = v.get("value", (lo + hi) / 2.0)
        ctx[k] = float(default)

    current_state = ctx.get(state_var, (raw_lo + raw_hi) / 2.0)

    try:
        safe0 = {**_SAFE_MATH, **ctx, input_var: 0.0, state_var: current_state}
        val_0 = float(eval(expr, {"__builtins__": {}}, safe0))  # noqa: S307

        safe_s = {**_SAFE_MATH, **ctx, input_var: step_raw, state_var: current_state}
        val_s = float(eval(expr, {"__builtins__": {}}, safe_s))  # noqa: S307

        raw_delta_per_step = val_s - val_0
    except Exception:
        return -1

    raw_delta_per_turn = raw_delta_per_step * steps_per_turn
    game_delta = raw_delta_per_turn / raw_rng * 100.0

    if abs(game_delta) < 0.3:
        return 0
    rounded = int(round(game_delta))
    if rounded == 0:
        rounded = 1 if game_delta > 0 else -1
    return max(-30, min(30, rounded))


# ──────────────────────────────────────────────────────────────────────────────
# Player cards from input variables
# ──────────────────────────────────────────────────────────────────────────────

_EMOJIS_UP   = ["📈", "⬆️", "💊", "🏋️", "🔬", "📊", "🧪", "⚡"]
_EMOJIS_DOWN = ["📉", "⬇️", "🚫", "😴", "🥗", "📋", "🛑", "🔻"]


def _build_player_cards(
    input_vars: dict,
    game_var_keys: list[str],
    game_vars: dict,
    steps_per_turn: float,
    optimizer: dict,
    input_formula_map: dict | None = None,
) -> list[dict]:
    """
    Generate 2 player cards per optimizable input variable (increase / decrease).
    Effects are derived from the formula dynamics where the input drives the condition.
    Falls back to input-bounds scaling only when no formula is found.
    """
    vto = optimizer.get("variables_to_optimize", list(input_vars))
    opt_targets = set(
        v["maps_to"] if isinstance(v, dict) and "maps_to" in v else
        (v["name"] if isinstance(v, dict) else v)
        for v in vto
    )
    if input_formula_map is None:
        input_formula_map = {}

    cards: list[dict] = []

    for i, (k, v) in enumerate(input_vars.items()):
        if not (v.get("optimizable", False) or k in opt_targets):
            continue

        bounds = v.get("bounds", [0, 100])
        lo, hi   = float(bounds[0]), float(bounds[-1])
        step_pct = 0.20
        step_raw = (hi - lo) * step_pct
        unit     = v.get("unit", "")
        short    = _formula_display_name(k)   # use same label logic as env cards
        desc     = (v.get("description") or k).strip()[:80]

        # ── Derive effects from formula dynamics ──────────────────────────────
        effects_up: list[dict] = []
        for fdef in input_formula_map.get(k, []):
            dynamics = fdef.get("dynamics", {})
            for vk, expr in dynamics.items():
                if vk not in game_var_keys:
                    continue
                delta = _eval_input_delta(
                    vk, str(expr), k, step_raw,
                    game_vars, {}, input_vars, steps_per_turn,
                )
                if delta != 0:
                    # Merge: if same variable appears in multiple formulas, sum deltas
                    existing = next((e for e in effects_up if e["variable"] == vk), None)
                    if existing:
                        existing["delta"] = max(-30, min(30, existing["delta"] + delta))
                    else:
                        effects_up.append({"variable": vk, "delta": delta})

        # ── Fallback: scale by input range fraction × game range ──────────────
        if not effects_up:
            for vk in game_var_keys:
                gv = game_vars.get(vk, {})
                raw_rng = max(gv.get("_raw_hi", 100) - gv.get("_raw_lo", 0), 1.0)
                delta = int(round(step_raw / raw_rng * 100 * 0.5))
                if delta != 0:
                    effects_up.append({"variable": vk, "delta": max(-30, min(30, delta))})

        effects_down = [{"variable": e["variable"], "delta": -e["delta"]} for e in effects_up]

        # ── Cost from effect magnitude ────────────────────────────────────────
        delta_sum = sum(abs(e["delta"]) for e in effects_up)
        cost_up   = 0 if delta_sum <= 8 else (1 if delta_sum <= 18 else (2 if delta_sum <= 30 else 3))
        cost_down = max(0, cost_up - 1)

        cards.append({
            "id":      f"increase_{k}",
            "name":    f"{short}↑",
            "type":    _input_card_type(k),
            "cost":    cost_up,
            "emoji":   _EMOJIS_UP[i % len(_EMOJIS_UP)],
            "flavor":  desc,
            "science": f"优化变量 {k}（+{step_raw:.2g} {unit}/回合）",
            "effects": effects_up,
        })
        cards.append({
            "id":      f"decrease_{k}",
            "name":    f"{short}↓",
            "type":    _input_card_type(k),
            "cost":    cost_down,
            "emoji":   _EMOJIS_DOWN[i % len(_EMOJIS_DOWN)],
            "flavor":  desc,
            "science": f"优化变量 {k}（-{step_raw:.2g} {unit}/回合）",
            "effects": effects_down,
        })

    return cards[:16]


# ──────────────────────────────────────────────────────────────────────────────
# System cards (功能牌) — affect game mechanics, not sim variables
# ──────────────────────────────────────────────────────────────────────────────

# Master library of all available system cards
_SYSTEM_CARD_LIBRARY: dict[str, dict] = {
    "sys_extra_ap": {
        "id": "sys_extra_ap",
        "name": "紧急集中",
        "type": "system",
        "category": "resource_burst",
        "cost": 0,
        "emoji": "⚡",
        "flavor": "有时候，专注本身就是一种力量。",
        "system_effect": {"type": "extra_ap", "value": 1},
        "effects": [],
        "channel": "system",
        "tags": ["system", "resource", "burst"],
    },
    "sys_extra_draw": {
        "id": "sys_extra_draw",
        "name": "快速回顾",
        "type": "system",
        "category": "resource_burst",
        "cost": 0,
        "emoji": "🃏",
        "flavor": "翻阅记忆，找到那张差点遗忘的牌。",
        "system_effect": {"type": "extra_draw", "value": 1},
        "effects": [],
        "channel": "system",
        "tags": ["system", "resource", "draw"],
    },
    "sys_routine": {
        "id": "sys_routine",
        "name": "建立规律",
        "type": "system",
        "category": "resource_investment",
        "cost": 2,
        "emoji": "📅",
        "flavor": "系统化的节律，比偶然的爆发更持久。",
        "system_effect": {"type": "extra_ap", "value": 1},
        "duration": 3,
        "effects": [],
        "channel": "system",
        "tags": ["system", "resource", "duration"],
    },
    "sys_amplify": {
        "id": "sys_amplify",
        "name": "全力以赴",
        "type": "system",
        "category": "effect_amplify",
        "cost": 2,
        "emoji": "🔥",
        "flavor": "在关键时刻，超越自己的极限。",
        "system_effect": {"type": "amplify", "multiplier": 1.5},
        "effects": [],
        "channel": "system",
        "tags": ["system", "effect", "amplify"],
    },
    "sys_shield": {
        "id": "sys_shield",
        "name": "保护屏障",
        "type": "system",
        "category": "effect_shield",
        "cost": 2,
        "emoji": "🛡️",
        "flavor": "有时候，最好的进攻是无懈可击的防守。",
        "system_effect": {"type": "shield_negative"},
        "effects": [],
        "channel": "system",
        "tags": ["system", "effect", "shield"],
    },
    "sys_avoid": {
        "id": "sys_avoid",
        "name": "暂时回避",
        "type": "system",
        "category": "effect_avoid",
        "cost": 1,
        "emoji": "🌫️",
        "flavor": "不是逃避，而是积蓄力量，等待时机。",
        "system_effect": {"type": "freeze_turn"},
        "effects": [],
        "channel": "system",
        "tags": ["system", "effect", "avoid"],
    },
}


def _select_system_cards(
    ap: int,
    turns: int,
    hand_size: int,
    neg_env_count: int,
    n_vars: int,
    config: dict,
) -> list[dict]:
    """
    Auto-select system cards and their copy counts based on scenario parameters.
    config: {card_id: {"enabled": bool, "copies": int}} — UI overrides.
    Returns list of card dicts (with "_copies" key for deck injection).
    """
    # Default auto-selection rules
    auto: dict[str, int] = {}  # card_id → copies
    auto["sys_extra_ap"]   = 3 if ap <= 2 else 2
    auto["sys_extra_draw"] = 2 if (turns >= 12 or hand_size <= 4) else 1
    auto["sys_routine"]    = 1 if turns >= 10 else 0
    auto["sys_amplify"]    = (2 if n_vars >= 4 else 1) if n_vars >= 3 else 0
    auto["sys_shield"]     = 1 if neg_env_count >= 3 else 0
    auto["sys_avoid"]      = 1

    # Apply UI overrides
    for card_id, cfg in config.items():
        if not cfg.get("enabled", True):
            auto[card_id] = 0
        elif "copies" in cfg:
            auto[card_id] = int(cfg["copies"])

    cards = []
    for card_id, copies in auto.items():
        if copies <= 0:
            continue
        base = _SYSTEM_CARD_LIBRARY.get(card_id)
        if base:
            card = dict(base)
            card["_copies"] = copies
            cards.append(card)
    return cards




def _input_card_type(key: str) -> str:
    MAP = {
        "training": "tactical", "load": "tactical",
        "dose": "medical", "protein": "medical", "diet": "medical",
        "purine": "medical", "weight": "medical",
    }
    for kw, t in MAP.items():
        if kw in key.lower():
            return t
    return "medical"


# ──────────────────────────────────────────────────────────────────────────────
# Win / lose conditions
# ──────────────────────────────────────────────────────────────────────────────

def _build_conditions(
    game_var_keys: list[str],
    game_vars: dict,
    optimizer: dict | None = None,
) -> tuple[list[dict], list[dict]]:
    """
    Derive win/lose conditions from optimizer objectives (maximize/minimize)
    and optimizer constraints. Falls back to variable semantics (higher_is_better)
    when no optimizer info is available.
    """
    lose: list[dict] = []
    win:  list[dict] = []

    # ── Build direction map from optimizer objectives ─────────────────────────
    # direction: 'maximize' → higher is better (low = lose); 'minimize' → lower is better (high = lose)
    direction: dict[str, str] = {}
    if optimizer:
        for obj in optimizer.get("objectives", []):
            vname = obj.get("variable", "")
            if vname in game_var_keys:
                direction[vname] = obj.get("direction", "maximize")

    # ── Derive conditions for optimizer target variables first ─────────────────
    handled: set[str] = set()
    for k in game_var_keys:
        gv    = game_vars.get(k, {})
        label = gv.get("label", k)
        # Determine direction: optimizer > variable higher_is_better flag > default maximize
        if k in direction:
            maximize = direction[k] == "maximize"
        else:
            maximize = gv.get("higher_is_better", True)

        # Use optimizer constraints for thresholds if available
        lose_threshold = win_threshold = None
        if optimizer:
            for c in optimizer.get("constraints", []):
                expr = c.get("expression", "")
                # e.g. "health >= 30" → lose if health < 30
                m = re.match(rf"\b{re.escape(k)}\b\s*(>=|<=|>|<)\s*([\d\.]+)", expr)
                if m:
                    op, val = m.group(1), float(m.group(2))
                    if op in (">=", ">") and maximize:
                        lose_threshold = float(val)
                    elif op in ("<=", "<") and not maximize:
                        lose_threshold = float(val)

        if maximize:
            lt = lose_threshold if lose_threshold is not None else 10.0
            wt = 80.0
            lose.append({"condition": f"{k} <= {int(lt)}", "message": f"{label}过低，无法继续。"})
            win.append( {"condition": f"{k} >= {int(wt)}", "message": f"{label}达到目标水平，优化成功。"})
        else:
            lt = lose_threshold if lose_threshold is not None else 88.0
            wt = 20.0
            lose.append({"condition": f"{k} >= {int(lt)}", "message": f"{label}过高，出现严重并发症。"})
            win.append( {"condition": f"{k} <= {int(wt)}", "message": f"{label}控制达标，临床目标实现。"})
        handled.add(k)

    # ── Fallback if no conditions derived ────────────────────────────────────
    if not lose:
        first = game_var_keys[0] if game_var_keys else None
        lose = [{"condition": f"{first} <= 5" if first else "false",
                 "message": "状态恶化至无法恢复的程度。"}]
    if not win:
        # Pick the primary optimizer maximize target, else first var
        primary = next(
            (k for k in game_var_keys if direction.get(k) == "maximize"),
            game_var_keys[0] if game_var_keys else None,
        )
        win = [{"condition": f"{primary} >= 80" if primary else "true",
                "message": "目标达成，优化成功。"}]

    return lose, win


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _estimate_turn_length(total_time: float) -> int:
    if total_time <= 30:  return 2
    if total_time <= 90:  return 7
    if total_time <= 365: return 14
    return 30


def _estimate_difficulty(env_cards: list[dict]) -> str:
    neg = sum(1 for c in env_cards for e in c.get("effects", [])
              if e.get("delta", 0) < 0)
    if neg >= 6: return "hard"
    if neg >= 3: return "medium"
    return "easy"


def _translate_condition(
    cond_str: str, game_vars: dict, state_vars: dict
) -> str | None:
    """Return cond_str if it references a known game variable; else None."""
    if not cond_str or cond_str.lower() in ("true", "false"):
        return None
    for k in game_vars:
        if k in cond_str:
            return cond_str
    # Same-key fallback (state var IS a game var)
    for k in state_vars:
        if k in cond_str and k in game_vars:
            return cond_str
    return None


_FORMULA_NAMES: dict[str, str] = {
    "fitness_dynamics":  "适应积累", "fatigue_dynamics": "疲劳积累",
    "performance_calc":  "表现计算", "gfr_decline":      "GFR下降",
    "bun_calc":          "BUN积累",  "muscle_dynamics":  "肌肉变化",
    "bp_dynamics":       "血压动力学", "ua_dynamics":     "尿酸动力学",
    "weight_dynamics":   "体重变化", "goal_score_calc":  "目标评分",
}

_FORMULA_EMOJIS: dict[str, str] = {
    "fitness_dynamics": "💪", "fatigue_dynamics": "😴",
    "performance_calc": "🏆", "gfr_decline":      "🔻",
    "bun_calc":         "☣️",  "muscle_dynamics":  "🦾",
    "bp_dynamics":      "💊", "ua_dynamics":      "🔬",
    "weight_dynamics":  "⚖️", "goal_score_calc":  "📊",
}

_TYPE_EMOJIS: dict[str, str] = {
    "Type1": "⚡", "Type2": "📉", "Type3": "📈",
    "Type4": "⚠️", "Type5": "🎲", "Type6": "🔄",
    "D1": "🌀", "D2": "🔗", "D3": "〰️",
}


def _formula_display_name(fname: str) -> str:
    return _FORMULA_NAMES.get(fname, fname.replace("_", " ").title())


def _formula_emoji(fname: str, ftype: str) -> str:
    return _FORMULA_EMOJIS.get(fname, _TYPE_EMOJIS.get(ftype, "📌"))


def _slug(name: str) -> str:
    s = re.sub(r"[^\w\s\-]", "", name.lower())
    s = re.sub(r"[\s_\-]+", "_", s)
    return s[:40] or "converted"


# ──────────────────────────────────────────────────────────────────────────────
# New-format multi-file serialization
# ──────────────────────────────────────────────────────────────────────────────

def _save_new_format(story: dict, out_dir: Path, source_path: str, source_meta: dict) -> list[str]:
    """
    Write the converted story as a folder-based new format:
      out_dir/
        game_story.yaml
        _mapping.json
        cards/
          player_<id>.yaml
          env_<id>.yaml
    Returns list of relative file paths written.
    """
    import json
    from datetime import date

    cards_dir = out_dir / "cards"
    cards_dir.mkdir(exist_ok=True)
    files: list[str] = []

    # ── Write card files ──────────────────────────────────────────────────────
    env_deck: list[dict] = []
    player_deck: list[dict] = []
    mapping_vars: dict[str, str] = {}

    for card in story.get("environment_cards", []):
        card_data = _to_new_card(card, "env")
        fname = f"env_{card['id']}.yaml"
        _write_yaml(cards_dir / fname, card_data)
        files.append(f"cards/{fname}")
        weight = _card_weight(card)
        env_deck.append({"path": f"cards/{fname}", "weight": weight})
        mapping_vars[card["id"]] = f"cards/{fname}"

    # Compute content card copy count: P = clamp(H×T×0.65, 10, 28)
    # content cards take ~65% of P; split evenly across n_content cards, max 3
    all_player = story.get("player_cards", [])
    n_content = sum(1 for c in all_player if c.get("type") != "system")
    game_cfg   = story.get("game", {})
    _H = game_cfg.get("hand_size", 5)
    _T = game_cfg.get("max_turns", 12)
    _P = max(10, min(28, int(_H * _T * 0.65)))
    content_copies = min(3, max(1, -(-int(_P * 0.65) // max(n_content, 1))))  # ceiling div

    for card in all_player:
        is_system = card.get("type") == "system"
        copies = card.pop("_copies", 1) if is_system else content_copies
        card_data = card if is_system else _to_new_card(card, "player")
        fname = f"{card['id']}.yaml" if is_system else f"player_{card['id']}.yaml"
        _write_yaml(cards_dir / fname, card_data)
        files.append(f"cards/{fname}")
        deck_entry: dict = {"path": f"cards/{fname}"}
        if copies > 1:
            deck_entry["copies"] = copies
        player_deck.append(deck_entry)
        mapping_vars[card["id"]] = f"cards/{fname}"

    # ── Build initial_state from variables ────────────────────────────────────
    initial_state: dict[str, float] = {}
    health_var = None
    for k, v in story.get("variables", {}).items():
        initial_state[k] = v.get("value", 0)
        if k == "health" or (health_var is None and k not in ("money", "status")):
            health_var = k

    # ── Win / lose → condition + endings ─────────────────────────────────────
    lose_conds = story.get("lose_conditions", [])
    win_conds  = story.get("win_conditions",  [])

    lose_condition = {
        "type": "custom",
        "description": lose_conds[0]["message"] if lose_conds else "状态恶化至无法恢复。",
    }
    win_condition = {
        "type": "custom",
        "description": win_conds[0]["message"] if win_conds else "目标达成。",
    }

    endings = []
    for wc in win_conds:
        endings.append({
            "grade": "A",
            "condition": wc["condition"],
            "title": "目标达成",
            "description": wc["message"],
        })
    for lc in lose_conds:
        endings.append({
            "grade": "D",
            "condition": lc["condition"],
            "title": "失败",
            "description": lc["message"],
        })

    # ── Assemble game_story.yaml ──────────────────────────────────────────────
    game = story.get("game", {})
    game_story = {
        "meta": {
            "name":            story["meta"].get("name", ""),
            "description":     story["meta"].get("description", ""),
            "difficulty":      story["meta"].get("difficulty", "medium"),
            "tags":            story["meta"].get("tags", []),
            "author":          "Universal Dynamics Converter",
            "version":         "0.1",
            "source_scenario": source_meta.get("name", ""),
            "base_language":   "en",
            "languages":       ["en"],
        },
        "initial_state": initial_state,
        "health_mapping": {
            "source_variable": health_var or "health",
            "scale": [0, 100, 0, 100],
            "display": "生命值",
        },
        "turns": {
            "total":             game.get("max_turns", 15),
            "time_per_turn":     "1 month",
            "env_cards_per_turn": 2,
            "player_hand_size":  game.get("hand_size", 5),
            "action_points":     game.get("ap_per_turn", 3),
        },
        "win_condition":  win_condition,
        "lose_condition": lose_condition,
        "endings":        endings,
        "env_deck":    env_deck,
        "player_deck": player_deck,
        "generic_cards": {"inject": ["rest", "interrupt"]},
    }

    main_file = out_dir / "game_story.yaml"
    _write_yaml(main_file, game_story)
    files.insert(0, "game_story.yaml")

    # ── Write i18n/zh-CN.yaml template ───────────────────────────────────────
    i18n_dir = out_dir / "i18n"
    i18n_dir.mkdir(exist_ok=True)
    i18n_template: dict = {
        "meta": {
            "name": game_story["meta"]["name"],
            "description": game_story["meta"]["description"],
        },
        "variable_display": {
            k: {"label": k} for k in (story.get("variables") or {})
        },
        "win_conditions": [{"message": e["description"]} for e in game_story.get("endings", []) if e.get("grade") not in ("D", "F")],
        "lose_conditions": [{"message": e["description"]} for e in game_story.get("endings", []) if e.get("grade") in ("D", "F")],
        "cards": {
            card["id"]: {
                "name": card.get("display", {}).get("name", card.get("name", card["id"])),
                "description": card.get("display", {}).get("description", card.get("description", "")),
                **({"flavor": card.get("display", {}).get("flavor", "")} if card.get("type") == "player" or card.get("category") not in ("env",) else {}),
            }
            for card in list(story.get("environment_cards", [])) + list(story.get("player_cards", []))
            if card.get("id")
        },
    }
    i18n_file = i18n_dir / "zh-CN.yaml.template"
    _write_yaml(i18n_file, i18n_template)
    files.append("i18n/zh-CN.yaml.template")

    # ── Write _mapping.json ───────────────────────────────────────────────────
    mapping = {
        "version": "1.0",
        "source_path": source_path,
        "generated_at": str(date.today()),
        "variable_to_card": mapping_vars,
    }
    mapping_file = out_dir / "_mapping.json"
    with open(mapping_file, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)
    files.append("_mapping.json")

    return files


def _to_new_card(card: dict, card_type: str) -> dict:
    """Convert internal card dict → new-format card YAML structure."""
    effects = [
        {"target": e["variable"], "delta": e["delta"], "condition": None}
        for e in card.get("effects", [])
    ]
    data: dict = {
        "id":   card["id"],
        "type": card_type,
        "category": _card_category(card, card_type),
        "display": {
            "name":        card.get("name", card["id"]),
            "description": card.get("description", ""),
            "flavor":      card.get("science", card.get("flavor", "")),
            "icon":        card.get("emoji", "🃏"),
        },
        "effects": effects,
        "channel": card.get("type", "medical"),
        "tags":    _card_tags(card, card_type),
        "weight":  _card_weight(card),
        "source": {
            "formula": card.get("science", ""),
            "pattern_detected": _ftype_to_pattern(card),
        },
        "references": card.get("references", []),
    }
    if card_type == "player":
        data["cost"] = card.get("cost", 1)
    if card.get("always_active"):
        data["always_active"] = True
    if card.get("condition"):
        data["condition"] = card["condition"]
    if card.get("probability") is not None:
        data["probability"] = card["probability"]
    return data


def _card_category(card: dict, card_type: str) -> str:
    t = card.get("type", "")
    if t in ("medical", "tactical"):
        return "health" if card_type == "env" else "action"
    return "state" if card_type == "env" else "action"


def _card_tags(card: dict, card_type: str) -> list[str]:
    tags = [card_type]
    t = card.get("type", "")
    if t:
        tags.append(t)
    science = card.get("science", "")
    if "Type1" in science or "always" in str(card.get("always_active", "")):
        tags.append("chronic")
    if "Type4" in science or card.get("condition"):
        tags.append("conditional")
    if "Type5" in science or card.get("probability") is not None:
        tags.append("random")
    return tags


def _card_weight(card: dict) -> int:
    # Heavier weight for passive/always-active cards
    if card.get("always_active"):
        return 200
    if card.get("probability", 1.0) < 0.4:
        return 80
    return 120


def _ftype_to_pattern(card: dict) -> str:
    science = card.get("science", "")
    for ptype in ("Type1", "Type2", "Type3", "Type4", "Type5", "Type6", "D1", "D2", "D3"):
        if ptype in science:
            return ptype
    return "P1"


def _write_yaml(path: Path, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
