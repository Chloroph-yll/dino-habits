import React, { useState, useEffect, useRef, useMemo } from "react";
import { Sun, Moon, BarChart3, ListChecks, Plus, Pencil, Archive, Trash2, MessageSquare, X, Info, Flame, Check } from "lucide-react";

/* ============ PURE LOGIC (no UI) ============ */
const KEY = "dinohabits:v1"; // one storage key, versioned so future upgrades can migrate old data
const DEFAULTS = () => ({ v: 1, habits: [], checks: {}, notes: [], tasks: [], theme: null });
const pad = (n) => String(n).padStart(2, "0");
// Dates are plain local-time strings "YYYY-MM-DD" so midnight is decided by the user's clock, not UTC.
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

function loadData() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    // If anything looks wrong (empty, corrupted, wrong shape) we quietly start fresh instead of crashing.
    if (!p || p.v !== 1 || !Array.isArray(p.habits) || !Array.isArray(p.notes) || !Array.isArray(p.tasks) || typeof p.checks !== "object" || !p.checks) return DEFAULTS();
    return { ...DEFAULTS(), ...p };
  } catch { return DEFAULTS(); }
}

/* FORGIVING STREAK RULE (in plain English):
   Walk backwards one day at a time counting completed days. A missed day does NOT end the streak
   if there has been no other missed day in the 6 days before it (so: 1 free miss per 7-day window).
   A second miss inside that window ends the streak. Today is "pending", not "missed":
   we start from yesterday if today isn't done yet. */
function streakEnding(done, end, min) {
  let s = 0, lastMiss = -99, used = 0;
  for (let i = 0; ; i++) {
    const d = addDays(end, -i);
    if (d < min) break;                         // never count days before the first check-in
    if (done[d]) s++;
    else if (i - lastMiss >= 7) { lastMiss = i; used++; } // forgiven miss (grace day)
    else break;                                 // second miss within 7 days: streak over
  }
  return { s, used };
}
function computeStreaks(done, today) {
  const dates = Object.keys(done).sort();
  if (!dates.length) return { current: 0, best: 0, graceUsed: false };
  const min = dates[0];
  const cur = streakEnding(done, done[today] ? today : addDays(today, -1), min);
  let best = cur.s;
  dates.forEach((d) => { best = Math.max(best, streakEnding(done, d, min).s); });
  return { current: cur.s, best, graceUsed: cur.used > 0 };
}
const activeHabits = (d) => d.habits.filter((h) => !h.archived);
// Completion % over the last n days (use Infinity for all-time); a habit only counts from the day it was created.
function rate(d, today, n) {
  let num = 0, den = 0;
  activeHabits(d).forEach((h) => {
    let start = h.created;
    const w = addDays(today, -(n - 1));
    if (n !== Infinity && w > start) start = w;
    if (start > today) return;
    den += daysBetween(start, today) + 1;
    Object.keys(d.checks[h.id] || {}).forEach((x) => { if (x >= start && x <= today) num++; });
  });
  return den ? Math.round((num / den) * 100) : null;
}
function trend30(d, today) {
  return Array.from({ length: 30 }, (_, k) => {
    const day = addDays(today, -(29 - k));
    const hs = activeHabits(d).filter((h) => h.created <= day);
    const n = hs.filter((h) => (d.checks[h.id] || {})[day]).length;
    return { day, pct: hs.length ? n / hs.length : 0 };
  });
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
function moodInsight(d) {
  const on = [], off = [];
  d.notes.forEach((n) => ((d.checks[n.habitId] || {})[n.date] ? on : off).push(n.mood));
  return { done: avg(on), skipped: avg(off), nDone: on.length, nSkip: off.length };
}
function sampleData(today) {
  const defs = [["Read 10 pages", "📖", 0.85], ["Walk outside", "🚶", 0.65], ["Drink water", "💧", 0.75], ["Stretch", "🧘", 0.5]];
  const habits = [], checks = {}, notes = [];
  defs.forEach(([name, emoji, p], i) => {
    const h = { id: uid(), name, emoji, color: COLORS[i], target: "", archived: false, created: addDays(today, -45) };
    habits.push(h); checks[h.id] = {};
    for (let k = 1; k <= 45; k++) {
      const day = addDays(today, -k), did = Math.random() < p;
      if (did) checks[h.id][day] = 1;
      if (Math.random() < 0.2) notes.push({ id: uid(), habitId: h.id, date: day, mood: did ? 3 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 3), energy: 1 + Math.floor(Math.random() * 5), text: did ? "Felt good to get this done." : "Skipped today.", tags: did ? ["in flow"] : ["tired"] });
    }
  });
  return { habits, checks, notes };
}

