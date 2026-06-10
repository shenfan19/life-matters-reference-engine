#!/usr/bin/env bash
# Life Matters — batch model tester
# Loops through all YAML files in --folder, runs sim and (optionally) opt,
# and saves a timestamped batch directory with CSVs, logs, and batch_report.md.
#
# Run from anywhere — the script always cd's to the project root (b_lm_sim_code/).
#
# Options (all optional):
#
#   --folder PATH        Folder to scan for *.yaml models (absolute or relative path).
#                         Default: ../b_lm_model/models/references
#                         Examples:
#                           --folder ../b_lm_model/models/papers
#                           --folder ../b_lm_model/models/references/medical
#
#   --output-dir PATH    Where timestamped batch results are saved.
#                         Default: ../b_lm_model/output
#
#   --no-opt             Skip the optimizer step (only run --sim).
#
#   --no-skip            Test all *.yaml files in --folder.
#                         Default: only files with _nosim or _noopt suffix
#                         (repair-queue mode — skips already-passing models).
#
#   --all-plans          Pass --all-plans to `lm-sim --sim` (one CSV per
#                         simulation.plans entry).
#
# Examples:
#   bash script/test_batch.sh
#   bash script/test_batch.sh --no-opt
#   bash script/test_batch.sh --folder ../b_lm_model/models/papers --no-skip --all-plans
#   bash script/test_batch.sh --no-skip --no-opt
#   bash script/test_batch.sh --output-dir /tmp/lm_out

set -euo pipefail

# ── Parameters ───────────────────────────────────────────────────────────────
MODEL_FOLDER="../b_lm_model/models/references"
OUTPUT_DIR="../b_lm_model/output"
RUN_OPT=true
FILTER_BROKEN=true
ALL_PLANS=false
CLI="sim_cli/main.py"
CLI_OUT_DIR="output"   # hardcoded in sim_cli/output.py — do not change
# ─────────────────────────────────────────────────────────────────────────────

usage() {
  sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --folder)      MODEL_FOLDER="$2"; shift 2 ;;
    --output-dir)  OUTPUT_DIR="$2"; shift 2 ;;
    --no-opt)      RUN_OPT=false; shift ;;
    --no-skip)     FILTER_BROKEN=false; shift ;;
    --all-plans)   ALL_PLANS=true; shift ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

cd "$(dirname "$0")/.."   # run from project root

BATCH_STAMP=$(date '+%Y-%m-%d_%H-%M-%S')
BATCH_DIR="$OUTPUT_DIR/$BATCH_STAMP"
REPORT="$BATCH_DIR/batch_report.md"
mkdir -p "$BATCH_DIR"

if [[ "$FILTER_BROKEN" == "true" ]]; then
  mapfile -t YAMLS < <(find "$MODEL_FOLDER" -name '*_nosim*.yaml' -o -name '*_noopt*.yaml' | sort)
else
  mapfile -t YAMLS < <(find "$MODEL_FOLDER" -name '*.yaml' | sort)
