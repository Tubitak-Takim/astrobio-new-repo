"""Protocol tests using fake speech engines; no models/dependencies required."""
import io
import json
import threading
import unittest
import urllib.error
import urllib.request
import wave
from http.server import ThreadingHTTPServer

from server import SpeechRuntime, handler_for, load_runtime, parse_form, validate_audio


def wav_bytes(rate=16000, duration=0.1):
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(b"\x00\x00" * int(rate * duration))
    return output.getvalue()


def form_bytes(audio, language="tr"):
    boundary = "AstrobioTestBoundary"
    pieces = []
    for name, value in [("model", b"local-whisper"), ("language", language.encode()), ("file", audio)]:
        pieces.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'.encode() + value + b"\r\n")
    pieces.append(f"--{boundary}--\r\n".encode())
    return "multipart/form-data; boundary=" + boundary, b"".join(pieces)


class SpeechTests(unittest.TestCase):
    def setUp(self):
        self.runtime = SpeechRuntime("local-whisper", "local-piper", "chosen-voice", lambda audio, language: "Merhaba", lambda text: wav_bytes(24000))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler_for(self.runtime))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, path, body, mime="application/json"):
        req = urllib.request.Request(self.base + path, data=body, headers={"Content-Type": mime})
        try:
            with urllib.request.urlopen(req, timeout=3) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            try:
                return error.code, error.read()
            finally:
                error.close()

    def test_wav_validation(self):
        validate_audio(wav_bytes())
        with self.assertRaises(ValueError):
            validate_audio(wav_bytes(24000))
        with self.assertRaises(ValueError):
            validate_audio(wav_bytes(16000, 31))

    def test_transcription(self):
        mime, body = form_bytes(wav_bytes())
        self.assertEqual(parse_form(mime, body)["model"], "local-whisper")
        status, response = self.request("/v1/audio/transcriptions", body, mime)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(response)["text"], "Merhaba")

    def test_transcription_rejects_bad_language_and_audio(self):
        mime, body = form_bytes(wav_bytes(), "xx")
        self.assertEqual(self.request("/v1/audio/transcriptions", body, mime)[0], 400)
        mime, body = form_bytes(b"not a wave")
        self.assertEqual(self.request("/v1/audio/transcriptions", body, mime)[0], 400)

    def test_synthesis_and_voice_isolation(self):
        payload = {"model": "local-piper", "voice": "chosen-voice", "input": "AI assistant", "response_format": "wav"}
        status, response = self.request("/v1/audio/speech", json.dumps(payload).encode())
        self.assertEqual(status, 200)
        self.assertTrue(response.startswith(b"RIFF"))
        payload["voice"] = "arbitrary-other-voice"
        self.assertEqual(self.request("/v1/audio/speech", json.dumps(payload).encode())[0], 400)

    def test_busy_service(self):
        self.runtime.slot.acquire()
        try:
            self.assertEqual(self.request("/v1/audio/speech", b"{}")[0], 429)
        finally:
            self.runtime.slot.release()

    def test_no_automatic_download(self):
        with self.assertRaises(ValueError):
            load_runtime({})


if __name__ == "__main__":
    unittest.main()
