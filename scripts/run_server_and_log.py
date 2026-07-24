import subprocess
import time

with open("server_runner.log", "w") as log:
    proc = subprocess.Popen(["python", "reference_engine/src/api_server.py"],
                            stdout=log, stderr=log, text=True)
    time.sleep(5)
    if proc.poll() is not None:
        print(f"Process exited with code {proc.returncode}")
    else:
        print("Process still running")
