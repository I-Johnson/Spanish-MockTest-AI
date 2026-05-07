# Spanish Interview Assistant

A real-time AI assistant that listens to your Spanish conversation partner, transcribes what they said, and instantly generates a natural Spanish response you can say out loud — along with an English translation so you always know what you're saying.

Built for mock Spanish interviews, language practice, or any situation where you need to hold a conversation in Spanish faster than you can think.

---

## How it works

```
Zoom tab (interviewer speaking)
        ↓
getDisplayMedia() — user picks the Zoom tab in Chrome's tab picker
        ↓
Browser captures the tab's audio stream
        ↓
MediaRecorder records it → sends to backend as audio/webm
        ↓
Groq Whisper transcribes the audio → Spanish transcript
        ↓
Groq LLaMA 3.3 70B generates a response using your profile + conversation history
        ↓
UI shows: what they said (ES + EN) + what you should say (ES + EN)
```

The backend is **fully stateless** — conversation history is maintained on the frontend and sent with each request.

---

## Features

- **Tab audio capture** — captures the interviewer's audio directly from a browser tab (Zoom, Google Meet, etc.), no microphone mixing
- **Persistent session** — one tab-sharing permission lasts the whole interview; the MediaRecorder is re-initialized after each question without re-prompting
- **Personal profile** — fill in structured context buckets (hobbies, food, where you live, etc.) before the session; the model uses only relevant buckets per question
- **Conversation history** — the last 5 Q&A pairs are silently sent with every request so the model handles follow-up questions naturally
- **Stateless backend** — no database, no session storage; all state lives in the browser

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5 |
| Backend | FastAPI, Python 3.11 |
| Transcription | Groq Whisper (`whisper-large-v3-turbo`) |
| Response generation | Groq LLaMA (`llama-3.3-70b-versatile`) |
| Containerisation | Docker, Docker Compose |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- A [Groq API key](https://console.groq.com) (free tier is fine)

---

## Setup

**1. Clone the repo**

```bash
git clone https://github.com/your-username/spanish-interview-assistant.git
cd spanish-interview-assistant
```

**2. Add your Groq API key**

```bash
echo "GROQ_API_KEY=your_groq_api_key_here" > backend/.env
```

**3. Build and run**

```bash
docker compose up --build
```

**4. Open the app**

```
http://localhost:5173
```

That's it. Both services start automatically:

| Service | URL |
|---|---|
| Frontend (React/Vite) | http://localhost:5173 |
| Backend (FastAPI) | http://localhost:8000 |
| Health check | http://localhost:8000/health |

To stop: `docker compose down`

---

## Usage

### 1. Fill in your profile *(optional but recommended)*

Before starting a session, fill in as many profile fields as you like. The model only uses fields that are relevant to the question — if someone asks about food and you've filled in the food bucket, it'll use that. If the question is unrelated to any bucket, it answers naturally without forcing personal details.

| Field | Example |
|---|---|
| About Me | My name is Sofia. I am 22 years old. |
| Major / Studies | I study Psychology at UC Berkeley. |
| Where I Live | I live in Pittsburg, California. |
| Why I Like It Here | I love the weather and how close it is to SF. |
| Recent Vacation | I just got back from Cancun with my college friends. |
| Hobbies | I love going to concerts, painting, and trying new cafes. |
| Food | I'm obsessed with birria tacos and matcha lattes. |
| Music | I'm really into indie pop and Bad Bunny. |
| Personality | I'm outgoing, a little sarcastic, and very passionate. |

### 2. Start a session

Click **Start Session**. Chrome shows a tab picker — select your Zoom/Meet tab and check **"Share tab audio"** before clicking Share. This permission is requested once and stays open for the whole interview.

### 3. Record each question

- Click **Start Recording** when the interviewer begins speaking
- Click **Done Talking** when they finish
- Wait ~2 seconds for the response to appear

### 4. Read the response

```
QUESTION
🇪🇸  ¿Qué haces en tu tiempo libre?
🇺🇸  What do you do in your free time?

YOUR ANSWER
🇪🇸  La verdad, me encanta ir a conciertos y probar cafés nuevos...
🇺🇸  Honestly, I love going to concerts and trying new cafes...
```

Say the Spanish answer out loud, then record the next question.

### 5. End the session

Click **End Session** to release the tab share. The Chrome "sharing" indicator in the toolbar disappears.

---

## Project structure

```
translate/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── main.py               # FastAPI app — Whisper + LLaMA calls
│   ├── requirements.txt
│   ├── .env                  # Your GROQ_API_KEY (not committed)
│   └── .env.example
└── frontend/
    ├── Dockerfile
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx            # All session logic, profile form, response display
        └── App.css
```

---

## API

### `POST /transcribe`

Accepts `multipart/form-data`.

| Field | Type | Description |
|---|---|---|
| `audio` | file | Audio blob (`audio/webm;codecs=opus`) |
| `about_me` | string | Profile bucket |
| `major` | string | Profile bucket |
| `where_i_live` | string | Profile bucket |
| `why_i_like_it_here` | string | Profile bucket |
| `recent_vacation` | string | Profile bucket |
| `hobbies` | string | Profile bucket |
| `food` | string | Profile bucket |
| `music` | string | Profile bucket |
| `personality` | string | Profile bucket |
| `history_json` | string | JSON array of last ≤5 Q&A pairs |

**Response**

```json
{
  "transcript":  "¿Qué haces en tu tiempo libre?",
  "question_en": "What do you do in your free time?",
  "spanish":     "La verdad, me encanta ir a conciertos...",
  "english":     "Honestly, I love going to concerts..."
}
```

### `GET /health`

Returns `{"status": "ok"}`.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Your Groq API key from console.groq.com |

---

## Browser compatibility

Requires **Chrome** (or a Chromium-based browser). The `getDisplayMedia()` API with tab audio capture and the `audio/webm;codecs=opus` MediaRecorder format are Chrome-specific. Firefox and Safari do not support tab audio capture via `getDisplayMedia`.

---

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a pull request

---

## License

MIT
