  /* =========================================================
   Second Cerveau OS -- app.js (final, compatible)
   - Aucune modif requise dans index.html / styles.css
   - Fallback LocalStorage si window.DB absent
   - Mises à jour live du dashboard + navigation persistée
========================================================= */

/* ---------- Helpers ---------- */
const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const todayStr = () => new Date().toISOString().slice(0,10);

/* ---------- State ---------- */
const state = {
  user: localStorage.getItem("scos_user") || null,
  activeTab: localStorage.getItem("scos_tab") || "dashboard",
  data: JSON.parse(localStorage.getItem("scos_data") || "{}"),
  tabs: [
    "dashboard","journal","tasks","habits","focus","metrics","goals","nutrition",
    "mood","assistant","calendar","resources","files","map","search","settings"
  ]
};

/* ---------- Storage layer (DB -> fallback LS) ---------- */
const stores = ["journal","tasks","habits","metrics","mood","goals","resources","files","nutrition","focusSessions"];

const Storage = (() => {
  const useDB = typeof window.DB === "object" && ["addItem","getAll","putItem","deleteItem"].every(k => typeof DB[k] === "function");

  async function lsGet(store){
    const key = `scos_${store}`;
    return JSON.parse(localStorage.getItem(key) || "[]");
  }
  async function lsPut(store, value){ // upsert by id (create id if needed)
    const key = `scos_${store}`;
    const arr = JSON.parse(localStorage.getItem(key) || "[]");
    if (value.id == null) value.id = Date.now() + Math.random();
    const i = arr.findIndex(x => x.id === value.id);
    if (i >= 0) arr[i] = value; else arr.push(value);
    localStorage.setItem(key, JSON.stringify(arr));
    return value;
  }
  async function lsAdd(store, value){ return lsPut(store, value); }
  async function lsDel(store, id){
    const key = `scos_${store}`;
    const arr = JSON.parse(localStorage.getItem(key) || "[]").filter(x => x.id !== id);
    localStorage.setItem(key, JSON.stringify(arr));
  }

  return {
    async getAll(store){ return useDB ? DB.getAll(store) : lsGet(store); },
    async add(store, value){ return useDB ? DB.addItem(store, value) : lsAdd(store, value); },
    async put(store, value){ return useDB ? DB.putItem(store, value) : lsPut(store, value); },
    async del(store, id){ return useDB ? DB.deleteItem(store, id) : lsDel(store, id); }
  };
})();

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", init);

async function init(){
  initLogin();
  initTheme();
  initNavigation();
  initDeepLink();
  initWidgetActions();
  initAssistant();
  initPomodoroControls();
  initFormsAndLists();      // monte les formulaires/sections si présents
  await loadAllStores();    // charge les données persistées
  refreshAll();             // dashboard + listes
  preloadData();            // météo + citation, non bloquant
}

/* ---------- Login ---------- */
function initLogin(){
  const splash = $("#splash-screen");
  const nameSpan = $("#profileName");
  const btn = $("#loginBtn");
  const input = $("#userName");

  if (!splash || !btn || !input || !nameSpan) return;

  if (state.user) {
    nameSpan.textContent = state.user;
    splash.style.display = "none";
  } else {
    btn.addEventListener("click", () => {
      const name = input.value.trim();
      if (!name) return;
      state.user = name;
      localStorage.setItem("scos_user", name);
      nameSpan.textContent = name;
      splash.style.display = "none";
    });
  }
}

/* ---------- Theme ---------- */
function initTheme(){
  const saved = localStorage.getItem("scos_theme");
  if (saved === "light") document.body.classList.add("light-theme");
  const tgl = $("#themeToggle");
  if (tgl) {
    tgl.addEventListener("click", () => {
      document.body.classList.toggle("light-theme");
      localStorage.setItem("scos_theme", document.body.classList.contains("light-theme") ? "light" : "dark");
    });
  }
}

