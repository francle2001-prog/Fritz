import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import { chat, speak as ttsSpeak, saveProgress, loadProgress } from "../lib/api.js";
import { LANGUAGES } from "./LanguageSelect.jsx";

const LEVEL_LABELS = ["Absolute Beginner","Absolute Beginner","Beginner","A1 Elementary","A1 Elementary","A2 Pre-Intermediate","A2 Pre-Intermediate","B1 Intermediate","B1 Intermediate","B2 Upper-Intermediate","B2+ Advanced"];
const LEVEL_COLORS = ["#6b7280","#6b7280","#f87171","#fb923c","#f59e0b","#eab308","#84cc16","#22d3ee","#2dd4bf","#60a5fa","#a78bfa"];
const MODES = [
  { id:"CHAT",      label:"💬 Conversation", color:"#f87171" },
  { id:"FLASHCARD", label:"🃏 Vocabulary",   color:"#22d3ee" },
  { id:"GRAMMAR",   label:"📚 Grammar",      color:"#eab308" },
  { id:"SCENARIO",  label:"🎭 Roleplay",     color:"#a78bfa" },
];
const DEFAULT_PROFILE = {
  level:3, levelLabel:"A1 Elementary", confidence:5,
  sessions:0, strengths:[], weaknesses:[],
  masteredWords:[], strugglingWords:[],
  style:null, summary:"", mode:"CHAT",
};

// Voice state machine: IDLE → LISTENING → THINKING → SPEAKING → LISTENING
const VS = { IDLE:"idle", LISTENING:"listening", THINKING:"thinking", SPEAKING:"speaking" };

const buildSystemPrompt = (profile, lang) => `
You are Fritz, a warm, witty, deeply attentive ${lang.name} tutor with a real personality.
You are teaching ${lang.name} (${lang.native}).

LEARNER PROFILE:
- Level: ${profile.level}/10 (${profile.levelLabel})
- Confidence: ${profile.confidence}/10
- Sessions: ${profile.sessions}
- Strong Areas: ${profile.strengths.join(", ")||"still discovering"}
- Weak Areas: ${profile.weaknesses.join(", ")||"still discovering"}
- Words Mastered: ${profile.masteredWords.slice(-8).join(", ")||"none yet"}
- Struggling With: ${profile.strugglingWords.slice(-5).join(", ")||"none yet"}

ADAPTATION BY LEVEL:
- 0-2: Mostly English. 1-2 ${lang.name} words per reply. Extremely encouraging.
- 3-4: Mix English/${lang.name} 50/50. Present tense. Celebrate every win.
- 5-6: Lean ${lang.name}, English support. Introduce past tense. Warm corrections.
- 7-8: Mostly ${lang.name}. Full sentences. Point out nuance.
- 9-10: Full ${lang.name}. Complex topics. Treat as near-peer.

CORRECTION FORMAT (only when user makes a ${lang.name} error):
[CORRECTION: "what they said" -> "correct form" | why: brief reason]
Max 2 corrections. Never shame. Frame as a gift.

ASSESSMENT (append silently after every reply):
[ASSESS: level=X | confidence=Y | strength=topic | weakness=topic | new_word=word | struggling=word]
Only include fields you genuinely detected.

PERSONALITY:
- Genuinely curious about this person's life
- Reference ${lang.name}-speaking culture naturally
- Celebrate wins authentically, not robotically
- Get gentler when they struggle, without being condescending
- Dry humor, occasional ${lang.name} puns

CRITICAL SPEECH RULES — replies are spoken aloud via text-to-speech:
- Natural spoken language ONLY. No asterisks, dashes, bullet points, markdown, or symbols.
- Maximum 3 sentences unless explaining a grammar concept.
- CORRECTION and ASSESS tags are parsed silently — never read aloud.
- Never start two consecutive replies the same way.
- Sound like a real person, not a chatbot.

Current mode: ${profile.mode}
`;

