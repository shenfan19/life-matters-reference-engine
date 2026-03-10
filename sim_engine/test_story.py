import urllib.request
import urllib.error
import json

try:
    req = urllib.request.Request('http://localhost:8001/api/story/marie_curie')
    with urllib.request.urlopen(req) as response:
        print(response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print(e.read().decode('utf-8'))
except Exception as e:
    print(f"Error: {e}")