/* ---------- Navigation (dock) ---------- */
function initNavigation(){
  $$(".dock button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.tab;
      setActiveTab(id);
    });
  });
  // Restaurer l’onglet actif
  setActiveTab(state.activeTab);
}
function setActiveTab(id){
  if (!state.tabs.includes(id)) id = "dashboard";
  state.tabs.forEach(t => { const el = $("#"+t); if (el) el.classList.remove("active"); });
  const next = $("#"+id); if (next) next.classList.add("active");
  $$(".dock button").forEach(b => b.classList.remove("active"));
  const btn = $(`.dock button[data-tab="${id}"]`); if (btn) btn.classList.add("active");
  state.activeTab = id;
  localStorage.setItem("scos_tab", id);
}
function initDeepLink(){
  // Permet d’ouvrir directement #journal, etc. (shortcuts PWA)
  const hash = (location.hash || "").replace("#","");
  if (hash && state.tabs.includes(hash)) setActiveTab(hash);
  window.addEventListener("hashchange", ()=>{
    const h = location.hash.replace("#","");
    if (state.tabs.includes(h)) setActiveTab(h);
  });
}

/* ---------- Widgets actions rapides ---------- */
function initWidgetActions(){
  $$(".widget").forEach(w => {
    w.addEventListener("dblclick", ()=>{
      const id = (w.id || "").replace("w-","");
      if (state.tabs.includes(id)) setActiveTab(id);
    });
  });
}

/* ---------- Assistant (placeholder local) ---------- */
function initAssistant(){
  const askBtn = $("#askAssistant");
  const input = $("#assistantInput");
  const chat = $("#assistantChat");
  if (!askBtn || !input || !chat) return;

  askBtn.addEventListener("click", ()=>{
    const q = input.value.trim();
    if (!q) return;
    appendChat("👤 " + q);
    const answer = assistantLocalAnswer(q);
    appendChat("🤖 " + answer);
    input.value = "";
  });

  function appendChat(text){
    const div = document.createElement("div");
    div.className = "card glass";
    div.textContent = text;
    chat.prepend(div);
  }
  function assistantLocalAnswer(q){
    const tasks = state.data.tasks || [];
    const habits = state.data.habits || [];
    if (/tâch|todo/i.test(q)) return `Tu as ${tasks.filter(t=>!t.done).length} tâche(s) à faire sur ${tasks.length}.`;
    if (/habitude|routine/i.test(q)) return `Tu suis ${habits.length} habitude(s). Streak moyen non calculé (à activer).`;
    if (/note|journal/i.test(q)) return `Dernière note: "${state.data.lastNote || "--"}".`;
    return "Je peux résumer tes données, compter tes tâches, et afficher des tendances. Pose-moi une question précise 😉";
  }
}

/* ---------- Pomodoro (Focus) ---------- */
let pomodoroTimer = null, remaining = 25*60;
function initPomodoroControls(){
  const start = $("#focusStart"), stop = $("#focusStop"), reset = $("#focusReset"), disp = $("#focusTimer");
  if (!start || !stop || !reset || !disp) return; // section absente → on ignore

  const render = () => {
    const m = String(Math.floor(remaining/60)).padStart(2,"0");
    const s = String(remaining%60).padStart(2,"0");
    disp.textContent = `${m}:${s}`;
  };
  render();

  start.onclick = ()=> {
    clearInterval(pomodoroTimer);
    pomodoroTimer = setInterval(()=>{
      remaining--; render();
      if (remaining <= 0) { clearInterval(pomodoroTimer); alert("Session terminée 🎉"); remaining = 25*60; render(); }
    }, 1000);
  };
  stop.onclick = ()=> { clearInterval(pomodoroTimer); };
  reset.onclick = ()=> { clearInterval(pomodoroTimer); remaining = 25*60; render(); };
}

