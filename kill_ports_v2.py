import os
import subprocess
import re

def kill_port(port):
    try:
        output = subprocess.check_output(f'netstat -ano | findstr :{port}', shell=True).decode()
        pids = set()
        for line in output.strip().split('\n'):
            match = re.search(r'\s+(\d+)$', line)
            if match:
                pids.add(match.group(1))
        
        for pid in pids:
            print(f"Killing PID {pid} on port {port}")
            subprocess.run(f'taskkill /F /PID {pid}', shell=True)
    except Exception as e:
        print(f"No process on port {port} or error: {e}")

if __name__ == "__main__":
    kill_port(8000)
    kill_port(5173)
    kill_port(5174)
