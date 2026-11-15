"""Consent-gated setup helper. Used only by the explicit installer, not inference.

Reads a bounded JSON job on stdin. Public HF repositories, pinned revisions and
local SHA256 manifests; no health data or authentication tokens are needed.
"""
import hashlib
import io
import json
import os
import re
import sys
import wave
from pathlib import Path

STT_REPO = "Systran/faster-whisper-small"
TTS_REPO = "rhasspy/piper-voices"
TTS_VOICE = "tr_TR-dfki-medium"
TTS_FILE = f"tr/tr_TR/dfki/medium/{TTS_VOICE}.onnx"
STT_NAMES = {"config.json", "model.bin", "tokenizer.json", "vocabulary.txt", "vocabulary.json", "preprocessor_config.json", "README.md"}


def sha256(path):
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def manifest(directory, names, repo=None, revision=None, voice=None):
    files = {name: sha256(directory / name) for name in sorted(names) if (directory / name).is_file()}
    return {"repo": repo, "revision": revision, "voice": voice, "files": files}


def check_files(directory, entry):
    if not isinstance(entry, dict) or not isinstance(entry.get("files"), dict):
        raise ValueError("Invalid voice model lock")
    for name, expected in entry["files"].items():
        relative = Path(name)
        if relative.is_absolute() or relative.drive or ".." in relative.parts or not re.fullmatch(r"[a-f0-9]{64}", str(expected)):
            raise ValueError("Invalid locked file/digest")
        path = directory / relative
        if path.exists() and sha256(path) != expected:
            raise ValueError("Existing voice weights changed; inspect them before --update-voice-lock")


def revision_for(repo, old, update, hub):
    if old and not update:
        revision = old.get("revision")
        if old.get("repo") != repo or not re.fullmatch(r"[a-f0-9]{40}", str(revision)):
            raise ValueError("Voice repository/revision does not match the lock")
        return revision
    revision = hub.model_info(repo_id=repo, token=False).sha
    if not re.fullmatch(r"[a-f0-9]{40}", str(revision)):
        raise ValueError("No immutable model revision returned")
    return revision


def prepare_assets(job, hub=None):
    stt = Path(job["sttPath"])
    tts = Path(job["ttsPath"])
    old = job.get("lock")
    update = job.get("updateLock") is True
    if old is not None and (not isinstance(old, dict) or old.get("schemaVersion") != 1):
        raise ValueError("Invalid voice lock schema")
    old_stt, old_tts = (old.get("stt"), old.get("tts")) if old else (None, None)
    tts_root = tts.parents[4] if job["managedTts"] else tts.parent
    if old and not update:
        check_files(stt, old_stt)
        check_files(tts_root, old_tts)
    stt_complete = all((stt / name).is_file() for name in ("model.bin", "config.json", "tokenizer.json"))
    tts_complete = tts.is_file() and Path(str(tts) + ".json").is_file()
    # Existing untracked weights must not be overwritten or falsely attributed
    # to the current upstream revision. Adopt them as local, checksum-only assets.
    adopt_stt = not update and ((old_stt is not None and old_stt.get("repo") is None) or (old is None and stt_complete))
    adopt_tts = not update and ((old_tts is not None and old_tts.get("repo") is None) or (old is None and tts_complete))
    if old is None and not update:
        if job["managedStt"] and not stt_complete and any((stt / name).exists() for name in STT_NAMES):
            raise ValueError("Partial untracked STT weights found; inspect before --update-voice-lock")
        if job["managedTts"] and not tts_complete and (tts.exists() or Path(str(tts) + ".json").exists()):
            raise ValueError("Partial untracked TTS weights found; inspect before --update-voice-lock")
    for directory, names in [(stt, STT_NAMES), (tts_root, [TTS_FILE, TTS_FILE + ".json"] if job["managedTts"] else [])]:
        if any((directory / name).is_symlink() for name in names):
            raise ValueError("Symlinked managed weights are not automatically modified")
    if (job["managedStt"] and not adopt_stt) or (job["managedTts"] and not adopt_tts):
        if hub is None:
            import huggingface_hub as hub
        os.environ["HF_HUB_OFFLINE"] = "0"
        os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
    if job["managedStt"] and not adopt_stt:
        revision = revision_for(STT_REPO, old_stt, update, hub)
        if old_stt and not update and all((stt / name).is_file() for name in old_stt["files"]):
            pass  # Valid cached weights need no network request.
        else:
            stt.mkdir(parents=True, exist_ok=True)
            hub.snapshot_download(repo_id=STT_REPO, revision=revision, allow_patterns=sorted(STT_NAMES), local_dir=str(stt), token=False)
        stt_manifest = manifest(stt, STT_NAMES, STT_REPO, revision)
    else:
        if not stt.is_dir():
            raise ValueError("Configured custom STT directory is missing; not overwritten")
        stt_manifest = manifest(stt, STT_NAMES)
    if not all((stt / name).is_file() for name in ("model.bin", "config.json", "tokenizer.json")):
        raise ValueError("Incomplete local STT model")
    if job["managedTts"] and not adopt_tts:
        names = [TTS_FILE, TTS_FILE + ".json", "tr/tr_TR/dfki/medium/MODEL_CARD"]
        revision = revision_for(TTS_REPO, old_tts, update, hub)
        if old_tts and not update and all((tts_root / name).is_file() for name in old_tts["files"]):
            pass
        else:
            tts_root.mkdir(parents=True, exist_ok=True)
            hub.snapshot_download(repo_id=TTS_REPO, revision=revision, allow_patterns=names, local_dir=str(tts_root), token=False)
        tts_manifest = manifest(tts_root, names, TTS_REPO, revision, TTS_VOICE)
    else:
        if not tts.is_file() or not Path(str(tts) + ".json").is_file():
            raise ValueError("Configured custom Piper voice is missing; not overwritten")
        names = [TTS_FILE, TTS_FILE + ".json"] if job["managedTts"] else [tts.name, tts.name + ".json"]
        tts_manifest = manifest(tts_root, names)
    if not tts.is_file() or not Path(str(tts) + ".json").is_file():
        raise ValueError("Incomplete local Piper voice")
    result = {"schemaVersion": 1, "stt": stt_manifest, "tts": tts_manifest}
    if old and not update and result != old:
        raise ValueError("Voice manifest changed; inspect before --update-voice-lock")
    return result


