
const cfg=window.APP_CONFIG||{};
const sb = (cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith("INSERISCI"))
  ? supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY)
  : null;

const $=s=>document.querySelector(s);
const authView=$("#authView"), appView=$("#appView"), view=$("#view"), tabs=$("#tabs"), headerUser=$("#headerUser");
let currentUser=null, profile=null, athleteProfile=null, activeTab="home";

const athleteTabs=["home","wellness","training","tests","races","performance","injuries","history","report"];
const doctorTabs=["home","history","performance","injuries","report"];
const coachTabs=["home","athletes","wellness","training","tests","races","performance","injuries","history","report","settings"];
const labels={home:"Home",athletes:"Atleti",wellness:"Wellness",training:"Allenamento",tests:"Test",races:"Gare",performance:"Performance",injuries:"Infortuni",history:"Storico",report:"Report",settings:"Impostazioni"};

const DEFAULT_TRAINING_TYPES=["Accelerazioni","Tempo Run","Forza","Lanciati","V Max","Capacità lattacida","Potenza lattacida","Speed Endurance","Special Speed Endurance","Ostacoli / Tecnica ostacoli","Tecnica di corsa","Pliometria","Recupero / Rigenerazione","Gara","Altro"];
const DEFAULT_TESTS=[
 {name:"CMJ",category:"Neuromuscolare",unit:"cm",attempts:3,higher_better:true},
 {name:"SJ",category:"Neuromuscolare",unit:"cm",attempts:3,higher_better:true},
 {name:"RSI",category:"Neuromuscolare",unit:"RSI",attempts:3,higher_better:true},
 {name:"Lungo da fermo",category:"Potenza orizzontale",unit:"m",attempts:3,higher_better:true},
 {name:"Policoncorrenza",category:"Coordinativo",unit:"punti",attempts:1,higher_better:true},
 {name:"30 m",category:"Sprint",unit:"s",attempts:3,higher_better:false},
 {name:"Flying 30 m",category:"V Max",unit:"s",attempts:3,higher_better:false},
 {name:'8×30 m rec. 30"',category:"RSA",unit:"s",attempts:8,higher_better:false},
 {name:"RM Squat",category:"Forza",unit:"kg",attempts:1,higher_better:true},
 {name:"RM Stacco",category:"Forza",unit:"kg",attempts:1,higher_better:true},
 {name:"Test 6'",category:"Aerobico",unit:"m",attempts:1,higher_better:true}
];

if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));

$("#loginForm").addEventListener("submit",async e=>{
 e.preventDefault();
 if(!sb){setAuthMsg("Configura prima Supabase in config.js.");return}
 setAuthMsg("Accesso...");
 const {data,error}=await sb.auth.signInWithPassword({email:$("#loginEmail").value,password:$("#loginPassword").value});
 if(error){setAuthMsg(error.message);return}
 await boot(data.user);
});
function setAuthMsg(x){$("#authMsg").textContent=x}
async function boot(user){
 currentUser=user;
 const {data:p,error}=await sb.from("profiles").select("*").eq("id",user.id).single();
 if(error){setAuthMsg("Profilo non configurato.");return}
 profile=p;
 if(profile.role==="athlete"){
   const {data:a}=await sb.from("athletes").select("*").eq("user_id",user.id).single();
   athleteProfile=a;
 }
 authView.classList.add("hidden");appView.classList.remove("hidden");headerUser.classList.remove("hidden");
 headerUser.innerHTML=`<span>${profile.full_name}<br><small>${profile.role==="coach"?"Allenatore":profile.role==="doctor"?"Medico sportivo":"Atleta"}</small></span><button class="secondary" id="logoutBtn">Esci</button>`;
 $("#logoutBtn").onclick=async()=>{await sb.auth.signOut();location.reload()};
 activeTab="home";renderTabs();await render();
}
async function restore(){
 if(!sb)return;
 const {data:{session}}=await sb.auth.getSession();
 if(session) await boot(session.user);
}
restore();

function renderTabs(){
 const arr=profile.role==="coach"?coachTabs:(profile.role==="doctor"?doctorTabs:athleteTabs);
 tabs.innerHTML=arr.map(t=>`<button class="tabBtn ${activeTab===t?"active":""}" data-tab="${t}">${labels[t]}</button>`).join("");
 tabs.querySelectorAll("button").forEach(b=>b.onclick=async()=>{activeTab=b.dataset.tab;renderTabs();await render()});
}
async function render(){
 const fn={home:renderHome,athletes:renderAthletes,wellness:renderWellness,training:renderTraining,tests:renderTests,races:renderRaces,performance:renderPerformance,injuries:renderInjuries,history:renderHistory,report:renderReport,settings:renderSettings}[activeTab];
 await fn();
}
const stat=(l,v)=>`<div class="stat"><span>${l}</span><b>${v}</b></div>`;
const avg=a=>a.length?a.reduce((s,x)=>s+Number(x||0),0)/a.length:0;
const fmt=d=>d?new Date(d).toLocaleString("it-IT"):"";
const toast=t=>{const x=$("#toast");x.textContent=t;x.classList.remove("hidden");setTimeout(()=>x.classList.add("hidden"),2200)};


const isStaff=()=>profile?.role==="coach"||profile?.role==="doctor";
const canCoachEdit=()=>profile?.role==="coach";

async function deleteCoachRecord(table,id,rerender,label="dato"){
 if(!canCoachEdit())return;
 if(!confirm(`Eliminare definitivamente questo ${label}?`))return;
 const {error}=await sb.from(table).delete().eq("id",id);
 if(error)return toast(error.message);
 toast("Dato eliminato");
 await rerender();
}
async function getAthletes(){
 const q=await sb.from("athletes").select("*").eq("active",true).order("display_name");
 return q.data||[];
}
async function athleteSelectHTML(id="athleteId"){
 if(profile.role==="athlete") return `<input type="hidden" id="${id}" value="${athleteProfile.id}"><p><b>Atleta:</b> ${athleteProfile.display_name}</p>`;
 const aa=await getAthletes();
 return `<label>Atleta<select id="${id}">${aa.map(a=>`<option value="${a.id}">${a.display_name}</option>`).join("")}</select></label>`;
}
async function renderHome(){
 if(profile.role==="athlete"){
   const id=athleteProfile.id;
   const [{data:t},{data:w},{data:tr},{data:r}]=await Promise.all([
    sb.from("trainings").select("*").eq("athlete_id",id).order("recorded_at",{ascending:true}),
    sb.from("wellness").select("*").eq("athlete_id",id).order("recorded_at",{ascending:true}),
    sb.from("test_results").select("*,tests(name,higher_better)").eq("athlete_id",id).order("recorded_at",{ascending:true}),
    sb.from("races").select("*,race_types(name)").eq("athlete_id",id).order("race_date",{ascending:true})
   ]);
   const alerts=buildAthleteAlerts(athleteProfile,w||[],t||[],tr||[],r||[]);
   view.innerHTML=`<div class="card hero"><h2>${athleteProfile.display_name}</h2><div class="stats">${stat("Sedute",t?.length||0)}${stat("TL totale",(t||[]).reduce((s,x)=>s+Number(x.session_load||0),0)+" AU")}${stat("Test",tr?.length||0)}${stat("Gare",r?.length||0)}</div></div>
   ${athleteAlertPanel(alerts,false)}
   <div class="actionGrid"><button class="actionBtn" data-go="wellness">+ Wellness</button><button class="actionBtn" data-go="training">+ Allenamento</button><button class="actionBtn" data-go="tests">+ Test</button><button class="actionBtn" data-go="races">+ Gara</button></div>`;
   document.querySelectorAll("[data-go]").forEach(b=>b.onclick=async()=>{activeTab=b.dataset.go;renderTabs();await render()});
 } else {
   const aa=await getAthletes();
   const [{data:t},{data:w},{data:tr},{data:r}]=await Promise.all([
    sb.from("trainings").select("id,session_load,athlete_id,recorded_at"),
    sb.from("wellness").select("id,score,sleep,fatigue,doms,stress,pain,athlete_id,recorded_at"),
    sb.from("test_results").select("id,athlete_id,mean_value,recorded_at,tests(name,higher_better)"),
    sb.from("races").select("id,athlete_id,result,race_date,race_types(name)")
   ]);
   const alertRows=aa.map(a=>({athlete:a,alerts:buildAthleteAlerts(
      a,
      (w||[]).filter(x=>x.athlete_id===a.id),
      (t||[]).filter(x=>x.athlete_id===a.id),
      (tr||[]).filter(x=>x.athlete_id===a.id),
      (r||[]).filter(x=>x.athlete_id===a.id)
   )}));
   const critical=alertRows.filter(x=>x.alerts.status==="red").length;
   const watch=alertRows.filter(x=>x.alerts.status==="orange").length;
   view.innerHTML=`<div class="grid two"><div class="card"><h2>${profile.role==="doctor"?"Dashboard medico sportivo":"Dashboard allenatore"}</h2><div class="stats">${stat("Atleti",aa.length)}${stat("Allenamenti",t?.length||0)}${stat("Test",tr?.length||0)}${stat("Gare",r?.length||0)}</div></div>
   <div class="card"><h2>Stato gruppo oggi</h2><div class="stats">${stat("🔴 Controllo",critical)}${stat("🟠 Attenzione",watch)}${stat("🟢 Regolari",Math.max(0,aa.length-critical-watch))}</div></div></div>
   <div class="card"><div class="sectionTitle"><div><h2>Atleti da controllare oggi</h2><p class="muted">Alert operativi basati sui dati registrati.</p></div><button class="secondary" id="enableNotifyHome">🔔 Notifiche</button></div>
   <div class="alertGrid">${alertRows.map(x=>coachAlertCard(x.athlete,x.alerts)).join("")}</div></div>
   <div class="card"><h2>Carico totale registrato</h2><div class="kpi">${(t||[]).reduce((s,x)=>s+Number(x.session_load||0),0)} AU</div></div>`;
   document.querySelectorAll("[data-hist]").forEach(b=>b.onclick=async()=>{sessionStorage.setItem("historyAthlete",b.dataset.hist);activeTab="history";renderTabs();await render()});
   if($("#enableNotifyHome")) $("#enableNotifyHome").onclick=enableNotifications;
   await maybeNotifyCoach(alertRows);
 }
}

