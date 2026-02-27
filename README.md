# 🎙️ Fritz — Adaptive Voice Language Tutor

> The AI tutor that detects your level, corrects you in real time, and adapts every session to exactly where you are.

---

## Architecture

```
GitHub Pages (frontend)  ←→  Railway (backend)  ←→  Supabase (auth + database)
                                    ↕                        ↕
                              Anthropic API           User profiles
                              ElevenLabs TTS
```

---

## Step-by-Step Deployment

### 1. Set up Supabase (free)

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Once created, go to **SQL Editor** and run this:

```sql
create table user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  profile jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- Only the owner can read/write their profile
alter table user_profiles enable row level security;

create policy "Users can manage their own profile"
  on user_profiles for all
  using (auth.uid() = user_id);
```

3. Go to **Settings → API** and copy:
   - `Project URL` → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_KEY` (backend only — never expose this)

4. Go to **Authentication → URL Configuration** and set:
   - Site URL: `https://yourusername.github.io/fritz`
   - Redirect URLs: `https://yourusername.github.io/fritz/*`

---

### 2. Deploy the Backend to Railway (free tier)

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub**
2. Select this repo, set the **Root Directory** to `backend`
3. Add these environment variables in Railway's dashboard:

```
ANTHROPIC_API_KEY=sk-ant-your-key
ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_VOICE_ID=dCnu06FiOZma2KVNUoPZ
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
FRONTEND_URL=https://yourusername.github.io
PORT=3001
```

4. Railway will give you a URL like `https://fritz-backend-production.up.railway.app` — **save this**.

---

### 3. Deploy the Frontend to GitHub Pages

1. Push this entire repo to GitHub
2. Go to your repo → **Settings → Pages**
   - Source: **GitHub Actions**
3. Go to **Settings → Secrets and Variables → Actions** and add:
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — your Supabase anon key
   - `VITE_API_URL` — your Railway backend URL (from step 2)
4. In `frontend/vite.config.js`, change `base: "/fritz/"` to match your repo name
5. In `frontend/src/App.jsx`, change `basename="/fritz"` to match your repo name
6. Push to `main` — GitHub Actions will build and deploy automatically ✅

Your site will be live at: `https://yourusername.github.io/fritz`

---

### 4. Local Development

**Backend:**
```bash
cd backend
cp .env.example .env   # fill in your values
npm install
npm run dev            # runs on localhost:3001
```

**Frontend:**
```bash
cd frontend
cp .env.example .env.local   # fill in your values
# Set VITE_API_URL=http://localhost:3001
npm install
npm run dev                   # runs on localhost:5173
```

---

## Environment Variables Reference

### Backend (`backend/.env`)
| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key — never exposed to browser |
| `ELEVENLABS_API_KEY` | Your ElevenLabs API key — never exposed to browser |
| `ELEVENLABS_VOICE_ID` | Voice ID (default: Fritz's voice) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (admin access) |
| `FRONTEND_URL` | Your GitHub Pages URL (for CORS) |

### Frontend (`frontend/.env.local`)
| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (safe for browser) |
| `VITE_API_URL` | Your Railway backend URL |

---

## Project Structure

```
fritz-web/
├── .github/
│   └── workflows/
│       └── deploy.yml          # Auto-deploy to GitHub Pages on push
├── backend/
│   ├── src/
│   │   └── index.js            # Express server — proxies Claude + ElevenLabs
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── hooks/
    │   │   └── useAuth.jsx     # Supabase auth context
    │   ├── lib/
    │   │   ├── supabase.js     # Supabase client
    │   │   └── api.js          # Backend API calls
    │   ├── pages/
    │   │   ├── Landing.jsx     # Marketing landing page
    │   │   ├── Auth.jsx        # Login + signup
    │   │   ├── LanguageSelect.jsx
    │   │   └── TutorApp.jsx    # Main tutor interface
    │   ├── App.jsx             # Router
    │   └── main.jsx
    ├── index.html
    ├── vite.config.js
    └── .env.example
```

---

## Adding More Languages

In `frontend/src/pages/LanguageSelect.jsx`, add to the `LANGUAGES` array:
```js
{ code: "ko", flag: "🇰🇷", name: "Korean", native: "한국어", voice: "YOUR_VOICE_ID", micLang: "ko-KR" },
```

To use a different ElevenLabs voice per language, update `ELEVENLABS_VOICE_ID` logic in `backend/src/index.js` to accept a `voiceId` from the request body.
