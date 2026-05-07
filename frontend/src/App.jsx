import { useState, useRef } from "react";
import "./App.css";

const BACKEND_URL = "http://localhost:8000";

const STATE = {
  NO_SESSION: "no_session",
  READY:      "ready",
  RECORDING:  "recording",
  SENDING:    "sending",
  ERROR:      "error",
};

const STATUS_TEXT = {
  [STATE.NO_SESSION]: "No active session",
  [STATE.READY]:      "Session live — waiting for interviewer",
  [STATE.RECORDING]:  "Recording…",
  [STATE.SENDING]:    "Transcribing & translating…",
  [STATE.ERROR]:      "Error",
};

const PROFILE_FIELDS = [
  { key: "about_me",           label: "About Me",             placeholder: "My name is Sofia. I am 22 years old.", full: true },
  { key: "major",              label: "Major / Studies",      placeholder: "I study Psychology at UC Berkeley." },
  { key: "where_i_live",       label: "Where I Live",         placeholder: "I live in Pittsburg, California." },
  { key: "why_i_like_it_here", label: "Why I Like It Here",   placeholder: "I love the weather and how close it is to SF." },
  { key: "recent_vacation",    label: "Recent Vacation",      placeholder: "I just got back from Cancun with my college friends.", full: true },
  { key: "hobbies",            label: "Hobbies",              placeholder: "I love going to concerts, painting, and trying new cafes." },
  { key: "food",               label: "Food",                 placeholder: "I'm obsessed with birria tacos and matcha lattes." },
  { key: "music",              label: "Music",                placeholder: "I'm really into indie pop and Bad Bunny." },
  { key: "personality",        label: "Personality",          placeholder: "I'm outgoing, a little sarcastic, and very passionate.", full: true },
];

const EMPTY_PROFILE = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, ""]));

