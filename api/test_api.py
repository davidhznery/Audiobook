import requests
try:
    res = requests.post("http://127.0.0.1:8000/api/generate-karaoke", data={"text": "Hello"})
    print("STATUS:", res.status_code)
    print("RESPONSE:", res.text[:200])
except Exception as e:
    print("ERROR:", e)
