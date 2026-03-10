import urllib.request
import urllib.error
import traceback
import sys

with open("test_out.txt", "w", encoding="utf-8") as f:
    def check_endpoint(url):
        f.write(f"\nChecking {url}...\n")
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req) as response:
                content = response.read().decode('utf-8')
                f.write(f"Success! Status: {response.status}\n")
                f.write(content[:200] + "...\n")
        except urllib.error.HTTPError as e:
            f.write(f"HTTP Error: {e.code}\n")
            f.write(e.read().decode('utf-8') + "\n")
        except Exception as e:
            f.write(f"Error: {e}\n")
            f.write(traceback.format_exc() + "\n")

    check_endpoint('http://localhost:8001/api/health')
    check_endpoint('http://localhost:8001/api/folders')
    check_endpoint('http://localhost:8001/api/files')
    check_endpoint('http://localhost:8001/api/story/marie_curie')