/* ---------- Forms & Lists (si présents dans l’index) ---------- */
function initFormsAndLists(){
  // JOURNAL
  const jf = $("#journalForm"), jt = $("#journalText"), jl = $("#journalList");
  if (jf && jt && jl){
    jf.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const text = jt.value.trim(); if (!text) return;
      const note = { id:null, text, date: Date.now() };
      await Storage.add("journal", note);
      jt.value = "";
      state.data.lastNote = text; persistData();
      await reloadJournal(); refreshDashboardOnly(["w-lastNote"]);
    });
    reloadJournal();
  }

  // TASKS
  const tf = $("#taskForm"), tTitle = $("#taskTitle"), tDue = $("#taskDue"), tProject = $("#taskProject");
  if (tf && tTitle){
    tf.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const title = tTitle.value.trim(); if (!title) return;
      const due = tDue?.value ? new Date(tDue.value).getTime() : null;
      const project = tProject?.value || "";
      await Storage.add("tasks", { id:null, title, due, project, done:false, stage:"todo", date: Date.now() });
      tTitle.value = ""; if (tDue) tDue.value=""; if (tProject) tProject.value="";
      await reloadTasks(); refreshDashboardOnly(["w-tasks"]);
    });
    reloadTasks();
  }

  // HABITS
  const hf = $("#habitForm"), hName = $("#habitName"), hList = $("#habitList");
  if (hf && hName && hList){
    hf.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const name = hName.value.trim(); if (!name) return;
      await Storage.add("habits", { id:null, name, log:{}, created: Date.now() });
      hName.value = "";
      await reloadHabits(); refreshDashboardOnly(["w-habits"]);
    });
    hList.addEventListener("click", async (e)=>{
      const btn = e.target.closest("button[data-id][data-action]");
      if (!btn) return;
      const id = Number(btn.dataset.id), action = btn.dataset.action;
      let items = await Storage.getAll("habits");
      const h = items.find(x=>x.id===id); if (!h) return;
      if (action==="inc"){
        h.log[todayStr()] = (h.log[todayStr()]||0)+1;
        await Storage.put("habits", h);
      } else if (action==="del"){
        await Storage.del("habits", id);
      }
      await reloadHabits(); refreshDashboardOnly(["w-habits"]);
    });
    reloadHabits();
  }

  // NUTRITION
  const nf = $("#nutriForm"), nFood = $("#nutriFood"), nKcal = $("#nutriKcal"), nList = $("#nutriList");
  if (nf && nFood && nKcal && nList){
    nf.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const food = nFood.value.trim(); const kcal = Number(nKcal.value||0);
      if (!food) return;
      await Storage.add("nutrition", { id:null, food, kcal, date: todayStr() });
      nFood.value=""; nKcal.value="";
      await reloadNutrition();
    });
    reloadNutrition();
  }

  // MOOD
  const moodSel = $("#moodSelect"), moodBtn = $("#saveMood"), moodHist = $("#moodHistory");
  if (moodSel && moodBtn && moodHist){
    moodBtn.addEventListener("click", async ()=>{
      await Storage.add("mood", { id:null, date: todayStr(), mood: moodSel.value });
      state.data.lastMood = moodSel.value; persistData();
      await reloadMood(); refreshDashboardOnly(["w-mood"]);
    });
    reloadMood();
  }

  // GOALS
  const gf = $("#goalForm"), gTitle = $("#goalTitle"), gTarget = $("#goalTarget"), gList = $("#goalList");
  if (gf && gTitle && gTarget && gList){
    gf.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const title = gTitle.value.trim(); const target = Number(gTarget.value||0);
      if (!title) return;
      await Storage.add("goals", { id:null, title, target, progress:0, created: Date.now() });
      gTitle.value=""; gTarget.value="";
      state.data.mainGoal = title; persistData();
      await reloadGoals(); refreshDashboardOnly(["w-goal"]);
    });
    reloadGoals();
  }

  // METRICS (Apple Santé)
  const parseBtn = $("#parseHealth"), fileInput = $("#healthFile");
  if (parseBtn && fileInput){
    parseBtn.addEventListener("click", async ()=>{
      const f = fileInput.files?.[0]; if (!f) return alert("Sélectionne export.xml");
      const xml = await f.text();
      const doc = new DOMParser().parseFromString(xml,"application/xml");
      const recs = [...doc.querySelectorAll("Record")];
      const steps = recs.filter(r=>r.getAttribute("type")==="HKQuantityTypeIdentifierStepCount")
                        .reduce((s,r)=>s+parseFloat(r.getAttribute("value")||"0"),0);
      const weights = recs.filter(r=>r.getAttribute("type")==="HKQuantityTypeIdentifierBodyMass")
                          .map(r=>parseFloat(r.getAttribute("value")||"0"));
      await Storage.add("metrics", { id:null, date: Date.now(), steps, weights });
      await reloadMetrics(); refreshDashboardOnly(["w-health"]);
    });
    reloadMetrics();
  }

  // SEARCH (simple placeholder)
  const sInput = $("#searchInput"), sBtn = $("#searchBtn"), sRes = $("#searchResults");
  if (sInput && sBtn && sRes){
    sBtn.addEventListener("click", async ()=>{
      const q = sInput.value.trim().toLowerCase();
      if (!q) { sRes.innerHTML = ""; return; }
      const [journal, tasks, habits] = await Promise.all([
        Storage.getAll("journal"), Storage.getAll("tasks"), Storage.getAll("habits")
      ]);
      const matches = [];
      journal.forEach(n=>{ if ((n.text||"").toLowerCase().includes(q)) matches.push(`📝 Note: ${n.text}`); });
      tasks.forEach(t=>{ if ((t.title||"").toLowerCase().includes(q)) matches.push(`✅ Tâche: ${t.title}`); });
      habits.forEach(h=>{ if ((h.name||"").toLowerCase().includes(q)) matches.push(`🔥 Habitude: ${h.name}`); });
      sRes.innerHTML = matches.length ? matches.map(m=>`<div class="card glass">${m}</div>`).join("") : `<div class="card glass">Aucun résultat</div>`;
    });
  }
}

