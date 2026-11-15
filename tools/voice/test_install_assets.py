import io
import tempfile
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace

from install_assets import TTS_FILE, STT_REPO, TTS_REPO, prepare_assets, smoke


class FakeHub:
    def __init__(self):
        self.downloads = []
        self.lookups = []

    def model_info(self, repo_id, token):
        assert token is False
        self.lookups.append(repo_id)
        return SimpleNamespace(sha="a" * 40)

    def snapshot_download(self, repo_id, revision, allow_patterns, local_dir, token):
        assert token is False
        self.downloads.append((repo_id, revision))
        for name in allow_patterns:
            path = Path(local_dir) / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(("fake weight " + name).encode())


class AssetTests(unittest.TestCase):
    def setUp(self):
        base = "/tmp/opencode" if Path("/tmp/opencode").is_dir() else None
        self.temp = tempfile.TemporaryDirectory(prefix="astrobio-voice-assets-", dir=base)
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.job = {
            "sttPath": str(root / "stt"),
            "ttsPath": str(root / "piper" / TTS_FILE),
            "managedStt": True, "managedTts": True,
            "lock": None, "updateLock": False,
        }
        self.hub = FakeHub()

    def test_first_download_records_immutable_revisions_and_checksums(self):
        result = prepare_assets(self.job, self.hub)
        self.assertEqual(result["schemaVersion"], 1)
        self.assertEqual(result["stt"]["repo"], STT_REPO)
        self.assertEqual(result["tts"]["repo"], TTS_REPO)
        self.assertEqual(len(result["stt"]["files"]["model.bin"]), 64)
        self.assertEqual(len(self.hub.downloads), 2)

    def test_repeat_uses_pinned_local_assets_without_network(self):
        first = prepare_assets(self.job, self.hub)
        self.job["lock"] = first
        second = prepare_assets(self.job, self.hub)
        self.assertEqual(first, second)
        self.assertEqual(len(self.hub.downloads), 2)
        self.assertEqual(len(self.hub.lookups), 2)

    def test_tampered_files_are_not_silently_replaced(self):
        self.job["lock"] = prepare_assets(self.job, self.hub)
        changed = Path(self.job["sttPath"]) / "model.bin"
        changed.write_bytes(b"user modified weights")
        with self.assertRaises(ValueError):
            prepare_assets(self.job, self.hub)
        self.assertEqual(changed.read_bytes(), b"user modified weights")

    def test_untracked_complete_assets_are_adopted_as_local_not_false_upstream(self):
        prepare_assets(self.job, self.hub)
        untouched = (Path(self.job["sttPath"]) / "model.bin").read_bytes()
        result = prepare_assets(self.job, self.hub)
        self.assertIsNone(result["stt"]["repo"])
        self.assertIsNone(result["tts"]["repo"])
        self.assertEqual((Path(self.job["sttPath"]) / "model.bin").read_bytes(), untouched)
        self.assertEqual(len(self.hub.downloads), 2)

    def test_partial_untracked_weights_require_explicit_review(self):
        path = Path(self.job["sttPath"])
        path.mkdir()
        (path / "config.json").write_text("user file")
        with self.assertRaises(ValueError):
            prepare_assets(self.job, self.hub)
        self.assertEqual(len(self.hub.downloads), 0)

    def test_explicit_update_can_replace_managed_assets(self):
        self.job["lock"] = prepare_assets(self.job, self.hub)
        (Path(self.job["sttPath"]) / "model.bin").write_bytes(b"changed")
        self.job["updateLock"] = True
        result = prepare_assets(self.job, self.hub)
        self.assertEqual(result["stt"]["revision"], "a" * 40)
        self.assertEqual(len(self.hub.downloads), 4)

    def test_synthetic_roundtrip_needs_no_microphone_or_patient_data(self):
        output = io.BytesIO()
        with wave.open(output, "wb") as target:
            target.setnchannels(1)
            target.setsampwidth(2)
            target.setframerate(16000)
            target.writeframes(b"\0\0" * 1600)
        runtime = SimpleNamespace(synthesize=lambda text: output.getvalue(), transcribe=lambda audio, language: "Merhaba")
        self.assertTrue(smoke({}, runtime)["ok"])
        runtime.transcribe = lambda audio, language: ""
        with self.assertRaises(ValueError):
            smoke({}, runtime)

    def test_smoke_refuses_weights_removed_after_download(self):
        self.job["lock"] = prepare_assets(self.job, self.hub)
        (Path(self.job["sttPath"]) / "model.bin").unlink()
        with self.assertRaises(ValueError):
            smoke(self.job, SimpleNamespace())


if __name__ == "__main__":
    unittest.main()