function startOfDay(d=new Date()){const x=new Date(d);x.setHours(0,0,0,0);return x}
function buildAthleteAlerts(athlete,wellness,trainings,tests,races){
 const items=[];
 const latestW=wellness.length?[...wellness].sort((a,b)=>new Date(b.recorded_at)-new Date(a.recorded_at))[0]:null;
 const today=startOfDay(), latestDay=latestW?startOfDay(new Date(latestW.recorded_at)):null;
 if(!latestW || latestDay.getTime()!==today.getTime()){
   items.push({level:"orange",text:"Wellness di oggi non ancora compilato"});
 } else {
   const score=Number(latestW.score||0);
   if(score<=10) items.push({level:"red",text:`Wellness basso: ${score}/20`});
   else if(score<=13) items.push({level:"orange",text:`Wellness da monitorare: ${score}/20`});
   if(Number(latestW.fatigue)<=2) items.push({level:Number(latestW.fatigue)===1?"red":"orange",text:"Stanchezza elevata"});
   if(Number(latestW.doms)<=2) items.push({level:Number(latestW.doms)===1?"red":"orange",text:"DOMS elevati"});
   if(Number(latestW.stress)<=2) items.push({level:Number(latestW.stress)===1?"red":"orange",text:"Stress elevato"});
   const pain=String(latestW.pain||"").trim();
   if(pain && !/^(nessuno|no|0)$/i.test(pain)){
     const n=(pain.match(/\b(10|[0-9])\b/)||[])[1];
     items.push({level:n&&Number(n)>=7?"red":"orange",text:`Dolore segnalato: ${pain}`});
   }
 }
 const now=new Date(), d7=new Date(now);d7.setDate(d7.getDate()-7);
 const d14=new Date(now);d14.setDate(d14.getDate()-14);
 const curTL=trainings.filter(x=>new Date(x.recorded_at)>=d7).reduce((s,x)=>s+Number(x.session_load||0),0);
 const prevTL=trainings.filter(x=>new Date(x.recorded_at)>=d14&&new Date(x.recorded_at)<d7).reduce((s,x)=>s+Number(x.session_load||0),0);
 if(prevTL>0){
   const ratio=curTL/prevTL;
   if(ratio>=1.5) items.push({level:"red",text:`TL 7 gg +${Math.round((ratio-1)*100)}% vs 7 gg precedenti`});
   else if(ratio>=1.3) items.push({level:"orange",text:`TL 7 gg +${Math.round((ratio-1)*100)}% vs 7 gg precedenti`});
 }
 const byTest={};
 tests.forEach(x=>{const n=x.tests?.name||"Test";(byTest[n]??=[]).push(x)});
 Object.entries(byTest).forEach(([name,list])=>{
   const s=[...list].sort((a,b)=>new Date(a.recorded_at)-new Date(b.recorded_at));
   if(s.length>=3){
     const last=s.slice(-3), hb=!!last[0].tests?.higher_better, v=last.map(x=>Number(x.mean_value));
     const worsening=hb?(v[0]>v[1]&&v[1]>v[2]):(v[0]<v[1]&&v[1]<v[2]);
     if(worsening) items.push({level:"orange",text:`${name}: 3 rilevazioni consecutive in peggioramento`});
   }
 });
 let status=items.some(x=>x.level==="red")?"red":items.some(x=>x.level==="orange")?"orange":"green";
 if(status==="green") items.push({level:"green",text:"Nessuna criticità rilevata"});
 return {status,items,curTL,prevTL};
}
function athleteAlertPanel(alerts,coach=false){
 const icon=alerts.status==="red"?"🔴":alerts.status==="orange"?"🟠":"🟢";
 return `<div class="card alertPanel ${alerts.status}"><div class="sectionTitle"><h3>${icon} Stato di oggi</h3><span class="badge">${alerts.status==="red"?"Controllare":alerts.status==="orange"?"Attenzione":"Regolare"}</span></div><ul>${alerts.items.map(x=>`<li>${x.text}</li>`).join("")}</ul></div>`;
}
function coachAlertCard(a,alerts){
 const icon=alerts.status==="red"?"🔴":alerts.status==="orange"?"🟠":"🟢";
 return `<div class="alertAthlete ${alerts.status}"><div class="sectionTitle"><h3>${icon} ${a.display_name}</h3><button class="secondary" data-hist="${a.id}">Storico</button></div><ul>${alerts.items.slice(0,4).map(x=>`<li>${x.text}</li>`).join("")}</ul></div>`;
}
async function enableNotifications(){
 if(!("Notification" in window)){toast("Notifiche non supportate da questo browser.");return}
 const permission=await Notification.requestPermission();
 localStorage.setItem("pamNotifications",permission);
 toast(permission==="granted"?"Notifiche attivate":"Notifiche non autorizzate");
}
async function showLocalNotification(title,body,tag){
 if(Notification.permission!=="granted")return;
 try{
   const reg=await navigator.serviceWorker.ready;
   await reg.showNotification(title,{body,tag,icon:"",badge:""});
 }catch(e){
   try{new Notification(title,{body,tag})}catch(_){}
 }
}
async function maybeNotifyCoach(rows){
 if(localStorage.getItem("pamNotifications")!=="granted" || Notification.permission!=="granted")return;
 const critical=rows.filter(x=>x.alerts.status==="red");
 if(!critical.length)return;
 const key="pam-alert-"+new Date().toISOString().slice(0,10)+"-"+critical.map(x=>x.athlete.id).sort().join("-");
 if(localStorage.getItem("pamLastAlertNotification")===key)return;
 await showLocalNotification("Patruno Athlete Monitor",`${critical.length} atleta/i con alert rosso da controllare oggi`,"coach-alert");
 localStorage.setItem("pamLastAlertNotification",key);
}

async function renderAthletes(){
 const aa=await sb.from("athletes").select("*").order("display_name");
 view.innerHTML=`<div class="card"><div class="sectionTitle"><h2>Gestione atleti</h2></div>
 <p class="note">Per creare un nuovo account atleta: crea prima l'utente in Supabase Authentication, poi associa qui il relativo UUID.</p>
 <form id="athForm" class="grid two">
  <label>Nome atleta<input id="athName" required></label>
  <label>UUID utente Supabase<input id="athUserId" placeholder="opzionale finché non crei il login"></label>
  <div><button class="primary">Aggiungi atleta</button></div>
 </form></div>
 <div class="card"><div class="tableWrap"><table><thead><tr><th>Atleta</th><th>Login collegato</th><th>Stato</th></tr></thead><tbody>${(aa.data||[]).map(a=>`<tr><td>${a.display_name}</td><td>${a.user_id||"—"}</td><td>${a.active?"Attivo":"Disattivato"}</td></tr>`).join("")}</tbody></table></div></div>`;
 $("#athForm").onsubmit=async e=>{
   e.preventDefault();
   const payload={owner_coach_id:currentUser.id,display_name:$("#athName").value.trim(),active:true};
   if($("#athUserId").value.trim()) payload.user_id=$("#athUserId").value.trim();
   const {error}=await sb.from("athletes").insert(payload); if(error) return toast(error.message); toast("Atleta aggiunto");await renderAthletes();
 };
}

async function renderWellness(){
 const athleteField=await athleteSelectHTML();
 view.innerHTML=`<div class="card"><h2>Wellness pre-allenamento</h2><form id="wellForm">${athleteField}
 ${scale("Sonno","sleep")}${scale("Stanchezza","fatigue")}${scale("DOMS","doms")}${scale("Stress","stress")}
 <label>Dolore / problema fisico<textarea id="pain" placeholder="Sede e intensità 0-10, oppure nessuno"></textarea></label>
 <button class="primary">Salva wellness</button></form></div><div id="wellRecent"></div>`;
 $("#wellForm").onsubmit=async e=>{
  e.preventDefault();
  const athleteId=$("#athleteId").value;
  const today=isoDateToday();
  const {data:existing}=await sb.from("wellness").select("id").eq("athlete_id",athleteId).gte("recorded_at",today+"T00:00:00").lte("recorded_at",today+"T23:59:59").limit(1);
  if(existing?.length)return toast("Wellness già compilato oggi.");
  const payload={athlete_id:athleteId,sleep:+$("#sleep").value,fatigue:+$("#fatigue").value,doms:+$("#doms").value,stress:+$("#stress").value,pain:$("#pain").value};
  const {error}=await sb.from("wellness").insert(payload);
  if(error){
    if(String(error.message).toLowerCase().includes("wellness_one_per_day"))return toast("Wellness già compilato oggi.");
    return toast(error.message);
  }
  toast("Wellness salvato");await renderWellness();
 };
 await renderRecentWellness();
}
function scale(l,id){
 const anchors={
  sleep:["Pessimo","Scarso","Discreto","Buono","Ottimo"],
  fatigue:["Molto stanco","Stanco","Normale","Fresco","Molto fresco"],
  doms:["Molto forti","Forti","Moderati","Lievi","Assenti"],
  stress:["Molto alto","Alto","Moderato","Basso","Molto basso"]
 };
 const a=anchors[id]||["Molto basso","Basso","Moderato","Alto","Molto alto"];
 return `<label>${l} (1–5)<select id="${id}">${[1,2,3,4,5].map((n,i)=>`<option value="${n}">${n} — ${a[i]}</option>`).join("")}</select></label>`;
}
async function renderRecentWellness(){
 let q=sb.from("wellness").select("*,athletes(display_name)").order("recorded_at",{ascending:false}).limit(10);
 if(profile.role==="athlete") q=q.eq("athlete_id",athleteProfile.id);
 const {data}=await q;
 $("#wellRecent").innerHTML=recentCard("Ultimi wellness",(data||[]).map(x=>[fmt(x.recorded_at),x.athletes?.display_name||"",`Score ${x.score}/20`,x.pain||"",canCoachEdit()?`<button class="dangerBtn" data-del-well="${x.id}">Elimina</button>`:""]));
 if(canCoachEdit()) document.querySelectorAll("[data-del-well]").forEach(b=>b.onclick=()=>deleteCoachRecord("wellness",b.dataset.delWell,renderRecentWellness,"wellness"));
}

