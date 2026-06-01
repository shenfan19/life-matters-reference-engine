# PyInstaller spec for lm-sim CLI
# Build from project root:
#   pyinstaller sim_cli/build.spec
#
# The produced exe expects models/ in the same directory as the exe.
# Distribute: lm-sim.exe + models/ folder together.

import sys
from pathlib import Path

ROOT = Path(SPECPATH).parent          # b_lm_sim_code/
SRC  = str(ROOT / 'sim_engine' / 'src')
ENG  = str(ROOT / 'sim_engine')

block_cipher = None

a = Analysis(
    [str(ROOT / 'sim_cli' / 'main.py')],
    pathex=[SRC, ENG, str(ROOT), str(ROOT / 'sim_cli')],
    binaries=[],
    datas=[],          # models/ kept external alongside exe
    hiddenimports=[
        'simulator_engine',
        'optimizer_engine',
        'loader_engine',
        'app_state',
        'session_manager',
        'regimen_runner',
        'mc_utils',
        'model_structure',
        'model_structure.base',
        'model_structure.core',
        'model_structure.loader',
        'model_structure.simulation',
        'model_structure.validator',
        'pymoo',
        'pymoo.algorithms.moo.nsga2',
        'pymoo.core.problem',
        'pymoo.optimize',
        'pymoo.termination',
        'pymoo.core.callback',
        'scipy',
        'numpy',
        'yaml',
        'asteval',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'IPython'],
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    name='lm-sim',
    debug=False,
    strip=False,
    upx=False,
    console=True,       # keep console open; CLI is text-based
    icon=None,
)
