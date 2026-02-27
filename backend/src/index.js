import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: "20kb" }));

// Rate limit: 60 requests/minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many requests, slow down a little!" },
});
app.use("/api/", limiter);

// ── Supabase (for auth verification) ─────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // service key — never sent to frontend
);

// ── Auth middleware ───────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Invalid session" });

  req.user = user;
  next();
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get("/health", (_, res) => res.json({ ok: true }));

// Proxy to Claude — API key never leaves the server
app.post("/api/chat", requireAuth, async (req, res) => {
  const { messages, systemPrompt } = req.body;
  if (!messages || !systemPrompt) {
    return res.status(400).json({ error: "Missing messages or systemPrompt" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1200,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Claude API error:", err);
      return res.status(502).json({ error: "AI service error" });
    }

    const data = await response.json();
    res.json({ content: data.content });
  } catch (e) {
    console.error("Chat error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Proxy to ElevenLabs TTS — voice ID and key never leave the server
app.post("/api/speak", requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text || text.length > 2000) {
    return res.status(400).json({ error: "Invalid text" });
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
        }),
      }
    );

    if (!response.ok) {
      return res.status(502).json({ error: "TTS service error" });
    }

    // Stream audio back to client
    res.setHeader("Content-Type", "audio/mpeg");
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error("Speak error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Save user progress to Supabase
app.post("/api/progress", requireAuth, async (req, res) => {
  const { profile } = req.body;
  if (!profile) return res.status(400).json({ error: "Missing profile" });

  const { error } = await supabase
    .from("user_profiles")
    .upsert({ user_id: req.user.id, profile, updated_at: new Date().toISOString() });

  if (error) return res.status(500).json({ error: "Failed to save progress" });
  res.json({ ok: true });
});

// Load user progress from Supabase
app.get("/api/progress", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("profile")
    .eq("user_id", req.user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    return res.status(500).json({ error: "Failed to load progress" });
  }

  res.json({ profile: data?.profile || null });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Fritz backend running on port ${PORT}`));
