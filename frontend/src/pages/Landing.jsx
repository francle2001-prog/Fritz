import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";

const LANGUAGES = [
  { flag: "🇩🇪", name: "German" },
  { flag: "🇫🇷", name: "French" },
  { flag: "🇪🇸", name: "Spanish" },
  { flag: "🇮🇹", name: "Italian" },
  { flag: "🇯🇵", name: "Japanese" },
  { flag: "🇧🇷", name: "Portuguese" },
];

const FEATURES = [
  { icon: "🧠", title: "Detects Your Level", desc: "Fritz listens to how you speak and instantly adapts — from absolute beginner to near-fluent." },
  { icon: "✅", title: "Real-Time Corrections", desc: "Every grammar mistake gets caught and explained inline, right as you make it." },
  { icon: "🎙️", title: "Full Voice Conversation", desc: "Speak naturally. Fritz hears you, responds out loud, and coaches your pronunciation." },
  { icon: "📈", title: "Tracks Your Growth", desc: "Your level, vocabulary, strengths and weak spots are tracked across every session." },
  { icon: "🎭", title: "Roleplay Scenarios", desc: "Practice real situations — ordering food, job interviews, travel — in a safe space." },
  { icon: "🌍", title: "6 Languages", desc: "German, French, Spanish, Italian, Japanese, Portuguese — with more coming." },
];

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={s.page}>
      {/* Nav */}
      <nav style={s.nav}>
        <div style={s.logo}>🎙️ Fritz</div>
        <div style={{ display: "flex", gap: 12 }}>
          {user ? (
            <button style={s.btnPrimary} onClick={() => navigate("/app")}>Open App →</button>
          ) : (
            <>
              <button style={s.btnGhost} onClick={() => navigate("/login")}>Sign in</button>
              <button style={s.btnPrimary} onClick={() => navigate("/signup")}>Get started free</button>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section style={s.hero}>
        <div style={s.heroGlow} />
        <div style={s.langPills}>
          {LANGUAGES.map(l => (
            <span key={l.name} style={s.pill}>{l.flag} {l.name}</span>
          ))}
        </div>
        <h1 style={s.heroTitle}>
          The AI tutor that<br />
          <span style={s.gradient}>actually listens.</span>
        </h1>
        <p style={s.heroSub}>
          Fritz detects your language level in real time, corrects your speech as you go,
          and adapts every lesson to exactly where you are. No apps. No flashcard grinding. Just conversation.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={{ ...s.btnPrimary, fontSize: 16, padding: "14px 32px" }}
            onClick={() => navigate(user ? "/app" : "/signup")}>
            Start learning free →
          </button>
          <button style={{ ...s.btnGhost, fontSize: 16, padding: "14px 32px" }}
            onClick={() => document.getElementById("features").scrollIntoView({ behavior: "smooth" })}>
            See how it works
          </button>
        </div>
        <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 16 }}>
          No credit card required · Works in your browser
        </p>
      </section>

      {/* Features */}
      <section id="features" style={s.section}>
        <h2 style={s.sectionTitle}>Everything a great tutor does — at any hour</h2>
        <div style={s.featureGrid}>
          {FEATURES.map(f => (
            <div key={f.title} style={s.featureCard}>
              <div style={s.featureIcon}>{f.icon}</div>
              <h3 style={s.featureTitle}>{f.title}</h3>
              <p style={s.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ ...s.section, background: "rgba(255,255,255,0.02)", borderRadius: 24, padding: "60px 40px" }}>
        <h2 style={s.sectionTitle}>How it works</h2>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center", maxWidth: 800, margin: "0 auto" }}>
          {[
            { step: "1", title: "Sign up free", desc: "Create your account in seconds. No payment details needed." },
            { step: "2", title: "Pick a language", desc: "Choose from 6 languages. Fritz asks why you're learning — and remembers." },
            { step: "3", title: "Just talk", desc: "Speak or type. Fritz calibrates to your level from your very first message." },
            { step: "4", title: "Watch yourself grow", desc: "Your level, vocabulary and progress are tracked across every session." },
          ].map(item => (
            <div key={item.step} style={s.stepCard}>
              <div style={s.stepNum}>{item.step}</div>
              <h3 style={{ color: "#fff", fontWeight: 700, marginBottom: 8, fontSize: 16 }}>{item.title}</h3>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, lineHeight: 1.6 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ ...s.section, textAlign: "center", paddingBottom: 80 }}>
        <h2 style={{ ...s.sectionTitle, marginBottom: 16 }}>Ready to actually learn?</h2>
        <p style={{ color: "rgba(255,255,255,0.4)", marginBottom: 32, fontSize: 15 }}>
          Join thousands of learners having real conversations from day one.
        </p>
        <button style={{ ...s.btnPrimary, fontSize: 16, padding: "14px 36px" }}
          onClick={() => navigate(user ? "/app" : "/signup")}>
          Start for free →
        </button>
      </section>

      {/* Footer */}
      <footer style={s.footer}>
        <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>🎙️ Fritz — Adaptive Voice Language Tutor</span>
      </footer>

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
      `}</style>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "radial-gradient(ellipse at 30% 0%, #1a0a2e 0%, #080810 60%)", color: "#fff", fontFamily: "'Segoe UI', system-ui, sans-serif" },
  nav: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", top: 0, background: "rgba(8,8,16,0.85)", backdropFilter: "blur(12px)", zIndex: 100 },
  logo: { fontSize: 20, fontWeight: 900, background: "linear-gradient(90deg,#FF6B6B,#FFE66D)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  hero: { textAlign: "center", padding: "80px 20px 60px", position: "relative", overflow: "hidden" },
  heroGlow: { position: "absolute", top: "-40%", left: "50%", transform: "translateX(-50%)", width: 600, height: 600, background: "radial-gradient(circle, rgba(138,70,255,0.15) 0%, transparent 70%)", pointerEvents: "none" },
  heroTitle: { fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 20, letterSpacing: -2, animation: "fadeUp 0.6s ease" },
  gradient: { background: "linear-gradient(90deg,#FF6B6B,#FFE66D,#4ECDC4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  heroSub: { color: "rgba(255,255,255,0.5)", fontSize: "clamp(15px,2vw,18px)", maxWidth: 560, margin: "0 auto 36px", lineHeight: 1.7 },
  langPills: { display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 32 },
  pill: { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "5px 12px", fontSize: 13, color: "rgba(255,255,255,0.6)" },
  section: { maxWidth: 1100, margin: "0 auto", padding: "60px 20px" },
  sectionTitle: { textAlign: "center", fontSize: "clamp(22px,3vw,32px)", fontWeight: 800, marginBottom: 40, letterSpacing: -0.5 },
  featureGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 },
  featureCard: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "28px 24px", transition: "transform 0.2s, border-color 0.2s", cursor: "default" },
  featureIcon: { fontSize: 32, marginBottom: 14 },
  featureTitle: { fontSize: 16, fontWeight: 700, marginBottom: 8 },
  featureDesc: { color: "rgba(255,255,255,0.45)", fontSize: 13, lineHeight: 1.7 },
  stepCard: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "24px", flex: "1 1 160px", maxWidth: 200, textAlign: "center" },
  stepNum: { width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#FF6B6B,#FFE66D)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, margin: "0 auto 14px", color: "#1a1a2e" },
  btnPrimary: { background: "linear-gradient(135deg,#FF6B6B,#ff8c42)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "opacity 0.2s" },
  btnGhost: { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 22px", fontWeight: 600, fontSize: 14, cursor: "pointer" },
  footer: { textAlign: "center", padding: "24px", borderTop: "1px solid rgba(255,255,255,0.06)" },
};