async function getTrainingTypes(){
 const {data}=await sb.from("training_types").select("*").eq("active",true).order("name");
 return data||[];
}
async function renderTraining(){
 const athleteField=await athleteSelectHTML(), types=await getTrainingTypes();
 view.innerHTML=`<div class="card"><h2>Registra allenamento</h2><form id="trainingForm">${athleteField}
 <label>Tipo seduta<select id="trainingType">${types.map(x=>`<option value="${x.id}">${x.name}</option>`).join("")}</select></label>
 <label>Lavoro reale svolto<textarea id="workDone" placeholder="Serie, ripetizioni, distanze, recuperi, carichi..."></textarea></label>
 <label>Tempi / risultati principali<textarea id="timesResults"></textarea></label>
 <div class="grid two"><label>Durata (min)<input type="number" id="duration" min="1" required></label><label>Session-RPE CR10
 <select id="srpe" required>
  <option value="0">0 — Riposo / nessuno sforzo</option>
  <option value="1">1 — Molto, molto facile</option>
  <option value="2">2 — Facile</option>
  <option value="3">3 — Moderato</option>
  <option value="4">4 — Moderatamente impegnativo</option>
  <option value="5">5 — Impegnativo</option>
  <option value="6">6 — Molto impegnativo</option>
  <option value="7">7 — Molto duro</option>
  <option value="8">8 — Durissimo</option>
  <option value="9">9 — Quasi massimale</option>
  <option value="10">10 — Massimale</option>
 </select></label></div>
 <label>Dolore / problemi post<textarea id="painPost"></textarea></label><label>Note<textarea id="trainingNotes"></textarea></label>
 <button class="primary">Salva allenamento</button></form></div><div id="trainRecent"></div>`;
 $("#trainingForm").onsubmit=async e=>{
   e.preventDefault();
   const payload={athlete_id:$("#athleteId").value,training_type_id:$("#trainingType").value,duration_min:+$("#duration").value,srpe:+$("#srpe").value,work_done:$("#workDone").value,times_results:$("#timesResults").value,pain_post:$("#painPost").value,notes:$("#trainingNotes").value};
   const {error}=await sb.from("trainings").insert(payload);if(error)return toast(error.message);toast("Allenamento salvato");await renderTraining();
 };
 await renderRecentTraining();
}
async function renderRecentTraining(){
 let q=sb.from("trainings").select("*,athletes(display_name),training_types(name)").order("recorded_at",{ascending:false}).limit(10);
 if(profile.role==="athlete") q=q.eq("athlete_id",athleteProfile.id);
 const {data}=await q;
 $("#trainRecent").innerHTML=recentCard("Ultimi allenamenti",(data||[]).map(x=>[fmt(x.recorded_at),x.athletes?.display_name||"",x.training_types?.name||"",`${x.duration_min} min · RPE ${x.srpe} · ${x.session_load} AU`,canCoachEdit()?`<button class="dangerBtn" data-del-training="${x.id}">Elimina</button>`:""]));
 if(canCoachEdit()) document.querySelectorAll("[data-del-training]").forEach(b=>b.onclick=()=>deleteCoachRecord("trainings",b.dataset.delTraining,renderRecentTraining,"allenamento"));
}

async function getTests(){
 const {data}=await sb.from("tests").select("*").eq("active",true).order("name");return data||[];
}
async function renderTests(){
 const athleteField=await athleteSelectHTML(), tests=await getTests();
 view.innerHTML=`<div class="card"><div class="sectionTitle"><h2>Test</h2>${profile.role==="coach"?'<button class="primary" id="newTest">+ Nuovo test</button>':""}</div>
 <form id="testForm">${athleteField}<label>Test<select id="testId">${tests.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select></label><div id="attempts"></div>
 <label>Note<textarea id="testNotes"></textarea></label><button class="primary">Salva test</button></form></div><div id="testRecent"></div>`;
 const draw=()=>{const t=tests.find(x=>x.id===$("#testId").value);$("#attempts").innerHTML=t?`<p class="note">${t.category||""} · unità ${t.unit||""} · ${t.higher_better?"più alto = migliore":"più basso = migliore"}</p>`+Array.from({length:t.attempts},(_,i)=>`<label>Prova ${i+1}<input class="attempt" type="number" step="0.001" required></label>`).join(""):""};
 $("#testId").onchange=draw;draw();
 $("#testForm").onsubmit=async e=>{
   e.preventDefault();const t=tests.find(x=>x.id===$("#testId").value), vals=[...document.querySelectorAll(".attempt")].map(x=>+x.value), mean=avg(vals), best=t.higher_better?Math.max(...vals):Math.min(...vals);
   const {error}=await sb.from("test_results").insert({athlete_id:$("#athleteId").value,test_id:t.id,values:vals,mean_value:mean,best_value:best,notes:$("#testNotes").value});
   if(error)return toast(error.message);toast("Test salvato");await renderTests();
 };
 if($("#newTest")) $("#newTest").onclick=()=>openNewTest(tests);
 await renderRecentTests();
}
async function openNewTest(){
 const name=prompt("Nome nuovo test");if(!name)return;
 const unit=prompt("Unità (s, cm, m, kg, W, RSI...)","s")||"";
 const attempts=Number(prompt("Numero di prove","3")||1);
 const higher=confirm("OK = valore più alto migliore. Annulla = valore più basso migliore.");
 const {error}=await sb.from("tests").insert({owner_coach_id:currentUser.id,name,category:"Personalizzato",unit,attempts,higher_better:higher,active:true});
 if(error)return toast(error.message);toast("Test aggiunto");await renderTests();
}
async function renderRecentTests(){
 let q=sb.from("test_results").select("*,athletes(display_name),tests(name,unit)").order("recorded_at",{ascending:false}).limit(10);
 if(profile.role==="athlete") q=q.eq("athlete_id",athleteProfile.id);
 const {data}=await q;
 $("#testRecent").innerHTML=recentCard("Ultimi test",(data||[]).map(x=>[fmt(x.recorded_at),x.athletes?.display_name||"",x.tests?.name||"",`Media ${x.mean_value} · Best ${x.best_value} ${x.tests?.unit||""}`,canCoachEdit()?`<button class="dangerBtn" data-del-test="${x.id}">Elimina</button>`:""]));
 if(canCoachEdit()) document.querySelectorAll("[data-del-test]").forEach(b=>b.onclick=()=>deleteCoachRecord("test_results",b.dataset.delTest,renderRecentTests,"test"));
}

async function getRaceTypes(){const {data}=await sb.from("race_types").select("*").eq("active",true).order("name");return data||[]}
async function renderRaces(){
 const athleteField=await athleteSelectHTML(), types=await getRaceTypes();
 view.innerHTML=`<div class="card"><div class="sectionTitle"><h2>Storico gare</h2>${profile.role==="coach"?'<button class="primary" id="newRaceType">+ Nuova specialità</button>':""}</div>
 <form id="raceForm">${athleteField}<label>Specialità<select id="raceType">${types.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select></label>
 <label>Data gara<input id="raceDate" type="date" required></label><label>Manifestazione<input id="meeting"></label><label>Risultato<input id="raceResult" type="number" step="0.001" required></label>
 <div id="raceExtras"></div><button class="primary">Salva gara</button></form></div><div id="raceRecent"></div>`;
 const draw=()=>{const t=types.find(x=>x.id===$("#raceType").value);const fields=t?.fields||[];$("#raceExtras").innerHTML=fields.map(f=>`<label>${cap(f)}${["note","intertempi","ritmica"].includes(f)?`<textarea data-extra="${f}"></textarea>`:`<input data-extra="${f}">`}</label>`).join("")};
 $("#raceType").onchange=draw;draw();
 $("#raceForm").onsubmit=async e=>{
  e.preventDefault();const extras={};document.querySelectorAll("[data-extra]").forEach(x=>extras[x.dataset.extra]=x.value);
  const {error}=await sb.from("races").insert({athlete_id:$("#athleteId").value,race_type_id:$("#raceType").value,race_date:$("#raceDate").value,meeting:$("#meeting").value,result:+$("#raceResult").value,extras});
  if(error)return toast(error.message);toast("Gara salvata");await renderRaces();
 };
 if($("#newRaceType")) $("#newRaceType").onclick=async()=>{const name=prompt("Nuova specialità");if(!name)return;const unit=prompt("Unità risultato","s")||"s";const fields=(prompt("Campi extra separati da virgola","vento,piazzamento,turno,note")||"").split(",").map(x=>x.trim()).filter(Boolean);const {error}=await sb.from("race_types").insert({owner_coach_id:currentUser.id,name,unit,fields,active:true});if(error)return toast(error.message);toast("Specialità aggiunta");await renderRaces()};
 await renderRecentRaces();
}
async function renderRecentRaces(){
 let q=sb.from("races").select("*,athletes(display_name),race_types(name,unit)").order("race_date",{ascending:false}).limit(10);
 if(profile.role==="athlete") q=q.eq("athlete_id",athleteProfile.id);
 const {data}=await q;$("#raceRecent").innerHTML=recentCard("Ultime gare",(data||[]).map(x=>[x.race_date,x.athletes?.display_name||"",x.race_types?.name||"",`${x.result} ${x.race_types?.unit||""}`,canCoachEdit()?`<button class="dangerBtn" data-del-race="${x.id}">Elimina</button>`:""]));
 if(canCoachEdit()) document.querySelectorAll("[data-del-race]").forEach(b=>b.onclick=()=>deleteCoachRecord("races",b.dataset.delRace,renderRecentRaces,"gara"));
}



