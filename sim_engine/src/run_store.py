"""
run_store.py — 仿真/优化运行历史的磁盘持久化。

每条运行记录以 JSON 文件形式存储在 PROJECT_ROOT/runs/ 目录下，
文件名格式：run_YYYYMMDD_HHMMSS_<6位uuid>.json

对外接口：
  init(project_root)          初始化，必须在使用其他函数前调用
  save_run(data) -> run_id    保存一条运行（创建或覆写）
  list_runs() -> [meta, ...]  返回元数据列表（不含大数组），按时间倒序
  get_run(run_id) -> dict     返回完整记录
  delete_run(run_id) -> bool  删除记录文件
  patch_run(run_id, patch) -> bool  更新 label / status 等轻量字段

数据结构：
  run_id     str              "run_YYYYMMDD_HHMMSS_abc123"
  type       str              "sim" | "opt"
  model_name str              模型名（文件名去掉 .yaml）
  model_key  str              完整相对路径，如 "models/published/.../foo.yaml"
  created_at str              ISO 8601 UTC
  status     str              "completed" | "interrupted"
  label      str              用户自定义备注（初始为空）

  # sim 运行额外字段
  sim_config dict             start_date, end_date, step_value, step_unit,
                               sim_runs, session_seed, input_events
  sim_result dict             data: SimulationDataPoint[], data_per_run: [][],
                               output_vars: str[]
  sim_result_summary dict     n_points, n_runs, output_vars（用于列表显示）

  # opt 运行额外字段
  opt_config dict             input_events, objectives, constraints,
                               optimizer_override
  opt_result dict             完整 optResult（含 best_x, pareto_front 等）
  opt_result_summary dict     n_solutions, method, elapsed（用于列表显示）
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

_runs_dir: Path | None = None

# 列表中不包含的大字段（留在各自文件中按需 get_run 才读取）
_SUMMARY_ONLY_FIELDS = {'sim_result', 'opt_result'}


def init(project_root: Path) -> None:
    global _runs_dir
    _runs_dir = project_root / "runs"
    _runs_dir.mkdir(exist_ok=True)


def _check() -> Path:
    if _runs_dir is None:
        raise RuntimeError("run_store not initialized — call init() first")
    return _runs_dir


def _new_id() -> str:
    ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    return f"run_{ts}_{uuid.uuid4().hex[:6]}"


def save_run(data: dict) -> str:
    """保存一条运行记录，返回 run_id。若 data 中已有 id 则覆写同名文件。"""
    runs_dir = _check()
    run_id: str = data.get('id') or _new_id()
    data = {**data, 'id': run_id}
    if not data.get('created_at'):
        data['created_at'] = datetime.now(timezone.utc).isoformat()
    (runs_dir / f"{run_id}.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    return run_id


def _meta_only(data: dict) -> dict:
    """从完整记录中提取轻量元数据（去掉大数组字段）。"""
    return {k: v for k, v in data.items() if k not in _SUMMARY_ONLY_FIELDS}


def list_runs() -> list[dict]:
    """返回所有运行的元数据列表，按文件修改时间倒序（最新在前）。"""
    runs_dir = _check()
    out: list[dict] = []
    for f in sorted(
        runs_dir.glob("run_*.json"),
        key=lambda x: x.stat().st_mtime,
        reverse=True,
    ):
        try:
            data = json.loads(f.read_text(encoding='utf-8'))
            out.append(_meta_only(data))
        except Exception:
            pass
    return out


def get_run(run_id: str) -> dict | None:
    """返回完整运行记录（含大数组），找不到返回 None。"""
    runs_dir = _check()
    f = runs_dir / f"{run_id}.json"
    if not f.exists():
        return None
    return json.loads(f.read_text(encoding='utf-8'))


def delete_run(run_id: str) -> bool:
    """删除运行记录文件，成功返回 True。"""
    runs_dir = _check()
    f = runs_dir / f"{run_id}.json"
    if f.exists():
        f.unlink()
        return True
    return False


def patch_run(run_id: str, patch: dict) -> bool:
    """仅允许更新 label / status 等轻量字段，防止意外覆写大数组。"""
    ALLOWED = {'label', 'status'}
    runs_dir = _check()
    f = runs_dir / f"{run_id}.json"
    if not f.exists():
        return False
    data = json.loads(f.read_text(encoding='utf-8'))
    for key, val in patch.items():
        if key in ALLOWED:
            data[key] = val
    f.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    return True
