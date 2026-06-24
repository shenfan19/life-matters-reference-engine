"""扫描 cli/、ref_engine/ 下是否有业务参数被硬编码成字面量常量。

背景：MC seed 等业务参数曾被直接写成字面量（如 seed=42）而不是读取 yaml/session 配置，
导致 CLI 和 GUI 跑出不一致的结果（见 ADR 0113）。本脚本把这类字段名维护成一份黑名单，
凡是 `<字段名>=<数字>` 或 `<字段名> = <数字>` 的赋值/调用形式都会被拦截。

行内加 `# allow-const` 注释可放行确实需要字面量的特例（如测试 fixture）。

用法：
    python scripts/check_hardcoded_constants.py            # 扫描默认目录
    python scripts/check_hardcoded_constants.py a.py b.py  # 只扫描给定文件（pre-commit 用）
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 已知因"业务参数被硬编码"而出过 bug 或存在该风险的字段名，按需追加。
BUSINESS_CONST_FIELDS = [
    'seed',
    'n_runs',
    'sim_runs',
    'mc_runs',
    'pop_size',
    'n_gen',
]

FIELD_PATTERN = re.compile(
    r'\b(' + '|'.join(BUSINESS_CONST_FIELDS) + r')\s*=\s*-?\d+(\.\d+)?\b'
)

DEFAULT_SCAN_DIRS = ['cli', 'ref_engine']
EXCLUDE_DIR_PARTS = {'tests', '__pycache__', 'test', 'node_modules'}
SUPPRESS_COMMENT = '# allow-const'


def iter_default_files():
    for dirname in DEFAULT_SCAN_DIRS:
        base = ROOT / dirname
        if not base.exists():
            continue
        for path in base.rglob('*.py'):
            if EXCLUDE_DIR_PARTS & set(path.relative_to(ROOT).parts):
                continue
            yield path


def check_file(path: Path):
    violations = []
    try:
        lines = path.read_text(encoding='utf-8').splitlines()
    except (UnicodeDecodeError, OSError):
        return violations
    for lineno, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith('#') or SUPPRESS_COMMENT in line:
            continue
        match = FIELD_PATTERN.search(line)
        if match:
            violations.append((lineno, match.group(0), line.strip()))
    return violations


def main(argv):
    if argv:
        files = [Path(arg) for arg in argv if arg.endswith('.py')]
    else:
        files = list(iter_default_files())

    found = False
    for path in files:
        for lineno, snippet, full_line in check_file(path):
            found = True
            rel = path.relative_to(ROOT) if path.is_absolute() else path
            print(f'{rel}:{lineno}: 疑似硬编码业务参数 `{snippet}` —— {full_line}')

    if found:
        print(
            '\n以上字段应从 yaml/config/session 读取，不应直接写字面量常量。'
            f'确认必须用字面量时，在该行加 `{SUPPRESS_COMMENT}` 放行。'
        )
        return 1

    print('check_hardcoded_constants: OK，未发现硬编码业务参数。')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
