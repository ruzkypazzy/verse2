"""VERSE2 audio-analysis sidecar. Node posts an audio file, gets analysis JSON.

Run: uvicorn server:app --host 127.0.0.1 --port 8077
"""
from __future__ import annotations

import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile

from analyzer import analyze

app = FastAPI(title="verse2-audio-sidecar")

MAX_BYTES = 60 * 1024 * 1024
ALLOWED_EXT = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac", ".opus"}


@app.get("/health")
def health():
    return {"ok": True, "service": "verse2-audio-sidecar"}


@app.post("/analyze")
async def analyze_endpoint(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(415, f"unsupported audio format {ext!r}")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "file too large (60MB max)")
    if len(data) < 1024:
        raise HTTPException(400, "file too small to be audio")
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        return analyze(path)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, f"analysis failed: {type(e).__name__}: {e}")
    finally:
        os.unlink(path)