function parseFritzReply(raw, profile) {
  let spoken = raw;
  const corrections = [];
  const corrRegex = /\[CORRECTION:\s*"([^"]+)"\s*->\s*"([^"]+)"\s*\|\s*why:\s*([^\]]+)\]/g;
  let m;
  while ((m=corrRegex.exec(raw))!==null) corrections.push({original:m[1],correct:m[2],reason:m[3].trim()});
  spoken = spoken.replace(corrRegex,"").trim();
  const profileUpdates = {...profile};
  const am = /\[ASSESS:\s*([^\]]+)\]/.exec(raw);
  if (am) {
    const p=am[1];
    const lvl=p.match(/level=(\d+(?:\.\d+)?)/);
    const conf=p.match(/confidence=(\d+(?:\.\d+)?)/);
    const str=p.match(/strength=([^|,\]]+)/);
    const weak=p.match(/weakness=([^|,\]]+)/);
    const nw=p.match(/new_word=([^|,\]]+)/);
    const sw=p.match(/struggling=([^|,\]]+)/);
    if(lvl){const nl=Math.round(parseFloat(lvl[1]));profileUpdates.level=Math.max(0,Math.min(10,Math.round((profile.level*3+nl)/4)));profileUpdates.levelLabel=LEVEL_LABELS[profileUpdates.level];}
    if(conf)profileUpdates.confidence=Math.round((profile.confidence*2+parseFloat(conf[1]))/3);
    if(str){const s=str[1].trim();if(s&&!profileUpdates.strengths.includes(s))profileUpdates.strengths=[...profileUpdates.strengths.slice(-4),s];}
    if(weak){const w=weak[1].trim();if(w&&!profileUpdates.weaknesses.includes(w))profileUpdates.weaknesses=[...profileUpdates.weaknesses.slice(-4),w];}
    if(nw){const word=nw[1].trim();if(word&&!profileUpdates.masteredWords.includes(word))profileUpdates.masteredWords=[...profileUpdates.masteredWords.slice(-19),word];}
    if(sw){const word=sw[1].trim();if(word&&!profileUpdates.strugglingWords.includes(word))profileUpdates.strugglingWords=[...profileUpdates.strugglingWords.slice(-9),word];}
  }
  spoken=spoken.replace(/\[ASSESS:[^\]]+\]/g,"").trim();
  return {spoken,corrections,profileUpdates};
}