def smoke(job, runtime=None):
    # No patient/microphone data: synthesize a known phrase, then transcribe it.
    if job.get("lock"):
        stt = Path(job["sttPath"])
        tts = Path(job["ttsPath"])
        tts_root = tts.parents[4] if job["managedTts"] else tts.parent
        for root, entry in [(stt, job["lock"]["stt"]), (tts_root, job["lock"]["tts"])]:
            check_files(root, entry)
            if any(not (root / name).is_file() for name in entry["files"]):
                raise ValueError("Locked speech files disappeared before smoke test")
    if runtime is None:
        from server import load_runtime
        runtime = load_runtime({**job["aliases"], "STT_MODEL_DIR": job["sttPath"], "TTS_MODEL_PATH": job["ttsPath"]})
    audio = runtime.synthesize("Merhaba. Bu bir yazılım bağlantı testidir.")
    with wave.open(io.BytesIO(audio), "rb") as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2 or source.getnframes() <= 0:
            raise ValueError("Piper did not generate mono PCM16 audio")
        rate = source.getframerate()
        count = source.getnframes()
        if not 8000 <= rate <= 48000 or count / rate > 30 or len(audio) > 3_000_000:
            raise ValueError("Invalid speech test audio")
        data = source.readframes(count)
    if rate != 16000:
        # numpy is an installed dependency of the speech runtime.
        import numpy as np
        samples = np.frombuffer(data, dtype="<i2")
        positions = np.arange(int(count * 16000 / rate)) * rate / 16000
        data = np.interp(positions, np.arange(count), samples).clip(-32768, 32767).astype("<i2").tobytes()
    output = io.BytesIO()
    with wave.open(output, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(16000)
        target.writeframes(data)
    text = runtime.transcribe(output.getvalue(), "tr").strip()
    if not text or len(text) > 2000:
        raise ValueError("STT returned no bounded transcript for synthetic speech")
    return {"ok": True, "ttsSampleRate": rate, "transcriptCharacters": len(text)}


if __name__ == "__main__":
    try:
        raw = sys.stdin.read(512_001)
        if len(raw) > 512_000:
            raise ValueError("Setup job too large")
        job = json.loads(raw)
        action = sys.argv[1] if len(sys.argv) == 2 else ""
        if action == "download":
            result = prepare_assets(job)
        elif action == "smoke":
            result = smoke(job)
        else:
            raise ValueError("Invalid setup action")
        print(json.dumps(result, ensure_ascii=False))
    except Exception as error:
        print(f"Voice asset setup failed ({type(error).__name__}): check files, network, disk space and the model lock. Existing .env settings were not changed.", file=sys.stderr)
        raise SystemExit(1)