async function getCustomFields(section){
 let q=sb.from("custom_fields").select("*").eq("section",section).eq("active",true).order("created_at");
 const {data,error}=await q;
 if(error){console.warn("custom_fields",error.message);return []}
 return data||[];
}
function customFieldInput(field,prefix="cf"){
 const id=`${prefix}_${field.field_key}`,req=field.required?"required":"";
 const label=`${field.label}${field.required?" *":""}`;
 if(field.field_type==="number") return `<label>${label}<input data-cf="${field.field_key}" id="${id}" type="number" step="any" ${req}></label>`;
 if(field.field_type==="date") return `<label>${label}<input data-cf="${field.field_key}" id="${id}" type="date" ${req}></label>`;
 if(field.field_type==="boolean") return `<label>${label}<select data-cf="${field.field_key}" id="${id}" ${req}><option value="">—</option><option value="Sì">Sì</option><option value="No">No</option></select></label>`;
 if(field.field_type==="select"){
   const opts=Array.isArray(field.options)?field.options:[];
   return `<label>${label}<select data-cf="${field.field_key}" id="${id}" ${req}><option value="">—</option>${opts.map(o=>`<option value="${String(o).replace(/"/g,"&quot;")}">${o}</option>`).join("")}</select></label>`;
 }
 if(field.field_type==="textarea") return `<label>${label}<textarea data-cf="${field.field_key}" id="${id}" ${req}></textarea></label>`;
 return `<label>${label}<input data-cf="${field.field_key}" id="${id}" type="text" ${req}></label>`;
}
function renderCustomFields(fields,prefix="cf"){
 if(!fields.length)return "";
 return `<div class="customFieldsBlock"><h4>Campi personalizzati</h4><div class="grid two">${fields.map(f=>customFieldInput(f,prefix)).join("")}</div></div>`;
}
function collectCustomFields(fields,prefix="cf"){
 const out={};
 fields.forEach(f=>{const el=document.getElementById(`${prefix}_${f.field_key}`);if(el&&el.value!=="")out[f.field_key]=el.value});
 return out;
}
function customExtrasHTML(extras,fields){
 const x=extras||{}, visible=fields.filter(f=>Object.prototype.hasOwnProperty.call(x,f.field_key)&&String(x[f.field_key])!=="");
 if(!visible.length)return "—";
 return visible.map(f=>`<span class="extraPill"><b>${f.label}:</b> ${x[f.field_key]}</span>`).join(" ");
}
function slugFieldKey(label){
 return (label||"campo").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,32)+"_"+Date.now().toString(36);
}
const SPRINT_QUALITIES=["Accelerazione","V Max / Lanciati","Speed Endurance","Special Speed Endurance","Ostacoli","Tecnica di corsa","Altro"];
const STRENGTH_QUALITIES=["Forza Max","Potenza","Forza speciale","Mantenimento","Prevenzione","Forza generale","Altro"];

function isoDateToday(){return new Date().toISOString().slice(0,10)}
function daysAgo(n){const d=new Date();d.setDate(d.getDate()-n);return d}
function parseDateLocal(x){return x?new Date(String(x).length===10?x+"T12:00:00":x):null}

async function renderPerformance(){
 const aa=isStaff()?await getAthletes():[athleteProfile];
 const initial=sessionStorage.getItem("perfAthlete")||aa[0]?.id;
 view.innerHTML=`<div class="card">
  <div class="sectionTitle"><div><h2>Performance</h2><p class="muted">Volume specifico sprint, qualità della forza e profilo test.</p></div><span class="badge redBadge">V3</span></div>
  ${isStaff()?`<label>Atleta<select id="perfAth">${aa.map(a=>`<option value="${a.id}" ${a.id===initial?"selected":""}>${a.display_name}</option>`).join("")}</select></label>`:""}
  <div class="segmented" id="perfSections">
    <button class="perfSec active" data-sec="sprint">Sprint</button>
    <button class="perfSec" data-sec="strength">Forza</button>
    <button class="perfSec" data-sec="profile">Profilo test</button>
  </div>
  <div id="perfBody"></div>
 </div>`;
 let sec="sprint";
 const athleteId=()=>isStaff()?$("#perfAth").value:athleteProfile.id;
 async function draw(){
   if(sec==="sprint") await drawSprintPerformance(athleteId());
   if(sec==="strength") await drawStrengthPerformance(athleteId());
   if(sec==="profile") await drawTestProfile(athleteId());
 }
 if(isStaff()) $("#perfAth").onchange=async()=>{sessionStorage.setItem("perfAthlete",$("#perfAth").value);await draw()};
 document.querySelectorAll(".perfSec").forEach(b=>b.onclick=async()=>{
   document.querySelectorAll(".perfSec").forEach(x=>x.classList.remove("active"));b.classList.add("active");sec=b.dataset.sec;await draw();
 });
 await draw();
}

async function drawSprintPerformance(id){
 const [{data},{data:customOptions}]=await Promise.all([
   sb.from("sprint_volume").select("*").eq("athlete_id",id).order("session_date",{ascending:true}),
   sb.from("custom_options").select("*").eq("section","sprint_quality").eq("active",true).order("name")
 ]);
 const fields=await getCustomFields("sprint");
 const qualities=[...SPRINT_QUALITIES,...(customOptions||[]).map(x=>x.name).filter(n=>!SPRINT_QUALITIES.includes(n))];
 const all=data||[], d7=daysAgo(7),d30=daysAgo(30);
 const m7=all.filter(x=>parseDateLocal(x.session_date)>=d7).reduce((s,x)=>s+Number(x.meters||0),0);
 const m30=all.filter(x=>parseDateLocal(x.session_date)>=d30).reduce((s,x)=>s+Number(x.meters||0),0);
 const byQ={};all.filter(x=>parseDateLocal(x.session_date)>=d30).forEach(x=>byQ[x.quality]=(byQ[x.quality]||0)+Number(x.meters||0));
 const editForm=profile.role==="doctor"?"":`<div class="card innerCard"><h3>Registra volume sprint</h3><form id="sprintVolForm">
  <label>Data<input type="date" id="svDate" value="${isoDateToday()}" required></label>
  <label>Qualità<select id="svQuality">${qualities.map(x=>`<option>${x}</option>`).join("")}</select></label>
  <div class="grid two"><label>Metri totali<input type="number" id="svMeters" min="0" step="1" required></label><label>N. prove<input type="number" id="svReps" min="1" step="1"></label></div>
  ${renderCustomFields(fields,"svcf")}
  <label>Note<textarea id="svNotes" placeholder="Es. 4×30 m + 3×60 m, rec. 4'"></textarea></label>
  <button class="primary">Salva volume</button>
 </form></div>`;
 $("#perfBody").innerHTML=`<div class="grid two">${editForm}
 <div class="card innerCard"><h3>Riepilogo</h3><div class="stats">${stat("Ultimi 7 gg",`${Math.round(m7)} m`)}${stat("Ultimi 30 gg",`${Math.round(m30)} m`)}</div>
 ${simpleBarChart(Object.entries(byQ).map(([label,value])=>({label,value})),"Volume 30 giorni per qualità","m")}</div></div>
 <div class="tableWrap historyGrid"><table><thead><tr><th>Data</th><th>Qualità</th><th>Metri</th><th>Prove</th><th>Campi extra</th><th>Note</th></tr></thead><tbody>${all.slice().reverse().map(x=>`<tr><td>${x.session_date}</td><td><b>${x.quality}</b></td><td>${x.meters} m</td><td>${x.reps||"—"}</td><td>${customExtrasHTML(x.extras,fields)}</td><td>${x.notes||"—"}</td></tr>`).join("")||'<tr><td colspan="6">Nessun volume sprint registrato</td></tr>'}</tbody></table></div>`;
 if($("#sprintVolForm")) $("#sprintVolForm").onsubmit=async e=>{
  e.preventDefault();
  const {error}=await sb.from("sprint_volume").insert({athlete_id:id,session_date:$("#svDate").value,quality:$("#svQuality").value,meters:+$("#svMeters").value,reps:$("#svReps").value?+$("#svReps").value:null,extras:collectCustomFields(fields,"svcf"),notes:$("#svNotes").value});
  if(error)return toast(error.message);toast("Volume sprint salvato");await drawSprintPerformance(id);
 };
}

async function drawStrengthPerformance(id){
 const [{data},{data:customOptions}]=await Promise.all([
   sb.from("strength_log").select("*").eq("athlete_id",id).order("session_date",{ascending:true}),
   sb.from("custom_options").select("*").eq("section","strength_quality").eq("active",true).order("name")
 ]);
 const fields=await getCustomFields("strength");
 const qualities=[...STRENGTH_QUALITIES,...(customOptions||[]).map(x=>x.name).filter(n=>!STRENGTH_QUALITIES.includes(n))];
 const all=data||[], recent=all.filter(x=>parseDateLocal(x.session_date)>=daysAgo(30));
 const vol=recent.reduce((s,x)=>s+Number(x.volume_load||0),0);
 const byQ={};recent.forEach(x=>byQ[x.quality]=(byQ[x.quality]||0)+Number(x.volume_load||0));
 const editForm=profile.role==="doctor"?"":`<div class="card innerCard"><h3>Registra lavoro di forza</h3><form id="strengthForm">
  <label>Data<input type="date" id="stDate" value="${isoDateToday()}" required></label>
  <label>Qualità<select id="stQuality">${qualities.map(x=>`<option>${x}</option>`).join("")}</select></label>
  <label>Esercizio<input id="stExercise" placeholder="Squat, hip thrust, Nordic..." required></label>
  <div class="grid three"><label>Serie<input type="number" id="stSets" min="1" required></label><label>Ripetizioni<input type="number" id="stReps" min="1" required></label><label>Carico kg<input type="number" id="stLoad" min="0" step="0.5" value="0"></label></div>
  ${renderCustomFields(fields,"stcf")}
  <label>Note<textarea id="stNotes" placeholder="%1RM, velocità, variante, recupero..."></textarea></label>
  <button class="primary">Salva forza</button>
 </form></div>`;
 $("#perfBody").innerHTML=`<div class="grid two">${editForm}
 <div class="card innerCard"><h3>Ultimi 30 giorni</h3><div class="stats">${stat("Esercizi",recent.length)}${stat("Volume-load",`${Math.round(vol)} kg`)}</div>
 ${simpleBarChart(Object.entries(byQ).filter(([,v])=>v>0).map(([label,value])=>({label,value})),"Volume-load per qualità","kg")}</div></div>
 <p class="note"><b>Nota sport science:</b> il volume-load (serie × ripetizioni × kg) è utile soprattutto per esercizi esterni caricati. Nordic, pliometria e lavori balistici vanno interpretati anche qualitativamente e non ridotti al solo tonnellaggio.</p>
 <div class="tableWrap historyGrid"><table><thead><tr><th>Data</th><th>Qualità</th><th>Esercizio</th><th>Serie×rep</th><th>Carico</th><th>Volume-load</th><th>Campi extra</th><th>Note</th></tr></thead><tbody>${all.slice().reverse().map(x=>`<tr><td>${x.session_date}</td><td><b>${x.quality}</b></td><td>${x.exercise}</td><td>${x.sets}×${x.reps}</td><td>${x.load_kg||0} kg</td><td>${Math.round(Number(x.volume_load||0))} kg</td><td>${customExtrasHTML(x.extras,fields)}</td><td>${x.notes||"—"}</td></tr>`).join("")||'<tr><td colspan="8">Nessun lavoro di forza registrato</td></tr>'}</tbody></table></div>`;
 if($("#strengthForm")) $("#strengthForm").onsubmit=async e=>{
  e.preventDefault();
  const {error}=await sb.from("strength_log").insert({athlete_id:id,session_date:$("#stDate").value,quality:$("#stQuality").value,exercise:$("#stExercise").value.trim(),sets:+$("#stSets").value,reps:+$("#stReps").value,load_kg:+$("#stLoad").value,extras:collectCustomFields(fields,"stcf"),notes:$("#stNotes").value});
  if(error)return toast(error.message);toast("Lavoro di forza salvato");await drawStrengthPerformance(id);
 };
}

