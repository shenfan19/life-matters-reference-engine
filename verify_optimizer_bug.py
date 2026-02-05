import sys
import os
import logging

# 将 engine/src 添加到 path
sys.path.append(os.path.abspath(os.path.join(os.getcwd(), 'engine', 'src')))

from loader_engine import LoaderEngine

def verify():
    engine = LoaderEngine(mods_directory="mods")
    model_name = "models/_test/test_optimizer_bug"
    try:
        engine.fetch(model_name, validate=True)
    except Exception as e:
        print(f"Caught exception: {type(e).__name__}: {e}")

if __name__ == "__main__":
    verify()
