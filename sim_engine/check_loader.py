import sys
import os
from pathlib import Path

# Add sim_engine to path
sys.path.append(str(Path("c:/green/code_matter/sim_engine").resolve()))

from src.loader_engine import LoaderEngine

def check_loader():
    try:
        loader = LoaderEngine(mods_directory="c:/green/code_matter/mods")
        model = loader.fetch("scenarios/test_schedule")
        if not model:
            print("Model not found")
            return
        
        print(f"Schedules in model: {list(model.schedules.keys())}")
        for var, sched in model.schedules.items():
            print(f"Schedule for {var}: {sched.interpolation}, points: {len(sched.points)}")
            for pt in sched.points:
                print(f"  t={pt.time}, v={pt.value}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_loader()