async function drawTestProfile(id){
 const {data}=await sb.from("test_results").select("*,tests(name,unit,higher_better,category)").eq("athlete_id",id).order("recorded_at",{ascending:true});
 const all=data||[], groups={};all.forEach(x=>{const n=x.tests?.name||"Test";(groups[n]??=[]).push(x)});
 const cards=Object.entries(groups).map(([name,list])=>{
  const first=list[0],last=list.at(-1),vals=list.map(x=>Number(x.mean_value)).filter(Number.isFinite);
  const hb=!!first.tests?.higher_better;
  const pb=vals.length?(hb?Math.max(...vals):Math.min(...vals)):null;
  const delta=first&&last?pctChange(Number(last.mean_value),Number(first.mean_value),!hb):null;
  return `<div class="profileMetric"><div class="sectionTitle"><h3>${name}</h3>${changeBadge(delta)}</div>
   <div class="miniMetrics"><span>Baseline<b>${Number(first.mean_value).toFixed(2)} ${first.tests?.unit||""}</b></span><span>Ultimo<b>${Number(last.mean_value).toFixed(2)} ${last.tests?.unit||""}</b></span><span>PB<b>${pb!==null?pb.toFixed(2):"—"} ${first.tests?.unit||""}</b></span></div>
   ${simpleLineChart(list.map(x=>({label:new Date(x.recorded_at).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"}),value:Number(x.mean_value)})),name,first.tests?.unit||"",!hb)}
  </div>`;
 }).join("");
 $("#perfBody").innerHTML=`<div class="sectionTitle"><div><h3>Profilo test atleta</h3><p class="muted">Baseline = prima rilevazione disponibile · PB = miglior valore storico.</p></div></div>
 <div class="profileGrid">${cards||'<div class="note">Nessun test registrato.</div>'}</div>`;
}

