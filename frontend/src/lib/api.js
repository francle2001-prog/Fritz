const API = import.meta.env.VITE_API_URL;

async function getToken() {
  const { data: { session } } = await import("./supabase.js").then(m => m.supabase.auth.getSession());
  return session?.access_token;
}

export async function chat(messages, systemPrompt) {
  const token = await getToken();
  const res = await fetch(`${API}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, systemPrompt }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function speak(text) {
  const token = await getToken();
  const res = await fetch(`${API}/api/speak`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("TTS failed");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function saveProgress(profile) {
  const token = await getToken();
  await fetch(`${API}/api/progress`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ profile }),
  });
}

export async function loadProgress() {
  const token = await getToken();
  const res = await fetch(`${API}/api/progress`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const { profile } = await res.json();
  return profile;
}