/* ---------- Renderers ---------- */
async function reloadJournal(){
  const ul = $("#journalList"); if (!ul) return;
  const items = (await Storage.getAll("journal")).sort((a,b)=>b.date-a.date);
  ul.innerHTML = items.map(n=>`<li class="card glass"><div>${n.text}</div><small>${new Date(n.date).toLocaleString()}</small></li>`).join("");
}

async function reloadTasks(){
  const todo = $("#todoList"), doing=$("#doingList"), done=$("#doneList");
  if (!todo || !doing || !done) return;
  const items = await Storage.getAll("tasks");
  const toHTML = (t)=>`
    <li class="card glass">
      <div>${t.done?'✅':'⬜️'} ${t.title} <small>${t.due? new Date(t.due).toLocaleDateString():''}</small></div>
      <div class="row">
        <button class="btn" data-action="toggle" data-id="${t.id}">✔️</button>
        <button class="btn" data-action="advance" data-id="${t.id}">➡️</button>
        <button class="btn danger" data-action="del" data-id="${t.id}">🗑</button>
      </div>
    </li>`;
  const byStage = { todo:[], doing:[], done:[] };
  items.forEach(t=> byStage[t.stage||"todo"].push(t));
  todo.innerHTML  = byStage.todo.map(toHTML).join("");
  doing.innerHTML = byStage.doing.map(toHTML).join("");
  done.innerHTML  = byStage.done.map(toHTML).join("");

  // Actions
  [todo,doing,done].forEach(list=>{
    list.addEventListener("click", async (e)=>{
      const btn = e.target.closest("button[data-id][data-action]"); if (!btn) return;
      const id = Number(btn.dataset.id), action = btn.dataset.action;
      const all = await Storage.getAll("tasks");
      const t = all.find(x=>x.id===id); if (!t) return;
      if (action==="toggle"){ t.done=!t.done; await Storage.put("tasks", t); }
      if (action==="advance"){
        t.stage = t.stage==="todo" ? "doing" : (t.stage==="doing" ? "done" : "done");
        if (t.stage==="done") t.done=true;
        await Storage.put("tasks", t);
      }
      if (action==="del"){ await Storage.del("tasks", id); }
      await reloadTasks(); refreshDashboardOnly(["w-tasks"]);
    }, { once: true }); // on réattache après reload
  });
}

async function reloadHabits(){
  const ul = $("#habitList"); if (!ul) return;
  const items = await Storage.getAll("habits");
  ul.innerHTML = items.map(h=>`
    <li class="card glass">
      <div>🔥 ${h.name} <small>Aujourd’hui: ${h.log?.[todayStr()]||0}</small></div>
      <div class="row">
        <button class="btn" data-action="inc" data-id="${h.id}">+1</button>
        <button class="btn danger" data-action="del" data-id="${h.id}">🗑</button>
      </div>
    </li>`).join("");
}

async function reloadNutrition(){
  const ul = $("#nutriList"); if (!ul) return;
  const items = (await Storage.getAll("nutrition")).sort((a,b)=> (a.date<b.date?1:-1));
  const total = items.filter(i=>i.date===todayStr()).reduce((s,i)=>s+(i.kcal||0),0);
  ul.innerHTML = `<li class="card glass"><strong>Total aujourd’hui:</strong> ${total} kcal</li>` + 
    items.map(n=>`<li class="card glass">${n.date} -- ${n.food} • ${n.kcal||0} kcal</li>`).join("");
}

