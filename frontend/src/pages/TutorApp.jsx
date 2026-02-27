import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import { chat, speak as ttsSpeak, saveProgress, loadProgress } from "../lib/api.js";
import { LANGUAGES } from "./LanguageSelect.jsx";

// ── Constants ─────────────────────────────────────────────────────────────────
const LEVEL_LABELS = ["Absolute Beginner","Absolute Beginner","Beginner","A1 Elementary","A1 Elementary","A2 Pre-Intermediate","A2 Pre-Intermediate","B1 Intermediate","B1 Intermediate","B2 Upper-Intermediate","B2+ Advanced"];
const LEVEL_COLORS = ["#888","#888","#FF6B6B","#FF8C42","#FFA500","#FFD700","#9ACD32","#4ECDC4","#26A69A","#5C85D6","#9B59B6"];
const MODES = [
  { id: "CHAT",      label: "💬 Talk",     color: "#FF6B6B" },
  { id: "FLASHCARD", label: "🃏 Vocab",    color: "#4ECDC4" },
  { id: "GRAMMAR",   label: "📚 Grammar",  color: "#FFE66D" },
  { id: "SCENARIO",  label: "🎭 Roleplay", color: "#C084FC" },
];
const DEFAULT_PROFILE = {
  level: 3, levelLabel: "A1 Elementary", confidence: 5,
  sessions: 0, strengths: [], weaknesses: [],
  masteredWords: [], strugglingWords: [],
  style: null, summary: "", mode: "CHAT",
};

// ── System prompt builder ─────────────────────────────────────────────────────
const buildSystemPrompt = (profile, lang) => `
You are Fritz, a deeply attentive and emotionally intelligent ${lang.name} tutor with real personality.
You are teaching ${lang.name} (${lang.native}).

LEARNER PROFILE:
- Detected Level: ${profile.level}/10 (${profile.levelLabel})
- Confidence: ${profile.confidence}/10
- Sessions: ${profile.sessions}
- Strong Areas: ${profile.strengths.join(", ") || "still discovering"}
- Weak Areas: ${profile.weaknesses.join(", ") || "still discovering"}
- Words Mastered: ${profile.masteredWords.slice(-8).join(", ") || "none yet"}
- Struggling With: ${profile.strugglingWords.slice(-5).join(", ") || "none yet"}

ADAPTATION:
- Level 0-2: Mostly English. 1-2 ${lang.name} words per reply. Extremely encouraging.
- Level 3-4: Mix English/${lang.name} 50/50. Simple present only. Celebrate wins.
- Level 5-6: Lean toward ${lang.name} with English support. Warm corrections.
- Level 7-8: Mostly ${lang.name}. Full sentences expected. Point out nuance.
- Level 9-10: Full ${lang.name}. Complex topics. Nuanced corrections.

CORRECTION FORMAT (when user makes an error):
[CORRECTION: "what they said" -> "correct form" | why: brief reason]
Max 2 corrections per reply. Never shame the learner.

ASSESSMENT (append after EVERY reply, parsed silently):
[ASSESS: level=X | confidence=Y | strength=topic | weakness=topic | new_word=word | struggling=word]

PERSONALITY:
- Warm, witty, genuinely curious about this person's life
- Make cultural references to ${lang.name}-speaking countries naturally
- Celebrate wins genuinely, not robotically
- When they struggle, get gentler without being condescending

SPEECH RULES (replies are spoken aloud):
- Natural spoken language only. No asterisks, bullet dashes, or markdown.
- 2-4 sentences max unless teaching a concept.
- CORRECTION and ASSESS tags are parsed silently — everything else is speech.
- Vary energy and how you start each reply.

Current mode: ${profile.mode}
`;

