import { useNavigate } from "react-router-dom";

const LANGUAGES = [
  { code: "de", flag: "🇩🇪", name: "German",     native: "Deutsch",    voice: "dCnu06FiOZma2KVNUoPZ", micLang: "de-DE" },
  { code: "fr", flag: "🇫🇷", name: "French",     native: "Français",   voice: "dCnu06FiOZma2KVNUoPZ", micLang: "fr-FR" },
  { code: "es", flag: "🇪🇸", name: "Spanish",    native: "Español",    voice: "dCnu06FiOZma2KVNUoPZ", micLang: "es-ES" },
  { code: "it", flag: "🇮🇹", name: "Italian",    native: "Italiano",   voice: "dCnu06FiOZma2KVNUoPZ", micLang: "it-IT" },
  { code: "ja", flag: "🇯🇵", name: "Japanese",   native: "日本語",       voice: "dCnu06FiOZma2KVNUoPZ", micLang: "ja-JP" },
  { code: "pt", flag: "🇧🇷", name: "Portuguese", native: "Português",  voice: "dCnu06FiOZma2KVNUoPZ", micLang: "pt-BR" },
];

export { LANGUAGES };

export default function LanguageSelect() {
  const navigate = useNavigate();

  const pick = (lang) => {
    navigate(`/app/${lang.code}`);
  };

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <div style={s.logo}>🎙️ Fritz</div>
        <h1 style={s.title}>What do you want to learn?</h1>
        <p style={s.sub}>Fritz will adapt to your level from your very first message.</p>
        <div style={s.grid}>
          {LANGUAGES.map(lang => (
            <button key={lang.code} style={s.card} onClick={() => pick(lang)}>
              <span style={s.flag}>{lang.flag}</span>
              <span style={s.name}>{lang.name}</span>
              <span style={s.native}>{lang.native}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "radial-gradient(ellipse at 30% 0%,#1a0a2e,#080810)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Segoe UI', system-ui, sans-serif" },
  inner: { textAlign: "center", maxWidth: 680, width: "100%" },
  logo: { fontSize: 22, fontWeight: 900, background: "linear-gradient(90deg,#FF6B6B,#FFE66D)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 24 },
  title: { color: "#fff", fontSize: "clamp(24px,4vw,36px)", fontWeight: 900, marginBottom: 10, letterSpacing: -0.5 },
  sub: { color: "rgba(255,255,255,0.4)", fontSize: 15, marginBottom: 36 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 },
  card: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: "28px 16px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "all 0.2s", color: "#fff", fontFamily: "inherit" },
  flag: { fontSize: 40 },
  name: { fontWeight: 700, fontSize: 15 },
  native: { color: "rgba(255,255,255,0.35)", fontSize: 12 },
};