// ── Fritz Avatar ──────────────────────────────────────────────────────────────
function FritzAvatar({voiceState,levelColor}) {
  const isSpeaking  = voiceState===VS.SPEAKING;
  const isListening = voiceState===VS.LISTENING;
  const isThinking  = voiceState===VS.THINKING;
  const [mouthOpen, setMouthOpen] = useState(false);

  useEffect(()=>{
    if (!isSpeaking) { setMouthOpen(false); return; }
    const iv = setInterval(()=>setMouthOpen(o=>!o), 180);
    return ()=>clearInterval(iv);
  },[isSpeaking]);

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,padding:"20px 0 12px"}}>
      <div style={{position:"relative",width:110,height:110}}>
        {/* Spinning ring when speaking */}
        {isSpeaking&&(
          <div style={{position:"absolute",inset:-5,borderRadius:"50%",border:`2px solid transparent`,backgroundImage:`conic-gradient(${levelColor},transparent,${levelColor})`,backgroundOrigin:"border-box",animation:"spin 1.8s linear infinite",opacity:0.7}}/>
        )}
        {/* Pulse ring when listening */}
        {isListening&&(
          <div style={{position:"absolute",inset:-8,borderRadius:"50%",border:`2px solid ${levelColor}`,animation:"listenPulse 1.4s ease-in-out infinite"}}/>
        )}
        {/* Face */}
        <div style={{
          position:"relative",width:110,height:110,borderRadius:"50%",
          background:"linear-gradient(145deg,#1e2d3d,#0d1825)",
          border:`2px solid ${levelColor}55`,
          display:"flex",alignItems:"center",justifyContent:"center",
          overflow:"hidden",zIndex:1,
          boxShadow:`0 0 24px ${levelColor}22,inset 0 0 20px rgba(0,0,0,0.6)`,
        }}>
          <svg width="74" height="74" viewBox="0 0 80 80" fill="none">
            {/* Head */}
            <ellipse cx="40" cy="40" rx="26" ry="28" fill="#c8956c"/>
            {/* Hair */}
            <ellipse cx="40" cy="16" rx="26" ry="11" fill="#3b2314"/>
            <rect x="14" y="16" width="52" height="10" fill="#3b2314"/>
            <ellipse cx="40" cy="24" rx="20" ry="7" fill="#c8956c"/>
            {/* Eyes */}
            <ellipse cx="29" cy="37" rx="5" ry="5.5" fill="white"/>
            <ellipse cx="51" cy="37" rx="5" ry="5.5" fill="white"/>
            <ellipse cx="30" cy="38" rx="3" ry="3.5" fill="#1a0f0a"/>
            <ellipse cx="52" cy="38" rx="3" ry="3.5" fill="#1a0f0a"/>
            <circle cx="31" cy="36.5" r="1" fill="white"/>
            <circle cx="53" cy="36.5" r="1" fill="white"/>
            {/* Eyebrows */}
            <path d="M23 30 Q29 27 35 29" stroke="#3b2314" strokeWidth="2" strokeLinecap="round"/>
            <path d="M45 29 Q51 27 57 30" stroke="#3b2314" strokeWidth="2" strokeLinecap="round"/>
            {/* Nose */}
            <path d="M37 44 Q40 48 43 44" stroke="#a8734a" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            <ellipse cx="36.5" cy="47" rx="2" ry="1.2" fill="#a8734a"/>
            <ellipse cx="43.5" cy="47" rx="2" ry="1.2" fill="#a8734a"/>
            {/* Mouth */}
            {mouthOpen
              ? <ellipse cx="40" cy="57" rx="7" ry="4" fill="#7b2d2d"/>
              : <path d="M33 55 Q40 59 47 55" stroke="#7b2d2d" strokeWidth="2" strokeLinecap="round" fill="none"/>
            }
            {/* Ears */}
            <ellipse cx="14" cy="40" rx="3.5" ry="5" fill="#c8956c"/>
            <ellipse cx="66" cy="40" rx="3.5" ry="5" fill="#c8956c"/>
            {/* Shirt collar */}
            <path d="M22 70 Q40 74 58 70 L63 80 L17 80 Z" fill="#1d4ed8"/>
            <path d="M36 70 L40 77 L44 70" fill="white"/>
          </svg>
        </div>
        {/* Thinking dots */}
        {isThinking&&(
          <div style={{position:"absolute",bottom:-2,right:-2,background:"#111827",border:`1.5px solid ${levelColor}44`,borderRadius:16,padding:"3px 8px",display:"flex",gap:3}}>
            {[0,1,2].map(i=><div key={i} style={{width:4,height:4,borderRadius:"50%",background:levelColor,animation:"bounce 1.2s infinite",animationDelay:`${i*0.2}s`}}/>)}
          </div>
        )}
      </div>

      {/* Status */}
      <div style={{display:"flex",alignItems:"center",gap:7,background:"rgba(255,255,255,0.04)",borderRadius:20,padding:"5px 14px",border:`1px solid ${levelColor}22`}}>
        <div style={{width:6,height:6,borderRadius:"50%",background:levelColor,animation:(isSpeaking||isListening)?"glow 0.8s infinite":"none"}}/>
        <span style={{color:levelColor,fontSize:12,fontWeight:600}}>
          {isSpeaking?"Fritz is speaking…":isListening?"Listening…":isThinking?"Thinking…":"Fritz"}
        </span>
        {isSpeaking&&(
          <div style={{display:"flex",gap:2,alignItems:"center"}}>
            {[0,1,2,3,4].map((_,i)=>(
              <div key={i} style={{width:3,borderRadius:2,background:levelColor,animation:"wave 0.7s ease-in-out infinite",animationDelay:`${i*0.1}s`,minHeight:2,maxHeight:12}}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CorrectionCard({corrections}) {
  if (!corrections.length) return null;
  return (
    <div style={{margin:"4px 0 2px 44px",background:"rgba(234,179,8,0.05)",border:"1px solid rgba(234,179,8,0.18)",borderRadius:10,padding:"8px 12px",display:"flex",flexDirection:"column",gap:5}}>
      <div style={{color:"rgba(234,179,8,0.55)",fontSize:9,fontWeight:800,textTransform:"uppercase",letterSpacing:1.2,marginBottom:1}}>Correction</div>
      {corrections.map((c,i)=>(
        <div key={i} style={{fontSize:13,lineHeight:1.5}}>
          <span style={{color:"rgba(248,113,113,0.85)",textDecoration:"line-through"}}>{c.original}</span>
          <span style={{color:"rgba(255,255,255,0.25)",margin:"0 8px"}}>→</span>
          <span style={{color:"#6ee7b7",fontWeight:600}}>{c.correct}</span>
          <span style={{color:"rgba(255,255,255,0.28)",marginLeft:8,fontSize:11}}>· {c.reason}</span>
        </div>
      ))}
    </div>
  );
}

function ProgressPanel({profile,levelColor}) {
  const [open,setOpen]=useState(false);
  return (
    <div style={{width:"100%",marginBottom:10}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"7px 14px",cursor:"pointer",color:"rgba(255,255,255,0.38)",fontSize:12,display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:"inherit"}}>
        <span style={{display:"flex",alignItems:"center",gap:8}}>
          <span>📊 Progress</span>
          <span style={{background:`${levelColor}18`,color:levelColor,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{profile.levelLabel}</span>
        </span>
        <span>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderTop:"none",borderRadius:"0 0 10px 10px",padding:14,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{gridColumn:"1/-1"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{color:"rgba(255,255,255,0.35)",fontSize:11}}>Level {profile.level}/10</span>
              <span style={{color:levelColor,fontSize:11,fontWeight:700}}>{profile.levelLabel}</span>
            </div>
            <div style={{height:5,background:"rgba(255,255,255,0.06)",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${profile.level*10}%`,background:`linear-gradient(90deg,${levelColor},${levelColor}77)`,borderRadius:3,transition:"width 0.6s ease"}}/>
            </div>
          </div>
          <div>
            <div style={{color:"rgba(255,255,255,0.35)",fontSize:11,marginBottom:4}}>Confidence</div>
            <div style={{display:"flex",gap:2}}>
              {Array.from({length:10}).map((_,i)=>(
                <div key={i} style={{flex:1,height:5,borderRadius:2,background:i<profile.confidence?"#22d3ee":"rgba(255,255,255,0.06)",transition:"background 0.3s"}}/>
              ))}
            </div>
          </div>
          <div>
            <div style={{color:"rgba(255,255,255,0.35)",fontSize:11,marginBottom:3}}>Sessions</div>
            <div style={{color:"#fff",fontSize:22,fontWeight:800}}>{profile.sessions}</div>
          </div>
          {profile.strengths.length>0&&(<div><div style={{color:"rgba(255,255,255,0.35)",fontSize:11,marginBottom:5}}>✅ Strong At</div><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{profile.strengths.map((s,i)=><span key={i} style={{background:"rgba(34,211,238,0.08)",color:"#22d3ee",fontSize:10,padding:"2px 8px",borderRadius:10}}>{s}</span>)}</div></div>)}
          {profile.weaknesses.length>0&&(<div><div style={{color:"rgba(255,255,255,0.35)",fontSize:11,marginBottom:5}}>🎯 Working On</div><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{profile.weaknesses.map((w,i)=><span key={i} style={{background:"rgba(248,113,113,0.08)",color:"#f87171",fontSize:10,padding:"2px 8px",borderRadius:10}}>{w}</span>)}</div></div>)}
          {profile.masteredWords.length>0&&(<div style={{gridColumn:"1/-1"}}><div style={{color:"rgba(255,255,255,0.35)",fontSize:11,marginBottom:5}}>📖 Vocabulary ({profile.masteredWords.length})</div><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{profile.masteredWords.slice(-16).map((w,i)=><span key={i} style={{background:"rgba(234,179,8,0.08)",color:"#eab308",fontSize:10,padding:"2px 8px",borderRadius:10}}>{w}</span>)}</div></div>)}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function TutorApp() {
  const {langCode="de"}=useParams();
  const navigate=useNavigate();
  const {user,signOut}=useAuth();
  const lang=LANGUAGES.find(l=>l.code===langCode)||LANGUAGES[0];

  const [voiceState,setVoiceStateRaw]=useState(VS.IDLE);
  const [muted,setMuted]=useState(false);
  const [messages,setMessages]=useState([]);
  const [rawHistory,setRawHistory]=useState([]);
  const [input,setInput]=useState("");
  const [liveTranscript,setLiveTranscript]=useState("");
  const [mode,setMode]=useState("CHAT");
  const [profile,setProfile]=useState(DEFAULT_PROFILE);
  const [profileLoaded,setProfileLoaded]=useState(false);
  const [leveled,setLeveled]=useState(false);
  const [micBlocked,setMicBlocked]=useState(false);
  const [micGranted,setMicGranted]=useState(false);

  const bottomRef=useRef(null);
  const recognitionRef=useRef(null);
  const currentAudioRef=useRef(null);
  const finalTextRef=useRef("");
  const shouldListenRef=useRef(false);
  const saveTimerRef=useRef(null);
  const vsRef=useRef(VS.IDLE);
  const mutedRef=useRef(false);
  const micGrantedRef=useRef(false);
  const profileRef=useRef(DEFAULT_PROFILE);
  const modeRef=useRef("CHAT");
  const rawHistoryRef=useRef([]);
  const langRef=useRef(lang);

  // Keep refs in sync
  const setVS=(s)=>{vsRef.current=s;setVoiceStateRaw(s);};
  useEffect(()=>{mutedRef.current=muted;},[muted]);
  useEffect(()=>{profileRef.current=profile;},[profile]);
  useEffect(()=>{modeRef.current=mode;},[mode]);
  useEffect(()=>{rawHistoryRef.current=rawHistory;},[rawHistory]);
  useEffect(()=>{langRef.current=lang;},[lang]);
  useEffect(()=>{micGrantedRef.current=micGranted;},[micGranted]);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages,voiceState]);

  useEffect(()=>{
    loadProgress().then(saved=>{setProfile(saved||DEFAULT_PROFILE);setProfileLoaded(true);});
  },[]);

  useEffect(()=>{
    if(!profileLoaded)return;
    const isNew=profile.sessions===0;
    const intro=isNew
      ?`Hallo! I'm Fritz, your personal ${lang.name} tutor. I'll adapt to exactly where you are — just talk to me naturally. Tap the microphone button to go fully hands-free. So, why do you want to learn ${lang.name}?`
      :`Willkommen zurück! You're at level ${profile.level} — ${profile.levelLabel}. ${profile.masteredWords.length>0?`You've built up ${profile.masteredWords.length} words.`:"Let's keep going."} Ready?`;
    setMessages([{role:"assistant",content:intro,corrections:[]}]);
    setRawHistory([{role:"assistant",content:intro}]);
    rawHistoryRef.current=[{role:"assistant",content:intro}];
  },[profileLoaded,langCode]);

  // ── Speech Recognition ───────────────────────────────────────────────────
  const spawnRecognition=useCallback(()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR)return;
    const rec=new SR();
    const p=profileRef.current;
    // Use target language when level is sufficient, otherwise accept English
    // Using two separate recognizers with different langs is not possible in Web Speech API,
    // so we pick the most useful one: target lang at level 4+, English below
    rec.lang=p.level>=4?langRef.current.micLang:"en-US";
    rec.interimResults=true;
    rec.continuous=true;
    rec.maxAlternatives=1;
    recognitionRef.current=rec;

    rec.onresult=(e)=>{
      let interim="";
      for(let i=e.resultIndex;i<e.results.length;i++){
        const t=e.results[i][0].transcript;
        if(e.results[i].isFinal)finalTextRef.current+=(finalTextRef.current?" ":"")+t.trim();
        else interim+=t;
      }
      setLiveTranscript((finalTextRef.current+(interim?" "+interim:"")).trim());
    };

    rec.onerror=(e)=>{
      if(e.error==="no-speech"||e.error==="aborted")return;
      console.warn("SR:",e.error);
      if(e.error==="not-allowed"){setMicBlocked(true);shouldListenRef.current=false;setVS(VS.IDLE);}
    };

    rec.onend=()=>{
      if(shouldListenRef.current&&vsRef.current===VS.LISTENING){
        try{spawnRecognition();}catch(_){}
      }
    };
    try{rec.start();}catch(e){console.warn(e);}
  },[]);

  const startListening=useCallback(async()=>{
    if(!micGrantedRef.current){
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        stream.getTracks().forEach(t=>t.stop());
        setMicGranted(true);
        micGrantedRef.current=true;
      }catch(err){
        if(err.name==="NotAllowedError"||err.name==="PermissionDeniedError")setMicBlocked(true);
        else alert("Microphone error: "+err.message);
        return;
      }
    }
    finalTextRef.current="";
    shouldListenRef.current=true;
    setLiveTranscript("");
    setVS(VS.LISTENING);
    spawnRecognition();
  },[spawnRecognition]);

  const stopListeningAndSend=useCallback(()=>{
    shouldListenRef.current=false;
    try{recognitionRef.current?.stop();}catch(_){}
    const text=finalTextRef.current.trim();
    finalTextRef.current="";
    setLiveTranscript("");
    if(text){
      sendMessageInternal(text);
    }else{
      setVS(VS.IDLE);
    }
  },[]);

  // ── TTS ──────────────────────────────────────────────────────────────────
  const stopAudio=useCallback(()=>{
    if(currentAudioRef.current){currentAudioRef.current.pause();currentAudioRef.current=null;}
  },[]);

  const speakText=useCallback(async(text,thenListen=false)=>{
    if(mutedRef.current)return;
    stopAudio();
    setVS(VS.SPEAKING);
    try{
      const url=await ttsSpeak(text);
      const audio=new Audio(url);
      currentAudioRef.current=audio;
      audio.onended=()=>{
        URL.revokeObjectURL(url);
        currentAudioRef.current=null;
        if(thenListen&&micGrantedRef.current&&!mutedRef.current){
          startListening();
        }else{
          setVS(VS.IDLE);
        }
      };
      audio.onerror=()=>setVS(VS.IDLE);
      audio.play();
    }catch(e){console.error(e);setVS(VS.IDLE);}
  },[stopAudio,startListening]);

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessageInternal=useCallback(async(text)=>{
    const clean=text.trim();
    if(!clean)return;
    shouldListenRef.current=false;
    try{recognitionRef.current?.stop();}catch(_){}
    setInput("");setLiveTranscript("");

    const userMsg={role:"user",content:clean,corrections:[]};
    const apiMsg={role:"user",content:`[MODE: ${modeRef.current}]\n${clean}`};
    setMessages(prev=>[...prev,userMsg]);
    const newRaw=[...rawHistoryRef.current,apiMsg];
    setRawHistory(newRaw);
    rawHistoryRef.current=newRaw;
    setVS(VS.THINKING);

    try{
      const data=await chat(newRaw,buildSystemPrompt({...profileRef.current,mode:modeRef.current},langRef.current));
      const raw=data.content?.map(b=>b.text||"").join("")||"Entschuldigung, something went wrong!";
      const{spoken,corrections,profileUpdates}=parseFritzReply(raw,profileRef.current);
      const didLevelUp=profileUpdates.level>profileRef.current.level;
      if(didLevelUp){setLeveled(true);setTimeout(()=>setLeveled(false),2500);}
      const updated={...profileUpdates,sessions:profileRef.current.sessions+(profileRef.current.sessions===0?1:0),mode:modeRef.current};
      setProfile(updated);
      profileRef.current=updated;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current=setTimeout(()=>saveProgress(updated),3000);
      const assistantMsg={role:"assistant",content:spoken,corrections};
      setMessages(prev=>[...prev,assistantMsg]);
      const newRawWithReply=[...newRaw,{role:"assistant",content:raw}];
      setRawHistory(newRawWithReply);
      rawHistoryRef.current=newRawWithReply;
      // Auto-speak then auto-listen if mic is granted
      speakText(spoken,micGrantedRef.current);
    }catch(e){
      console.error(e);
      setMessages(prev=>[...prev,{role:"assistant",content:"Connection error. Please try again.",corrections:[]}]);
      setVS(VS.IDLE);
    }
  },[speakText]);

  const sendMessage=(text)=>sendMessageInternal(text);
  const handleKey=(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage(input);}};

  const handleMicButton=()=>{
    if(vsRef.current===VS.SPEAKING){stopAudio();startListening();return;}
    if(vsRef.current===VS.LISTENING){stopListeningAndSend();return;}
    if(vsRef.current===VS.IDLE){startListening();return;}
  };

  if(!profileLoaded) return <div style={{minHeight:"100vh",background:"#060910",display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.3)",fontFamily:"system-ui",fontSize:14}}>Loading…</div>;

  const activeMode=MODES.find(m=>m.id===mode);
  const levelColor=LEVEL_COLORS[profile.level];

  return (
    <div style={s.page}>
      <style>{`
        @keyframes wave{0%,100%{height:2px}50%{height:12px}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,0.5)}50%{box-shadow:0 0 0 18px rgba(248,113,113,0)}}
        @keyframes listenPulse{0%,100%{transform:scale(1);opacity:0.5}50%{transform:scale(1.18);opacity:0.15}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
        @keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
        @keyframes glow{0%,100%{opacity:0.4}50%{opacity:1}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .msg{animation:fadeUp 0.3s ease}
        .ctag{animation:slideIn 0.25s ease}
        button{font-family:inherit;cursor:pointer}
        textarea,input{font-family:inherit;outline:none}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}
      `}</style>

      {/* Nav */}
      <nav style={s.nav}>
        <button onClick={()=>navigate("/app")} style={s.navBtn}>← {lang.flag} {lang.name}</button>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:6,background:`${levelColor}12`,border:`1px solid ${levelColor}2a`,borderRadius:20,padding:"4px 11px"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:levelColor,animation:"glow 2s infinite"}}/>
            <span style={{color:levelColor,fontSize:11,fontWeight:600}}>{profile.levelLabel}</span>
            {leveled&&<span style={{color:"#eab308",fontSize:10,fontWeight:700}}>↑ Level up!</span>}
          </div>
          <button onClick={()=>setMuted(m=>!m)} style={{...s.navBtn,color:muted?"#f87171":"rgba(255,255,255,0.45)"}}>
            {muted?"🔇":"🔊"}
          </button>
          <button onClick={signOut} style={{...s.navBtn,fontSize:11}}>Sign out</button>
        </div>
      </nav>

      <div style={s.main}>
        <FritzAvatar voiceState={voiceState} levelColor={levelColor}/>

        {micBlocked&&(
          <div style={s.warnBox}>
            <p style={{color:"#f87171",fontWeight:700,fontSize:13,marginBottom:5}}>🎙️ Microphone blocked</p>
            <p style={{color:"rgba(255,255,255,0.45)",fontSize:12,lineHeight:1.7}}>Click the 🔒 icon in your address bar → Microphone → Allow → reload the page.</p>
            <button onClick={()=>setMicBlocked(false)} style={s.dismissBtn}>Dismiss</button>
          </div>
        )}

        <ProgressPanel profile={profile} levelColor={levelColor}/>

        {/* Mode tabs */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",marginBottom:12}}>
          {MODES.map(m=>(
            <button key={m.id} onClick={()=>setMode(m.id)} style={{padding:"5px 13px",borderRadius:20,border:"none",fontSize:12,fontWeight:600,background:mode===m.id?m.color:"rgba(255,255,255,0.05)",color:mode===m.id?"#0f172a":"rgba(255,255,255,0.4)",boxShadow:mode===m.id?`0 2px 10px ${m.color}44`:"none",transition:"all 0.18s"}}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Chat */}
        <div style={s.chatWrap}>
          <div style={s.chatScroll}>
            {messages.map((msg,i)=>(
              <div key={i} className="msg">
                <div style={{display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start",gap:8,alignItems:"flex-end"}}>
                  {msg.role==="assistant"&&(
                    <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,background:`linear-gradient(135deg,${levelColor},${levelColor}55)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,boxShadow:`0 0 10px ${levelColor}22`}}>🎓</div>
                  )}
                  <div style={{maxWidth:"76%",display:"flex",flexDirection:"column",gap:3}}>
                    <div style={{padding:"10px 14px",borderRadius:16,borderBottomLeftRadius:msg.role==="assistant"?3:16,borderBottomRightRadius:msg.role==="user"?3:16,background:msg.role==="user"?`linear-gradient(135deg,${activeMode.color}bb,${activeMode.color}44)`:"rgba(255,255,255,0.06)",color:"#fff",fontSize:14,lineHeight:1.65}}>
                      {msg.content}
                    </div>
                    {msg.role==="assistant"&&!muted&&(
                      <button onClick={()=>speakText(msg.content,false)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.18)",fontSize:11,padding:"1px 4px",textAlign:"left",transition:"color 0.2s"}} onMouseEnter={e=>e.target.style.color="rgba(255,255,255,0.55)"} onMouseLeave={e=>e.target.style.color="rgba(255,255,255,0.18)"}>🔊 replay</button>
                    )}
                  </div>
                </div>
                {msg.role==="assistant"&&msg.corrections?.length>0&&(
                  <div className="ctag"><CorrectionCard corrections={msg.corrections}/></div>
                )}
              </div>
            ))}

            {/* Live transcript preview */}
            {voiceState===VS.LISTENING&&(
              <div style={{display:"flex",justifyContent:"flex-end",animation:"fadeUp 0.2s ease"}}>
                <div style={{maxWidth:"76%",padding:"10px 14px",borderRadius:16,borderBottomRightRadius:3,background:`${activeMode.color}22`,border:`1px solid ${activeMode.color}44`,color:"rgba(255,255,255,0.65)",fontSize:14,fontStyle:liveTranscript?"normal":"italic"}}>
                  {liveTranscript||"Listening…"}
                </div>
              </div>
            )}

            {voiceState===VS.THINKING&&(
              <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
                <div style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg,${levelColor},${levelColor}55)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🎓</div>
                <div style={{background:"rgba(255,255,255,0.06)",borderRadius:16,borderBottomLeftRadius:3,padding:"12px 16px"}}>
                  <div style={{display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:"50%",background:levelColor,animation:"bounce 1.2s infinite",animationDelay:`${i*0.2}s`}}/>)}</div>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          <div style={s.inputBar}>
            <textarea
              value={voiceState===VS.LISTENING?(liveTranscript||""):input}
              onChange={e=>{if(voiceState!==VS.LISTENING)setInput(e.target.value);}}
              onKeyDown={handleKey}
              readOnly={voiceState===VS.LISTENING}
              placeholder={voiceState===VS.LISTENING?"Listening — tap ⏹ when done…":"Type here or tap 🎙️ to speak…"}
              rows={1}
              style={{flex:1,background:"rgba(255,255,255,0.04)",border:`1.5px solid ${voiceState===VS.LISTENING?activeMode.color:"rgba(255,255,255,0.08)"}`,borderRadius:12,padding:"9px 12px",color:voiceState===VS.LISTENING?"#86efac":"#fff",fontSize:14,resize:"none",transition:"all 0.2s"}}
            />
            <button onClick={handleMicButton} disabled={voiceState===VS.THINKING} style={{
              width:48,height:48,borderRadius:"50%",border:"none",
              background:voiceState===VS.LISTENING?"linear-gradient(135deg,#f87171,#dc2626)":voiceState===VS.SPEAKING?"linear-gradient(135deg,#eab308,#b45309)":`linear-gradient(135deg,${levelColor},${levelColor}88)`,
              color:"#fff",fontSize:voiceState===VS.LISTENING?11:18,flexShrink:0,
              animation:voiceState===VS.LISTENING?"pulse 1.5s infinite":"none",
              display:"flex",alignItems:"center",justifyContent:"center",
              opacity:voiceState===VS.THINKING?0.25:1,
              fontWeight:700,
              boxShadow:voiceState===VS.LISTENING?`0 0 0 3px rgba(248,113,113,0.3)`:`0 4px 14px ${levelColor}33`,
              transition:"all 0.2s",
            }}>
              {voiceState===VS.LISTENING?"⏹ Send":voiceState===VS.SPEAKING?"⚡":"🎙️"}
            </button>
            <button onClick={()=>sendMessage(input)} disabled={!input.trim()||voiceState===VS.LISTENING||voiceState===VS.THINKING} style={{height:48,padding:"0 16px",borderRadius:12,border:"none",background:(input.trim()&&voiceState===VS.IDLE)?activeMode.color:"rgba(255,255,255,0.05)",color:(input.trim()&&voiceState===VS.IDLE)?"#0f172a":"rgba(255,255,255,0.18)",fontWeight:700,fontSize:13,flexShrink:0,transition:"all 0.2s"}}>
              Send ↑
            </button>
          </div>
        </div>

        <p style={{color:"rgba(255,255,255,0.15)",fontSize:11,marginTop:10,textAlign:"center"}}>
          {micGranted?"🎙️ Hands-free active — Fritz listens after each reply":"Tap 🎙️ once to enable hands-free voice mode"}
        </p>
      </div>
    </div>
  );
}

const s={
  page:{minHeight:"100vh",background:"radial-gradient(ellipse at 30% 0%,#0f1729 0%,#060910 60%)",display:"flex",flexDirection:"column",fontFamily:"'Segoe UI',system-ui,sans-serif",color:"#fff"},
  nav:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px",borderBottom:"1px solid rgba(255,255,255,0.04)",position:"sticky",top:0,background:"rgba(6,9,16,0.92)",backdropFilter:"blur(16px)",zIndex:100},
  navBtn:{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.5)",borderRadius:8,padding:"6px 12px",fontSize:12},
  main:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"0 14px 24px",maxWidth:660,margin:"0 auto",width:"100%"},
  chatWrap:{width:"100%",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:20,display:"flex",flexDirection:"column",height:"36vh",overflow:"hidden"},
  chatScroll:{flex:1,overflowY:"auto",padding:"12px",display:"flex",flexDirection:"column",gap:8},
  inputBar:{padding:"10px 12px",borderTop:"1px solid rgba(255,255,255,0.04)",display:"flex",gap:8,alignItems:"flex-end"},
  warnBox:{width:"100%",marginBottom:10,background:"rgba(248,113,113,0.06)",border:"1px solid rgba(248,113,113,0.2)",borderRadius:12,padding:"13px 15px"},
  dismissBtn:{marginTop:8,background:"none",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.3)",fontSize:11,padding:"4px 12px",borderRadius:20},
};
