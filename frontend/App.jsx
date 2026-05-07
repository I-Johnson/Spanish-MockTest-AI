import { useState, useRef } from "react";
import "./App.css";

const BACKEND_URL = "http://localhost:8000";

// Recording states
const STATE = {
  IDLE: "idle",
  RECORDING: "recording",
  SENDING: "sending",
  SUCCESS: "success",
  ERROR: "error",
};

export default function App() {
  const [recState, setRecState] = useState(STATE.IDLE);
  const [serverResponse, setServerResponse] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [audioURL, setAudioURL] = useState(null); // lets you play back what was recorded

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  // ── Start recording ──────────────────────────────────────────
  async function startRecording() {
    setServerResponse(null);
    setErrorMsg("");
    setAudioURL(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus", // compact + high quality
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        // Stop all mic tracks so the browser stops showing "recording" indicator
        stream.getTracks().forEach((t) => t.stop());
        handleSend();
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecState(STATE.RECORDING);
    } catch (err) {
      setErrorMsg("Microphone access denied. Please allow mic permissions.");
      setRecState(STATE.ERROR);
    }
  }

  // ── Stop recording → triggers onstop → handleSend ────────────
  function stopRecording() {
    recorderRef.current?.stop();
    setRecState(STATE.SENDING);
  }

  // ── Send audio blob to FastAPI ────────────────────────────────
  async function handleSend() {
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });

    // Let user play back the recording locally
    setAudioURL(URL.createObjectURL(blob));

    const formData = new FormData();
    formData.append("audio", blob, "recording.webm");

    try {
      const res = await fetch(`${BACKEND_URL}/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();
      setServerResponse(data);
      setRecState(STATE.SUCCESS);
    } catch (err) {
      setErrorMsg(`Failed to reach backend: ${err.message}`);
      setRecState(STATE.ERROR);
    }
  }

  // ── Reset ─────────────────────────────────────────────────────
  function reset() {
    setRecState(STATE.IDLE);
    setServerResponse(null);
    setErrorMsg("");
    setAudioURL(null);
  }

  return (
    <div className="app">
      <header>
        <div className="tag">ENTREVISTA</div>
        <h1>Spanish Interview<br /><span>Assistant</span></h1>
        <p className="subtitle">Real-time Spanish ↔ English support</p>
      </header>

      <main>
        <div className="card">
          <div className="status-row">
            <div className={`dot ${recState === STATE.RECORDING ? "pulse" : ""} ${recState}`} />
            <span className="status-label">
              {recState === STATE.IDLE && "Ready to record"}
              {recState === STATE.RECORDING && "Recording…"}
              {recState === STATE.SENDING && "Sending to server…"}
              {recState === STATE.SUCCESS && "Received by server ✓"}
              {recState === STATE.ERROR && "Error"}
            </span>
          </div>

          <div className="btn-row">
            {recState === STATE.IDLE && (
              <button className="btn record" onClick={startRecording}>
                <span className="btn-icon">⏺</span> Start Recording
              </button>
            )}

            {recState === STATE.RECORDING && (
              <button className="btn stop" onClick={stopRecording}>
                <span className="btn-icon">⏹</span> Done Talking
              </button>
            )}

            {(recState === STATE.SENDING) && (
              <button className="btn disabled" disabled>
                <span className="spinner" /> Sending…
              </button>
            )}

            {(recState === STATE.SUCCESS || recState === STATE.ERROR) && (
              <button className="btn reset" onClick={reset}>
                ↺ Record Again
              </button>
            )}
          </div>

          {/* Playback — confirm audio was captured correctly */}
          {audioURL && (
            <div className="playback">
              <p className="playback-label">▶ Playback (verify your audio)</p>
              <audio controls src={audioURL} />
            </div>
          )}

          {/* Server response */}
          {serverResponse && (
            <div className="response success-box">
              <p className="response-label">Server Response</p>
              <pre>{JSON.stringify(serverResponse, null, 2)}</pre>
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div className="response error-box">
              <p className="response-label">Error</p>
              <p>{errorMsg}</p>
            </div>
          )}
        </div>

        <div className="hint">
          <strong>Testing checklist</strong>
          <ol>
            <li>Click <em>Start Recording</em> and allow mic access</li>
            <li>Say something in Spanish (or anything)</li>
            <li>Click <em>Done Talking</em></li>
            <li>Listen to the playback — confirm it sounds right</li>
            <li>Check the server response shows <code>"status": "received"</code></li>
            <li>Check your terminal for the server log line</li>
          </ol>
        </div>
      </main>
    </div>
  );
}
