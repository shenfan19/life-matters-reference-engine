import time
import os

print("Heartbeat started")
path = "heartbeat.txt"
for i in range(60):
    with open(path, "w") as f:
        f.write(f"Heartbeat {i} at {time.ctime()}\n")
    time.sleep(1)
