"""Provider-neutral extension point for a hosted/local LLM.
The portfolio demo does not require any API key.
"""
import os, json, urllib.request

def call_provider(prompt: str):
    url = os.getenv("LLM_PROVIDER_URL")
    if not url: return None
    req = urllib.request.Request(url, data=json.dumps({"prompt":prompt}).encode(), headers={"content-type":"application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=20).read())
