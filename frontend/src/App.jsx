import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth.jsx";
import Landing from "./pages/Landing.jsx";
import AuthPage from "./pages/Auth.jsx";
import LanguageSelect from "./pages/LanguageSelect.jsx";
import TutorApp from "./pages/TutorApp.jsx";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight: "100vh", background: "#080810", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", fontFamily: "system-ui", fontSize: 14 }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/"        element={<Landing />} />
      <Route path="/login"   element={user ? <Navigate to="/app" /> : <AuthPage mode="login" />} />
      <Route path="/signup"  element={user ? <Navigate to="/app" /> : <AuthPage mode="signup" />} />
      <Route path="/app"     element={<Protected><LanguageSelect /></Protected>} />
      <Route path="/app/:langCode" element={<Protected><TutorApp /></Protected>} />
      <Route path="*"        element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/Fritz">
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