async function renderInjuries(){
 const aa=isStaff()?await getAthletes():[athleteProfile];
 const allFields=await getCustomFields("injury");
 const fields=isStaff()?allFields:allFields.filter(f=>f.athlete_visible);
 const athleteField=isStaff()?`<label>Atleta<select id="injAth">${aa.map(a=>`<option value="${a.id}">${a.display_name}</option>`).join("")}</select></label>`:`<p><b>Atleta:</b> ${athleteProfile.display_name}</p>`;
 view.innerHTML=`<div class="card"><div class="sectionTitle"><div><h2>Storico infortuni & problematiche</h2><p class="muted">Registro separato dal wellness quotidiano.</p></div><span class="badge redBadge">MEDICAL LOG</span></div>
 ${profile.role==="coach"?`<form id="injuryForm">${athleteField}
 <div class="grid two"><label>Data inizio<input type="date" id="injStart" value="${isoDateToday()}" required></label><label>Sede<input id="injSite" placeholder="es. femorale dx, caviglia sx" required></label></div>
 <label>Problematica / diagnosi riferita<input id="injType" required></label>
 <div class="grid three"><label>Dolore 0–10<input type="number" id="injPain" min="0" max="10" value="0"></label><label>Limitazione<select id="injLimit"><option value="none">Nessuna</option><option value="reduced">Allenamento ridotto</option><option value="stop">Stop allenamento</option></select></label><label>Giorni persi<input type="number" id="injDays" min="0" value="0"></label></div>
 <div class="grid two"><label>Stato<select id="injStatus"><option value="active">Attivo</option><option value="recovering">In recupero</option><option value="resolved">Risolto</option></select></label><label>Data rientro<input type="date" id="injReturn"></label></div>
 ${renderCustomFields(fields,"injcf")}
 <label>Note / trattamento<textarea id="injNotes"></textarea></label><button class="primary">Salva problematica</button>
 </form>`:`<p class="note">Questa sezione è consultabile dall'atleta. L'inserimento e l'aggiornamento del registro sono riservati al coach.</p>`}
 ${profile.role==="doctor"?athleteField:""}
 </div><div id="injuryList"></div>`;
 async function draw(){
  const id=isStaff()?$("#injAth").value:athleteProfile.id;
  const {data}=await sb.from("injuries").select("*").eq("athlete_id",id).order("start_date",{ascending:false});
  $("#injuryList").innerHTML=`<div class="card"><div class="stats">${stat("Totale",(data||[]).length)}${stat("Attivi",(data||[]).filter(x=>x.status==="active").length)}${stat("Giorni persi",(data||[]).reduce((s,x)=>s+Number(x.days_lost||0),0))}</div>
  <div class="tableWrap historyGrid"><table><thead><tr><th>Inizio</th><th>Sede</th><th>Problematica</th><th>Dolore</th><th>Limitazione</th><th>Giorni persi</th><th>Stato</th><th>Rientro</th><th>Campi extra</th><th>Note</th></tr></thead><tbody>${(data||[]).map(x=>`<tr><td>${x.start_date}</td><td><b>${x.site}</b></td><td>${x.issue_type}</td><td>${x.pain_score}/10</td><td>${x.limitation}</td><td>${x.days_lost}</td><td><span class="badge ${x.status==="resolved"?"ok":x.status==="active"?"danger":""}">${x.status}</span></td><td>${x.return_date||"—"}</td><td>${customExtrasHTML(x.extras,fields)}</td><td>${x.notes||"—"}</td></tr>`).join("")||'<tr><td colspan="10">Nessuna problematica registrata</td></tr>'}</tbody></table></div></div>`;
 }
 if(isStaff()) $("#injAth").onchange=draw;
 if(profile.role==="coach"){
  $("#injuryForm").onsubmit=async e=>{
   e.preventDefault();
   const {error}=await sb.from("injuries").insert({athlete_id:$("#injAth").value,start_date:$("#injStart").value,site:$("#injSite").value.trim(),issue_type:$("#injType").value.trim(),pain_score:+$("#injPain").value,limitation:$("#injLimit").value,days_lost:+$("#injDays").value,status:$("#injStatus").value,return_date:$("#injReturn").value||null,extras:collectCustomFields(fields,"injcf"),notes:$("#injNotes").value});
   if(error)return toast(error.message);toast("Problematica salvata");await draw();
  };
 }
 await draw();
}

async function renderReport(){
 const aa=isStaff()?await getAthletes():[athleteProfile];
 const allFields=await getCustomFields("report");
 const fields=isStaff()?allFields:allFields.filter(f=>f.athlete_visible);
 const monthNow=new Date().toISOString().slice(0,7);
 view.innerHTML=`<div class="card noPrint"><div class="sectionTitle"><div><h2>Report mensile atleta</h2><p class="muted">Sintesi di carico, qualità, test, gare e problematiche.</p></div><button class="primary" id="printReport">🖨️ Stampa / salva PDF</button></div>
 <div class="grid two">${isStaff()?`<label>Atleta<select id="repAth">${aa.map(a=>`<option value="${a.id}">${a.display_name}</option>`).join("")}</select></label>`:""}<label>Mese<input type="month" id="repMonth" value="${monthNow}"></label></div></div>
 <div id="reportBody"></div>`;
 const athleteId=()=>isStaff()?$("#repAth").value:athleteProfile.id;
 async function draw(){
  const id=athleteId(), ath=aa.find(x=>x.id===id)||athleteProfile, ym=$("#repMonth").value;
  const start=ym+"-01", endDate=new Date(Number(ym.slice(0,4)),Number(ym.slice(5,7)),0),end=endDate.toISOString().slice(0,10);
  const [{data:t},{data:w},{data:te},{data:r},{data:sv},{data:st},{data:inj},{data:mr}]=await Promise.all([
   sb.from("trainings").select("*,training_types(name)").eq("athlete_id",id).gte("recorded_at",start).lte("recorded_at",end+"T23:59:59"),
   sb.from("wellness").select("*").eq("athlete_id",id).gte("recorded_at",start).lte("recorded_at",end+"T23:59:59"),
   sb.from("test_results").select("*,tests(name,unit,higher_better)").eq("athlete_id",id).gte("recorded_at",start).lte("recorded_at",end+"T23:59:59"),
   sb.from("races").select("*,race_types(name,unit)").eq("athlete_id",id).gte("race_date",start).lte("race_date",end),
   sb.from("sprint_volume").select("*").eq("athlete_id",id).gte("session_date",start).lte("session_date",end),
   sb.from("strength_log").select("*").eq("athlete_id",id).gte("session_date",start).lte("session_date",end),
   sb.from("injuries").select("*").eq("athlete_id",id).lte("start_date",end),
   sb.from("monthly_reports").select("*").eq("athlete_id",id).eq("month_start",start).maybeSingle()
  ]);
  const tl=(t||[]).reduce((s,x)=>s+Number(x.session_load||0),0),well=(w||[]).length?avg((w||[]).map(x=>Number(x.score||0))):null;
  const sprint=(sv||[]).reduce((s,x)=>s+Number(x.meters||0),0),strength=(st||[]).reduce((s,x)=>s+Number(x.volume_load||0),0);
  const bySprint={};(sv||[]).forEach(x=>bySprint[x.quality]=(bySprint[x.quality]||0)+Number(x.meters||0));
  const activeInj=(inj||[]).filter(x=>x.status!=="resolved" || (x.return_date&&x.return_date>=start));
  const reportExtra=mr?.extras||{};
  const extraDisplay=fields.filter(f=>reportExtra[f.field_key]!==undefined&&reportExtra[f.field_key]!=="").map(f=>`<p><b>${f.label}:</b> ${reportExtra[f.field_key]}</p>`).join("");
  $("#reportBody").innerHTML=`<div class="reportPage">
   <div class="reportHeader"><div><h1>${ath.display_name}</h1><p>Report performance · ${new Date(start+"T12:00:00").toLocaleDateString("it-IT",{month:"long",year:"numeric"})}</p></div><div class="reportMark">PAM</div></div>
   <div class="stats reportStats">${stat("Sedute",(t||[]).length)}${stat("Training Load",`${Math.round(tl)} AU`)}${stat("Wellness medio",well!==null?`${well.toFixed(1)}/20`:"—")}${stat("Sprint",`${Math.round(sprint)} m`)}${stat("Volume forza",`${Math.round(strength)} kg`)}${stat("Gare",(r||[]).length)}</div>
   <div class="grid two reportGrid">
    <div><h3>Qualità sprint</h3>${simpleBarChart(Object.entries(bySprint).map(([label,value])=>({label,value})),"Volume specifico","m")}</div>
    <div><h3>Test del mese</h3>${rows((te||[]).map(x=>[fmt(x.recorded_at),x.tests?.name||"",`${Number(x.mean_value).toFixed(2)} ${x.tests?.unit||""}`]))}</div>
    <div><h3>Gare</h3>${rows((r||[]).map(x=>[x.race_date,x.race_types?.name||"",`${x.result} ${x.race_types?.unit||""}`]))}</div>
    <div><h3>Problematiche / infortuni</h3>${rows(activeInj.map(x=>[x.start_date,x.site,x.issue_type,x.status]))}</div>
   </div>
   ${profile.role==="coach"?`<div class="reportCustomFields">${renderCustomFields(fields,"repcf")}</div>`:(extraDisplay?`<div class="reportCustomFields"><h3>Dati aggiuntivi</h3>${extraDisplay}</div>`:"")}
   <div class="reportComment"><h3>Commento coach</h3>${profile.role==="coach"?`<textarea id="reportCommentText" placeholder="Sintesi tecnica del mese, progressi, criticità, obiettivi successivi...">${mr?.coach_comment||""}</textarea><button class="primary noPrint" id="saveReportComment">Salva report</button>`:`<p>${mr?.coach_comment||"Nessun commento inserito."}</p>`}</div>
  </div>`;
  if(profile.role==="coach"){
    fields.forEach(f=>{const el=document.getElementById(`repcf_${f.field_key}`);if(el&&reportExtra[f.field_key]!==undefined)el.value=reportExtra[f.field_key]});
    if($("#saveReportComment")) $("#saveReportComment").onclick=async()=>{
      const payload={athlete_id:id,month_start:start,coach_comment:$("#reportCommentText").value,extras:collectCustomFields(fields,"repcf"),coach_id:currentUser.id};
      const {error}=await sb.from("monthly_reports").upsert(payload,{onConflict:"athlete_id,month_start"});
      if(error)return toast(error.message);toast("Report salvato");
    };
  }
 }
 if(isStaff()) $("#repAth").onchange=draw;
 $("#repMonth").onchange=draw;
 $("#printReport").onclick=()=>window.print();
 await draw();
}

async function renderHistory(){
 const aa=isStaff()?await getAthletes():[athleteProfile];
 const initial=sessionStorage.getItem("historyAthlete")||aa[0]?.id;
 view.innerHTML=`<div class="card historyShell">
   <div class="sectionTitle">
     <div><h2>Storico & progressi</h2><p class="muted">Confronta allenamenti, test, gare e wellness nel tempo.</p></div>
     <div class="historyActions"><button class="secondary" id="exportHistory">⬇️ Esporta CSV</button><span class="badge redBadge">PROGRESSI</span></div>
   </div>
   ${isStaff()?`<label>Atleta<select id="histAth">${aa.map(a=>`<option value="${a.id}" ${a.id===initial?"selected":""}>${a.display_name}</option>`).join("")}</select></label>`:""}
   <div class="historyToolbar">
     <div class="segmented" id="historyRanges">
       <button class="histRange active" data-days="7">7 giorni</button>
       <button class="histRange" data-days="30">30 giorni</button>
       <button class="histRange" data-days="90">90 giorni</button>
       <button class="histRange" data-days="0">Tutto</button>
     </div>
     <div class="segmented" id="historySections">
       <button class="histSection active" data-section="training">Allenamenti</button>
       <button class="histSection" data-section="tests">Test</button>
       <button class="histSection" data-section="races">Gare</button>
       <button class="histSection" data-section="wellness">Wellness</button>
     </div>
   </div>
   <div id="historyBody"></div>
 </div>`;

 let days=7, section="training";
 let cache=null;

 async function loadData(){
   const id=isStaff()?$("#histAth").value:athleteProfile.id;
   const a=aa.find(x=>x.id===id)||athleteProfile;
   const [{data:t},{data:w},{data:te},{data:r}]=await Promise.all([
     sb.from("trainings").select("*,training_types(name)").eq("athlete_id",id).order("recorded_at",{ascending:true}),
     sb.from("wellness").select("*").eq("athlete_id",id).order("recorded_at",{ascending:true}),
     sb.from("test_results").select("*,tests(name,unit,higher_better)").eq("athlete_id",id).order("recorded_at",{ascending:true}),
     sb.from("races").select("*,race_types(name,unit)").eq("athlete_id",id).order("race_date",{ascending:true})
   ]);
   cache={a,t:t||[],w:w||[],te:te||[],r:r||[]};
 }
 async function draw(){
   if(!cache) await loadData();
   const filtered={
     training:filterByDays(cache.t,days,"recorded_at"),
     wellness:filterByDays(cache.w,days,"recorded_at"),
     tests:filterByDays(cache.te,days,"recorded_at"),
     races:filterByDays(cache.r,days,"race_date")
   };
   let html=`<div class="sectionTitle"><h3>${cache.a.display_name}</h3><span class="muted">${days?`ultimi ${days} giorni`:"tutto lo storico"}</span></div>`;
   if(section==="training") html+=historyTraining(filtered.training,cache.t,days);
   if(section==="tests") html+=historyTests(filtered.tests,cache.te);
   if(section==="races") html+=historyRaces(filtered.races,cache.r);
   if(section==="wellness") html+=historyWellness(filtered.wellness);
   $("#historyBody").innerHTML=html;
   bindHistoryDynamicControls(filtered);
 }
 function bindHistoryDynamicControls(filtered){
   const testSel=$("#historyTestSelect");
   if(testSel) testSel.onchange=()=>renderSelectedTestChart(filtered.tests,cache.te,testSel.value);
   const raceSel=$("#historyRaceSelect");
   if(raceSel) raceSel.onchange=()=>renderSelectedRaceChart(filtered.races,cache.r,raceSel.value);
 }
 if(isStaff()) $("#histAth").onchange=async()=>{cache=null;await draw();};
 if($("#exportHistory")) $("#exportHistory").onclick=()=>exportHistoryCSV(cache,section,days);
 document.querySelectorAll(".histRange").forEach(b=>b.onclick=async()=>{
   document.querySelectorAll(".histRange").forEach(x=>x.classList.remove("active"));b.classList.add("active");days=+b.dataset.days;await draw();
 });
 document.querySelectorAll(".histSection").forEach(b=>b.onclick=async()=>{
   document.querySelectorAll(".histSection").forEach(x=>x.classList.remove("active"));b.classList.add("active");section=b.dataset.section;await draw();
 });
 await draw();
}

function filterByDays(arr,days,dateField){
 if(!days) return arr;
 const cutoff=new Date();cutoff.setHours(0,0,0,0);cutoff.setDate(cutoff.getDate()-days+1);
 return arr.filter(x=>new Date(x[dateField])>=cutoff);
}
function pctChange(current,previous,lowerBetter=false){
 if(previous===null||previous===undefined||Number(previous)===0||current===null||current===undefined) return null;
 const raw=((Number(current)-Number(previous))/Math.abs(Number(previous)))*100;
 return lowerBetter?-raw:raw;
}
function changeBadge(v){
 if(v===null||!Number.isFinite(v)) return `<span class="badge">—</span>`;
 const cls=v>0.01?"ok":v<-0.01?"danger":"";
 const sign=v>0?"+":"";
 return `<span class="badge ${cls}">${sign}${v.toFixed(1)}%</span>`;
}
function periodBounds(days){
 const now=new Date();now.setHours(23,59,59,999);
 const currentStart=new Date(now);currentStart.setDate(currentStart.getDate()-days+1);currentStart.setHours(0,0,0,0);
 const previousEnd=new Date(currentStart);previousEnd.setMilliseconds(-1);
 const previousStart=new Date(currentStart);previousStart.setDate(previousStart.getDate()-days);
 return {currentStart,now,previousStart,previousEnd};
}
function historyTraining(current,all,days){
 const tl=current.reduce((s,x)=>s+Number(x.session_load||0),0);
 const srpe=current.length?avg(current.map(x=>Number(x.srpe||0))):0;
 const dur=current.reduce((s,x)=>s+Number(x.duration_min||0),0);
 let previousTL=0,delta=null;
 if(days){
   const b=periodBounds(days);
   const prev=all.filter(x=>{const d=new Date(x.recorded_at);return d>=b.previousStart&&d<=b.previousEnd});
   previousTL=prev.reduce((s,x)=>s+Number(x.session_load||0),0);
   delta=pctChange(tl,previousTL,false);
 }
 const byDay={};
 current.forEach(x=>{const k=new Date(x.recorded_at).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"});byDay[k]=(byDay[k]||0)+Number(x.session_load||0)});
 const points=Object.entries(byDay).map(([label,value])=>({label,value}));
 return `<div class="stats">
   ${stat("Sedute",current.length)}
   ${stat("TL totale",`${Math.round(tl)} AU`)}
   ${stat("sRPE medio",current.length?srpe.toFixed(1):"—")}
   ${stat("Durata",`${Math.round(dur)} min`)}
 </div>
 ${days?`<div class="comparisonCard"><div><span class="muted">Periodo precedente</span><b>${Math.round(previousTL)} AU</b></div><div class="compareArrow">→</div><div><span class="muted">Periodo attuale</span><b>${Math.round(tl)} AU</b></div><div class="right">${previousTL===0&&tl>0?'<span class="badge ok">Nuovo carico</span>':changeBadge(delta)}</div></div>`:""}
 ${simpleBarChart(points,"Training Load giorno per giorno","AU")}
 <div class="tableWrap historyGrid"><table><thead><tr><th>Data</th><th>Tipo</th><th>Lavoro svolto</th><th>Tempi</th><th>Durata</th><th>sRPE</th><th>TL</th><th>Dolore</th></tr></thead><tbody>
 ${current.slice().reverse().map(x=>`<tr><td>${fmt(x.recorded_at)}</td><td><b>${x.training_types?.name||""}</b></td><td>${x.work_done||"—"}</td><td>${x.times_results||"—"}</td><td>${x.duration_min} min</td><td>${x.srpe}</td><td><b>${x.session_load} AU</b></td><td>${x.pain_post||"—"}</td></tr>`).join("")||'<tr><td colspan="8">Nessun allenamento nel periodo</td></tr>'}
 </tbody></table></div>`;
}
function historyTests(current,all){
 const names=[...new Set(current.map(x=>x.tests?.name).filter(Boolean))];
 const grouped={};all.forEach(x=>{const n=x.tests?.name||"Test";(grouped[n]??=[]).push(x)});
 const grid=current.slice().reverse().map(x=>{
   const list=grouped[x.tests?.name||"Test"]||[];
   const idx=list.findIndex(y=>y.id===x.id);
   const prev=idx>0?list[idx-1]:null;
   const delta=prev?pctChange(x.mean_value,prev.mean_value,!x.tests?.higher_better):null;
   const vals=list.map(y=>Number(y.mean_value)).filter(Number.isFinite);
   const pb=vals.length?(x.tests?.higher_better?Math.max(...vals):Math.min(...vals)):null;
   const isPB=pb!==null&&Math.abs(Number(x.mean_value)-pb)<1e-9;
   return `<tr><td>${fmt(x.recorded_at)}</td><td><b>${x.tests?.name||""}</b></td><td>${Array.isArray(x.values)?x.values.join(" · "):""}</td><td>${Number(x.mean_value).toFixed(2)} ${x.tests?.unit||""}</td><td>${Number(x.best_value).toFixed(2)} ${x.tests?.unit||""}</td><td>${changeBadge(delta)}</td><td>${isPB?'<span class="badge ok">PB</span>':pb!==null?`${pb.toFixed(2)} ${x.tests?.unit||""}`:"—"}</td></tr>`;
 }).join("");
 const picker=names.length?`<div class="chartPicker"><label>Grafico test<select id="historyTestSelect">${names.map(n=>`<option value="${n}">${n}</option>`).join("")}</select></label></div><div id="historyTestChart">${testChartHTML(current,all,names[0])}</div>`:"";
 return `<div class="stats">${stat("Test nel periodo",current.length)}${stat("Tipi di test",names.length)}</div>
 ${picker}
 <div class="tableWrap historyGrid"><table><thead><tr><th>Data</th><th>Test</th><th>Prove</th><th>Media</th><th>Best prova</th><th>Δ vs precedente</th><th>PB</th></tr></thead><tbody>${grid||'<tr><td colspan="7">Nessun test nel periodo</td></tr>'}</tbody></table></div>`;
}
function renderSelectedTestChart(current,all,name){
 const el=$("#historyTestChart");if(el)el.innerHTML=testChartHTML(current,all,name);
}
function testChartHTML(current,all,name){
 const allSame=all.filter(x=>x.tests?.name===name);
 const curIds=new Set(current.filter(x=>x.tests?.name===name).map(x=>x.id));
 const series=allSame.filter(x=>curIds.has(x.id)).map(x=>({label:new Date(x.recorded_at).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"}),value:Number(x.mean_value)}));
 if(!series.length)return `<div class="note">Nessun dato per ${name} nel periodo selezionato.</div>`;
 const meta=allSame[0]?.tests||{};
 const best=meta.higher_better?Math.max(...allSame.map(x=>Number(x.mean_value))):Math.min(...allSame.map(x=>Number(x.mean_value)));
 return `${simpleLineChart(series,`${name} — media delle prove`,meta.unit||"",!meta.higher_better)}<div class="chartFooter"><span>PB storico: <b>${best.toFixed(2)} ${meta.unit||""}</b></span></div>`;
}
function historyRaces(current,all){
 const names=[...new Set(current.map(x=>x.race_types?.name).filter(Boolean))];
 const year=new Date().getFullYear();
 const grouped={};all.forEach(x=>{const n=x.race_types?.name||"Gara";(grouped[n]??=[]).push(x)});
 const grid=current.slice().reverse().map(x=>{
   const name=x.race_types?.name||"";
   const list=grouped[name]||[];
   const idx=list.findIndex(y=>y.id===x.id);
   const prev=idx>0?list[idx-1]:null;
   const delta=prev?pctChange(x.result,prev.result,true):null;
   const vals=list.map(y=>Number(y.result)).filter(Number.isFinite);
   const pb=vals.length?Math.min(...vals):null;
   const season=list.filter(y=>new Date(y.race_date).getFullYear()===year);
   const sb=season.length?Math.min(...season.map(y=>Number(y.result))):null;
   const ex=x.extras||{};
   return `<tr><td>${x.race_date}</td><td><b>${name}</b></td><td>${x.meeting||"—"}</td><td><b>${x.result} ${x.race_types?.unit||""}</b></td><td>${ex.vento||"—"}</td><td>${ex.piazzamento||"—"}</td><td>${ex.turno||"—"}</td><td>${changeBadge(delta)}</td><td>${pb!==null&&Number(x.result)===pb?'<span class="badge ok">PB</span>':pb??"—"}</td><td>${sb!==null&&Number(x.result)===sb?'<span class="badge ok">SB</span>':sb??"—"}</td></tr>`;
 }).join("");
 const picker=names.length?`<div class="chartPicker"><label>Grafico specialità<select id="historyRaceSelect">${names.map(n=>`<option value="${n}">${n}</option>`).join("")}</select></label></div><div id="historyRaceChart">${raceChartHTML(current,all,names[0])}</div>`:"";
 return `<div class="stats">${stat("Gare nel periodo",current.length)}${stat("Specialità",names.length)}${stat("Stagione",year)}</div>
 ${picker}
 <div class="tableWrap historyGrid"><table><thead><tr><th>Data</th><th>Specialità</th><th>Manifestazione</th><th>Risultato</th><th>Vento</th><th>Pos.</th><th>Turno</th><th>Δ</th><th>PB</th><th>SB</th></tr></thead><tbody>${grid||'<tr><td colspan="10">Nessuna gara nel periodo</td></tr>'}</tbody></table></div>`;
}
function renderSelectedRaceChart(current,all,name){
 const el=$("#historyRaceChart");if(el)el.innerHTML=raceChartHTML(current,all,name);
}
function raceChartHTML(current,all,name){
 const allSame=all.filter(x=>x.race_types?.name===name);
 const curIds=new Set(current.filter(x=>x.race_types?.name===name).map(x=>x.id));
 const series=allSame.filter(x=>curIds.has(x.id)).map(x=>({label:new Date(x.race_date).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"}),value:Number(x.result)}));
 if(!series.length)return `<div class="note">Nessuna gara di ${name} nel periodo selezionato.</div>`;
 const unit=allSame[0]?.race_types?.unit||"";
 const pb=Math.min(...allSame.map(x=>Number(x.result)));
 return `${simpleLineChart(series,`${name} — progressione gare`,unit,true)}<div class="chartFooter"><span>PB storico: <b>${pb} ${unit}</b></span></div>`;
}
function historyWellness(current){
 const mean=current.length?avg(current.map(x=>Number(x.score||0))):null;
 const pain=current.filter(x=>String(x.pain||"").trim()).length;
 const series=current.map(x=>({label:new Date(x.recorded_at).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"}),value:Number(x.score||0)}));
 return `<div class="stats">${stat("Registrazioni",current.length)}${stat("Wellness medio",mean!==null?`${mean.toFixed(1)}/20`:"—")}${stat("Segnalazioni dolore",pain)}</div>
 ${series.length?simpleLineChart(series,"Wellness score","/20"):""}
 <div class="tableWrap historyGrid"><table><thead><tr><th>Data</th><th>Sonno</th><th>Stanchezza</th><th>DOMS</th><th>Stress</th><th>Score</th><th>Dolore</th></tr></thead><tbody>${current.slice().reverse().map(x=>`<tr><td>${fmt(x.recorded_at)}</td><td>${x.sleep}</td><td>${x.fatigue}</td><td>${x.doms}</td><td>${x.stress}</td><td><b>${x.score}/20</b></td><td>${x.pain||"—"}</td></tr>`).join("")||'<tr><td colspan="7">Nessun wellness nel periodo</td></tr>'}</tbody></table></div>`;
}
function simpleBarChart(points,title,unit){
 if(!points.length)return "";
 const max=Math.max(...points.map(p=>Number(p.value)||0),1);
 return `<div class="chartCard"><div class="sectionTitle"><h4>${title}</h4><span class="muted">${unit}</span></div><div class="barChart">${points.slice(-31).map(p=>`<div class="barItem"><div class="barValue">${Math.round(p.value)}</div><div class="barTrack"><div class="barFill" style="height:${Math.max(4,(p.value/max)*100)}%"></div></div><div class="barLabel">${p.label}</div></div>`).join("")}</div></div>`;
}
function simpleLineChart(points,title,unit,lowerBetter=false){
 if(points.length<2)return points.length?`<div class="chartCard"><div class="sectionTitle"><h4>${title}</h4></div><p class="muted">Servono almeno 2 rilevazioni per visualizzare il trend.</p></div>`:"";
 const vals=points.map(p=>Number(p.value));const min=Math.min(...vals),max=Math.max(...vals),range=Math.max(max-min,0.0001);
 const w=760,h=220,pad=30;
 const coords=points.map((p,i)=>{const x=pad+i*((w-pad*2)/Math.max(points.length-1,1));const y=pad+(max-Number(p.value))/range*(h-pad*2);return{x,y,p}});
 const poly=coords.map(c=>`${c.x},${c.y}`).join(" ");
 const first=vals[0],last=vals.at(-1),delta=pctChange(last,first,lowerBetter);
 return `<div class="chartCard"><div class="sectionTitle"><h4>${title}</h4><div>${changeBadge(delta)} <span class="muted">${first} → ${last} ${unit}</span></div></div>
 <svg class="lineChart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
   <polyline points="${poly}" fill="none" stroke="currentColor" stroke-width="3" vector-effect="non-scaling-stroke"/>
   ${coords.map(c=>`<circle cx="${c.x}" cy="${c.y}" r="4.5" fill="currentColor"/>`).join("")}
 </svg>
 <div class="chartLabels"><span>${points[0].label}</span><span>${points.at(-1).label}</span></div></div>`;
}


function csvEscape(v){
 const s=String(v??"").replace(/"/g,'""');
 return `"${s}"`;
}
function downloadCSV(filename,headers,rows){
 const csv="\ufeff"+[headers,...rows].map(r=>r.map(csvEscape).join(";")).join("\n");
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportHistoryCSV(cache,section,days){
 if(!cache)return;
 const athlete=cache.a?.display_name||"atleta",period=days?`${days}gg`:"tutto";
 if(section==="training"){
   const x=filterByDays(cache.t,days,"recorded_at");
   downloadCSV(`${athlete}_allenamenti_${period}.csv`,
    ["Data","Tipo","Lavoro svolto","Tempi/risultati","Durata min","sRPE","Training Load AU","Dolore post","Note"],
    x.map(r=>[fmt(r.recorded_at),r.training_types?.name||"",r.work_done||"",r.times_results||"",r.duration_min,r.srpe,r.session_load,r.pain_post||"",r.notes||""]));
 }else if(section==="wellness"){
   const x=filterByDays(cache.w,days,"recorded_at");
   downloadCSV(`${athlete}_wellness_${period}.csv`,
    ["Data","Sonno","Stanchezza","DOMS","Stress","Score","Dolore"],
    x.map(r=>[fmt(r.recorded_at),r.sleep,r.fatigue,r.doms,r.stress,r.score,r.pain||""]));
 }else if(section==="tests"){
   const x=filterByDays(cache.te,days,"recorded_at");
   downloadCSV(`${athlete}_test_${period}.csv`,
    ["Data","Test","Unità","Prove","Media","Best","Note"],
    x.map(r=>[fmt(r.recorded_at),r.tests?.name||"",r.tests?.unit||"",Array.isArray(r.values)?r.values.join(" | "):"",r.mean_value,r.best_value,r.notes||""]));
 }else if(section==="races"){
   const x=filterByDays(cache.r,days,"race_date");
   downloadCSV(`${athlete}_gare_${period}.csv`,
    ["Data","Specialità","Manifestazione","Risultato","Unità","Extra"],
    x.map(r=>[r.race_date,r.race_types?.name||"",r.meeting||"",r.result,r.race_types?.unit||"",JSON.stringify(r.extras||{})]));
 }
 toast("CSV creato");
}

async function renderSettings(){
 const types=await getTrainingTypes(), tests=await getTests(), races=await getRaceTypes();
 const [{data:fields},{data:opts}]=await Promise.all([
   sb.from("custom_fields").select("*").order("created_at"),
   sb.from("custom_options").select("*").order("section").order("name")
 ]);
 const notif=("Notification" in window)?Notification.permission:"non supportate";
 view.innerHTML=`<div class="grid two">
 <div class="card"><div class="sectionTitle"><h2>Tipi allenamento</h2><button id="addTT" class="primary">+ Aggiungi</button></div>${types.map(x=>`<span class="badge">${x.name}</span>`).join(" ")}</div>
 <div class="card"><h2>Configurazione</h2><p>${tests.length} test attivi · ${races.length} specialità gara attive</p><p class="note">Test e specialità si aggiungono direttamente nelle rispettive pagine.</p></div>

 <div class="card fullSpan"><div class="sectionTitle"><div><h2>Campi personalizzati</h2><p class="muted">Aggiungi campi alle sezioni senza modificare il codice.</p></div></div>
 <form id="customFieldForm" class="grid three">
   <label>Sezione<select id="cfSection"><option value="sprint">Sprint</option><option value="strength">Forza</option><option value="injury">Infortuni</option><option value="report">Report</option></select></label>
   <label>Nome campo<input id="cfLabel" placeholder="es. %1RM, fisioterapista, obiettivo mese" required></label>
   <label>Tipo<select id="cfType"><option value="text">Testo</option><option value="number">Numero</option><option value="date">Data</option><option value="select">Tendina</option><option value="boolean">Sì / No</option><option value="textarea">Testo lungo</option></select></label>
   <label id="cfOptionsWrap" class="hidden">Opzioni tendina<input id="cfOptions" placeholder="es. Basso,Medio,Alto"></label>
   <label><input type="checkbox" id="cfRequired"> Obbligatorio</label>
   <label><input type="checkbox" id="cfAthleteVisible" checked> Visibile all'atleta</label>
   <div><button class="primary">+ Crea campo</button></div>
 </form>
 <div class="tableWrap historyGrid"><table><thead><tr><th>Sezione</th><th>Campo</th><th>Tipo</th><th>Atleta</th><th>Stato</th><th></th></tr></thead><tbody>${(fields||[]).map(f=>`<tr><td>${f.section}</td><td><b>${f.label}</b></td><td>${f.field_type}</td><td>${f.athlete_visible?"Visibile":"Solo coach"}</td><td>${f.active?"Attivo":"Disattivato"}</td><td>${f.active?`<button class="secondary" data-disable-field="${f.id}">Disattiva</button>`:""}</td></tr>`).join("")||'<tr><td colspan="6">Nessun campo personalizzato</td></tr>'}</tbody></table></div>
 </div>

 <div class="card"><h2>Nuove qualità Sprint</h2><form id="sprintOptionForm"><label>Nome<input id="sprintOptionName" placeholder="es. Sprint resistito" required></label><button class="primary">+ Aggiungi</button></form><div class="pillWrap">${(opts||[]).filter(x=>x.section==="sprint_quality"&&x.active).map(x=>`<span class="badge">${x.name}</span>`).join(" ")||'<span class="muted">Nessuna personalizzata</span>'}</div></div>
 <div class="card"><h2>Nuove qualità Forza</h2><form id="strengthOptionForm"><label>Nome<input id="strengthOptionName" placeholder="es. Isometrica" required></label><button class="primary">+ Aggiungi</button></form><div class="pillWrap">${(opts||[]).filter(x=>x.section==="strength_quality"&&x.active).map(x=>`<span class="badge">${x.name}</span>`).join(" ")||'<span class="muted">Nessuna personalizzata</span>'}</div></div>

 <div class="card"><div class="sectionTitle"><h2>Notifiche</h2><button id="enableNotifications" class="primary">🔔 Attiva</button></div><p>Stato browser: <b>${notif}</b></p><p class="note">Le vere push ad app chiusa richiedono un servizio push/backend dedicato.</p></div>
 <div class="card"><h2>Regole alert</h2><p class="note">Wellness basso, stanchezza/DOMS/stress elevati, dolore, aumento marcato del TL 7 giorni e trend negativi dei test.</p></div>
 </div>`;
 $("#addTT").onclick=async()=>{const name=prompt("Nuovo tipo allenamento");if(!name)return;const {error}=await sb.from("training_types").insert({owner_coach_id:currentUser.id,name,active:true});if(error)return toast(error.message);toast("Tipo allenamento aggiunto");await renderSettings()};
 $("#enableNotifications").onclick=enableNotifications;
 $("#cfType").onchange=()=>$("#cfOptionsWrap").classList.toggle("hidden",$("#cfType").value!=="select");
 $("#customFieldForm").onsubmit=async e=>{
   e.preventDefault();
   const options=$("#cfType").value==="select"?$("#cfOptions").value.split(",").map(x=>x.trim()).filter(Boolean):[];
   const payload={owner_coach_id:currentUser.id,section:$("#cfSection").value,field_key:slugFieldKey($("#cfLabel").value),label:$("#cfLabel").value.trim(),field_type:$("#cfType").value,options,required:$("#cfRequired").checked,athlete_visible:$("#cfAthleteVisible").checked,active:true};
   const {error}=await sb.from("custom_fields").insert(payload);if(error)return toast(error.message);toast("Campo creato");await renderSettings();
 };
 document.querySelectorAll("[data-disable-field]").forEach(b=>b.onclick=async()=>{const {error}=await sb.from("custom_fields").update({active:false}).eq("id",b.dataset.disableField);if(error)return toast(error.message);toast("Campo disattivato");await renderSettings()});
 $("#sprintOptionForm").onsubmit=async e=>{e.preventDefault();const name=$("#sprintOptionName").value.trim();const {error}=await sb.from("custom_options").insert({owner_coach_id:currentUser.id,section:"sprint_quality",name,active:true});if(error)return toast(error.message);toast("Qualità sprint aggiunta");await renderSettings()};
 $("#strengthOptionForm").onsubmit=async e=>{e.preventDefault();const name=$("#strengthOptionName").value.trim();const {error}=await sb.from("custom_options").insert({owner_coach_id:currentUser.id,section:"strength_quality",name,active:true});if(error)return toast(error.message);toast("Qualità forza aggiunta");await renderSettings()};
}
function recentCard(title,data){return `<div class="card"><h3>${title}</h3>${rows(data)}</div>`}
function rows(data){return `<div class="tableWrap"><table><tbody>${data.length?data.map(r=>`<tr>${r.map(c=>`<td>${c??""}</td>`).join("")}</tr>`).join(""):`<tr><td>Nessun dato</td></tr>`}</tbody></table></div>`}
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
