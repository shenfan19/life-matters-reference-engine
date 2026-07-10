"""启发式扫描 gui/src、reference_engine/src、cli/ 下"看起来零引用"的源文件。

背景：code_review_guide.md 第5节"已知缺口"记录死代码检测目前全靠按需手动 grep（对每个可疑
文件，全代码库搜索文件名，零命中即确认孤儿——2026-06-24 用这个方法查出 PluginLoader.tsx/
plugin_ui_server.py 两个孤儿文件，2026-07-10 已删除）。本脚本把这个手动方法的第一步（文件名
全库检索）自动化，产出一份"候选名单"，缩小人工复查范围，不是最终结论。

**这是一个初筛工具，不是判决**——静态文件名匹配无法识别：
  - 通过 importlib/目录扫描动态加载的模块（如 plugins/*/backend.py，PluginManager 按目录
    结构加载，不靠 import 语句引用文件名）
  - 只被字符串路径引用的资源（locale json 的 key、manifest.yaml 里的路径）
  - 框架自身的入口文件/约定文件名（已用 KNOWN_ENTRY_POINTS 排除一部分，但排除表不可能穷尽）
  - 文件改名/移动后另一处仍用旧名字符串匹配巧合"命中"，从而被漏报（假阴性）
报告出的每一条都需要人工用 Grep 工具再确认一遍引用路径，才能像 2026-06-24 那次一样下结论
（该次同样是"先脚本/grep 初筛，再人工判断产品范围"两步走，没有跳过人工判断这一步）。

用法：
    python scripts/find_dead_code.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SCAN_DIRS = ['gui/src', 'reference_engine/src', 'cli']
SCAN_EXTS = {'.py', '.ts', '.tsx'}
EXCLUDE_DIR_PARTS = {'node_modules', '__pycache__', '.git', 'dist', 'build'}

# 文件名本身就是框架/工具链约定入口，不靠仓库内 import 语句被引用，不构成"孤儿"信号。
KNOWN_ENTRY_POINTS = {
    '__init__', 'main', 'app', 'api_server', 'conftest', 'setupTests',
    'vite-env.d', 'index', 'App', 'index.test',
}


def iter_source_files():
    for dirname in SCAN_DIRS:
        base = ROOT / dirname
        if not base.exists():
            continue
        for path in base.rglob('*'):
            if path.suffix not in SCAN_EXTS or not path.is_file():
                continue
            if EXCLUDE_DIR_PARTS & set(path.relative_to(ROOT).parts):
                continue
            yield path


def build_haystack(all_files):
    """{file: full text} for every scanned source file, read once."""
    text = {}
    for path in all_files:
        try:
            text[path] = path.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            text[path] = ''
    return text


def main():
    all_files = list(iter_source_files())
    haystack = build_haystack(all_files)

    candidates = []
    for path in all_files:
        stem = path.stem
        if stem in KNOWN_ENTRY_POINTS or stem.endswith('.test') or stem.endswith('.d'):
            continue
        hits = sum(
            1 for other, text in haystack.items()
            if other != path and stem in text
        )
        if hits == 0:
            candidates.append(path.relative_to(ROOT))

    if not candidates:
        print('find_dead_code: 未发现候选孤儿文件（不代表零死代码，见脚本顶部说明的检测盲区）。')
        return 0

    print(f'find_dead_code: {len(candidates)} 个候选孤儿文件（文件名在仓库其余扫描范围内零命中）：\n')
    for rel in sorted(candidates):
        print(f'  {rel}')
    print(
        '\n以上是初筛结果，不是结论——每一条都需要人工用 Grep 工具确认真的零引用（含动态加载/'
        '字符串路径引用等本脚本无法识别的情况），再判断是否属于产品范围问题（如插件系统那次）'
        '还是可以直接删除的纯孤儿文件。'
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())