export default function App() {
  const [appState, setAppState] = useState(STATE.NO_SESSION);
  const [response, setResponse] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [audioURL, setAudioURL] = useState(null);
  const [profile, setProfile]   = useState(EMPTY_PROFILE);

  const streamRef        = useRef(null);
  const recorderRef      = useRef(null);
  const chunksRef        = useRef([]);
  const sessionActiveRef = useRef(false);
  const historyRef       = useRef([]);   // rolling window of last 5 Q&A pairs

  function updateProfile(key, value) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  // ── Build a fresh MediaRecorder on the live stream ─────────────────────
  function initRecorder() {
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: "audio/webm;codecs=opus",
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => handleSend();
    recorderRef.current = recorder;
  }

  // ── Acquire stream once ─────────────────────────────────────────────────
  async function startSession() {
    setErrorMsg("");
    setResponse(null);
    setAudioURL(null);
    historyRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          suppressLocalAudioPlayback: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });

      stream.getVideoTracks().forEach((t) => t.stop());

      if (!stream.getAudioTracks().length) {
        stream.getTracks().forEach((t) => t.stop());
        setErrorMsg('No audio captured. Check "Share tab audio" in the Chrome picker.');
        setAppState(STATE.ERROR);
        return;
      }

      stream.getAudioTracks()[0].onended = () => endSession();

      streamRef.current = stream;
      sessionActiveRef.current = true;
      initRecorder();
      setAppState(STATE.READY);
    } catch (err) {
      const msg = err.name === "NotAllowedError"
        ? "Tab sharing cancelled. Click 'Start Session' and pick your Zoom tab."
        : `Could not start capture: ${err.message}`;
      setErrorMsg(msg);
      setAppState(STATE.ERROR);
    }
  }

  // ── Start a new recording (stream stays open) ──────────────────────────
  function startRecording() {
    setResponse(null);
    setAudioURL(null);
    recorderRef.current.start();
    setAppState(STATE.RECORDING);
  }

  // ── Stop recorder only — stream is NOT touched ─────────────────────────
  function stopRecording() {
    recorderRef.current?.stop();
    setAppState(STATE.SENDING);
  }

  // ── Send audio, show response, re-arm recorder ─────────────────────────
  async function handleSend() {
    if (!sessionActiveRef.current) return;

    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    setAudioURL(URL.createObjectURL(blob));

    const formData = new FormData();
    formData.append("audio", blob, "recording.webm");
    Object.entries(profile).forEach(([key, val]) => formData.append(key, val));
    formData.append("history_json", JSON.stringify(historyRef.current));

    try {
      const res = await fetch(`${BACKEND_URL}/transcribe`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();
      setResponse(data);

      // Push this exchange into the rolling history window (max 5)
      historyRef.current = [
        ...historyRef.current,
        {
          question_es: data.transcript,
          question_en: data.question_en,
          answer_es:   data.spanish,
          answer_en:   data.english,
        },
      ].slice(-5);

      if (sessionActiveRef.current) {
        initRecorder();
        setAppState(STATE.READY);
      }
    } catch (err) {
      if (sessionActiveRef.current) {
        setErrorMsg(`Failed: ${err.message}`);
        setAppState(STATE.ERROR);
      }
    }
  }

  // ── Fully release stream and tear down session ─────────────────────────
  function endSession() {
    sessionActiveRef.current = false;
    try {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    } catch (_) {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current   = null;
    recorderRef.current = null;
    chunksRef.current   = [];
    setAppState(STATE.NO_SESSION);
  }

  const inSession = appState === STATE.READY
    || appState === STATE.RECORDING
    || appState === STATE.SENDING;

  return (
    <div className="app">
      <header>
        <div className="tag">ENTREVISTA</div>
        <h1>Spanish Interview<br /><span>Assistant</span></h1>
        <p className="subtitle">Real-time Spanish ↔ English support</p>
      </header>

      <main>
        {/* ── Profile card — visible before session starts ── */}
        {appState === STATE.NO_SESSION && (
          <div className="profile-card">
            <div className="profile-card-header">
              <span className="profile-card-title">My Profile</span>
              <span className="profile-card-hint">Personalises your answers — all fields optional</span>
            </div>
            <div className="profile-grid">
              {PROFILE_FIELDS.map((field) => (
                <div
                  key={field.key}
                  className={`profile-field${field.full ? " full" : ""}`}
                >
                  <label className="profile-field-label" htmlFor={field.key}>
                    {field.label}
                  </label>
                  <input
                    id={field.key}
                    type="text"
                    className="profile-input"
                    value={profile[field.key]}
                    onChange={(e) => updateProfile(field.key, e.target.value)}
                    placeholder={field.placeholder}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card">

          {/* ── Status bar ── */}
          <div className="status-row">
            <div className={`dot ${appState}`} />
            <span className="status-label">{STATUS_TEXT[appState]}</span>
            {inSession && (
              <button className="btn-end-session" onClick={endSession}>
                End Session
              </button>
            )}
          </div>

          {/* ── Pre-session tip ── */}
          {appState === STATE.NO_SESSION && (
            <div className="tab-audio-tip">
              Chrome will show a tab picker — select your <em>Zoom tab</em> and
              check <strong>"Share tab audio"</strong> before clicking Share.
            </div>
          )}

          {/* ── Primary action button ── */}
          <div className="btn-row">
            {appState === STATE.NO_SESSION && (
              <button className="btn record" onClick={startSession}>
                ▶ Start Session
              </button>
            )}
            {appState === STATE.READY && (
              <button className="btn record" onClick={startRecording}>
                <span className="btn-icon">⏺</span> Start Recording
              </button>
            )}
            {appState === STATE.RECORDING && (
              <button className="btn stop" onClick={stopRecording}>
                <span className="btn-icon">⏹</span> Done Talking
              </button>
            )}
            {appState === STATE.SENDING && (
              <button className="btn disabled" disabled>
                <span className="spinner" /> Processing…
              </button>
            )}
            {appState === STATE.ERROR && (
              <button className="btn reset" onClick={() => { setErrorMsg(""); setAppState(STATE.NO_SESSION); }}>
                ↺ Try Again
              </button>
            )}
          </div>

          {/* ── Playback ── */}
          {audioURL && (
            <div className="playback">
              <p className="playback-label">▶ Playback</p>
              <audio controls src={audioURL} />
            </div>
          )}

          {/* ── Conversational response ── */}
          {response && (
            <div className="convo">
              <div className="convo-block question-block">
                <p className="convo-role">Question</p>
                <div className="convo-line">
                  <span className="flag">🇪🇸</span>
                  <span className="convo-text">{response.transcript}</span>
                </div>
                {response.question_en && (
                  <div className="convo-line secondary">
                    <span className="flag">🇺🇸</span>
                    <span className="convo-text">{response.question_en}</span>
                  </div>
                )}
              </div>
              <div className="convo-divider" />
              <div className="convo-block answer-block">
                <p className="convo-role">Your Answer</p>
                <div className="convo-line">
                  <span className="flag">🇪🇸</span>
                  <span className="convo-text answer-es">{response.spanish}</span>
                </div>
                <div className="convo-line secondary">
                  <span className="flag">🇺🇸</span>
                  <span className="convo-text">{response.english}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {errorMsg && (
            <div className="error-box">
              <p className="error-label">Error</p>
              <p className="error-msg">{errorMsg}</p>
            </div>
          )}
        </div>

        <div className="hint">
          <strong>How to use</strong>
          <ol>
            <li>Fill in your profile above (optional but makes answers personal)</li>
            <li>Click <em>Start Session</em> → pick your Zoom tab → check <strong>"Share tab audio"</strong></li>
            <li>When the interviewer speaks, click <em>Start Recording</em></li>
            <li>Click <em>Done Talking</em> when they finish — the answer appears automatically</li>
            <li>Say the Spanish answer out loud, then record the next question</li>
            <li>Click <em>End Session</em> when the interview is over</li>
          </ol>
        </div>
      </main>
    </div>
  );
}
