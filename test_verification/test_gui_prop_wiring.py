"""Finds props that a React component declares and its parent passes, but that the component never uses.

This is the kind of defect that hides a feature without any error: when the model tree was split into
its own component, the handler of the cross on a session row was still passed down but the component
no longer drew the cross, so a model imported into the session could not be removed. The type checker
accepts it, because a declared prop that nobody reads is not an error, and the build error about an
unused variable that followed was silenced by deleting the name.

gui/scripts/find-unused-props.mjs reads the components with the TypeScript compiler and lists every prop
that is not used. A prop that is meant to be unused goes into ALLOWED with the reason, so that an unused
prop is always a decision.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
GUI = ROOT / 'gui'

pytestmark = pytest.mark.skipif(
    shutil.which('node') is None or not (GUI / 'node_modules' / 'typescript').exists(),
    reason='node or the GUI dependencies are not installed')

LEFT_OVER = 'left over, confirm in the review'

# file name -> {prop: reason}. Add a line only when a prop is unused on purpose.
ALLOWED = {
    # Loader.tsx is not mounted anywhere since the app became a single Simulator page.
    'Loader.tsx': {name: 'component is not mounted' for name in ('subPage', 'confirmedModel', 'checkedStoryKeys', 'setCheckedStoryKeys', 'onPlayStory')},
    # Left over from the rename and the build fix of 2026-08-23, where the names were dropped from the destructuring
    # to silence the unused-variable error. Nothing visible is known to be missing. Each of them is to be confirmed, then
    # the prop removed or its control drawn.
    'OptControlBar.tsx': {'scsMode': LEFT_OVER},
    'SimModelTree.tsx': {'loadFileContent': LEFT_OVER, 'handleTreeNodeClick': LEFT_OVER, 'runningModelTitle': LEFT_OVER},
    'SimOptTab.tsx': {'constraints': LEFT_OVER, 'hasExistingResults': LEFT_OVER},
    'SimSetupTab.tsx': {'SECTION_H': LEFT_OVER},
}


def unused_props():
    out = subprocess.run(['node', 'scripts/find-unused-props.mjs'], cwd=GUI, capture_output=True, text=True, check=True).stdout
    return [(Path(e.partition(': ')[0]).name, e.partition(': ')[2].split('.', 1)[1], e) for e in json.loads(out)]


def test_every_declared_prop_is_used_by_its_component():
    problems = [entry for file, prop, entry in unused_props() if prop not in ALLOWED.get(file, {})]
    message = 'props declared and never used, so a control or a feature may be missing:\n  ' + '\n  '.join(problems)
    assert not problems, message


def test_allowed_props_are_still_unused():
    """An entry of ALLOWED that is no longer needed is removed, so the list cannot grow stale."""
    current = {(file, prop) for file, prop, _ in unused_props()}
    stale = [f'{file}: {prop}' for file, props in ALLOWED.items() for prop in props if (file, prop) not in current]
    message = 'listed in ALLOWED but used now:\n  ' + '\n  '.join(stale)
    assert not stale, message
