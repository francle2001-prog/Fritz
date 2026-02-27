import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";

export default function AuthPage({ mode = "login" }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState("");
  const [done, setDone]         = useState(false);
  const { signIn, signUp }      = useAuth();
  const navigate                = useNavigate();
  const isLogin                 = mode === "login";

  const submit = async () => {
    setError(""); setLoading(true);
    const { error: err } = isLogin
      ? await signIn(email, password)
      : await signUp(email, password);
    setLoading(false);
    if (err) { setError(err.message); return; }
    if (isLogin) navigate("/app");
    else setDone(true);
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <Link to="/" style={s.logo}>🎙️ Fritz</Link>
        <h1 style={s.title}>{isLogin ? "Welcome back" : "Start learning free"}</h1>
        <p style={s.sub}>{isLogin ? "Sign in to continue your progress." : "Create your account. No credit card needed."}</p>

        {done ? (
          <div style={s.successBox}>
            ✅ Check your email to confirm your account, then{" "}
            <Link to="/login" style={{ color: "#4ECDC4" }}>sign in</Link>.
          </div>
        ) : (
          <>
            <div style={s.field}>
              <label style={s.label}>Email</label>
              <input style={s.input} type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" onKeyDown={e => e.key === "Enter" && submit()} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Password</label>
              <input style={s.input} type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" onKeyDown={e => e.key === "Enter" && submit()} />
            </div>
            {error && <p style={s.error}>{error}</p>}
            <button style={{ ...s.btn, opacity: loading ? 0.6 : 1 }} onClick={submit} disabled={loading}>
              {loading ? "Please wait…" : isLogin ? "Sign in →" : "Create account →"}
            </button>
            <p style={s.switch}>
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <Link to={isLogin ? "/signup" : "/login"} style={{ color: "#4ECDC4" }}>
                {isLogin ? "Sign up free" : "Sign in"}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "radial-gradient(ellipse at 30% 0%,#1a0a2e,#080810)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Segoe UI', system-ui, sans-serif" },
  card: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 4 },
  logo: { fontSize: 20, fontWeight: 900, background: "linear-gradient(90deg,#FF6B6B,#FFE66D)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textDecoration: "none", marginBottom: 8 },
  title: { color: "#fff", fontSize: 24, fontWeight: 800, marginBottom: 4 },
  sub: { color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 20 },
  field: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 },
  label: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600 },
  input: { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "11px 14px", color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" },
  error: { color: "#FF6B6B", fontSize: 12, marginBottom: 4 },
  btn: { background: "linear-gradient(135deg,#FF6B6B,#ff8c42)", color: "#fff", border: "none", borderRadius: 10, padding: "13px", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 4 },
  switch: { color: "rgba(255,255,255,0.35)", fontSize: 13, textAlign: "center", marginTop: 12 },
  successBox: { background: "rgba(78,205,148,0.1)", border: "1px solid rgba(78,205,148,0.3)", borderRadius: 10, padding: "14px", color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 1.6 },
};
