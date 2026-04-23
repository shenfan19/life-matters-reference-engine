import urllib.request
import urllib.error
import urllib.parse
import json
import traceback

with open("test_validate.txt", "w", encoding="utf-8") as f:
    try:
        url = 'http://localhost:8001/api/validate'
        data = json.dumps({"model_names": ["models/stories/marie_curie/story.yaml"]}).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req) as response:
            content = response.read().decode('utf-8')
            f.write(f"Success! Status: {response.status}\n")
            f.write(content)
    except urllib.error.HTTPError as e:
        f.write(f"HTTP Error: {e.code}\n")
        f.write(e.read().decode('utf-8') + "\n")
    except Exception as e:
        f.write(f"Error: {e}\n")
        f.write(traceback.format_exc() + "\n")
