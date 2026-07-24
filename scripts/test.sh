#!/usr/bin/env bash
# 跑 pytest 套件；配置文件挪进了 scripts/pytest.ini，不放根目录，所以用这个脚本代替直接敲 pytest。
# 支持透传参数，例如: scripts/test.sh -k schedule_runner  /  scripts/test.sh -v
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
pytest -c scripts/pytest.ini test_verification "$@"
