"""Local CPU-only faster-whisper/Piper bridge. No automatic weight downloads.

The Node API provides authentication/consent. Never expose this loopback service
to a network or proxy it directly to browsers. No audio/transcript logging.
"""
import io
import json
import os
import threading
import wave
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_INPUT = 1_050_000
MAX_OUTPUT = 8 * 1024 * 1024


def validate_audio(data):
    if len(data) > 1_000_000:
        raise ValueError("Audio is too large")
    with wave.open(io.BytesIO(data), "rb") as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
            raise ValueError("Use mono PCM16 WAV at 16000 Hz")
        count = audio.getnframes()
        if count <= 0 or count > 30 * 16000 or len(audio.readframes(count + 1)) != count * 2:
            raise ValueError("Invalid or overlong audio")


def parse_form(content_type, body):
    if not content_type.startswith("multipart/form-data;"):
        raise ValueError("Multipart form required")
    message = BytesParser(policy=policy.default).parsebytes(
        ("Content-Type: " + content_type + "\r\nMIME-Version: 1.0\r\n\r\n").encode() + body
    )
    if not message.is_multipart():
        raise ValueError("Invalid multipart")
    values = {}
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if name not in {"file", "model", "language", "response_format"} or name in values:
            raise ValueError("Invalid form fields")
        payload = part.get_payload(decode=True)
        if not isinstance(payload, bytes):
            raise ValueError("Invalid form payload")
        values[name] = payload if name == "file" else payload.decode("utf-8")
    return values


class SpeechRuntime:
    def __init__(self, stt_model, tts_model, voice, transcribe, synthesize):
        self.stt_model, self.tts_model, self.voice = stt_model, tts_model, voice
        self.transcribe, self.synthesize = transcribe, synthesize
        self.slot = threading.BoundedSemaphore(1)


def handler_for(runtime):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def respond(self, status, data, mime="application/json"):
            if mime == "application/json":
                data = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path != "/v1/models":
                return self.respond(404, {"error": "Not found"})
            self.respond(200, {"data": [{"id": runtime.stt_model}, {"id": runtime.tts_model}]})

        def do_POST(self):
            self.close_connection = True
            if self.path not in {"/v1/audio/transcriptions", "/v1/audio/speech"}:
                return self.respond(404, {"error": "Not found"})
            if not runtime.slot.acquire(blocking=False):
                return self.respond(429, {"error": "Speech runtime busy"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > MAX_INPUT:
                    return self.respond(413, {"error": "Invalid request size"})
                self.connection.settimeout(15)
                body = self.rfile.read(length)
                if len(body) != length:
                    raise ValueError("Incomplete body")
                if self.path.endswith("transcriptions"):
                    form = parse_form(self.headers.get("Content-Type", ""), body)
                    if form.get("model") != runtime.stt_model or form.get("language") not in {"tr", "en"} or not isinstance(form.get("file"), bytes):
                        raise ValueError("Invalid STT request")
                    validate_audio(form["file"])
                    text = runtime.transcribe(form["file"], form["language"]).strip()
                    if not text or len(text) > 2000:
                        raise ValueError("No bounded transcript")
                    self.respond(200, {"text": text})
                else:
                    value = json.loads(body)
                    if not isinstance(value, dict):
                        raise ValueError("JSON object required")
                    if (value.get("model") != runtime.tts_model or value.get("voice") != runtime.voice
                            or value.get("response_format") != "wav"
                            or not isinstance(value.get("input"), str)
                            or not 0 < len(value["input"]) <= 6000):
                        raise ValueError("Invalid TTS request")
                    audio = runtime.synthesize(value["input"])
                    if not audio or len(audio) > MAX_OUTPUT:
                        raise ValueError("Speech output too large")
                    self.respond(200, audio, "audio/wav")
            except (ValueError, TypeError, KeyError, wave.Error):
                self.respond(400, {"error": "Invalid speech input or output"})
            except Exception:
                # Do not return engine exceptions containing transcripts or paths.
                self.respond(503, {"error": "Local speech engine failed"})
            finally:
                runtime.slot.release()

    return Handler


def load_runtime(env):
    stt = Path(env.get("STT_MODEL_DIR", ""))
    tts = Path(env.get("TTS_MODEL_PATH", ""))
    identifiers = [env.get(k, "") for k in ("VOICE_STT_MODEL", "VOICE_TTS_MODEL", "VOICE_TTS_VOICE")]
    if not env.get("STT_MODEL_DIR") or not stt.is_dir() or not (stt / "tokenizer.json").is_file():
        raise ValueError("STT_MODEL_DIR must contain a local CTranslate2 Whisper model and tokenizer.json")
    if not env.get("TTS_MODEL_PATH") or not tts.is_file() or not Path(str(tts) + ".json").is_file() or not all(identifiers):
        raise ValueError("Set local TTS_MODEL_PATH (.onnx + .onnx.json) and VOICE_STT_MODEL/VOICE_TTS_MODEL/VOICE_TTS_VOICE aliases")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    from faster_whisper import WhisperModel
    from piper import PiperVoice
    # Deliberately leave the laptop GPU available for the two language models.
    whisper = WhisperModel(str(stt.resolve()), device="cpu", compute_type="int8", local_files_only=True, cpu_threads=min(8, os.cpu_count() or 1))
    piper = PiperVoice.load(str(tts.resolve()), use_cuda=False)

    def transcribe(data, language):
        segments, _ = whisper.transcribe(io.BytesIO(data), language=language, beam_size=1, condition_on_previous_text=False, vad_filter=True)
        return " ".join(segment.text for segment in segments)

    def synthesize(text):
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            piper.synthesize_wav(text, wav)
        return output.getvalue()

    return SpeechRuntime(*identifiers, transcribe, synthesize)


if __name__ == "__main__":
    try:
        port = int(os.environ.get("VOICE_PORT", "8001"))
        runtime = load_runtime(os.environ)
        server = ThreadingHTTPServer(("127.0.0.1", port), handler_for(runtime))
        print(f"Astrobio local CPU speech runtime: http://127.0.0.1:{port}", flush=True)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    except Exception as error:
        print(f"Speech runtime not started ({type(error).__name__}). Check local model paths, aliases and optional Python dependencies.", flush=True)
        raise SystemExit(1)