/* ============ SMALL UI PIECES ============ */
const COLORS = ["#2f6f5e", "#5b6b8c", "#8a6f3d", "#7a5a7a"];
const EMOJI = ["📖", "💧", "🚶", "🧘", "🏃", "🍎", "💤", "✍️", "🎧", "🌱"];
const TAGS = ["tired", "traveling", "distracted", "in flow"];
const MOODS = ["😞", "🙁", "😐", "🙂", "😄"];
const CSS = `
:root{--bg:#f2f3ef;--ink:#1e2622;--mute:#66706a;--line:#d9dcd5;--card:#fafaf7;--accent:#2f6f5e;--onacc:#fff}
.dark{--bg:#161a18;--ink:#e7ebe6;--mute:#98a39c;--line:#2d3430;--card:#1e2421;--accent:#7fc4ae;--onacc:#10201a}
body{margin:0;background:var(--bg);color:var(--ink);transition:background .25s,color .25s}
.serif{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif}
.paper{background:var(--bg);background-image:repeating-linear-gradient(transparent 0 31px,var(--line) 31px 32px);min-height:100vh}
.card{background:var(--card);border:1px solid var(--line);border-radius:6px;box-shadow:2px 2px 0 var(--line)}
.btn{border:1px solid var(--ink);border-radius:6px;padding:.4rem .8rem;min-height:40px;transition:transform .15s,background .15s}
.btn:active{transform:translateY(1px)}
.btn-acc{background:var(--accent);color:var(--onacc);border-color:var(--accent)}
.icon{min-width:40px;min-height:40px;display:inline-grid;place-items:center;border-radius:6px;transition:background .15s}
.icon:hover{background:var(--line)}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
input,textarea,select{background:var(--card);color:var(--ink);border:1px solid var(--mute);border-radius:6px;padding:.45rem .6rem;width:100%}
.draw{stroke-dasharray:100;stroke-dashoffset:100;animation:draw .6s .1s forwards ease-out}
.pop{transform-origin:center;animation:pop .5s .15s both ease-out}
.shake{transform-origin:50% 100%;animation:shake .6s infinite}
.dood{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;background:color-mix(in srgb,var(--card) 88%,transparent);animation:out 1.3s forwards}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes shake{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
@keyframes out{0%,75%{opacity:1}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;animation-iteration-count:1!important;transition:none!important}.draw{stroke-dashoffset:0}}
`;
const S = { stroke: "var(--accent)", strokeWidth: 5, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
// Four hand-drawn reward animations; one is picked at random each time (variable reward).
function Doodle({ kind }) {
  return (
    <svg viewBox="0 0 100 100" width="96" height="96" aria-hidden="true">
      {kind === 0 && <path className="draw" pathLength="100" d="M18 54 L40 76 L84 24" {...S} />}
      {kind === 1 && [0, 1, 2, 3, 4, 5, 6, 7].map((i) => <line key={i} className="pop" style={{ animationDelay: i * 0.03 + "s" }} x1="50" y1="18" x2="50" y2="34" transform={`rotate(${i * 45} 50 50)`} {...S} />)}
      {kind === 2 && <><path className="draw" pathLength="100" d="M50 84 C10 56 22 20 50 40 C78 20 90 56 50 84Z" {...S} /><path className="pop" d="M50 8 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z" fill="var(--accent)" /></>}
      {kind === 3 && <><g className="shake"><ellipse cx="50" cy="60" rx="26" ry="32" {...S} /><path className="draw" pathLength="100" d="M26 56 l10 -8 8 8 10 -8 8 8 10 -8" {...S} /></g><circle className="pop" cx="82" cy="22" r="9" fill="var(--accent)" /></>}
    </svg>
  );
}
function Modal({ title, onClose, children }) {
  const ref = useRef(), close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement, el = ref.current;
    const items = () => [...el.querySelectorAll("button,input,textarea,select")].filter((x) => !x.disabled);
    (items()[1] || items()[0])?.focus();
    // Focus trap: Tab loops inside the dialog; Esc closes it.
    const key = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close.current(); }
      if (e.key === "Tab") {
        const n = items(), a = n[0], z = n[n.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    el.addEventListener("keydown", key);
    return () => { el.removeEventListener("keydown", key); prev?.focus?.(); };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3" style={{ background: "rgba(0,0,0,.45)" }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="card w-full max-w-md max-h-[85vh] overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="serif text-xl">{title}</h2>
          <button className="icon" aria-label="Close" onClick={onClose}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function HabitForm({ habit, onSave, onClose }) {
  const [f, setF] = useState(habit || { name: "", emoji: "🌱", color: COLORS[0], target: "" });
  const ok = f.name.trim().length > 0;
  return (
    <Modal title={habit ? "Edit habit" : "New habit"} onClose={onClose}>
      <label className="block mb-3">Name<input value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <p className="mb-1">Icon</p>
      <div className="flex flex-wrap gap-1 mb-3">{EMOJI.map((e) => <button key={e} aria-label={"Icon " + e} aria-pressed={f.emoji === e} className="icon text-xl" style={f.emoji === e ? { outline: "2px solid var(--accent)" } : {}} onClick={() => setF({ ...f, emoji: e })}>{e}</button>)}</div>
      <p className="mb-1">Color</p>
      <div className="flex gap-2 mb-3">{COLORS.map((c) => <button key={c} aria-label={"Color " + c} aria-pressed={f.color === c} className="icon" onClick={() => setF({ ...f, color: c })}><span style={{ background: c, width: 22, height: 22, borderRadius: 99, outline: f.color === c ? "2px solid var(--ink)" : "none", outlineOffset: 2 }} /></button>)}</div>
      <label className="block mb-4">Daily target (optional, e.g. "8 glasses")<input value={f.target} maxLength={30} onChange={(e) => setF({ ...f, target: e.target.value })} /></label>
      <button className="btn btn-acc w-full" disabled={!ok} style={{ opacity: ok ? 1 : 0.5 }} onClick={() => onSave({ ...f, name: f.name.trim() })}>Save habit</button>
    </Modal>
  );
}
function ReflectionModal({ habit, date, existing, onSave, onClose }) {
  const [n, setN] = useState(existing || { mood: 3, energy: 3, text: "", tags: [] });
  const Scale = ({ label, k, render }) => (
    <fieldset className="mb-3"><legend className="mb-1">{label}</legend>
      <div className="flex gap-1">{[1, 2, 3, 4, 5].map((v) => <button key={v} aria-label={`${label} ${v} of 5`} aria-pressed={n[k] === v} className="icon text-xl" style={n[k] === v ? { outline: "2px solid var(--accent)" } : {}} onClick={() => setN({ ...n, [k]: v })}>{render(v)}</button>)}</div>
    </fieldset>
  );
  return (
    <Modal title={`Note: ${habit.name}`} onClose={onClose}>
      <p className="mb-3" style={{ color: "var(--mute)" }}>{date}</p>
      <Scale label="Mood" k="mood" render={(v) => MOODS[v - 1]} />
      <Scale label="Energy" k="energy" render={(v) => v} />
      <div className="flex flex-wrap gap-2 mb-3">{TAGS.map((t) => { const on = n.tags.includes(t); return <button key={t} aria-pressed={on} className="btn" style={on ? { background: "var(--accent)", color: "var(--onacc)" } : {}} onClick={() => setN({ ...n, tags: on ? n.tags.filter((x) => x !== t) : [...n.tags, t] })}>{t}</button>; })}</div>
      <label className="block mb-4">Note<textarea rows={4} maxLength={500} value={n.text} onChange={(e) => setN({ ...n, text: e.target.value })} /></label>
      <button className="btn btn-acc w-full" onClick={() => onSave(n)}>Save note</button>
    </Modal>
  );
}

/* ============ TODAY ============ */
function HabitCard({ h, d, today, api }) {
  const done = !!(d.checks[h.id] || {})[today];
  const st = useMemo(() => computeStreaks(d.checks[h.id] || {}, today), [d.checks, h.id, today]);
  const timer = useRef(), fired = useRef(false), lock = useRef(0);
  const [dood, setDood] = useState(null);
  const tap = () => {
    if (fired.current) { fired.current = false; return; }          // a long-press just opened the note; ignore the click that follows
    const now = Date.now(); if (now - lock.current < 300) return;  // ignore accidental rapid double-taps
    lock.current = now;
    api.toggle(h.id, today);                                       // state updates instantly (optimistic): nothing to wait for
    if (!done) { setDood(Math.floor(Math.random() * 4)); setTimeout(() => setDood(null), 1400); }
  };
  const start = () => { fired.current = false; timer.current = setTimeout(() => { fired.current = true; api.reflect(h, today); }, 500); };
  const stop = () => clearTimeout(timer.current);
  return (
    <li className="card relative p-3 flex items-center gap-3" style={{ borderLeft: `6px solid ${h.color}` }}>
      <button aria-pressed={done} aria-label={`${done ? "Undo" : "Complete"} ${h.name}`} className="icon" style={{ width: 52, height: 52, border: "2px solid var(--ink)", borderRadius: 99, background: done ? "var(--accent)" : "transparent", color: "var(--onacc)" }}
        onClick={tap} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={(e) => { e.preventDefault(); api.reflect(h, today); }}>
        {done ? <Check size={26} /> : <span className="text-2xl">{h.emoji}</span>}
      </button>
      <div className="min-w-0 flex-1">
        <p className="serif text-lg truncate">{h.name}</p>
        <p className="text-sm flex items-center gap-1" style={{ color: "var(--mute)" }}>
          <Flame size={14} />{st.current}-day streak{st.graceUsed ? " · grace day used" : ""}{h.target ? ` · goal: ${h.target}` : ""}
        </p>
      </div>
      <button className="icon" aria-label={`Add note for ${h.name}`} onClick={() => api.reflect(h, today)}><MessageSquare size={18} /></button>
      <button className="icon" aria-label={`Edit ${h.name}`} onClick={() => api.edit(h)}><Pencil size={18} /></button>
      <button className="icon" aria-label={`Archive ${h.name}`} onClick={() => api.archive(h.id, true)}><Archive size={18} /></button>
      {dood !== null && <div className="dood"><Doodle kind={dood} /></div>}
    </li>
  );
}
function Today({ d, today, api }) {
  const act = activeHabits(d), arch = d.habits.filter((h) => h.archived);
  const n = act.filter((h) => (d.checks[h.id] || {})[today]).length;
  return (
    <section>
      <h1 className="serif text-3xl mb-1">Today</h1>
      <p className="mb-4" style={{ color: "var(--mute)" }}>{act.length ? `${n} of ${act.length} done. Tap to check in. Press and hold, or right-click, to add a note.` : "Nothing here yet."}</p>
      {!act.length && <div className="card p-4 mb-4"><p className="mb-3">Start with one small habit you can do in under two minutes, or explore with sample data.</p><button className="btn btn-acc mr-2" onClick={() => api.edit({})}>Add a habit</button><button className="btn" onClick={api.sample}>Load sample data</button></div>}
      <ul className="grid gap-3 mb-4">{act.map((h) => <HabitCard key={h.id} h={h} d={d} today={today} api={api} />)}</ul>
      {act.length > 0 && <button className="btn flex items-center gap-1" onClick={() => api.edit({})}><Plus size={18} />New habit</button>}
      {arch.length > 0 && <div className="mt-6"><h2 className="serif text-xl mb-2">Archived</h2><ul className="grid gap-2">{arch.map((h) => <li key={h.id} className="card p-2 flex items-center gap-2"><span className="flex-1 truncate">{h.emoji} {h.name}</span><button className="btn" onClick={() => api.archive(h.id, false)}>Restore</button><button className="icon" aria-label={`Delete ${h.name} permanently`} onClick={() => api.remove(h)}><Trash2 size={18} /></button></li>)}</ul></div>}
    </section>
  );
}

/* ============ INSIGHTS (analytics + calendar + timeline) ============ */
function Insights({ d, today, api }) {
  const [mode, setMode] = useState("month"), [tip, setTip] = useState(false), [day, setDay] = useState(null);
  const act = activeHabits(d);
  const any = {}; act.forEach((h) => Object.keys(d.checks[h.id] || {}).forEach((x) => (any[x] = 1)));
  const sk = computeStreaks(any, today);
  const total = d.habits.reduce((s, h) => s + Object.keys(d.checks[h.id] || {}).length, 0);
  const tr = trend30(d, today), mi = moodInsight(d);
  const pct = (v) => (v === null ? "–" : v + "%");
  if (!d.habits.length) return <section><h1 className="serif text-3xl mb-2">Insights</h1><div className="card p-4"><p className="mb-3">Your charts appear after your first check-in. Want to see a full dashboard right now?</p><button className="btn btn-acc" onClick={api.sample}>Load sample data</button></div></section>;
  const first = mode === "week" ? addDays(today, -6) : ymd(new Date(parse(today).getFullYear(), parse(today).getMonth(), 1));
  const cells = []; for (let x = first; x <= today; x = addDays(x, 1)) cells.push(x);
  const dens = (x) => { const hs = act.filter((h) => h.created <= x); return hs.length ? hs.filter((h) => (d.checks[h.id] || {})[x]).length / hs.length : 0; };
  const Stat = ({ l, v }) => <div className="card p-3"><p className="serif text-2xl">{v}</p><p className="text-sm" style={{ color: "var(--mute)" }}>{l}</p></div>;
  return (
    <section>
      <h1 className="serif text-3xl mb-3">Insights</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <Stat l="7-day completion" v={pct(rate(d, today, 7))} /><Stat l="30-day completion" v={pct(rate(d, today, 30))} /><Stat l="All-time completion" v={pct(rate(d, today, Infinity))} />
        <Stat l="Current streak (days)" v={sk.current} /><Stat l="Best streak (days)" v={sk.best} /><Stat l="Total check-ins" v={total} />
      </div>
      <div className="mb-5">
        <button className="flex items-center gap-1 text-sm" aria-expanded={tip} onClick={() => setTip(!tip)} style={{ minHeight: 40 }}><Info size={16} />How streaks forgive you{sk.graceUsed ? " (a grace day is active)" : ""}</button>
        {tip && <p className="card p-3 text-sm">One missed day in any 7 does not break your streak. Miss two in the same week and it resets. Life happens; we count effort, not perfection.</p>}
      </div>
      <h2 className="serif text-xl mb-2">Last 30 days</h2>
      <div className="card p-3 mb-5"><svg viewBox="0 0 300 90" role="img" aria-label={`Bar chart of daily completion for the last 30 days. Today: ${Math.round(tr[29].pct * 100)}%.`} className="w-full">
        <line x1="0" y1="80" x2="300" y2="80" stroke="var(--line)" />{tr.map((t, i) => <rect key={t.day} x={i * 10 + 1} y={80 - t.pct * 76} width="7" height={Math.max(t.pct * 76, 1)} rx="1.5" fill="var(--accent)" opacity={t.pct ? 1 : 0.25}><title>{t.day}: {Math.round(t.pct * 100)}%</title></rect>)}
      </svg></div>
      <div className="flex items-center justify-between mb-2"><h2 className="serif text-xl">Calendar</h2>
        <div className="flex gap-1">{["week", "month"].map((m) => <button key={m} className="btn" aria-pressed={mode === m} style={mode === m ? { background: "var(--accent)", color: "var(--onacc)" } : {}} onClick={() => setMode(m)}>{m === "week" ? "Week" : "Month"}</button>)}</div></div>
      <div className="grid grid-cols-7 gap-1 mb-5">{cells.map((x) => <button key={x} aria-label={`${x}, ${Math.round(dens(x) * 100)}% complete`} onClick={() => setDay(x)} className="card" style={{ minHeight: 48, background: `color-mix(in srgb, var(--accent) ${Math.round(dens(x) * 85)}%, var(--card))` }}>{parse(x).getDate()}</button>)}</div>
      <h2 className="serif text-xl mb-2">Per habit</h2>
      <ul className="grid gap-2 mb-5">{act.map((h) => { const s = computeStreaks(d.checks[h.id] || {}, today); const r = rate({ ...d, habits: [h] }, today, 30) || 0; return <li key={h.id} className="card p-3"><div className="flex justify-between"><span className="truncate">{h.emoji} {h.name}</span><span style={{ color: "var(--mute)" }}>{s.current}d streak · {r}%</span></div><div style={{ height: 6, background: "var(--line)", borderRadius: 9, marginTop: 6 }}><div style={{ width: r + "%", height: 6, background: h.color, borderRadius: 9, transition: "width .25s" }} /></div></li>; })}</ul>
      <h2 className="serif text-xl mb-2">Reflection insight</h2>
      <p className="card p-3 mb-5">{mi.nDone && mi.nSkip ? `Average mood is ${mi.done.toFixed(1)}/5 on days you completed a habit versus ${mi.skipped.toFixed(1)}/5 on days you skipped (from ${mi.nDone + mi.nSkip} notes). This is your own pattern, not proof of cause.` : "Add notes on both completed and skipped days to unlock this comparison."}</p>
      <h2 className="serif text-xl mb-2">Reflection timeline</h2>
      <ul className="grid gap-2">{!d.notes.length && <li style={{ color: "var(--mute)" }}>No notes yet. Press and hold any habit to add one.</li>}
        {[...d.notes].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20).map((n) => { const h = d.habits.find((x) => x.id === n.habitId); return <li key={n.id} className="card p-3"><p className="text-sm" style={{ color: "var(--mute)" }}>{n.date} · {h ? h.name : "Deleted habit"} · {MOODS[n.mood - 1]} · energy {n.energy}/5{n.tags.length ? " · " + n.tags.join(", ") : ""}</p>{n.text && <p className="break-words">{n.text}</p>}</li>; })}</ul>
      {day && <Modal title={day} onClose={() => setDay(null)}>
        {act.filter((h) => h.created <= day).map((h) => { const on = !!(d.checks[h.id] || {})[day]; return <div key={h.id} className="flex items-center gap-2 mb-2"><button aria-pressed={on} className="btn flex-1 text-left truncate" style={on ? { background: "var(--accent)", color: "var(--onacc)" } : {}} onClick={() => api.toggle(h.id, day)}>{on ? "✓ " : ""}{h.emoji} {h.name}</button><button className="icon" aria-label={`Add note for ${h.name} on ${day}`} onClick={() => { setDay(null); api.reflect(h, day); }}><MessageSquare size={18} /></button></div>; })}
        {!act.some((h) => h.created <= day) && <p>No habits existed on this day.</p>}
      </Modal>}
    </section>
  );
}

/* ============ TASKS (Eisenhower matrix) ============ */
const QUADS = [["ui", "Do now", "Urgent + important"], ["nui", "Schedule", "Important, not urgent"], ["uni", "Delegate", "Urgent, not important"], ["nn", "Drop or later", "Neither"]];
function Tasks({ d, setD }) {
  const [t, setT] = useState(""), [q, setQ] = useState("ui"), [edit, setEdit] = useState(null);
  const up = (id, patch) => setD((s) => ({ ...s, tasks: s.tasks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const add = () => { if (!t.trim()) return; setD((s) => ({ ...s, tasks: [...s.tasks, { id: uid(), title: t.trim(), q, done: false }] })); setT(""); };
  return (
    <section>
      <h1 className="serif text-3xl mb-3">Tasks</h1>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input aria-label="New task" className="flex-1" style={{ minWidth: 160 }} maxLength={120} placeholder="What needs doing?" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select aria-label="Quadrant" style={{ width: "auto" }} value={q} onChange={(e) => setQ(e.target.value)}>{QUADS.map((x) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>
        <button className="btn btn-acc" onClick={add}>Add task</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">{QUADS.map(([k, name, sub]) => (
        <div key={k} className="card p-3" style={{ minHeight: 120 }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => up(e.dataTransfer.getData("text"), { q: k })}>
          <h2 className="serif text-lg">{name}</h2><p className="text-sm mb-2" style={{ color: "var(--mute)" }}>{sub}</p>
          <ul className="grid gap-2">{d.tasks.filter((x) => x.q === k).map((x) => (
            <li key={x.id} draggable onDragStart={(e) => e.dataTransfer.setData("text", x.id)} className="flex items-center gap-1">
              <input type="checkbox" aria-label={`Complete ${x.title}`} style={{ width: 22, height: 22 }} checked={x.done} onChange={() => up(x.id, { done: !x.done })} />
              {edit === x.id ? <input autoFocus aria-label="Edit task" defaultValue={x.title} maxLength={120} onBlur={(e) => { if (e.target.value.trim()) up(x.id, { title: e.target.value.trim() }); setEdit(null); }} onKeyDown={(e) => e.key === "Enter" && e.target.blur()} /> : <span className="flex-1 break-words" style={{ textDecoration: x.done ? "line-through" : "none", opacity: x.done ? 0.6 : 1 }}>{x.title}</span>}
              <select aria-label={`Move ${x.title}`} style={{ width: 70 }} value={x.q} onChange={(e) => up(x.id, { q: e.target.value })}>{QUADS.map((z) => <option key={z[0]} value={z[0]}>{z[1].split(" ")[0]}</option>)}</select>
              <button className="icon" aria-label={`Edit ${x.title}`} onClick={() => setEdit(x.id)}><Pencil size={16} /></button>
              <button className="icon" aria-label={`Delete ${x.title}`} onClick={() => setD((s) => ({ ...s, tasks: s.tasks.filter((y) => y.id !== x.id) }))}><Trash2 size={16} /></button>
            </li>))}</ul>
        </div>))}</div>
    </section>
  );
}

/* ============ APP SHELL ============ */
export default function App() {
  const [d, setD] = useState(loadData), [tab, setTab] = useState("today"), [modal, setModal] = useState(null);
  const [today, setToday] = useState(ymd(new Date()));
  const dark = d.theme ? d.theme === "dark" : window.matchMedia?.("(prefers-color-scheme: dark)").matches; // default = system preference
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage full or blocked: app still works this session */ } }, [d]);
  useEffect(() => { document.documentElement.classList.toggle("dark", !!dark); }, [dark]);
  // Midnight rollover: re-check the date every 20s and when the tab becomes visible again.
  useEffect(() => { const f = () => setToday(ymd(new Date())); const i = setInterval(f, 20000); document.addEventListener("visibilitychange", f); return () => { clearInterval(i); document.removeEventListener("visibilitychange", f); }; }, []);
  const api = {
    toggle: (hid, date) => setD((s) => { const h = { ...(s.checks[hid] || {}) }; if (h[date]) delete h[date]; else h[date] = 1; return { ...s, checks: { ...s.checks, [hid]: h } }; }),
    edit: (h) => setModal({ type: "habit", h }),
    reflect: (h, date) => setModal({ type: "note", h, date }),
    archive: (id, v) => setD((s) => ({ ...s, habits: s.habits.map((h) => (h.id === id ? { ...h, archived: v } : h)) })),
    remove: (h) => { if (window.confirm(`Delete "${h.name}" and all its check-ins and notes? This cannot be undone.`)) setD((s) => { const c = { ...s.checks }; delete c[h.id]; return { ...s, habits: s.habits.filter((x) => x.id !== h.id), checks: c, notes: s.notes.filter((n) => n.habitId !== h.id) }; }); },
    sample: () => setD((s) => ({ ...s, ...sampleData(today), tasks: s.tasks.length ? s.tasks : [{ id: uid(), title: "Plan next week", q: "nui", done: false }, { id: uid(), title: "Pay electricity bill", q: "ui", done: false }] })),
  };
  const saveHabit = (f) => { setD((s) => f.id ? { ...s, habits: s.habits.map((h) => (h.id === f.id ? { ...h, ...f } : h)) } : { ...s, habits: [...s.habits, { ...f, id: uid(), archived: false, created: today }] }); setModal(null); };
  const saveNote = (n) => { const { h, date } = modal; setD((s) => ({ ...s, notes: [...s.notes.filter((x) => !(x.habitId === h.id && x.date === date)), { ...n, id: n.id || uid(), habitId: h.id, date }] })); setModal(null); };
  const tabs = [["today", "Today", Sun], ["insights", "Insights", BarChart3], ["tasks", "Tasks", ListChecks]];
  return (
    <div className="paper">
      <style>{CSS}</style>
      <header className="max-w-2xl mx-auto px-4 pt-5 flex items-center justify-between">
        <span className="serif text-lg">DinoHabits 🦖</span>
        <button className="icon" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setD((s) => ({ ...s, theme: dark ? "light" : "dark" }))}>{dark ? <Sun size={20} /> : <Moon size={20} />}</button>
      </header>
      <main className="max-w-2xl mx-auto px-4 pt-3 pb-32">
        {tab === "today" && <Today d={d} today={today} api={api} />}
        {tab === "insights" && <Insights d={d} today={today} api={api} />}
        {tab === "tasks" && <Tasks d={d} setD={setD} />}
      </main>
      <nav aria-label="Main" className="card fixed bottom-4 left-1/2 flex gap-1 p-1" style={{ transform: "translateX(-50%)", zIndex: 40 }}>
        {tabs.map(([k, l, I]) => <button key={k} aria-current={tab === k ? "page" : undefined} className="btn flex items-center gap-1" style={{ border: "none", background: tab === k ? "var(--accent)" : "transparent", color: tab === k ? "var(--onacc)" : "var(--ink)" }} onClick={() => setTab(k)}><I size={18} />{l}</button>)}
      </nav>
      {modal?.type === "habit" && <HabitForm habit={modal.h.id ? modal.h : null} onSave={saveHabit} onClose={() => setModal(null)} />}
      {modal?.type === "note" && <ReflectionModal habit={modal.h} date={modal.date} existing={d.notes.find((x) => x.habitId === modal.h.id && x.date === modal.date)} onSave={saveNote} onClose={() => setModal(null)} />}
    </div>
  );
}
