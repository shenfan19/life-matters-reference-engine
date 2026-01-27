import requests
import json
import time

BASE_URL = "http://localhost:8000/api"

def test_simulation():
    print("Testing Simulation...")
    
    # 1. Start simulation
    start_payload = {
        "model_name": "obesity_diabetes",
        "folder": "physiology",
        "time_hours": 10,
        "step_size": 3600
    }
    
    response = requests.post(f"{BASE_URL}/simulation/start", json=start_payload)
    if response.status_code != 200:
        print(f"FAILED: /simulation/start - {response.text}")
        return
    
    data = response.json()
    session_id = data['data']['session_id']
    print(f"SUCCESS: Started session {session_id}")
    
    # 2. Batch steps
    step_payload = {
        "session_id": session_id,
        "steps": 5
    }
    response = requests.post(f"{BASE_URL}/simulation/batch", json=step_payload)
    if response.status_code != 200:
        print(f"FAILED: /simulation/batch - {response.text}")
        return
    
    data = response.json()
    print(f"SUCCESS: Executed {data['data']['steps_executed']} steps. Progress: {data['data']['progress']}%")
    
    # 3. Pause
    requests.post(f"{BASE_URL}/simulation/pause", json={"session_id": session_id})
    print("SUCCESS: Paused simulation")
    
    # 4. Resume
    requests.post(f"{BASE_URL}/simulation/resume", json={"session_id": session_id})
    print("SUCCESS: Resumed simulation")
    
    # 5. Export
    response = requests.post(f"{BASE_URL}/simulation/export", json={"session_id": session_id})
    if response.status_code == 200:
        print(f"SUCCESS: Exported CSV to {response.json()['csv_path']}")
        
def test_optimization():
    print("\nTesting Optimization...")
    
    opt_payload = {
        "model_names": ["obesity_diabetes"],
        "folder": "physiology",
        "mode": "full_params",
        "method": "grid",
        "time_hours": 24
    }
    
    response = requests.post(f"{BASE_URL}/optimizer/run", json=opt_payload)
    if response.status_code != 200:
        print(f"FAILED: /optimizer/run - {response.text}")
        return
    
    data = response.json()
    print(f"SUCCESS: Optimization completed. Best value: {data['value']}")

if __name__ == "__main__":
    try:
        test_simulation()
        test_optimization()
    except Exception as e:
        print(f"Error: {e}")
        print("Make sure the backend is running at http://localhost:8000")