fi
TOTAL=${#YAMLS[@]}

echo "============================================================"
echo "  Life Matters 批量模型测试"
echo "  文件夹：$MODEL_FOLDER"
echo "  模型数：$TOTAL"
echo "  跑 Opt：$RUN_OPT"
echo "  All plans：$ALL_PLANS"
  [[ "$FILTER_BROKEN" == "true" ]] && echo "  过滤：仅 _nosim/_noopt"
echo "============================================================"
echo ""

# ── Report header ─────────────────────────────────────────────────────────────
{
  echo "# Batch Test Report"
  echo ""
  echo "- 时间：$BATCH_STAMP"
  echo "- 文件夹：\`$MODEL_FOLDER\`"
  echo "- 模型数：$TOTAL"
  echo ""
  echo "| # | 模型 | Sim | Opt | 错误摘要 |"
  echo "|---|------|-----|-----|---------|"
} > "$REPORT"

# ── Helpers ───────────────────────────────────────────────────────────────────
# CLI writes to $CLI_OUT_DIR/ (project root staging); we move files to $BATCH_DIR/.
# Accepts zero or more CSV filenames (a sim run with --all-plans produces one
# CSV per plan, sharing a single <stem>.log).
move_run_files() {
  local mode="$1"; shift
  local model_name="$1"; shift
  local csvs=("$@")
  local moved_log=false

  for csv in "${csvs[@]}"; do
    [[ -z "$csv" ]] && continue
    mv "$CLI_OUT_DIR/$csv" "$BATCH_DIR/" 2>/dev/null || true
    if ! $moved_log; then
      local stem="${csv%%__*}"
      [[ "$stem" == "$csv" ]] && stem="${csv%.csv}"
      mv "$CLI_OUT_DIR/${stem}.log" "$BATCH_DIR/" 2>/dev/null && moved_log=true || true
    fi
  done

  if ! $moved_log; then
    local log
    log=$(ls -t "$CLI_OUT_DIR/${model_name}_"*"_${mode}.log" 2>/dev/null | head -1 || true)
    [[ -n "$log" ]] && mv "$log" "$BATCH_DIR/" 2>/dev/null || true
  fi
}

# ── Main loop ─────────────────────────────────────────────────────────────────
PASS_COUNT=0
FAIL_COUNT=0
FAIL_ROWS=()

IDX=0
for YAML_PATH in "${YAMLS[@]}"; do
  IDX=$((IDX + 1))
  MODEL_NAME=$(basename "$YAML_PATH" .yaml)

  echo "[$IDX/$TOTAL] $YAML_PATH"

  # Initialise per-model state
  SIM_STATUS=""  SIM_ERR=""  SIM_CSVS=()
  OPT_STATUS="⏭ SKIP"  OPT_ERR=""  OPT_CSV=""

  # ── Sim ────────────────────────────────────────────────────────────────────
  SIM_EXIT=0
  if $ALL_PLANS; then
    SIM_OUT=$(python "$CLI" "$YAML_PATH" --sim --all-plans 2>&1) || SIM_EXIT=$?
    mapfile -t SIM_CSVS < <(echo "$SIM_OUT" | grep -oP '^\s*\K\S+\.csv' || true)
  else
    SIM_OUT=$(python "$CLI" "$YAML_PATH" --sim 2>&1) || SIM_EXIT=$?
    SIM_CSV=$(echo "$SIM_OUT" | grep -oP '(?<=→ )\S+\.csv' | head -1 || true)
    [[ -n "$SIM_CSV" ]] && SIM_CSVS=("$SIM_CSV")
  fi
  move_run_files "sim" "$MODEL_NAME" "${SIM_CSVS[@]}"

  if [[ $SIM_EXIT -eq 0 && ${#SIM_CSVS[@]} -gt 0 ]]; then
    SIM_STATUS="✓ PASS"
    PASS_COUNT=$((PASS_COUNT + 1))
    printf "    → sim      \033[0;32m✓\033[0m PASS → %s\n" "${SIM_CSVS[*]}"
  else
    SIM_STATUS="✗ FAIL"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    SIM_ERR=$(echo "$SIM_OUT" | grep -oP '(?<=错误: ).*' | head -1 || \
              echo "$SIM_OUT" | tail -2 | tr '\n' ' ' || true)
    printf "    → sim      \033[0;31m✗\033[0m FAIL — %s\n" "$SIM_ERR"
  fi

  # ── Opt ────────────────────────────────────────────────────────────────────
  if [[ "$RUN_OPT" == "true" ]]; then
    OPT_EXIT=0
    OPT_OUT=$(python "$CLI" "$YAML_PATH" --opt 2>&1) || OPT_EXIT=$?
    OPT_CSV=$(echo "$OPT_OUT" | grep -oP '(?<=→ )\S+\.csv' | head -1 || true)
    move_run_files "opt" "$MODEL_NAME" "$OPT_CSV"

    if [[ $OPT_EXIT -eq 0 && -n "$OPT_CSV" ]]; then
      OPT_STATUS="✓ PASS"
      printf "    → opt      \033[0;32m✓\033[0m PASS → %s\n" "$OPT_CSV"
    else
      OPT_STATUS="✗ FAIL"
      OPT_ERR=$(echo "$OPT_OUT" | grep -oP '(?<=错误: ).*' | head -1 || \
                echo "$OPT_OUT" | tail -2 | tr '\n' ' ' || true)
      printf "    → opt      \033[0;31m✗\033[0m FAIL — %s\n" "$OPT_ERR"
    fi
  fi

  # ── Report row ─────────────────────────────────────────────────────────────
  if [[ ${#SIM_CSVS[@]} -gt 0 ]]; then
    SIM_CELL="$SIM_STATUS"
    for csv in "${SIM_CSVS[@]}"; do
      SIM_CELL="$SIM_CELL<br>[$csv](./$csv)"
    done
  else
    SIM_CELL="$SIM_STATUS"
  fi

  OPT_CELL="$OPT_STATUS"
  [[ -n "$OPT_CSV" ]] && OPT_CELL="[$OPT_STATUS](./$OPT_CSV)"

  ERR_CELL="${SIM_ERR}${OPT_ERR:+ / $OPT_ERR}"

  echo "| $IDX | \`$MODEL_NAME\` | $SIM_CELL | $OPT_CELL | $ERR_CELL |" >> "$REPORT"

  if [[ "$SIM_STATUS" == "✗ FAIL" || "$OPT_STATUS" == "✗ FAIL" ]]; then
    FAIL_ROWS+=("$IDX. $MODEL_NAME  sim=$SIM_STATUS opt=$OPT_STATUS")
  fi

  echo ""
done

# ── Summary ────────────────────────────────────────────────────────────────
{
  echo ""
  echo "## 汇总"
  echo ""
  echo "- 通过：$PASS_COUNT / $TOTAL"
  echo "- 失败：$FAIL_COUNT / $TOTAL"
} >> "$REPORT"

echo "============================================================"
echo "  完成：$PASS_COUNT PASS，$FAIL_COUNT FAIL（共 $TOTAL 个模型）"
echo "  报告：$REPORT"
echo "============================================================"

if [[ ${#FAIL_ROWS[@]} -gt 0 ]]; then
  echo ""
  echo "  失败列表："
  for row in "${FAIL_ROWS[@]}"; do
    echo "    $row"
  done
fi