// ── Parse Fritz's hidden tags ─────────────────────────────────────────────────
function parseFritzReply(raw, profile) {
  let spoken = raw;
  const corrections = [];

  const corrRegex = /\[CORRECTION:\s*"([^"]+)"\s*->\s*"([^"]+)"\s*\|\s*why:\s*([^\]]+)\]/g;
  let m;
  while ((m = corrRegex.exec(raw)) !== null) {
    corrections.push({ original: m[1], correct: m[2], reason: m[3].trim() });
  }
  spoken = spoken.replace(corrRegex, "").trim();

  const profileUpdates = { ...profile };
  const assessMatch = /\[ASSESS:\s*([^\]]+)\]/.exec(raw);
  if (assessMatch) {
    const p = assessMatch[1];
    const lvl  = p.match(/level=(\d+(?:\.\d+)?)/);
    const conf = p.match(/confidence=(\d+(?:\.\d+)?)/);
    const str  = p.match(/strength=([^|,\]]+)/);
    const weak = p.match(/weakness=([^|,\]]+)/);
    const nw   = p.match(/new_word=([^|,\]]+)/);
    const sw   = p.match(/struggling=([^|,\]]+)/);
    if (lvl) { const nl = Math.round(parseFloat(lvl[1])); profileUpdates.level = Math.max(0, Math.min(10, Math.round((profile.level * 3 + nl) / 4))); profileUpdates.levelLabel = LEVEL_LABELS[profileUpdates.level]; }
    if (conf) profileUpdates.confidence = Math.round((profile.confidence * 2 + parseFloat(conf[1])) / 3);
    if (str)  { const s = str[1].trim();  if (s && !profileUpdates.strengths.includes(s))     profileUpdates.strengths     = [...profileUpdates.strengths.slice(-4), s]; }
    if (weak) { const w = weak[1].trim(); if (w && !profileUpdates.weaknesses.includes(w))    profileUpdates.weaknesses    = [...profileUpdates.weaknesses.slice(-4), w]; }
    if (nw)   { const word = nw[1].trim(); if (word && !profileUpdates.masteredWords.includes(word)) profileUpdates.masteredWords = [...profileUpdates.masteredWords.slice(-19), word]; }
    if (sw)   { const word = sw[1].trim(); if (word && !profileUpdates.strugglingWords.includes(word)) profileUpdates.strugglingWords = [...profileUpdates.strugglingWords.slice(-9), word]; }
  }
  spoken = spoken.replace(/\[ASSESS:[^\]]+\]/g, "").trim();
  return { spoken, corrections, profileUpdates };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Waveform({ active, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 30 }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} style={{
          width: 4, borderRadius: 2, background: color, minHeight: 4, maxHeight: 26,
          animation: active ? `wave 0.85s ease-in-out infinite` : "none",
          animationDelay: `${i * 0.09}s`,
          height: active ? undefined : "4px", opacity: active ? 1 : 0.2,
        }} />
      ))}
    </div>
  );
}