async function reloadMood(){
  const div = $("#moodHistory"); if (!div) return;
  const items = (await Storage.getAll("mood")).sort((a,b)=> (a.date<b.date?1:-1));
  div.innerHTML = items.map(m=>`${m.date} -- ${m.mood}`).join("<br>");
}

async function reloadGoals(){
  const ul = $("#goalList"); if (!ul) return;
  const items = await Storage.getAll("goals");
  ul.innerHTML = items.map(g=>`
    <li class="card glass">
      <div>🎯 ${g.title}</div>
      <small>Objectif: ${g.target}</small>
    </li>`).join("");
}

async function reloadMetrics(){
  const div = $("#healthSummary"); if (!div) return;
  const items = await Storage.getAll("metrics");
  if (!items.length){ div.textContent = "Aucune donnée santé"; return; }
  const last = items[items.length-1];
  div.innerHTML = `Pas: <strong>${last.steps}</strong> • Poids: <strong>${(last.weights||[]).slice(-1)[0] ?? "--"}</strong> kg`;
}

/* ---------- Dashboard ---------- */
function refreshDashboard(){
  // lastNote
  $("#w-lastNote p")?.textContent = state.data.lastNote || "--";
  // tasks
  Storage.getAll("tasks").then(ts=>{
    $("#w-tasks p") && ($("#w-tasks p").textContent = ts.filter(t=>!t.done).length + " à faire");
  });
  // habits
  Storage.getAll("habits").then(hs=>{
    $("#w-habits p") && ($("#w-habits p").textContent = hs.filter(h=> (h.log?.[todayStr()]||0) > 0).length + " complétées");
  });
  // mood, goal, weather, quote
  $("#w-mood p")   && ($("#w-mood p").textContent = state.data.lastMood || "--");
  $("#w-goal p")   && ($("#w-goal p").textContent = state.data.mainGoal || "--");
  $("#w-weather p")&& ($("#w-weather p").textContent = state.data.weather || "--");
  $("#w-quote p")  && ($("#w-quote p").textContent = state.data.quote || "--");
}
function refreshDashboardOnly(ids){
  ids.forEach(id=>{
    if (id==="w-lastNote") $("#w-lastNote p").textContent = state.data.lastNote || "--";
    if (id==="w-mood")     $("#w-mood p").textContent = state.data.lastMood || "--";
    if (id==="w-goal")     $("#w-goal p").textContent = state.data.mainGoal || "--";
    if (id==="w-weather")  $("#w-weather p").textContent = state.data.weather || "--";
    if (id==="w-quote")    $("#w-quote p").textContent = state.data.quote || "--";
    if (id==="w-tasks")    Storage.getAll("tasks").then(ts=> $("#w-tasks p").textContent = ts.filter(t=>!t.done).length + " à faire");
    if (id==="w-habits")   Storage.getAll("habits").then(hs=> $("#w-habits p").textContent = hs.filter(h=> (h.log?.[todayStr()]||0) > 0).length + " complétées");
  });
}

/* ---------- Data preload (météo + citation) ---------- */
function preloadData(){
  // Citation du jour
  fetch("https://api.quotable.io/random").then(r=>r.json()).then(d=>{
    state.data.quote = d.content; persistData(); refreshDashboardOnly(["w-quote"]);
  }).catch(()=>{});

  // Météo
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos=>{
      const { latitude, longitude } = pos.coords;
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`)
        .then(r=>r.json()).then(d=>{
          const t = d?.current?.temperature_2m;
          if (typeof t !== "undefined") {
            state.data.weather = `${t}°C`;
            persistData(); refreshDashboardOnly(["w-weather"]);
          }
        }).catch(()=>{});
    });
  }
}

/* ---------- Load persisted stores into memory (optional) ---------- */
async function loadAllStores(){
  // Rien à charger explicitement dans state (on lit direct Storage au rendu),
  // mais on peut initialiser les structures de base :
  if (!Array.isArray(state.data.tasks)) state.data.tasks = [];        // pour compatibilité ancienne version
  persistData();
}

/* ---------- Persist top-level data ---------- */
function persistData(){
  localStorage.setItem("scos_data", JSON.stringify(state.data));
}