function CorrectionCard({ corrections }) {
  if (!corrections.length) return null;
  return (
    <div style={{ margin: "4px 0 2px 38px", background: "rgba(255,214,0,0.06)", border: "1px solid rgba(255,214,0,0.18)", borderRadius: 10, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
      {corrections.map((c, i) => (
        <div key={i} style={{ fontSize: 12, lineHeight: 1.5 }}>
          <span style={{ color: "rgba(255,100,100,0.85)", textDecoration: "line-through" }}>{c.original}</span>
          <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 6px" }}>→</span>
          <span style={{ color: "#7FFFD4", fontWeight: 600 }}>{c.correct}</span>
          <span style={{ color: "rgba(255,255,255,0.3)", marginLeft: 8, fontSize: 11 }}>· {c.reason}</span>
        </div>
      ))}
    </div>
  );
}

function ProgressPanel({ profile, levelColor }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ width: "100%", maxWidth: 680, marginBottom: 10 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "7px 14px", cursor: "pointer", color: "rgba(255,255,255,0.45)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "inherit" }}>
        <span>📊 Your Progress</span><span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderTop: "none", borderRadius: "0 0 12px 12px", padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Level</span>
              <span style={{ color: levelColor, fontSize: 11, fontWeight: 700 }}>{profile.level}/10</span>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${profile.level * 10}%`, background: `linear-gradient(90deg,${levelColor},${levelColor}99)`, borderRadius: 3, transition: "width 0.5s" }} />
            </div>
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 5 }}>Confidence</div>
            <div style={{ display: "flex", gap: 3 }}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: 7, borderRadius: 2, background: i < profile.confidence ? "#4ECDC4" : "rgba(255,255,255,0.08)", transition: "background 0.3s" }} />
              ))}
            </div>
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 3 }}>Sessions</div>
            <div style={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>{profile.sessions}</div>
          </div>
          {profile.strengths.length > 0 && (
            <div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 5 }}>✅ Strong At</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {profile.strengths.map((s, i) => <span key={i} style={{ background: "rgba(74,205,148,0.15)", color: "#4ECDC4", fontSize: 10, padding: "2px 8px", borderRadius: 10 }}>{s}</span>)}
              </div>
            </div>
          )}
          {profile.weaknesses.length > 0 && (
            <div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 5 }}>🎯 Working On</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {profile.weaknesses.map((w, i) => <span key={i} style={{ background: "rgba(255,107,107,0.12)", color: "#FF6B6B", fontSize: 10, padding: "2px 8px", borderRadius: 10 }}>{w}</span>)}
              </div>
            </div>
          )}
          {profile.masteredWords.length > 0 && (
            <div style={{ gridColumn: "1/-1" }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 5 }}>📖 Words ({profile.masteredWords.length})</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {profile.masteredWords.slice(-14).map((w, i) => <span key={i} style={{ background: "rgba(255,230,109,0.1)", color: "#FFE66D", fontSize: 10, padding: "2px 8px", borderRadius: 10 }}>{w}</span>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function TutorApp() {
  const { langCode = "de" } = useParams();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const lang = LANGUAGES.find(l => l.code === langCode) || LANGUAGES[0];

  const [mode, setMode]           = useState("CHAT");
  const [messages, setMessages]   = useState([]);
  const [rawHistory, setRawHistory] = useState([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [speaking, setSpeaking]   = useState(false);
  const [recording, setRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [leveled, setLeveled]     = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const [profile, setProfile]     = useState(DEFAULT_PROFILE);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const bottomRef       = useRef(null);
  const recognitionRef  = useRef(null);
  const currentAudioRef = useRef(null);
  const finalTextRef    = useRef("");
  const shouldRestartRef = useRef(false);
  const saveTimerRef    = useRef(null);

  const levelColor = LEVEL_COLORS[profile.level];
  const activeMode = MODES.find(m => m.id === mode);

  // Load progress on mount
  useEffect(() => {
    loadProgress().then(saved => {
      const p = saved || DEFAULT_PROFILE;
      setProfile(p);
      setProfileLoaded(true);
    });
  }, []);

  // Init intro message
  useEffect(() => {
    if (!profileLoaded) return;
    const isNew = profile.sessions === 0;
    const intro = isNew
      ? `Hallo! Ich bin Fritz, your personal ${lang.name} tutor. I'm going to pay close attention to how you communicate and adapt to exactly where you are. No pressure at all — just talk to me naturally, even in English, and I'll figure out the best place to start. So tell me, why do you want to learn ${lang.name}?`
      : `Willkommen zurück! Great to see you again. You are at level ${profile.level} — ${profile.levelLabel}. ${profile.masteredWords.length > 0 ? "You've been building up some solid vocabulary." : "Let's keep building."} Ready to continue?`;
    setMessages([{ role: "assistant", content: intro, corrections: [] }]);
    setRawHistory([{ role: "assistant", content: intro }]);
  }, [profileLoaded, langCode]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // Auto-save progress (debounced)
  const scheduleSave = (p) => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveProgress(p), 3000);
  };

  // ── TTS ────────────────────────────────────────────────────────────────────
  const stopSpeaking = () => {
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
    setSpeaking(false);
  };

  const speak = useCallback(async (text) => {
    stopSpeaking();
    setSpeaking(true);
    try {
      const url = await ttsSpeak(text);
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
      audio.onerror = () => setSpeaking(false);
      audio.play();
    } catch (e) { console.error(e); setSpeaking(false); }
  }, []);

  // ── STT ────────────────────────────────────────────────────────────────────
  const spawnRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = profile.level >= 5 ? lang.micLang : "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTextRef.current += (finalTextRef.current ? " " : "") + t.trim();
        else interim += t;
      }
      setLiveTranscript((finalTextRef.current + (interim ? " " + interim : "")).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      shouldRestartRef.current = false;
      setRecording(false);
      setLiveTranscript("");
      if (e.error === "not-allowed") setMicBlocked(true);
    };
    rec.onend = () => { if (shouldRestartRef.current) try { spawnRecognition(); } catch (_) {} };
    try { rec.start(); } catch (e) { console.warn(e); }
  };

  const startRecording = async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition requires Chrome or Edge."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") setMicBlocked(true);
      else alert("Could not access microphone: " + err.message);
      return;
    }
    finalTextRef.current = "";
    shouldRestartRef.current = true;
    setLiveTranscript(""); setInput(""); setMicBlocked(false); setRecording(true);
    spawnRecognition();
  };

  const stopRecording = () => {
    shouldRestartRef.current = false;
    setRecording(false);
    try { recognitionRef.current?.stop(); } catch (_) {}
    const finalText = finalTextRef.current.trim();
    setLiveTranscript(""); finalTextRef.current = "";
    if (finalText) sendMessage(finalText);
  };

  // ── Send ───────────────────────────────────────────────────────────────────
  const sendMessage = async (text) => {
    const clean = text.trim();
    if (!clean || loading) return;
    setInput(""); setLiveTranscript("");
    const userDisplayMsg = { role: "user", content: clean, corrections: [] };
    const userApiMsg     = { role: "user", content: `[MODE: ${mode}]\n${clean}` };
    setMessages(prev => [...prev, userDisplayMsg]);
    const newRaw = [...rawHistory, userApiMsg];
    setRawHistory(newRaw);
    setLoading(true);
    try {
      const data = await chat(newRaw, buildSystemPrompt({ ...profile, mode }, lang));
      const raw = data.content?.map(b => b.text || "").join("") || "Entschuldigung, something went wrong!";
      const { spoken, corrections, profileUpdates } = parseFritzReply(raw, profile);
      const didLevelUp = profileUpdates.level > profile.level;
      if (didLevelUp) { setLeveled(true); setTimeout(() => setLeveled(false), 2500); }
      const updatedProfile = { ...profileUpdates, sessions: profile.sessions + (profile.sessions === 0 ? 1 : 0), mode };
      setProfile(updatedProfile);
      scheduleSave(updatedProfile);
      setMessages(prev => [...prev, { role: "assistant", content: spoken, corrections }]);
      setRawHistory(prev => [...prev, { role: "assistant", content: raw }]);
      speak(spoken);
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Please try again.", corrections: [] }]);
    }
    setLoading(false);
  };

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } };

  if (!profileLoaded) {
    return <div style={{ minHeight: "100vh", background: "#080810", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", fontFamily: "system-ui" }}>Loading your progress…</div>;
  }

  return (
    <div style={s.page}>
      <style>{`
        @keyframes wave{0%,100%{height:4px}50%{height:26px}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,107,107,0.5)}50%{box-shadow:0 0 0 16px rgba(255,107,107,0)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
        @keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
        @keyframes glow{0%,100%{opacity:0.6}50%{opacity:1}}
        .msg{animation:fadeUp 0.3s ease}
        .ctag{animation:slideIn 0.25s ease}
        button{font-family:inherit}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:2px}
      `}</style>

      {/* Nav */}
      <nav style={s.nav}>
        <button onClick={() => navigate("/app")} style={s.navBtn}>← {lang.flag} {lang.name}</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: `${levelColor}18`, border: `1px solid ${levelColor}44`, borderRadius: 20, padding: "4px 12px" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: levelColor, animation: "glow 2s infinite" }} />
            <span style={{ color: levelColor, fontSize: 11, fontWeight: 700 }}>{profile.levelLabel}</span>
            {leveled && <span style={{ color: "#FFE66D", fontSize: 10 }}>↑ Level up!</span>}
          </div>
          <button onClick={signOut} style={{ ...s.navBtn, fontSize: 11 }}>Sign out</button>
        </div>
      </nav>

      <div style={s.main}>
        <ProgressPanel profile={profile} levelColor={levelColor} />

        {/* Mic blocked warning */}
        {micBlocked && (
          <div style={s.warnBox}>
            <p style={{ color: "#FF6B6B", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>🎙️ Microphone permission denied</p>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 1.7 }}>
              Click the 🔒 icon in your browser's address bar → set Microphone to <strong>Allow</strong> → reload the page.
            </p>
            <button onClick={() => setMicBlocked(false)} style={s.dismissBtn}>Dismiss</button>
          </div>
        )}

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 11 }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} style={{
              padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 600,
              background: mode === m.id ? m.color : "rgba(255,255,255,0.07)",
              color: mode === m.id ? "#1a1a2e" : "rgba(255,255,255,0.5)",
              boxShadow: mode === m.id ? `0 3px 12px ${m.color}44` : "none",
              transition: "all 0.18s",
            }}>{m.label}</button>
          ))}
        </div>

        {/* Chat window */}
        <div style={s.chatWrap}>
          <div style={s.chatScroll}>
            {messages.map((msg, i) => (
              <div key={i} className="msg">
                <div style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 8, alignItems: "flex-end" }}>
                  {msg.role === "assistant" && (
                    <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: `linear-gradient(135deg,${levelColor},${levelColor}77)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🤖</div>
                  )}
                  <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ padding: "9px 13px", borderRadius: 14, borderBottomLeftRadius: msg.role === "assistant" ? 3 : 14, borderBottomRightRadius: msg.role === "user" ? 3 : 14, background: msg.role === "user" ? `linear-gradient(135deg,${activeMode.color}bb,${activeMode.color}55)` : "rgba(255,255,255,0.08)", color: "#fff", fontSize: 13, lineHeight: 1.65 }}>
                      {msg.content}
                    </div>
                    {msg.role === "assistant" && (
                      <button onClick={() => { stopSpeaking(); speak(msg.content); }} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.25)", fontSize: 11, padding: "2px 5px", textAlign: "left", transition: "color 0.2s", fontFamily: "inherit" }}
                        onMouseEnter={e => e.target.style.color = "rgba(255,255,255,0.65)"}
                        onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.25)"}>🔊 replay</button>
                    )}
                  </div>
                </div>
                {msg.role === "assistant" && msg.corrections?.length > 0 && (
                  <div className="ctag"><CorrectionCard corrections={msg.corrections} /></div>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg,${levelColor},${levelColor}77)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🤖</div>
                <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 14, borderBottomLeftRadius: 3, padding: "11px 14px" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: levelColor, animation: "bounce 1.2s infinite", animationDelay: `${i * 0.2}s` }} />)}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div style={s.inputBar}>
            <textarea
              value={recording ? (liveTranscript || "") : input}
              onChange={e => { if (!recording) setInput(e.target.value); }}
              onKeyDown={handleKey}
              readOnly={recording}
              placeholder={recording ? "🎙️ Listening — tap ⏹ to send..." : "Type or press 🎙️ to speak..."}
              rows={1}
              style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: `2px solid ${recording ? activeMode.color : "rgba(255,255,255,0.1)"}`, borderRadius: 10, padding: "8px 11px", color: recording ? "#aaffcc" : "#fff", fontSize: 13, resize: "none", fontFamily: "inherit", outline: "none", transition: "all 0.2s" }}
            />
            <button onClick={recording ? stopRecording : startRecording} disabled={loading || speaking}
              style={{ width: 44, height: 44, borderRadius: "50%", border: "none", cursor: "pointer", background: recording ? "linear-gradient(135deg,#FF6B6B,#cc2200)" : "rgba(255,255,255,0.09)", color: "#fff", fontSize: recording ? 12 : 18, flexShrink: 0, animation: recording ? "pulse 1.5s infinite" : "none", display: "flex", alignItems: "center", justifyContent: "center", opacity: (loading || speaking) ? 0.35 : 1, boxShadow: recording ? "0 0 0 3px rgba(255,107,107,0.35)" : "none", transition: "all 0.2s", fontWeight: 700 }}>
              {recording ? "⏹ Send" : "🎙️"}
            </button>
            <button onClick={() => sendMessage(input)} disabled={loading || !input.trim() || recording}
              style={{ height: 44, padding: "0 14px", borderRadius: 10, border: "none", cursor: "pointer", background: (input.trim() && !loading && !recording) ? activeMode.color : "rgba(255,255,255,0.07)", color: (input.trim() && !loading && !recording) ? "#1a1a2e" : "rgba(255,255,255,0.2)", fontWeight: 700, fontSize: 13, flexShrink: 0, transition: "all 0.2s" }}>
              Send ↑
            </button>
          </div>
        </div>

        {/* Speaking bar */}
        {speaking && (
          <div style={s.speakBar}>
            <Waveform active={true} color={levelColor} />
            <span style={{ color: levelColor, fontSize: 12, fontWeight: 600 }}>Fritz is speaking…</span>
            <button onClick={stopSpeaking} style={{ background: `${levelColor}22`, border: "none", color: levelColor, cursor: "pointer", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>Stop</button>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "radial-gradient(ellipse at 20% 0%,#1a0a2e,#080810 55%,#0a1220)", display: "flex", flexDirection: "column", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#fff" },
  nav: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", top: 0, background: "rgba(8,8,16,0.85)", backdropFilter: "blur(12px)", zIndex: 100 },
  navBtn: { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" },
  main: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 14px 24px", maxWidth: 700, margin: "0 auto", width: "100%" },
  chatWrap: { width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, display: "flex", flexDirection: "column", height: "52vh", overflow: "hidden" },
  chatScroll: { flex: 1, overflowY: "auto", padding: "13px 12px", display: "flex", flexDirection: "column", gap: 8 },
  inputBar: { padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 7, alignItems: "flex-end" },
  speakBar: { marginTop: 10, display: "flex", alignItems: "center", gap: 10, background: "rgba(255,107,107,0.07)", border: "1px solid rgba(255,107,107,0.2)", borderRadius: 30, padding: "6px 16px" },
  warnBox: { width: "100%", marginBottom: 12, background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.3)", borderRadius: 14, padding: "14px 16px" },
  dismissBtn: { marginTop: 10, background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.4)", fontSize: 11, padding: "4px 12px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit" },
};
