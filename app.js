
const cfg=window.APP_CONFIG||{};
const sb = (cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith("INSERISCI"))
  ? supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY)
  : null;

const $=s=>document.querySelector(s);
const authView=$("#authView"), appView=$("#appView"), view=$("#view"), tabs=$("#tabs"), headerUser=$("#headerUser");
let currentUser=null, profile=null, athleteProfile=null, activeTab="home";

const athleteTabs=["home","attendance","program","wellness","training","tests","races","performance","compare","injuries","history","report"];
const doctorTabs=["home","attendance","program","performance","compare","history","injuries","report"];
const coachTabs=["home","attendance","program","athletes","wellness","training","tests","races","performance","compare","injuries","history","report","settings"];
const assistantTabs=["home","attendance","program","wellness","training","tests","races","performance","compare","injuries","history","report"];
const labels={home:"Dashboard",attendance:"Presenze",program:"Programma",athletes:"Atleti",wellness:"Wellness",training:"Allenamento",tests:"Test",races:"Gare",performance:"Performance",compare:"Confronti",injuries:"Infortuni",history:"Storico",report:"Report",settings:"Impostazioni"};

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
 headerUser.innerHTML=`<span>${profile.full_name}<br><small>${profile.role==="coach"?"Allenatore":profile.role==="assistant_coach"?"Vice allenatore":profile.role==="doctor"?"Medico sportivo":"Atleta"}</small></span><button class="secondary" id="logoutBtn">Esci</button>`;
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
 const arr=profile.role==="coach"?coachTabs:(profile.role==="assistant_coach"?assistantTabs:(profile.role==="doctor"?doctorTabs:athleteTabs));
 tabs.innerHTML=arr.map(t=>`<button class="tabBtn ${activeTab===t?"active":""}" data-tab="${t}">${labels[t]}</button>`).join("");
 tabs.querySelectorAll("button").forEach(b=>b.onclick=async()=>{activeTab=b.dataset.tab;renderTabs();await render()});
}
async function render(){
 const fn={home:renderHome,attendance:renderAttendance,program:renderProgram,athletes:renderAthletes,wellness:renderWellness,training:renderTraining,tests:renderTests,races:renderRaces,performance:renderPerformance,compare:renderCompare,injuries:renderInjuries,history:renderHistory,report:renderReport,settings:renderSettings}[activeTab];
 await fn();
}
const stat=(l,v)=>`<div class="stat"><span>${l}</span><b>${v}</b></div>`;
const avg=a=>a.length?a.reduce((s,x)=>s+Number(x||0),0)/a.length:0;
const fmt=d=>d?new Date(d).toLocaleString("it-IT"):"";
const fmtDate=d=>d?new Date(String(d).length===10?d+"T12:00:00":d).toLocaleDateString("it-IT"):"";
const localISODate=(d=new Date())=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const daysBackISO=n=>{const d=new Date();d.setDate(d.getDate()-n);return localISODate(d)};
const effectiveWellDate=x=>x?.wellness_date||localISODate(new Date(x.recorded_at));
const effectiveTrainingDate=x=>x?.training_date||localISODate(new Date(x.recorded_at));
const toast=t=>{const x=$("#toast");x.textContent=t;x.classList.remove("hidden");setTimeout(()=>x.classList.add("hidden"),2200)};


const isStaff=()=>["coach","doctor","assistant_coach"].includes(profile?.role);
const canCoachEdit=()=>["coach","assistant_coach"].includes(profile?.role);
const canManageAttendance=()=>["coach","assistant_coach"].includes(profile?.role);
const canManageInjuries=()=>["coach","assistant_coach","doctor"].includes(profile?.role);

async function deleteCoachRecord(table,id,rerender,label="dato"){
 if(!canCoachEdit())return;
 if(!confirm(`Eliminare definitivamente questo ${label}?`))return;
 const {error}=await sb.from(table).delete().eq("id",id);
 if(error)return toast(error.message);
 toast("Dato eliminato");
 await rerender();
}

function openEditModal(title,fields,onSave){
 const old=document.getElementById("editModalOverlay");if(old)old.remove();
 const fieldHTML=fields.map(f=>{
   const v=f.value??"";
   if(f.type==="textarea")return `<label>${f.label}<textarea id="edit_${f.key}">${v}</textarea></label>`;
   if(f.type==="select")return `<label>${f.label}<select id="edit_${f.key}">${(f.options||[]).map(o=>`<option value="${o.value}" ${String(o.value)===String(v)?"selected":""}>${o.label}</option>`).join("")}</select></label>`;
   return `<label>${f.label}<input id="edit_${f.key}" type="${f.type||"text"}" step="${f.step||"any"}" value="${String(v).replace(/"/g,"&quot;")}"></label>`;
 }).join("");
 const el=document.createElement("div");el.id="editModalOverlay";el.className="modalOverlay";
 el.innerHTML=`<div class="editModal card"><div class="sectionTitle"><h2>${title}</h2><button class="modalClose secondary">✕</button></div><form id="editModalForm">${fieldHTML}<div class="modalActions"><button type="button" class="secondary modalCancel">Annulla</button><button class="primary">Salva modifiche</button></div></form></div>`;
 document.body.appendChild(el);
 const close=()=>el.remove();
 el.querySelector(".modalClose").onclick=close;el.querySelector(".modalCancel").onclick=close;
 el.onclick=e=>{if(e.target===el)close()};
 el.querySelector("#editModalForm").onsubmit=async e=>{
   e.preventDefault();
   if(!confirm("Confermi la modifica?"))return;
   const values={};fields.forEach(f=>values[f.key]=document.getElementById(`edit_${f.key}`).value);
   const ok=await onSave(values);if(ok!==false)close();
 };
}
async function editWellnessRecord(id,after){
 const {data:x,error}=await sb.from("wellness").select("*").eq("id",id).single();if(error)return toast(error.message);
 openEditModal("Modifica Wellness",[
  {key:"wellness_date",label:"Data Wellness",type:"date",value:effectiveWellDate(x)},
  {key:"sleep",label:"Sonno (1–5)",type:"number",value:x.sleep},{key:"fatigue",label:"Stanchezza (1–5)",type:"number",value:x.fatigue},
  {key:"doms",label:"DOMS (1–5)",type:"number",value:x.doms},{key:"stress",label:"Stress (1–5)",type:"number",value:x.stress},
  {key:"pain",label:"Dolore / problema",type:"textarea",value:x.pain||""}
 ],async v=>{const {error}=await sb.from("wellness").update({wellness_date:v.wellness_date,sleep:+v.sleep,fatigue:+v.fatigue,doms:+v.doms,stress:+v.stress,pain:v.pain}).eq("id",id);if(error){toast(error.message);return false}toast("Wellness modificato");await after();});
}
async function editTrainingRecord(id,after){
 const [{data:x,error},{data:types}]=await Promise.all([sb.from("trainings").select("*").eq("id",id).single(),sb.from("training_types").select("*").eq("active",true).order("name")]);if(error)return toast(error.message);
 openEditModal("Modifica Allenamento",[
  {key:"training_date",label:"Data allenamento",type:"date",value:effectiveTrainingDate(x)},
  {key:"training_type_id",label:"Tipo seduta",type:"select",value:x.training_type_id,options:(types||[]).map(t=>({value:t.id,label:t.name}))},
  {key:"duration_min",label:"Durata (min)",type:"number",value:x.duration_min},{key:"srpe",label:"sRPE CR10",type:"number",value:x.srpe},
  {key:"work_done",label:"Lavoro svolto",type:"textarea",value:x.work_done||""},{key:"times_results",label:"Tempi / risultati",type:"textarea",value:x.times_results||""},
  {key:"pain_post",label:"Dolore post",type:"textarea",value:x.pain_post||""},{key:"notes",label:"Note",type:"textarea",value:x.notes||""}
 ],async v=>{const {error}=await sb.from("trainings").update({training_date:v.training_date,training_type_id:v.training_type_id,duration_min:+v.duration_min,srpe:+v.srpe,work_done:v.work_done,times_results:v.times_results,pain_post:v.pain_post,notes:v.notes}).eq("id",id);if(error){toast(error.message);return false}toast("Allenamento modificato");await after();});
}
async function editTestRecord(id,after){
 const {data:x,error}=await sb.from("test_results").select("*,tests(name,unit,higher_better,attempts)").eq("id",id).single();if(error)return toast(error.message);
 const vals=Array.isArray(x.values)?x.values:[];
 const fields=vals.map((v,i)=>({key:`v${i}`,label:`Prova ${i+1} (${x.tests?.unit||""})`,type:"number",value:v}));
 fields.push({key:"notes",label:"Note",type:"textarea",value:x.notes||""});
 openEditModal(`Modifica Test — ${x.tests?.name||""}`,fields,async v=>{
   const nv=vals.map((_,i)=>+v[`v${i}`]);const mean=avg(nv),best=x.tests?.higher_better?Math.max(...nv):Math.min(...nv);
   const {error}=await sb.from("test_results").update({values:nv,mean_value:mean,best_value:best,notes:v.notes}).eq("id",id);
   if(error){toast(error.message);return false}toast("Test modificato");await after();
 });
}
async function editRaceRecord(id,after){
 const {data:x,error}=await sb.from("races").select("*,race_types(name,unit,fields)").eq("id",id).single();if(error)return toast(error.message);
 const fields=[{key:"race_date",label:"Data gara",type:"date",value:x.race_date},{key:"meeting",label:"Manifestazione",value:x.meeting||""},{key:"result",label:`Risultato (${x.race_types?.unit||""})`,type:"number",value:x.result}];
 (x.race_types?.fields||[]).forEach(k=>fields.push({key:`extra_${k}`,label:cap(k),type:["note","intertempi","ritmica"].includes(k)?"textarea":"text",value:(x.extras||{})[k]||""}));
 openEditModal(`Modifica Gara — ${x.race_types?.name||""}`,fields,async v=>{
  const extras={...(x.extras||{})};(x.race_types?.fields||[]).forEach(k=>extras[k]=v[`extra_${k}`]);
  const {error}=await sb.from("races").update({race_date:v.race_date,meeting:v.meeting,result:+v.result,extras}).eq("id",id);
  if(error){toast(error.message);return false}toast("Gara modificata");await after();
 });
}

async function editInjuryRecord(id,after){
 const [{data:x,error},{data:allFields}]=await Promise.all([
   sb.from("injuries").select("*").eq("id",id).single(),
   Promise.resolve(await getCustomFields("injury"))
 ]);
 if(error)return toast(error.message);
 const fields=[
  {key:"start_date",label:"Data inizio",type:"date",value:x.start_date},
  {key:"site",label:"Sede",value:x.site||""},
  {key:"issue_type",label:"Problematica / diagnosi riferita",value:x.issue_type||""},
  {key:"pain_score",label:"Dolore 0–10",type:"number",value:x.pain_score??0},
  {key:"limitation",label:"Limitazione",type:"select",value:x.limitation||"none",options:[
   {value:"none",label:"Nessuna"},{value:"reduced",label:"Allenamento ridotto"},{value:"stop",label:"Stop allenamento"}
  ]},
  {key:"days_lost",label:"Giorni persi",type:"number",value:x.days_lost??0},
  {key:"status",label:"Stato",type:"select",value:x.status||"active",options:[
   {value:"active",label:"Attivo"},{value:"recovering",label:"In recupero"},{value:"resolved",label:"Risolto"}
  ]},
  {key:"return_date",label:"Data rientro",type:"date",value:x.return_date||""},
  {key:"notes",label:"Note / trattamento",type:"textarea",value:x.notes||""}
 ];
 (allFields||[]).forEach(f=>fields.push({
   key:`extra_${f.field_key}`,label:f.label,
   type:f.field_type==="textarea"?"textarea":f.field_type==="number"?"number":f.field_type==="date"?"date":"text",
   value:(x.extras||{})[f.field_key]??""
 }));
 openEditModal("Modifica problematica / infortunio",fields,async v=>{
   const extras={...(x.extras||{})};
   (allFields||[]).forEach(f=>extras[f.field_key]=v[`extra_${f.field_key}`]);
   const {error}=await sb.from("injuries").update({
    start_date:v.start_date,site:v.site.trim(),issue_type:v.issue_type.trim(),
    pain_score:+v.pain_score,limitation:v.limitation,days_lost:+v.days_lost,
    status:v.status,return_date:v.return_date||null,notes:v.notes,extras
   }).eq("id",id);
   if(error){toast(error.message);return false}
   toast("Registro infortuni aggiornato");await after();
 });
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
    sb.from("trainings").select("*").eq("athlete_id",id).order("training_date",{ascending:true}),
    sb.from("wellness").select("*").eq("athlete_id",id).order("wellness_date",{ascending:true}),
    sb.from("test_results").select("*,tests(name,higher_better)").eq("athlete_id",id).order("recorded_at",{ascending:true}),
    sb.from("races").select("*,race_types(name)").eq("athlete_id",id).order("race_date",{ascending:true})
   ]);
   const alerts=buildAthleteAlerts(athleteProfile,w||[],t||[],tr||[],r||[]);
   view.innerHTML=`<div class="card hero"><h2>${athleteProfile.display_name}</h2><div class="stats">${stat("Sedute",t?.length||0)}${stat("TL totale",(t||[]).reduce((s,x)=>s+Number(x.session_load||0),0)+" AU")}${stat("Test",tr?.length||0)}${stat("Gare",r?.length||0)}</div></div>
   ${athleteAlertPanel(alerts,false)}
   <div class="actionGrid"><button class="actionBtn" data-go="attendance">📅 Presenze</button><button class="actionBtn" data-go="wellness">+ Wellness</button><button class="actionBtn" data-go="training">+ Allenamento</button><button class="actionBtn" data-go="tests">+ Test</button><button class="actionBtn" data-go="races">+ Gara</button></div>`;
   document.querySelectorAll("[data-go]").forEach(b=>b.onclick=async()=>{activeTab=b.dataset.go;renderTabs();await render()});
 } else {
   const aa=await getAthletes();
   const [{data:t},{data:w},{data:tr},{data:r}]=await Promise.all([
    sb.from("trainings").select("id,session_load,duration_min,srpe,athlete_id,recorded_at,training_date,training_types(name)").order("training_date",{ascending:true}),
    sb.from("wellness").select("id,score,sleep,fatigue,doms,stress,pain,athlete_id,recorded_at,wellness_date").order("wellness_date",{ascending:true}),
    sb.from("test_results").select("id,athlete_id,mean_value,best_value,recorded_at,tests(name,unit,higher_better)").order("recorded_at",{ascending:true}),
    sb.from("races").select("id,athlete_id,result,race_date,race_types(name,unit)").order("race_date",{ascending:true})
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
   view.innerHTML=`<div class="grid two"><div class="card"><h2>${profile.role==="doctor"?"Dashboard medico sportivo":profile.role==="assistant_coach"?"Dashboard vice allenatore":"Dashboard allenatore"}</h2><div class="stats">${stat("Atleti",aa.length)}${stat("Allenamenti",t?.length||0)}${stat("Test",tr?.length||0)}${stat("Gare",r?.length||0)}</div></div>
   <div class="card"><h2>Stato gruppo oggi</h2><div class="stats">${stat("🔴 Controllo",critical)}${stat("🟠 Attenzione",watch)}${stat("🟢 Regolari",Math.max(0,aa.length-critical-watch))}</div></div></div>
   <div class="card"><div class="sectionTitle"><div><h2>Atleti da controllare oggi</h2><p class="muted">Alert operativi basati sui dati registrati.</p></div><button class="secondary" id="enableNotifyHome">🔔 Notifiche</button></div>
   <div class="alertGrid">${alertRows.map(x=>coachAlertCard(x.athlete,x.alerts)).join("")}</div></div>
   <div class="dashboardHero card"><div><span class="eyebrow">PATRUNO SPEED TEAM</span><h2>Speed · Data · Progress</h2><p>Una vista unica per leggere carico, wellness e prestazione del gruppo.</p></div><img src="assets/hero.jpg" alt="Sprint Patruno Speed Team"></div>
   ${dashboardAnalytics(aa,t||[],w||[],tr||[])}
   <div class="card"><h2>Carico totale registrato</h2><div class="kpi">${(t||[]).reduce((s,x)=>s+Number(x.session_load||0),0)} AU</div></div>`;
   document.querySelectorAll("[data-hist]").forEach(b=>b.onclick=async()=>{sessionStorage.setItem("historyAthlete",b.dataset.hist);activeTab="history";renderTabs();await render()});
   document.querySelectorAll("[data-go-compare]").forEach(b=>b.onclick=async()=>{sessionStorage.setItem("compareSection",b.dataset.goCompare);activeTab="compare";renderTabs();await render()});
   if($("#enableNotifyHome")) $("#enableNotifyHome").onclick=enableNotifications;
   await maybeNotifyCoach(alertRows);
 }
}


function athleteNameById(aa,id){return aa.find(a=>a.id===id)?.display_name||"—"}
function dashboardAnalytics(aa,t,w,tr){
 const cutoff=daysAgo(14), recentT=t.filter(x=>new Date(effectiveTrainingDate(x)+"T12:00:00")>=cutoff), recentW=w.filter(x=>new Date(effectiveWellDate(x)+"T12:00:00")>=daysAgo(7)), recentTests=tr.slice(-12).reverse();
 const byDay={};recentT.forEach(x=>{const k=fmtDate(effectiveTrainingDate(x));byDay[k]=(byDay[k]||0)+Number(x.session_load||0)});
 const avgWell=recentW.length?avg(recentW.map(x=>Number(x.score||0))):0;
 return `<div class="grid two dashboardDataGrid">
   <div class="card"><div class="sectionTitle"><div><h2>Training Load · 14 giorni</h2><p class="muted">Carico totale del gruppo giorno per giorno.</p></div><button class="secondary" data-go-compare="training">Confronta</button></div>${simpleBarChart(Object.entries(byDay).map(([label,value])=>({label,value})),"","AU")}</div>
   <div class="card"><div class="sectionTitle"><div><h2>Wellness · 7 giorni</h2><p class="muted">Media gruppo: <b>${avgWell.toFixed(1)}/20</b></p></div><button class="secondary" data-go-compare="wellness">Confronta</button></div>
    <div class="tableWrap"><table><thead><tr><th>Atleta</th><th>Ultimo score</th><th>Dolore</th></tr></thead><tbody>${aa.map(a=>{const x=[...w].filter(q=>q.athlete_id===a.id).sort((a,b)=>new Date(effectiveWellDate(b))-new Date(effectiveWellDate(a)))[0];return `<tr><td><b>${a.display_name}</b></td><td>${x?`${x.score}/20`:"—"}</td><td>${x?.pain||"—"}</td></tr>`}).join("")}</tbody></table></div></div>
   <div class="card"><div class="sectionTitle"><div><h2>Ultimi allenamenti</h2><p class="muted">Confrontabili direttamente nella nuova area Confronti.</p></div><button class="secondary" data-go-compare="training">Apri confronti</button></div>
    <div class="tableWrap"><table><thead><tr><th>Atleta</th><th>Data</th><th>Seduta</th><th>Durata</th><th>sRPE</th><th>TL</th></tr></thead><tbody>${[...t].slice(-12).reverse().map(x=>`<tr><td>${athleteNameById(aa,x.athlete_id)}</td><td>${fmtDate(effectiveTrainingDate(x))}</td><td>${x.training_types?.name||"—"}</td><td>${x.duration_min}′</td><td>${x.srpe}</td><td><b>${x.session_load} AU</b></td></tr>`).join("")||'<tr><td colspan="6">Nessun dato</td></tr>'}</tbody></table></div></div>
   <div class="card"><div class="sectionTitle"><div><h2>Ultimi test</h2><p class="muted">Risultati recenti del gruppo.</p></div><button class="secondary" data-go-compare="tests">Confronta</button></div>
    <div class="tableWrap"><table><thead><tr><th>Atleta</th><th>Test</th><th>Risultato</th><th>Data</th></tr></thead><tbody>${recentTests.map(x=>`<tr><td>${athleteNameById(aa,x.athlete_id)}</td><td>${x.tests?.name||"—"}</td><td><b>${Number(x.mean_value).toFixed(2)} ${x.tests?.unit||""}</b></td><td>${fmt(x.recorded_at)}</td></tr>`).join("")||'<tr><td colspan="4">Nessun dato</td></tr>'}</tbody></table></div></div>
 </div>`;
}
function startOfDay(d=new Date()){const x=new Date(d);x.setHours(0,0,0,0);return x}
function buildAthleteAlerts(athlete,wellness,trainings,tests,races){
 const items=[];
 const latestW=wellness.length?[...wellness].sort((a,b)=>new Date(effectiveWellDate(b))-new Date(effectiveWellDate(a)))[0]:null;
 const today=startOfDay(), latestDay=latestW?startOfDay(new Date(effectiveWellDate(latestW)+"T12:00:00")):null;
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
 const curTL=trainings.filter(x=>new Date(effectiveTrainingDate(x)+"T12:00:00")>=d7).reduce((s,x)=>s+Number(x.session_load||0),0);
 const prevTL=trainings.filter(x=>new Date(effectiveTrainingDate(x)+"T12:00:00")>=d14&&new Date(effectiveTrainingDate(x)+"T12:00:00")<d7).reduce((s,x)=>s+Number(x.session_load||0),0);
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
 await showLocalNotification("Patruno Speed Team",`${critical.length} atleta/i con alert rosso da controllare oggi`,"coach-alert");
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


function mondayOfWeek(base=new Date()){
 const d=new Date(base);d.setHours(12,0,0,0);
 const day=d.getDay()||7;d.setDate(d.getDate()-day+1);return d;
}
function addDaysDate(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
const attendanceStatusMeta={
 present:{label:"✅ Presente",short:"✅",cls:"attPresent"},
 absent:{label:"❌ Assente",short:"❌",cls:"attAbsent"},
 maybe:{label:"❓ Da confermare",short:"❓",cls:"attMaybe"}
};
async function renderAttendance(){
 const aa=await getAthletes();
 let weekOffset=Number(sessionStorage.getItem("attendanceWeekOffset")||0);
 const draw=async()=>{
   const monday=addDaysDate(mondayOfWeek(),weekOffset*7);
   const days=Array.from({length:6},(_,i)=>addDaysDate(monday,i));
   const start=localISODate(days[0]),end=localISODate(days[5]);
   const {data:entries,error}=await sb.from("attendance").select("*").gte("attendance_date",start).lte("attendance_date",end);
   if(error){view.innerHTML=`<div class="card"><h2>Presenze</h2><div class="note">${error.message}<br><b>Prima esegui V3_4_UPGRADE.sql su Supabase.</b></div></div>`;return}
   const map=new Map((entries||[]).map(x=>[`${x.athlete_id}_${x.attendance_date}`,x]));
   const canEditAthlete=a=>canManageAttendance()||(profile.role==="athlete"&&athleteProfile?.id===a.id);
   view.innerHTML=`<div class="card attendanceHead">
     <div class="sectionTitle"><div><h2>Presenze settimanali</h2><p class="muted">Visibile a tutto il team · da lunedì a sabato.</p></div>
       <div class="weekNav"><button class="secondary" id="prevWeek">←</button><button class="secondary" id="thisWeek">Settimana attuale</button><button class="secondary" id="nextWeek">→</button></div>
     </div>
     <div class="weekTitle">${fmtDate(start)} – ${fmtDate(end)}</div>
     <div class="attendanceLegend"><span>✅ Presente</span><span>❌ Assente</span><span>❓ Da confermare</span></div>
     <div class="tableWrap attendanceTable"><table><thead><tr><th>Atleta</th>${days.map(d=>`<th>${d.toLocaleDateString("it-IT",{weekday:"short"})}<br>${d.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"})}</th>`).join("")}</tr></thead>
     <tbody>${aa.map(a=>`<tr><td><b>${a.display_name}</b></td>${days.map(d=>{const date=localISODate(d),x=map.get(`${a.id}_${date}`),m=x?attendanceStatusMeta[x.status]:null;return `<td class="attCell ${m?.cls||""}">${canEditAthlete(a)?`<button class="attendanceCellBtn" data-att-ath="${a.id}" data-att-date="${date}" data-att-status="${x?.status||""}" title="${m?.label||"Imposta presenza"}">${m?.short||"＋"}${x?.expected_time?`<small>${String(x.expected_time).slice(0,5)}</small>`:""}</button>`:`<div class="attendanceRead">${m?.short||"—"}${x?.expected_time?`<small>${String(x.expected_time).slice(0,5)}</small>`:""}</div>`}</td>`}).join("")}</tr>`).join("")}</tbody></table></div>
     <p class="note">Tocca una casella per impostare stato e, se vuoi, orario previsto. Il medico visualizza soltanto.</p>
   </div>`;
   $("#prevWeek").onclick=()=>{weekOffset--;sessionStorage.setItem("attendanceWeekOffset",weekOffset);draw()};
   $("#nextWeek").onclick=()=>{weekOffset++;sessionStorage.setItem("attendanceWeekOffset",weekOffset);draw()};
   $("#thisWeek").onclick=()=>{weekOffset=0;sessionStorage.setItem("attendanceWeekOffset",0);draw()};
   document.querySelectorAll("[data-att-ath]").forEach(b=>b.onclick=async()=>{
     const athlete=aa.find(a=>a.id===b.dataset.attAth);
     await openAttendanceEditor(athlete,b.dataset.attDate,b.dataset.attStatus,draw);
   });
 };
 await draw();
}
async function openAttendanceEditor(athlete,date,currentStatus,after){
 const {data:old}=await sb.from("attendance").select("*").eq("athlete_id",athlete.id).eq("attendance_date",date).maybeSingle();
 openEditModal(`Presenza · ${athlete.display_name} · ${fmtDate(date)}`,[
  {key:"status",label:"Stato",type:"select",value:old?.status||currentStatus||"present",options:[
   {value:"present",label:"✅ Presente"},{value:"absent",label:"❌ Assente"},{value:"maybe",label:"❓ Da confermare"}
  ]},
  {key:"expected_time",label:"Orario previsto (facoltativo)",type:"time",value:old?.expected_time?String(old.expected_time).slice(0,5):""},
  {key:"note",label:"Nota (facoltativa)",type:"textarea",value:old?.note||""}
 ],async v=>{
   const payload={athlete_id:athlete.id,attendance_date:date,status:v.status,expected_time:v.expected_time||null,note:v.note||null,updated_by:currentUser.id,updated_at:new Date().toISOString()};
   const {error}=await sb.from("attendance").upsert(payload,{onConflict:"athlete_id,attendance_date"});
   if(error){toast(error.message);return false}
   toast("Presenza aggiornata");await after();
 });
}
async function renderWellness(){
 const athleteField=await athleteSelectHTML();
 const minWell=profile.role==="athlete"?daysBackISO(3):"";
 const maxWell=profile.role==="athlete"?localISODate():"";
 view.innerHTML=`<div class="card"><h2>Wellness pre-allenamento</h2><form id="wellForm">${athleteField}
 <label>Data a cui si riferisce il Wellness<input type="date" id="wellnessDate" value="${localISODate()}" ${minWell?`min="${minWell}"`:""} ${maxWell?`max="${maxWell}"`:""} required></label>
 <p class="note">${profile.role==="athlete"?"Puoi recuperare il Wellness di oggi o dei 3 giorni precedenti.":"Come staff puoi correggere anche date precedenti."}</p>
 ${scale("Sonno","sleep")}${scale("Stanchezza","fatigue")}${scale("DOMS","doms")}${scale("Stress","stress")}
 <label>Dolore / problema fisico<textarea id="pain" placeholder="Sede e intensità 0-10, oppure nessuno"></textarea></label>
 <button class="primary">Salva wellness</button></form></div><div id="wellRecent"></div>`;
 $("#wellForm").onsubmit=async e=>{
  e.preventDefault();
  const athleteId=$("#athleteId").value;
  const wellnessDate=$("#wellnessDate").value;
  const {data:existing}=await sb.from("wellness").select("id").eq("athlete_id",athleteId).eq("wellness_date",wellnessDate).limit(1);
  if(existing?.length)return toast("Wellness già compilato per questa data.");
  const payload={athlete_id:athleteId,wellness_date:wellnessDate,sleep:+$("#sleep").value,fatigue:+$("#fatigue").value,doms:+$("#doms").value,stress:+$("#stress").value,pain:$("#pain").value};
  const {error}=await sb.from("wellness").insert(payload);
  if(error){
    if(String(error.message).toLowerCase().includes("wellness_one_per_day"))return toast("Wellness già compilato per questa data.");
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
 let q=sb.from("wellness").select("*,athletes(display_name)").order("wellness_date",{ascending:false}).limit(10);
 if(profile.role==="athlete") q=q.eq("athlete_id",athleteProfile.id);
 const {data}=await q;
 $("#wellRecent").innerHTML=recentCard("Ultimi wellness",(data||[]).map(x=>[fmtDate(effectiveWellDate(x)),x.athletes?.display_name||"",`Score ${x.score}/20`,x.pain||"",canCoachEdit()?`<div class="rowActions"><button class="editBtn" data-edit-well="${x.id}">✏️ Modifica</button><button class="dangerBtn" data-del-well="${x.id}">Elimina</button></div>`:""]));
 if(canCoachEdit()){document.querySelectorAll("[data-edit-well]").forEach(b=>b.onclick=()=>editWellnessRecord(b.dataset.editWell,renderRecentWellness));document.querySelectorAll("[data-del-well]").forEach(b=>b.onclick=()=>deleteCoachRecord("wellness",b.dataset.delWell,renderRecentWellness,"wellness"));}
}

async function getTrainingTypes(){
 const {data}=await sb.from("training_types").select("*").eq("active",true).order("name");
 return data||[];
}


function blockEditorRow(prefix,index,data={}){
 const kind=data.block_kind||((data.quality==="Forza")?"strength":"run");
 const q=data.quality||"Accelerazione";
 const isStrength=kind==="strength";
 const isRun=kind==="run";
 const isGeneral=["warmup","mobility","technique","freq_amp"].includes(kind);
 const labelMap={run:"Corsa / specifico",strength:"Forza",warmup:"Riscaldamento",mobility:"Mobilità",technique:"Tecnica di corsa",freq_amp:"Frequenza / ampiezza"};
 return `<div class="workBlockRow ${kind}Block" data-block-row="${prefix}_${index}">
   <label>Tipo<select class="${prefix}Kind blockKind">
     ${Object.entries(labelMap).map(([v,l])=>`<option value="${v}" ${kind===v?"selected":""}>${l}</option>`).join("")}
   </select></label>

   <label class="runOnly">Qualità<select class="${prefix}Quality">${PERFORMANCE_QUALITIES.filter(x=>x!=="Forza").map(x=>`<option ${x===q?"selected":""}>${x}</option>`).join("")}</select></label>

   <label class="generalOnly">${kind==="freq_amp"?"Focus":"Esercizio / contenuto"}
     <input class="${prefix}Exercise" value="${data.exercise??""}" placeholder="${kind==="freq_amp"?"es. Frequenza, Ampiezza, Dribble":"es. mobilità anche, skip, jogging..."}">
   </label>

   <label class="runOnly">Distanza (m)<input class="${prefix}Distance" type="number" min="0" step="1" value="${data.distance_m??""}" placeholder="es. 120"></label>
   <label class="strengthOnly">Esercizio<input class="${prefix}ExerciseStrength" value="${data.exercise??""}" placeholder="es. Squat"></label>

   <label>Serie<input class="${prefix}Sets" type="number" min="1" step="1" value="${data.sets??1}"></label>

   <label>${prefix==="actual"?"Rip. previste":"Ripetute"}
     <input class="${prefix}PlannedReps" type="number" min="0" step="1" value="${data.planned_reps??data.reps??1}">
   </label>

   ${prefix==="actual"?`<label>Rip. effettive<input class="${prefix}CompletedReps" type="number" min="0" step="1" value="${data.completed_reps??data.planned_reps??1}"></label>`:""}

   <label class="strengthOnly">Carico (kg)<input class="${prefix}LoadKg" type="number" min="0" step="0.5" value="${data.load_kg??""}" placeholder="kg"></label>

   <label class="generalOnly">Durata (min)<input class="${prefix}DurationMin" type="number" min="0" step="1" value="${data.duration_min??""}" placeholder="min"></label>

   <label class="freqOnly">Focus<select class="${prefix}Subtype">
      <option value="frequency" ${data.subtype==="frequency"?"selected":""}>Frequenza</option>
      <option value="amplitude" ${data.subtype==="amplitude"?"selected":""}>Ampiezza</option>
      <option value="mixed" ${!data.subtype||data.subtype==="mixed"?"selected":""}>Misto</option>
   </select></label>

   <label class="runOnly">Recupero<input class="${prefix}Recovery" value="${data.recovery_text??""}" placeholder="es. 3′ / 6′"></label>
   <label class="blockNotes">Note<input class="${prefix}BlockNotes" value="${data.notes??""}"></label>
   <button type="button" class="dangerBtn removeBlock">✕</button>
 </div>`;
}
function addBlockRow(containerId,prefix,data={}){
 const c=document.getElementById(containerId); if(!c)return;
 const idx=Date.now()+Math.floor(Math.random()*1000);
 c.insertAdjacentHTML("beforeend",blockEditorRow(prefix,idx,data));
 const row=c.lastElementChild;
 row.querySelector(".removeBlock").onclick=()=>row.remove();
 const kindSel=row.querySelector(`.${prefix}Kind`);
 const refresh=()=>{
   const kind=kindSel.value;
   row.className=`workBlockRow ${kind}Block`;
   row.querySelectorAll(".runOnly,.strengthOnly,.generalOnly,.freqOnly").forEach(x=>x.style.display="none");
   if(kind==="run") row.querySelectorAll(".runOnly").forEach(x=>x.style.display="");
   if(kind==="strength") row.querySelectorAll(".strengthOnly").forEach(x=>x.style.display="");
   if(["warmup","mobility","technique","freq_amp"].includes(kind)) row.querySelectorAll(".generalOnly").forEach(x=>x.style.display="");
   if(kind==="freq_amp") row.querySelectorAll(".freqOnly").forEach(x=>x.style.display="");
 };
 kindSel.onchange=refresh;
 refresh();
}
function collectBlockRows(containerId,prefix){
 const c=document.getElementById(containerId); if(!c)return [];
 return [...c.querySelectorAll(".workBlockRow")].map(r=>{
   const kind=r.querySelector(`.${prefix}Kind`)?.value||"run";
   const generalExercise=r.querySelector(`.${prefix}Exercise`)?.value||"";
   const strengthExercise=r.querySelector(`.${prefix}ExerciseStrength`)?.value||"";
   const o={
     block_kind:kind,
     quality:kind==="strength"?"Forza":kind==="run"?(r.querySelector(`.${prefix}Quality`)?.value||"Altro"):
       ({warmup:"Riscaldamento",mobility:"Mobilità",technique:"Tecnica di corsa",freq_amp:"Frequenza / ampiezza"}[kind]||"Altro"),
     distance_m:kind==="run"?Number(r.querySelector(`.${prefix}Distance`)?.value||0):0,
     exercise:kind==="strength"?strengthExercise.trim():generalExercise.trim(),
     load_kg:kind==="strength"?Number(r.querySelector(`.${prefix}LoadKg`)?.value||0):0,
     duration_min:["warmup","mobility","technique","freq_amp"].includes(kind)?Number(r.querySelector(`.${prefix}DurationMin`)?.value||0):0,
     subtype:kind==="freq_amp"?(r.querySelector(`.${prefix}Subtype`)?.value||"mixed"):null,
     sets:Number(r.querySelector(`.${prefix}Sets`)?.value||1),
     planned_reps:Number(r.querySelector(`.${prefix}PlannedReps`)?.value||0),
     recovery_text:kind==="run"?(r.querySelector(`.${prefix}Recovery`)?.value||""):"",
     notes:r.querySelector(`.${prefix}BlockNotes`)?.value||""
   };
   if(prefix==="actual")o.completed_reps=Number(r.querySelector(`.${prefix}CompletedReps`)?.value||0);
   return o;
 }).filter(x=>{
   if(x.block_kind==="run") return x.distance_m>0;
   if(x.block_kind==="strength") return !!x.exercise;
   return !!x.exercise || x.duration_min>0;
 });
}
function volumeForBlock(b,actual=true){
 const reps=actual?(Number(b.completed_reps??b.planned_reps??0)):Number(b.planned_reps??0);
 if((b.block_kind||"run")==="strength") return Number(b.load_kg||0)*Number(b.sets||1)*reps;
 return Number(b.distance_m||0)*Number(b.sets||1)*reps;
}
function blocksSummaryHTML(blocks,actual=true){
 if(!blocks?.length)return '<span class="muted">Nessun blocco specifico</span>';
 return blocks.map(b=>{
   const reps=actual?(b.completed_reps??b.planned_reps):b.planned_reps;
   const kind=b.block_kind||"run";
   if(kind==="strength")
     return `<span class="volumePill strengthPill"><b>Forza · ${b.exercise||"Esercizio"}</b> · ${b.sets||1}×${reps} @ ${Number(b.load_kg||0)} kg = ${Math.round(volumeForBlock(b,actual))} kg volume-load</span>`;
   if(kind==="run")
     return `<span class="volumePill"><b>${b.quality}</b> · ${b.sets||1}×${reps}×${b.distance_m} m = ${Math.round(volumeForBlock(b,actual))} m</span>`;
   const icon={warmup:"🔥",mobility:"🧘",technique:"🏃",freq_amp:"⚡"}[kind]||"•";
   const sub=kind==="freq_amp"?(b.subtype==="frequency"?"Frequenza":b.subtype==="amplitude"?"Ampiezza":"Misto"):"";
   return `<span class="volumePill generalPill">${icon} <b>${b.quality}${sub?` · ${sub}`:""}</b> · ${b.exercise||"contenuto"}${b.duration_min?` · ${b.duration_min} min`:""}${reps?` · ${b.sets||1}×${reps}`:""}</span>`;
 }).join(" ");
}


async function clonePlannedSessionToAthletes(session,athleteIds,dateOverride=null){
 if(!["coach","assistant_coach"].includes(profile?.role))return false;
 const blocks=session.planned_blocks||[];
 for(const athleteId of athleteIds){
   const {data:newS,error}=await sb.from("planned_sessions").insert({
     athlete_id:athleteId,
     session_date:dateOverride||session.session_date,
     training_type_id:session.training_type_id,
     title:session.title||"",
     notes:session.notes||"",
     status:"planned",
     created_by:currentUser.id
   }).select("id").single();
   if(error){toast(error.message);return false}
   if(blocks.length){
     const payload=blocks.map(({id,planned_session_id,planned_volume_m,created_at,...b})=>({
       planned_session_id:newS.id,...b
     }));
     const {error:be}=await sb.from("planned_blocks").insert(payload);
     if(be){toast(be.message);return false}
   }
 }
 return true;
}

async function editPlannedSession(session,after){
 if(!["coach","assistant_coach"].includes(profile?.role))return;
 const aa=await getAthletes();
 const types=await getTrainingTypes();

 const old=document.getElementById("plannedEditOverlay");
 if(old)old.remove();

 const el=document.createElement("div");
 el.id="plannedEditOverlay";
 el.className="modalOverlay";
 el.innerHTML=`<div class="editModal card plannedEditModal">
   <div class="sectionTitle">
     <div><h2>Modifica seduta programmata</h2><p class="muted">${fmtDate(session.session_date)}</p></div>
     <button class="modalClose secondary">✕</button>
   </div>

   <div class="grid two">
     <label>Data<input type="date" id="editPlanDate" value="${session.session_date}" required></label>
     <label>Tipo seduta<select id="editPlanType">${types.map(t=>`<option value="${t.id}" ${t.id===session.training_type_id?"selected":""}>${t.name}</option>`).join("")}</select></label>
   </div>

   <label>Titolo / focus<input id="editPlanTitle" value="${(session.title||"").replace(/"/g,"&quot;")}"></label>

   <div class="sectionTitle">
     <div><h3>Blocchi</h3><p class="muted">Puoi correggere, aggiungere o eliminare blocchi.</p></div>
     <div class="rowActions blockButtons">
       <button type="button" class="secondary" id="epWarmup">+ Riscaldamento</button>
       <button type="button" class="secondary" id="epMobility">+ Mobilità</button>
       <button type="button" class="secondary" id="epTechnique">+ Tecnica</button>
       <button type="button" class="secondary" id="epFreq">+ Frequenza/Ampiezza</button>
       <button type="button" class="secondary" id="epRun">+ Corsa</button>
       <button type="button" class="secondary" id="epStrength">+ Forza</button>
     </div>
   </div>
   <div id="editPlannedBlocks" class="workBlocks"></div>

   <label>Note programma<textarea id="editPlanNotes">${session.notes||""}</textarea></label>

   <div class="multiAthleteBox">
     <div class="sectionTitle">
       <div><h3>Aggiungi questa seduta ad altri atleti</h3><p class="muted">La seduta modificata verrà copiata anche agli atleti selezionati.</p></div>
       <div class="rowActions"><button type="button" class="secondary" id="editPlanSelectAll">Tutti</button><button type="button" class="secondary" id="editPlanClearAll">Nessuno</button></div>
     </div>
     <div class="athleteCheckGrid">
       ${aa.filter(a=>a.id!==session.athlete_id).map(a=>`<label class="athleteCheck"><input type="checkbox" class="editPlanAthCheck" value="${a.id}"><span>${a.display_name}</span></label>`).join("")}
     </div>
   </div>

   <div class="modalActions">
     <button type="button" class="secondary modalCancel">Annulla</button>
     <button type="button" class="primary" id="savePlannedEdit">Salva modifiche</button>
   </div>
 </div>`;
 document.body.appendChild(el);

 const close=()=>el.remove();
 el.querySelector(".modalClose").onclick=close;
 el.querySelector(".modalCancel").onclick=close;
 el.onclick=e=>{if(e.target===el)close()};

 const add=(d={})=>addBlockRow("editPlannedBlocks","program",d);
 (session.planned_blocks||[]).forEach(b=>add(b));

 $("#epWarmup").onclick=()=>add({block_kind:"warmup",exercise:"Corsa blanda + attivazione",duration_min:10,sets:1,planned_reps:1});
 $("#epMobility").onclick=()=>add({block_kind:"mobility",exercise:"Mobilità dinamica",duration_min:8,sets:1,planned_reps:1});
 $("#epTechnique").onclick=()=>add({block_kind:"technique",exercise:"Skip / dribble / gambe tese",sets:2,planned_reps:2});
 $("#epFreq").onclick=()=>add({block_kind:"freq_amp",exercise:"Drill frequenza/ampiezza",subtype:"mixed",sets:2,planned_reps:3});
 $("#epRun").onclick=()=>add({block_kind:"run",quality:"Accelerazione",sets:1,planned_reps:1,distance_m:30});
 $("#epStrength").onclick=()=>add({block_kind:"strength",quality:"Forza",exercise:"Squat",sets:4,planned_reps:4,load_kg:0});

 $("#editPlanSelectAll").onclick=()=>document.querySelectorAll(".editPlanAthCheck").forEach(c=>c.checked=true);
 $("#editPlanClearAll").onclick=()=>document.querySelectorAll(".editPlanAthCheck").forEach(c=>c.checked=false);

 $("#savePlannedEdit").onclick=async()=>{
   if(!confirm("Salvare le modifiche alla seduta programmata?"))return;
   const newBlocks=collectBlockRows("editPlannedBlocks","program");

   const {error:ue}=await sb.from("planned_sessions").update({
     session_date:$("#editPlanDate").value,
     training_type_id:$("#editPlanType").value,
     title:$("#editPlanTitle").value.trim(),
     notes:$("#editPlanNotes").value
   }).eq("id",session.id);
   if(ue)return toast(ue.message);

   const {error:de}=await sb.from("planned_blocks").delete().eq("planned_session_id",session.id);
   if(de)return toast(de.message);

   if(newBlocks.length){
     const payload=newBlocks.map(b=>({planned_session_id:session.id,...b}));
     const {error:ie}=await sb.from("planned_blocks").insert(payload);
     if(ie)return toast(ie.message);
   }

   const targetAthletes=[...document.querySelectorAll(".editPlanAthCheck:checked")].map(c=>c.value);
   if(targetAthletes.length){
     const updatedSession={
       ...session,
       session_date:$("#editPlanDate").value,
       training_type_id:$("#editPlanType").value,
       title:$("#editPlanTitle").value.trim(),
       notes:$("#editPlanNotes").value,
       planned_blocks:newBlocks
     };
     const ok=await clonePlannedSessionToAthletes(updatedSession,targetAthletes);
     if(!ok)return;
   }

   close();
   toast(targetAthletes.length?`Seduta modificata e aggiunta a ${targetAthletes.length} atleta/i`:"Seduta programmata modificata");
   if(after)await after();
 };
}

async function renderProgram(){
 const aa=isStaff()?await getAthletes():[athleteProfile];
 const types=await getTrainingTypes();
 let weekOffset=Number(sessionStorage.getItem("programWeekOffset")||0);
 const canEditProgram=()=>["coach","assistant_coach"].includes(profile?.role);

 view.innerHTML=`<div class="card">
   <div class="sectionTitle"><div><h2>Programma allenamento</h2><p class="muted">Pianifica il microciclo e confronta automaticamente programmato e svolto.</p></div><span class="badge redBadge">V3.6</span></div>
   <div class="grid two">
     ${isStaff()?`<label>Atleta<select id="programAth">${aa.map(a=>`<option value="${a.id}">${a.display_name}</option>`).join("")}</select></label>`:""}
     <div class="weekNav"><button class="secondary" id="programPrev">←</button><button class="secondary" id="programThis">Settimana attuale</button><button class="secondary" id="programNext">→</button></div>
   </div>
   <div id="programBoard"></div>
 </div>
 ${canEditProgram()?`<div class="card"><h2>Programma una seduta</h2><form id="programForm">
   ${isStaff()?`<div class="multiAthleteBox">
   <div class="sectionTitle"><div><h3>Assegna a più atleti</h3><p class="muted">Seleziona uno o più atleti per creare la stessa seduta nello stesso giorno.</p></div>
   <div class="rowActions"><button type="button" class="secondary" id="selectAllProgramAth">Tutti</button><button type="button" class="secondary" id="clearAllProgramAth">Nessuno</button></div></div>
   <div id="programAthleteChecks" class="athleteCheckGrid">
     ${aa.map(a=>`<label class="athleteCheck"><input type="checkbox" class="programAthCheck" value="${a.id}"><span>${a.display_name}</span></label>`).join("")}
   </div>
 </div>`:""}
   <div class="grid two"><label>Data<input type="date" id="programDate" value="${localISODate()}" required></label>
   <label>Tipo seduta<select id="programType">${types.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select></label></div>
   <label>Titolo / focus<input id="programTitle" placeholder="es. Accelerazioni + tecnica"></label>
   <div class="sectionTitle"><h3>Blocchi programmati</h3><div class="rowActions blockButtons">
<button type="button" class="secondary" id="addProgramWarmupBlock">+ Riscaldamento</button>
<button type="button" class="secondary" id="addProgramMobilityBlock">+ Mobilità</button>
<button type="button" class="secondary" id="addProgramTechniqueBlock">+ Tecnica</button>
<button type="button" class="secondary" id="addProgramFreqBlock">+ Frequenza/Ampiezza</button>
<button type="button" class="secondary" id="addProgramRunBlock">+ Corsa</button>
<button type="button" class="secondary" id="addProgramStrengthBlock">+ Forza</button>
</div></div>
   <div id="programBlocks" class="workBlocks"></div>
   <label>Note programma<textarea id="programNotes" placeholder="Indicazioni tecniche, recuperi, obiettivi..."></textarea></label>
   <button class="primary">Salva nel programma</button>
 </form></div>`:""}`;

 const selectedAthlete=()=>isStaff()?$("#programAth").value:athleteProfile.id;

 async function draw(){
   const monday=addDaysDate(mondayOfWeek(),weekOffset*7);
   const days=Array.from({length:7},(_,i)=>addDaysDate(monday,i));
   const start=localISODate(days[0]),end=localISODate(days[6]),id=selectedAthlete();
   const [{data:p,error},{data:t}]=await Promise.all([
     sb.from("planned_sessions").select("*,training_types(name),planned_blocks(*)").eq("athlete_id",id).gte("session_date",start).lte("session_date",end).order("session_date"),
     sb.from("trainings").select("id,planned_session_id,training_date,session_load").eq("athlete_id",id).gte("training_date",start).lte("training_date",end)
   ]);
   if(error){$("#programBoard").innerHTML=`<div class="note">${error.message}<br><b>Esegui prima V3_6_UPGRADE.sql.</b></div>`;return}
   const byDate={};(p||[]).forEach(x=>(byDate[x.session_date]??=[]).push(x));
   const completed=new Set((t||[]).map(x=>x.planned_session_id).filter(Boolean));
   $("#programBoard").innerHTML=`<div class="programWeekHeader"><div class="sectionTitle"><strong>${fmtDate(start)} – ${fmtDate(end)}</strong>
   ${canEditProgram()?`<div class="rowActions"><button class="secondary" id="copyWeekBtn">📋 Copia settimana</button><button class="secondary" id="repeatWeekBtn">🔁 Ripeti nel mesociclo</button></div>`:""}
   </div></div>
   <div class="programWeekGrid">${days.map(d=>{
     const iso=localISODate(d),list=byDate[iso]||[];
     return `<div class="programDay"><div class="programDayHead"><b>${d.toLocaleDateString("it-IT",{weekday:"short"})}</b><span>${d.getDate()}</span></div>
       ${list.length?list.map(s=>`<div class="programSession ${completed.has(s.id)||s.status==="completed"?"programDone":""}">
         <div class="sectionTitle"><div><b>${s.title||s.training_types?.name||"Seduta"}</b><small>${s.training_types?.name||""}</small></div><span class="badge ${completed.has(s.id)||s.status==="completed"?"ok":""}">${completed.has(s.id)||s.status==="completed"?"Svolto":"Programmato"}</span></div>
         <div class="programBlocksView">${blocksSummaryHTML(s.planned_blocks||[],false)}</div>
         ${s.notes?`<p>${s.notes}</p>`:""}
         <div class="programActions">
           ${profile.role!=="doctor"&&!completed.has(s.id)&&s.status!=="completed"?`<button class="primary smallBtn" data-execute-program="${s.id}">Registra svolto</button>`:""}
           ${canEditProgram()?`<button class="editBtn smallBtn" data-edit-program="${s.id}">✏️ Modifica</button><button class="secondary smallBtn" data-share-program="${s.id}">👥 Aggiungi ad altri</button><button class="dangerBtn smallBtn" data-delete-program="${s.id}">🗑️ Elimina</button>`:""}
         </div>
       </div>`).join(""):'<div class="programRest">Riposo / nessuna seduta programmata</div>'}
     </div>`;
   }).join("")}</div>`;

   if(canEditProgram()){
     const duplicateWeek=async(repeats=1)=>{
       const source=p||[];
       if(!source.length)return toast("Nessuna seduta da copiare in questa settimana.");

       const rawDate=prompt(repeats===1?"Data del lunedì di destinazione (AAAA-MM-GG):":"Data del lunedì di inizio mesociclo (AAAA-MM-GG):",localISODate(addDaysDate(monday,7)));
       if(!rawDate)return;
       const targetMonday=new Date(rawDate+"T12:00:00");

       const weekCount=repeats===1?1:Number(prompt("Quante settimane vuoi programmare?",4)||0);
       if(!weekCount||weekCount<1)return;

       const athleteList=aa.map((a,i)=>`${i+1}. ${a.display_name}`).join("\\n");
       const rawAth=prompt(`Per quali atleti vuoi copiare ${repeats===1?"la settimana":"il mesociclo"}?\\nInserisci i numeri separati da virgola oppure scrivi TUTTI.\\n\\n${athleteList}`,"TUTTI");
       if(!rawAth)return;

       let targetAthletes=[];
       if(rawAth.trim().toUpperCase()==="TUTTI"){
         targetAthletes=aa;
       }else{
         const idxs=rawAth.split(",").map(x=>Number(x.trim())-1).filter(x=>Number.isInteger(x));
         targetAthletes=idxs.map(i=>aa[i]).filter(Boolean);
       }
       if(!targetAthletes.length)return toast("Nessun atleta valido selezionato.");

       if(!confirm(`Copio ${source.length} sedute per ${weekCount} settimana/e a ${targetAthletes.length} atleta/i. Confermi?`))return;

       for(const athlete of targetAthletes){
         for(let w=0;w<weekCount;w++){
           for(const s of source){
             const srcDate=new Date(s.session_date+"T12:00:00");
             const delta=Math.round((srcDate-monday)/86400000);
             const newDate=localISODate(addDaysDate(targetMonday,delta+w*7));

             const {data:newS,error:se}=await sb.from("planned_sessions").insert({
               athlete_id:athlete.id,
               session_date:newDate,
               training_type_id:s.training_type_id,
               title:s.title,
               notes:s.notes,
               status:"planned",
               created_by:currentUser.id
             }).select("id").single();
             if(se)return toast(se.message);

             const blocks=(s.planned_blocks||[]).map(({id,planned_session_id,planned_volume_m,created_at,...b})=>({
               planned_session_id:newS.id,...b
             }));
             if(blocks.length){
               const {error:be}=await sb.from("planned_blocks").insert(blocks);
               if(be)return toast(be.message);
             }
           }
         }
       }
       toast(`${repeats===1?"Settimana":"Mesociclo"} copiato per ${targetAthletes.length} atleta/i`);
       await draw();
     };
     $("#copyWeekBtn").onclick=()=>duplicateWeek(1);
     $("#repeatWeekBtn").onclick=()=>duplicateWeek(4);
   }

   document.querySelectorAll("[data-execute-program]").forEach(b=>b.onclick=()=>{
     sessionStorage.setItem("programToExecute",b.dataset.executeProgram);
     activeTab="training";renderTabs();render();
   });
   document.querySelectorAll("[data-edit-program]").forEach(b=>b.onclick=async()=>{
     const s=(p||[]).find(x=>x.id===b.dataset.editProgram);
     if(s)await editPlannedSession(s,draw);
   });
   document.querySelectorAll("[data-share-program]").forEach(b=>b.onclick=async()=>{
     const s=(p||[]).find(x=>x.id===b.dataset.shareProgram);
     if(!s)return;
     const names=aa.filter(a=>a.id!==s.athlete_id).map((a,i)=>`${i+1}. ${a.display_name}`).join("\n");
     const raw=prompt(`Aggiungi la seduta ad altri atleti. Inserisci i numeri separati da virgola:\n${names}\n\nEsempio: 1,3,4`);
     if(!raw)return;
     const idxs=raw.split(",").map(x=>Number(x.trim())-1).filter(x=>Number.isInteger(x));
     const targets=idxs.map(i=>aa.filter(a=>a.id!==s.athlete_id)[i]).filter(Boolean);
     if(!targets.length)return toast("Nessun atleta valido selezionato.");
     if(!confirm(`Copiare la seduta a ${targets.length} atleta/i?`))return;
     const ok=await clonePlannedSessionToAthletes(s,targets.map(x=>x.id));
     if(ok){toast("Seduta aggiunta agli altri atleti");await draw()}
   });
   document.querySelectorAll("[data-delete-program]").forEach(b=>b.onclick=async()=>{
     await deletePlannedSession(b.dataset.deleteProgram,draw);
   });
 }
 $("#programPrev").onclick=()=>{weekOffset--;sessionStorage.setItem("programWeekOffset",weekOffset);draw()};
 $("#programNext").onclick=()=>{weekOffset++;sessionStorage.setItem("programWeekOffset",weekOffset);draw()};
 $("#programThis").onclick=()=>{weekOffset=0;sessionStorage.setItem("programWeekOffset",0);draw()};
 if(isStaff())$("#programAth").onchange=()=>{
   document.querySelectorAll(".programAthCheck").forEach(c=>c.checked=false);
   const c=document.querySelector(`.programAthCheck[value="${$("#programAth").value}"]`);
   if(c)c.checked=true;
   draw();
 };
 if($("#programForm")){
   addBlockRow("programBlocks","program",{block_kind:"run",quality:"Accelerazione",sets:1,planned_reps:4,distance_m:30});
   if(isStaff()){
     const checks=()=>[...document.querySelectorAll(".programAthCheck")];
     $("#selectAllProgramAth").onclick=()=>checks().forEach(c=>c.checked=true);
     $("#clearAllProgramAth").onclick=()=>checks().forEach(c=>c.checked=false);
     const activeId=$("#programAth")?.value;
     if(activeId){const c=document.querySelector(`.programAthCheck[value="${activeId}"]`);if(c)c.checked=true;}
   }
   $("#addProgramWarmupBlock").onclick=()=>addBlockRow("programBlocks","program",{block_kind:"warmup",exercise:"Corsa blanda + attivazione",duration_min:10,sets:1,planned_reps:1});
   $("#addProgramMobilityBlock").onclick=()=>addBlockRow("programBlocks","program",{block_kind:"mobility",exercise:"Mobilità dinamica",duration_min:8,sets:1,planned_reps:1});
   $("#addProgramTechniqueBlock").onclick=()=>addBlockRow("programBlocks","program",{block_kind:"technique",exercise:"Skip / dribble / gambe tese",sets:2,planned_reps:2});
   $("#addProgramFreqBlock").onclick=()=>addBlockRow("programBlocks","program",{block_kind:"freq_amp",exercise:"Drill frequenza/ampiezza",subtype:"mixed",sets:2,planned_reps:3});
   $("#addProgramRunBlock").onclick=()=>addBlockRow("programBlocks","program",{block_kind:"run",quality:"Accelerazione"});
   $("#addProgramStrengthBlock").onclick=()=>addBlockRow("programBlocks","program",{block_kind:"strength",quality:"Forza",exercise:"Squat",sets:4,planned_reps:4,load_kg:0});
   $("#programForm").onsubmit=async e=>{
     e.preventDefault();
     const athleteIds=isStaff()
       ? [...document.querySelectorAll(".programAthCheck:checked")].map(c=>c.value)
       : [athleteProfile.id];
     if(!athleteIds.length)return toast("Seleziona almeno un atleta.");

     const baseBlocks=collectBlockRows("programBlocks","program");
     if(!baseBlocks.length&&!$("#programTitle").value.trim()&&!$("#programNotes").value.trim())
       return toast("Inserisci almeno un contenuto nella seduta.");

     if(athleteIds.length>1&&!confirm(`Creare la stessa seduta per ${athleteIds.length} atleti?`))return;

     for(const athleteId of athleteIds){
       const {data:s,error}=await sb.from("planned_sessions").insert({
         athlete_id:athleteId,
         session_date:$("#programDate").value,
         training_type_id:$("#programType").value,
         title:$("#programTitle").value.trim(),
         notes:$("#programNotes").value,
         created_by:currentUser.id,
         status:"planned"
       }).select("id").single();
       if(error)return toast(error.message);

       if(baseBlocks.length){
         const blocks=baseBlocks.map(x=>({planned_session_id:s.id,...x}));
         const {error:be}=await sb.from("planned_blocks").insert(blocks);
         if(be)return toast(be.message);
       }
     }
     toast(`Seduta programmata per ${athleteIds.length} atleta/i`);
     await renderProgram();
   };
 }
 await draw();
}

async function showTrainingDetailsModal(trainings,date,athleteId){
 const ids=(trainings||[]).map(x=>x.id); let blockMap={};
 if(ids.length){const {data:bs}=await sb.from("training_blocks").select("*").in("training_id",ids).order("created_at");(bs||[]).forEach(b=>(blockMap[b.training_id]??=[]).push(b));}
 const old=document.getElementById("trainingDetailsOverlay");if(old)old.remove();
 const items=(trainings||[]).map((x,i)=>`
   <div class="trainingDetailBlock">
     <div class="sectionTitle">
       <div>
         <span class="eyebrow">SEDUTA ${i+1}</span>
         <h3>${x.training_types?.name||"Allenamento"}</h3>
       </div>
       <span class="badge redBadge">${x.session_load??"—"} AU</span>
     </div>
     <div class="trainingDetailGrid">
       <div><span>Data</span><strong>${fmtDate(effectiveTrainingDate(x))}</strong></div>
       <div><span>Durata</span><strong>${x.duration_min??"—"} min</strong></div>
       <div><span>sRPE</span><strong>${x.srpe??"—"}/10</strong></div>
       <div><span>Training Load</span><strong>${x.session_load??"—"} AU</strong></div>
     </div>
     <div class="trainingDetailText"><span>Volume specifico automatico</span><div>${blocksSummaryHTML(blockMap[x.id]||[],true)}</div></div>
     <div class="trainingDetailText"><span>Lavoro svolto</span><p>${x.work_done||"—"}</p></div>
     <div class="trainingDetailText"><span>Tempi / risultati</span><p>${x.times_results||"—"}</p></div>
     <div class="trainingDetailText"><span>Dolore / problemi post</span><p>${x.pain_post||"—"}</p></div>
     <div class="trainingDetailText"><span>Note</span><p>${x.notes||"—"}</p></div>
     ${canCoachEdit()?`<div class="modalActions trainingManageActions">
       <button class="editBtn" data-detail-edit="${x.id}">✏️ Modifica seduta</button>
       <button class="secondary" data-detail-volume="${x.id}">📊 Modifica volume</button>
       <button class="dangerBtn" data-detail-delete="${x.id}">🗑️ Elimina seduta</button>
     </div>`:""}
   </div>`).join("");

 const el=document.createElement("div");
 el.id="trainingDetailsOverlay";
 el.className="modalOverlay";
 el.innerHTML=`<div class="editModal card trainingDetailsModal">
   <div class="sectionTitle">
     <div><h2>Dettagli allenamento</h2><p class="muted">${fmtDate(date)}</p></div>
     <button class="modalClose secondary">✕</button>
   </div>
   ${items}
   <div class="modalActions">
     <button class="secondary modalCloseBottom">Chiudi</button>
   </div>
 </div>`;
 document.body.appendChild(el);
 const close=()=>el.remove();
 el.querySelector(".modalClose").onclick=close;
 el.querySelector(".modalCloseBottom").onclick=close;
 el.onclick=e=>{if(e.target===el)close()};
 if(canCoachEdit()){
   el.querySelectorAll("[data-detail-edit]").forEach(b=>b.onclick=async()=>{
     const id=b.dataset.detailEdit;
     close();
     await editTrainingRecord(id,renderTraining);
   });
   el.querySelectorAll("[data-detail-volume]").forEach(b=>b.onclick=async()=>{
     const id=b.dataset.detailVolume;
     close();
     await editTrainingVolume(id,renderTraining);
   });
   el.querySelectorAll("[data-detail-delete]").forEach(b=>b.onclick=async()=>{
     const id=b.dataset.detailDelete;
     if(!confirm("Sei sicuro di voler eliminare questa seduta?"))return;
     const {error}=await sb.from("trainings").delete().eq("id",id);
     if(error)return toast(error.message);
     close();
     toast("Seduta eliminata");
     await renderTraining();
   });
 }
}



async function deleteActualTraining(id,after){
 if(!canCoachEdit())return;
 if(!confirm("Eliminare definitivamente questa seduta di allenamento? Verranno eliminati anche i blocchi di volume collegati."))return;
 const {error}=await sb.from("trainings").delete().eq("id",id);
 if(error)return toast(error.message);
 toast("Seduta eliminata");
 if(after)await after();
}

async function editTrainingVolume(trainingId,after){
 if(!canCoachEdit())return;
 const {data:blocks,error}=await sb.from("training_blocks").select("*").eq("training_id",trainingId).order("created_at");
 if(error)return toast(error.message);

 const old=document.getElementById("trainingVolumeOverlay");
 if(old)old.remove();

 const el=document.createElement("div");
 el.id="trainingVolumeOverlay";
 el.className="modalOverlay";
 el.innerHTML=`<div class="editModal card trainingVolumeModal">
   <div class="sectionTitle">
     <div><h2>Modifica volume seduta</h2><p class="muted">Correggi distanza, serie, ripetizioni effettive, esercizi e carichi.</p></div>
     <button class="modalClose secondary">✕</button>
   </div>
   <div class="rowActions blockButtons">
     <button type="button" class="secondary" id="volAddWarmup">+ Riscaldamento</button>
     <button type="button" class="secondary" id="volAddMobility">+ Mobilità</button>
     <button type="button" class="secondary" id="volAddTechnique">+ Tecnica</button>
     <button type="button" class="secondary" id="volAddFreq">+ Frequenza/Ampiezza</button>
     <button type="button" class="secondary" id="volAddRun">+ Corsa</button>
     <button type="button" class="secondary" id="volAddStrength">+ Forza</button>
   </div>
   <div id="editVolumeBlocks" class="workBlocks"></div>
   <div class="modalActions">
     <button class="secondary modalCancel">Annulla</button>
     <button class="primary" id="saveTrainingVolume">Salva volume corretto</button>
   </div>
 </div>`;
 document.body.appendChild(el);

 const close=()=>el.remove();
 el.querySelector(".modalClose").onclick=close;
 el.querySelector(".modalCancel").onclick=close;
 el.onclick=e=>{if(e.target===el)close()};

 const add=(data={})=>addBlockRow("editVolumeBlocks","actual",data);
 (blocks||[]).forEach(b=>add(b));
 if(!(blocks||[]).length) add({block_kind:"run",quality:"Accelerazione",sets:1,planned_reps:1,completed_reps:1});

 $("#volAddWarmup").onclick=()=>add({block_kind:"warmup",exercise:"Corsa blanda + attivazione",duration_min:10,sets:1,planned_reps:1,completed_reps:1});
 $("#volAddMobility").onclick=()=>add({block_kind:"mobility",exercise:"Mobilità dinamica",duration_min:8,sets:1,planned_reps:1,completed_reps:1});
 $("#volAddTechnique").onclick=()=>add({block_kind:"technique",exercise:"Skip / dribble / gambe tese",sets:2,planned_reps:2,completed_reps:2});
 $("#volAddFreq").onclick=()=>add({block_kind:"freq_amp",exercise:"Drill frequenza/ampiezza",subtype:"mixed",sets:2,planned_reps:3,completed_reps:3});
 $("#volAddRun").onclick=()=>add({block_kind:"run",quality:"Accelerazione",sets:1,planned_reps:1,completed_reps:1});
 $("#volAddStrength").onclick=()=>add({block_kind:"strength",quality:"Forza",exercise:"Squat",sets:4,planned_reps:4,completed_reps:4,load_kg:0});

 $("#saveTrainingVolume").onclick=async()=>{
   const newBlocks=collectBlockRows("editVolumeBlocks","actual");
   if(!confirm("Salvare il volume corretto della seduta?"))return;
   const {error:de}=await sb.from("training_blocks").delete().eq("training_id",trainingId);
   if(de)return toast(de.message);
   if(newBlocks.length){
     const payload=newBlocks.map(b=>({training_id:trainingId,...b}));
     const {error:ie}=await sb.from("training_blocks").insert(payload);
     if(ie)return toast(ie.message);
   }
   close();
   toast("Volume seduta aggiornato");
   if(after)await after();
 };
}

async function deletePlannedSession(id,after){
 if(!["coach","assistant_coach"].includes(profile?.role))return;
 if(!confirm("Eliminare questa seduta programmata? I blocchi collegati verranno eliminati automaticamente."))return;
 const {error}=await sb.from("planned_sessions").delete().eq("id",id);
 if(error)return toast(error.message);
 toast("Seduta programmata eliminata");
 if(after)await after();
}
function showPlannedTrainingModal(session){
 const old=document.getElementById("plannedTrainingOverlay");if(old)old.remove();
 const blocks=session.planned_blocks||[];
 const el=document.createElement("div");
 el.id="plannedTrainingOverlay";
 el.className="modalOverlay";
 el.innerHTML=`<div class="editModal card trainingDetailsModal">
   <div class="sectionTitle">
     <div>
       <span class="eyebrow">SEDUTA PROGRAMMATA</span>
       <h2>${session.title||session.training_types?.name||"Allenamento"}</h2>
       <p class="muted">${fmtDate(session.session_date)} · ${session.training_types?.name||""}</p>
     </div>
     <button class="modalClose secondary">✕</button>
   </div>
   <div class="trainingDetailText">
     <span>Programma completo</span>
     <div>${blocksSummaryHTML(blocks,false)}</div>
   </div>
   ${session.notes?`<div class="trainingDetailText"><span>Note del programma</span><p>${session.notes}</p></div>`:""}
   <div class="modalActions">
     <button class="secondary modalCloseBottom">Chiudi</button>
     ${["coach","assistant_coach"].includes(profile?.role)?`<button class="dangerBtn" id="deletePlannedSessionBtn">🗑️ Elimina seduta</button>`:""}
     ${profile.role!=="doctor"?`<button class="primary" id="executePlannedSession">Registra allenamento svolto</button>`:""}
   </div>
 </div>`;
 document.body.appendChild(el);
 const close=()=>el.remove();
 el.querySelector(".modalClose").onclick=close;
 el.querySelector(".modalCloseBottom").onclick=close;
 el.onclick=e=>{if(e.target===el)close()};
 if($("#deletePlannedSessionBtn"))$("#deletePlannedSessionBtn").onclick=async()=>{
   const ok=confirm("Sei sicuro di voler eliminare questa seduta programmata?");
   if(!ok)return;
   const {error}=await sb.from("planned_sessions").delete().eq("id",session.id);
   if(error)return toast(error.message);
   close();
   toast("Seduta programmata eliminata");
   await renderTraining();
 };
 if($("#executePlannedSession"))$("#executePlannedSession").onclick=()=>{
   sessionStorage.setItem("programToExecute",session.id);
   close();
   renderTraining();
 };
}
async function renderTraining(){
 const athleteField=await athleteSelectHTML(), types=await getTrainingTypes();
 const aa=isStaff()?await getAthletes():[athleteProfile];
 view.innerHTML=`<div class="card trainingDiaryCard">
   <div class="sectionTitle"><div><h2>Diario di allenamento</h2><p class="muted">Calendario mensile: sedute registrate, riposo e presenza prevista nello stesso colpo d'occhio.</p></div><span class="badge redBadge">DIARIO</span></div>
   <div class="grid two diaryToolbar">
     ${isStaff()?`<label>Atleta<select id="diaryAth">${aa.map(a=>`<option value="${a.id}">${a.display_name}</option>`).join("")}</select></label>`:""}
     <div class="monthNav"><button class="secondary" id="diaryPrev">←</button><strong id="diaryMonthLabel"></strong><button class="secondary" id="diaryNext">→</button><button class="secondary" id="diaryToday">Oggi</button></div>
   </div>
   <div id="trainingDiary"></div>
 </div>
 <div class="card"><h2>Registra allenamento</h2><form id="trainingForm">${athleteField}
 <label>Data allenamento<input type="date" id="trainingDate" value="${localISODate()}" required></label>
 <label>Tipo seduta<select id="trainingType">${types.map(x=>`<option value="${x.id}">${x.name}</option>`).join("")}</select></label>
 <label>Lavoro reale svolto<textarea id="workDone" placeholder="Serie, ripetizioni, distanze, recuperi, carichi..."></textarea></label>
 <div class="card innerCard structuredWorkCard">
   <div class="sectionTitle"><div><h3>Lavoro strutturato</h3><p class="muted">Registra anche riscaldamento, mobilità, tecnica e lavori di frequenza/ampiezza.</p></div><div class="rowActions blockButtons">
<button type="button" class="secondary" id="addActualWarmupBlock">+ Riscaldamento</button>
<button type="button" class="secondary" id="addActualMobilityBlock">+ Mobilità</button>
<button type="button" class="secondary" id="addActualTechniqueBlock">+ Tecnica</button>
<button type="button" class="secondary" id="addActualFreqBlock">+ Frequenza/Ampiezza</button>
<button type="button" class="secondary" id="addActualRunBlock">+ Corsa</button>
<button type="button" class="secondary" id="addActualStrengthBlock">+ Forza</button>
</div></div>
   <div id="actualBlocks" class="workBlocks"></div>
   <input type="hidden" id="plannedSessionId">
 </div>
 <label>Tempi / risultati principali<textarea id="timesResults"></textarea></label>
 <div class="grid two"><label>Durata (min)<input type="number" id="duration" min="1" required></label><label>Session-RPE CR10
 <select id="srpe" required>
  <option value="0">0 — Riposo / nessuno sforzo</option><option value="1">1 — Molto, molto facile</option><option value="2">2 — Facile</option>
  <option value="3">3 — Moderato</option><option value="4">4 — Moderatamente impegnativo</option><option value="5">5 — Impegnativo</option>
  <option value="6">6 — Molto impegnativo</option><option value="7">7 — Molto duro</option><option value="8">8 — Durissimo</option>
  <option value="9">9 — Quasi massimale</option><option value="10">10 — Massimale</option>
 </select></label></div>
 <label>Dolore / problemi post<textarea id="painPost"></textarea></label><label>Note<textarea id="trainingNotes"></textarea></label>
 <button class="primary">Salva allenamento</button></form></div><div id="trainRecent"></div>`;

 let diaryDate=new Date();diaryDate.setDate(1);diaryDate.setHours(12,0,0,0);
 const diaryAthleteId=()=>isStaff()?$("#diaryAth").value:athleteProfile.id;

 async function drawDiary(){
   const y=diaryDate.getFullYear(),m=diaryDate.getMonth();
   const first=new Date(y,m,1,12),last=new Date(y,m+1,0,12);
   const start=localISODate(first),end=localISODate(last),id=diaryAthleteId();
   $("#diaryMonthLabel").textContent=first.toLocaleDateString("it-IT",{month:"long",year:"numeric"});
   const [{data:t,error:te},{data:a,error:ae},{data:p,error:pe}]=await Promise.all([
     sb.from("trainings").select("id,planned_session_id,training_date,duration_min,srpe,session_load,work_done,times_results,pain_post,notes,training_types(name)").eq("athlete_id",id).gte("training_date",start).lte("training_date",end).order("training_date"),
     sb.from("attendance").select("attendance_date,status,expected_time,note").eq("athlete_id",id).gte("attendance_date",start).lte("attendance_date",end),
     sb.from("planned_sessions").select("*,training_types(name),planned_blocks(*)").eq("athlete_id",id).gte("session_date",start).lte("session_date",end).order("session_date")
   ]);
   if(te||ae||pe){$("#trainingDiary").innerHTML=`<div class="note">${(te||ae||pe).message}</div>`;return}
   const byTrain={};(t||[]).forEach(x=>(byTrain[x.training_date]??=[]).push(x));
   const byPlan={};(p||[]).forEach(x=>(byPlan[x.session_date]??=[]).push(x));
   const completedPlanIds=new Set((t||[]).map(x=>x.planned_session_id).filter(Boolean));
   const byAtt=new Map((a||[]).map(x=>[x.attendance_date,x]));
   const offset=(first.getDay()+6)%7; // Monday=0
   const total=Math.ceil((offset+last.getDate())/7)*7;
   const cells=[];
   for(let i=0;i<total;i++){
     const d=new Date(y,m,1-offset+i,12),iso=localISODate(d),inMonth=d.getMonth()===m;
     const tr=byTrain[iso]||[],pl=(byPlan[iso]||[]).filter(x=>!completedPlanIds.has(x.id)),att=byAtt.get(iso),future=d>new Date(new Date().setHours(23,59,59,999));
     let body="",cls="";
     if(tr.length){
       cls="hasTraining";
       body=tr.map(x=>`<div class="diaryTrainingChip actualChip"><b>✅ ${x.training_types?.name||"Allenamento svolto"}</b><small>${x.duration_min}′ · RPE ${x.srpe} · TL ${x.session_load} AU</small></div>`).join("");
       if(pl.length) body+=pl.map(x=>`<div class="diaryTrainingChip plannedChip" data-plan-id="${x.id}"><b>📋 ${x.title||x.training_types?.name||"Seduta programmata"}</b><small>Programmato</small></div>`).join("");
     }else if(pl.length){
       cls="hasPlannedTraining";
       body=pl.map(x=>`<div class="diaryTrainingChip plannedChip" data-plan-id="${x.id}"><b>📋 ${x.title||x.training_types?.name||"Seduta programmata"}</b><small>${blocksSummaryHTML(x.planned_blocks||[],false)}</small></div>`).join("");
     }else if(att?.status==="present"){
       cls="plannedPresent"; body=`<div class="diaryState">🟡 Presente${att.expected_time?` · ${String(att.expected_time).slice(0,5)}`:""}<small>Allenamento da registrare</small></div>`;
     }else if(att?.status==="maybe"){
       cls="plannedMaybe"; body=`<div class="diaryState">❓ Da confermare${att.expected_time?` · ${String(att.expected_time).slice(0,5)}`:""}</div>`;
     }else{
       cls="restDay"; body=`<div class="diaryState">○ Riposo${att?.status==="absent"?"":" / nessuna seduta"}</div>`;
     }
     cells.push(`<button class="diaryDay ${inMonth?"":"outsideMonth"} ${cls}" data-diary-date="${iso}" ${inMonth?"":"tabindex=-1"}>
       <span class="diaryDayNum">${d.getDate()}</span>${body}
     </button>`);
   }
   $("#trainingDiary").innerHTML=`<div class="diaryWeekdays">${["Lun","Mar","Mer","Gio","Ven","Sab","Dom"].map(x=>`<span>${x}</span>`).join("")}</div><div class="diaryGrid">${cells.join("")}</div>
   <div class="diaryLegend"><span>✅ Allenamento svolto</span><span>📋 Seduta programmata</span><span>🟡 Presente: da registrare</span><span>❓ Da confermare</span><span>○ Riposo</span></div>`;
   document.querySelectorAll("[data-diary-date]").forEach(b=>b.onclick=e=>{
     if(e.target.closest("[data-plan-id]"))return;
     const date=b.dataset.diaryDate;
     const dayTrainings=byTrain[date]||[];
     const dayPlans=(byPlan[date]||[]).filter(x=>!completedPlanIds.has(x.id));
     if(dayTrainings.length){
       showTrainingDetailsModal(dayTrainings,date,id);
       return;
     }
     if(dayPlans.length){
       showPlannedTrainingModal(dayPlans[0]);
       return;
     }
     $("#trainingDate").value=date;
     if(isStaff()&&$("#athleteId"))$("#athleteId").value=id;
     $("#trainingForm").scrollIntoView({behavior:"smooth",block:"start"});
   });
   document.querySelectorAll("[data-plan-id]").forEach(el=>el.onclick=e=>{
     e.stopPropagation();
     const s=(p||[]).find(x=>x.id===el.dataset.planId);
     if(s)showPlannedTrainingModal(s);
   });
 }
 $("#diaryPrev").onclick=async()=>{diaryDate.setMonth(diaryDate.getMonth()-1);await drawDiary()};
 $("#diaryNext").onclick=async()=>{diaryDate.setMonth(diaryDate.getMonth()+1);await drawDiary()};
 $("#diaryToday").onclick=async()=>{diaryDate=new Date();diaryDate.setDate(1);diaryDate.setHours(12,0,0,0);await drawDiary()};
 if(isStaff())$("#diaryAth").onchange=async()=>{
   if($("#athleteId"))$("#athleteId").value=$("#diaryAth").value;
   await drawDiary();
 };
 if(isStaff()&&$("#athleteId"))$("#athleteId").onchange=async()=>{
   if($("#diaryAth"))$("#diaryAth").value=$("#athleteId").value;
   await drawDiary();
 };


 addBlockRow("actualBlocks","actual",{block_kind:"run",quality:"Accelerazione",sets:1,planned_reps:1,completed_reps:1});
 $("#addActualWarmupBlock").onclick=()=>addBlockRow("actualBlocks","actual",{block_kind:"warmup",exercise:"Corsa blanda + attivazione",duration_min:10,sets:1,planned_reps:1,completed_reps:1});
 $("#addActualMobilityBlock").onclick=()=>addBlockRow("actualBlocks","actual",{block_kind:"mobility",exercise:"Mobilità dinamica",duration_min:8,sets:1,planned_reps:1,completed_reps:1});
 $("#addActualTechniqueBlock").onclick=()=>addBlockRow("actualBlocks","actual",{block_kind:"technique",exercise:"Skip / dribble / gambe tese",sets:2,planned_reps:2,completed_reps:2});
 $("#addActualFreqBlock").onclick=()=>addBlockRow("actualBlocks","actual",{block_kind:"freq_amp",exercise:"Drill frequenza/ampiezza",subtype:"mixed",sets:2,planned_reps:3,completed_reps:3});
 $("#addActualRunBlock").onclick=()=>addBlockRow("actualBlocks","actual",{block_kind:"run",quality:"Accelerazione"});
 $("#addActualStrengthBlock").onclick=()=>addBlockRow("actualBlocks","actual",{block_kind:"strength",quality:"Forza",exercise:"Squat",sets:4,planned_reps:4,completed_reps:4,load_kg:0});

 const programToExecute=sessionStorage.getItem("programToExecute");
 if(programToExecute){
   const {data:ps}=await sb.from("planned_sessions").select("*,planned_blocks(*)").eq("id",programToExecute).maybeSingle();
   if(ps){
     if(isStaff()&&$("#athleteId"))$("#athleteId").value=ps.athlete_id;
     if(isStaff()&&$("#diaryAth"))$("#diaryAth").value=ps.athlete_id;
     $("#trainingDate").value=ps.session_date;
     $("#trainingType").value=ps.training_type_id||$("#trainingType").value;
     $("#workDone").value=ps.title||"";
     $("#trainingNotes").value=ps.notes||"";
     $("#plannedSessionId").value=ps.id;
     $("#actualBlocks").innerHTML="";
     (ps.planned_blocks||[]).forEach(b=>addBlockRow("actualBlocks","actual",{...b,completed_reps:b.planned_reps}));
   }
   sessionStorage.removeItem("programToExecute");
 }

 $("#trainingForm").onsubmit=async e=>{
   e.preventDefault();
   const athleteId=$("#athleteId").value,trainingDate=$("#trainingDate").value,trainingTypeId=$("#trainingType").value;
   let plannedId=$("#plannedSessionId").value||null;
   if(!plannedId){
     const {data:match}=await sb.from("planned_sessions").select("id").eq("athlete_id",athleteId).eq("session_date",trainingDate).eq("training_type_id",trainingTypeId).eq("status","planned").limit(1);
     plannedId=match?.[0]?.id||null;
   }
   const payload={athlete_id:athleteId,training_date:trainingDate,training_type_id:trainingTypeId,planned_session_id:plannedId,duration_min:+$("#duration").value,srpe:+$("#srpe").value,work_done:$("#workDone").value,times_results:$("#timesResults").value,pain_post:$("#painPost").value,notes:$("#trainingNotes").value};
   const {data:saved,error}=await sb.from("trainings").insert(payload).select("id").single();if(error)return toast(error.message);
   const blocks=collectBlockRows("actualBlocks","actual").map(b=>({training_id:saved.id,...b}));
   if(blocks.length){const {error:be}=await sb.from("training_blocks").insert(blocks);if(be)return toast(be.message)}
   if(plannedId)await sb.from("planned_sessions").update({status:"completed"}).eq("id",plannedId);
   toast("Allenamento salvato · Performance aggiornata");await renderTraining();
 };
 await drawDiary();
 await renderRecentTraining();
}
async function renderRecentTraining(){
 let q=sb.from("trainings").select("*,athletes(display_name),training_types(name)").order("training_date",{ascending:false}).limit(10);
 if(profile.role==="athlete") q=q.eq("athlete_id",athleteProfile.id);
 const {data}=await q;
 $("#trainRecent").innerHTML=recentCard("Ultimi allenamenti",(data||[]).map(x=>[fmtDate(effectiveTrainingDate(x)),x.athletes?.display_name||"",x.training_types?.name||"",`${x.duration_min} min · RPE ${x.srpe} · ${x.session_load} AU`,canCoachEdit()?`<div class="rowActions"><button class="editBtn" data-edit-training="${x.id}">✏️ Modifica</button><button class="secondary" data-volume-training="${x.id}">📊 Volume</button><button class="dangerBtn" data-del-training="${x.id}">Elimina</button></div>`:""]));
 if(canCoachEdit()){
   document.querySelectorAll("[data-edit-training]").forEach(b=>b.onclick=()=>editTrainingRecord(b.dataset.editTraining,renderRecentTraining));
   document.querySelectorAll("[data-volume-training]").forEach(b=>b.onclick=()=>editTrainingVolume(b.dataset.volumeTraining,renderRecentTraining));
   document.querySelectorAll("[data-del-training]").forEach(b=>b.onclick=()=>deleteCoachRecord("trainings",b.dataset.delTraining,renderRecentTraining,"allenamento"));
 }
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
 $("#testRecent").innerHTML=recentCard("Ultimi test",(data||[]).map(x=>[fmt(x.recorded_at),x.athletes?.display_name||"",x.tests?.name||"",`Media ${x.mean_value} · Best ${x.best_value} ${x.tests?.unit||""}`,canCoachEdit()?`<div class="rowActions"><button class="editBtn" data-edit-test="${x.id}">✏️ Modifica</button><button class="dangerBtn" data-del-test="${x.id}">Elimina</button></div>`:""]));
 if(canCoachEdit()){document.querySelectorAll("[data-edit-test]").forEach(b=>b.onclick=()=>editTestRecord(b.dataset.editTest,renderRecentTests));document.querySelectorAll("[data-del-test]").forEach(b=>b.onclick=()=>deleteCoachRecord("test_results",b.dataset.delTest,renderRecentTests,"test"));}
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
 const {data}=await q;$("#raceRecent").innerHTML=recentCard("Ultime gare",(data||[]).map(x=>[x.race_date,x.athletes?.display_name||"",x.race_types?.name||"",`${x.result} ${x.race_types?.unit||""}`,canCoachEdit()?`<div class="rowActions"><button class="editBtn" data-edit-race="${x.id}">✏️ Modifica</button><button class="dangerBtn" data-del-race="${x.id}">Elimina</button></div>`:""]));
 if(canCoachEdit()){document.querySelectorAll("[data-edit-race]").forEach(b=>b.onclick=()=>editRaceRecord(b.dataset.editRace,renderRecentRaces));document.querySelectorAll("[data-del-race]").forEach(b=>b.onclick=()=>deleteCoachRecord("races",b.dataset.delRace,renderRecentRaces,"gara"));}
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
const SPRINT_QUALITIES=["Accelerazione","V Max / Lanciati","Tempo Run","Speed Endurance","Special Speed Endurance","Ostacoli","Tecnica di corsa","Pliometria","Altro"];
const PERFORMANCE_QUALITIES=[...SPRINT_QUALITIES,"Forza"];
const STRENGTH_QUALITIES=["Forza Max","Potenza","Forza speciale","Mantenimento","Prevenzione","Forza generale","Altro"];

function isoDateToday(){return new Date().toISOString().slice(0,10)}
function daysAgo(n){const d=new Date();d.setDate(d.getDate()-n);return d}
function parseDateLocal(x){return x?new Date(String(x).length===10?x+"T12:00:00":x):null}

async function renderPerformance(){
 const aa=isStaff()?await getAthletes():[athleteProfile];
 const initial=sessionStorage.getItem("perfAthlete")||aa[0]?.id;
 view.innerHTML=`<div class="card">
  <div class="sectionTitle"><div><h2>Performance</h2><p class="muted">Volume specifico aggiornato automaticamente dagli allenamenti effettivamente svolti.</p></div><span class="badge redBadge">V3.6 AUTO</span></div>
  ${isStaff()?`<label>Atleta<select id="perfAth">${aa.map(a=>`<option value="${a.id}" ${a.id===initial?"selected":""}>${a.display_name}</option>`).join("")}</select></label>`:""}
  <div class="segmented" id="perfSections">
    <button class="perfSec active" data-sec="sprint">Volumi corsa</button>
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
 const [{data:t,error},{data:planned},{data:legacy}]=await Promise.all([
   sb.from("trainings").select("id,training_date,work_done,training_types(name),training_blocks(*)").eq("athlete_id",id).order("training_date",{ascending:true}),
   sb.from("planned_sessions").select("id,session_date,status,training_types(name),planned_blocks(*)").eq("athlete_id",id).order("session_date",{ascending:true}),
   sb.from("sprint_volume").select("*").eq("athlete_id",id).order("session_date",{ascending:true})
 ]);
 if(error){$("#perfBody").innerHTML=`<div class="note">${error.message}<br><b>Esegui prima V3_6_UPGRADE.sql.</b></div>`;return}
 const sessions=t||[], rows=[];
 sessions.forEach(s=>(s.training_blocks||[]).filter(b=>(b.block_kind||"run")==="run").forEach(b=>rows.push({
   date:s.training_date,session:s.training_types?.name||"Allenamento",quality:b.quality,
   distance_m:Number(b.distance_m||0),sets:Number(b.sets||1),planned_reps:Number(b.planned_reps||0),
   completed_reps:Number(b.completed_reps||0),meters:volumeForBlock(b,true),training_id:s.id
 })));
 const d7=daysAgo(7),d30=daysAgo(30);
 const recent7=rows.filter(x=>parseDateLocal(x.date)>=d7),recent30=rows.filter(x=>parseDateLocal(x.date)>=d30);
 const m7=recent7.reduce((s,x)=>s+x.meters,0),m30=recent30.reduce((s,x)=>s+x.meters,0);
 const byQ={};recent30.forEach(x=>byQ[x.quality]=(byQ[x.quality]||0)+x.meters);
 const tempo30=byQ["Tempo Run"]||0;
 const plannedRows=[];
 (planned||[]).filter(s=>parseDateLocal(s.session_date)>=d30).forEach(s=>(s.planned_blocks||[]).filter(b=>(b.block_kind||"run")==="run").forEach(b=>plannedRows.push({quality:b.quality,meters:volumeForBlock(b,false)})));
 const plannedByQ={};plannedRows.forEach(x=>plannedByQ[x.quality]=(plannedByQ[x.quality]||0)+x.meters);
 const qualities=[...new Set([...Object.keys(plannedByQ),...Object.keys(byQ)])];
 const compare=qualities.map(q=>({q,planned:plannedByQ[q]||0,actual:byQ[q]||0,pct:plannedByQ[q]?((byQ[q]||0)/plannedByQ[q]*100):null}));

 $("#perfBody").innerHTML=`<div class="stats autoPerfStats">
   ${stat("Volume 7 gg",`${Math.round(m7)} m`)}
   ${stat("Volume 30 gg",`${Math.round(m30)} m`)}
   ${stat("Tempo Run 30 gg",`${Math.round(tempo30)} m`)}
   ${stat("Blocchi registrati",rows.length)}
 </div>
 <div class="grid two">
   <div class="card innerCard"><h3>Volume effettivo · ultimi 30 giorni</h3>${simpleBarChart(Object.entries(byQ).map(([label,value])=>({label,value})),"Metri per qualità","m")}
     <p class="monitoringNote">Calcolato automaticamente: distanza × serie × ripetute effettivamente completate.</p>
   </div>
   <div class="card innerCard"><h3>Programmato vs svolto · 30 giorni</h3>
     <div class="tableWrap"><table><thead><tr><th>Qualità</th><th>Programmato</th><th>Svolto</th><th>Completamento</th></tr></thead><tbody>
     ${compare.map(x=>`<tr><td><b>${x.q}</b></td><td>${Math.round(x.planned)} m</td><td>${Math.round(x.actual)} m</td><td>${x.pct!==null?`${Math.round(x.pct)}%`:"—"}</td></tr>`).join("")||'<tr><td colspan="4">Nessun programma/volume nel periodo</td></tr>'}
     </tbody></table></div>
   </div>
 </div>
 <div class="card innerCard"><div class="sectionTitle"><div><h3>Dettaglio automatico</h3><p class="muted">Una riga per ogni blocco effettivamente inserito nella seduta.</p></div></div>
   <div class="tableWrap historyGrid"><table><thead><tr><th>Data</th><th>Seduta</th><th>Qualità</th><th>Distanza</th><th>Serie</th><th>Rip. previste</th><th>Rip. effettive</th><th>Volume</th></tr></thead><tbody>
   ${rows.slice().reverse().map(x=>`<tr><td>${fmtDate(x.date)}</td><td>${x.session}</td><td><b>${x.quality}</b></td><td>${x.distance_m} m</td><td>${x.sets}</td><td>${x.planned_reps}</td><td>${x.completed_reps}</td><td><b>${Math.round(x.meters)} m</b></td></tr>`).join("")||'<tr><td colspan="8">Nessun blocco strutturato registrato. I nuovi allenamenti V3.6 alimenteranno automaticamente questa sezione.</td></tr>'}
   </tbody></table></div>
 </div>
 ${(legacy||[]).length?`<details class="card innerCard legacyPerf"><summary>Storico volume manuale precedente alla V3.6 (${legacy.length})</summary><div class="tableWrap"><table><thead><tr><th>Data</th><th>Qualità</th><th>Metri</th><th>Prove</th></tr></thead><tbody>${legacy.slice().reverse().map(x=>`<tr><td>${x.session_date}</td><td>${x.quality}</td><td>${x.meters} m</td><td>${x.reps||"—"}</td></tr>`).join("")}</tbody></table></div></details>`:""}
 <p class="note"><b>Importante:</b> dalla V3.6 Performance non richiede più il doppio inserimento del volume. Per i lavori specifici usa i blocchi strutturati dentro Allenamento.</p>`;
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
   ${simpleLineChart(list.map(x=>({label:fmtDate(effectiveTrainingDate(x)),value:Number(x.mean_value)})),name,first.tests?.unit||"",!hb)}
  </div>`;
 }).join("");
 $("#perfBody").innerHTML=`<div class="sectionTitle"><div><h3>Profilo test atleta</h3><p class="muted">Baseline = prima rilevazione disponibile · PB = miglior valore storico.</p></div></div>
 <div class="profileGrid">${cards||'<div class="note">Nessun test registrato.</div>'}</div>`;
}


async function renderCompare(){
 const aa=isStaff()?await getAthletes():[athleteProfile];
 const savedSec=sessionStorage.getItem("compareSection")||"training";
 view.innerHTML=`<div class="card compareShell"><div class="sectionTitle"><div><h2>Confronti</h2><p class="muted">Confronta direttamente allenamenti, Wellness e Test dello stesso atleta.</p></div><span class="badge redBadge">ANALISI</span></div>
 <div class="grid three compareFilters">
 ${isStaff()?`<label>Atleta<select id="cmpAth">${aa.map(a=>`<option value="${a.id}">${a.display_name}</option>`).join("")}</select></label>`:""}
 <label>Area<select id="cmpSection"><option value="training" ${savedSec==="training"?"selected":""}>Allenamenti</option><option value="wellness" ${savedSec==="wellness"?"selected":""}>Wellness</option><option value="tests" ${savedSec==="tests"?"selected":""}>Test</option></select></label>
 <label>Periodo<select id="cmpDays"><option value="7">7 giorni</option><option value="30" selected>30 giorni</option><option value="90">90 giorni</option><option value="0">Tutto</option></select></label>
 </div><div id="compareBody"></div></div>`;
 const athleteId=()=>isStaff()?$("#cmpAth").value:athleteProfile.id;
 const draw=async()=>{
   sessionStorage.setItem("compareSection",$("#cmpSection").value);
   const sec=$("#cmpSection").value,days=+$("#cmpDays").value,id=athleteId();
   if(sec==="training")await drawTrainingCompare(id,days);
   if(sec==="wellness")await drawWellnessCompare(id,days);
   if(sec==="tests")await drawTestCompare(id,days);
 };
 if(isStaff())$("#cmpAth").onchange=draw;$("#cmpSection").onchange=draw;$("#cmpDays").onchange=draw;await draw();
}
async function drawTrainingCompare(id,days){
 const {data}=await sb.from("trainings").select("*,training_types(name)").eq("athlete_id",id).order("training_date",{ascending:true});
 const all=filterByDays(data||[],days,"training_date"), types=[...new Set(all.map(x=>x.training_types?.name).filter(Boolean))];
 $("#compareBody").innerHTML=`<div class="grid two"><label>Tipo allenamento<select id="cmpTrainType"><option value="">Tutti</option>${types.map(n=>`<option>${n}</option>`).join("")}</select></label><label>Metrica grafico<select id="cmpTrainMetric"><option value="session_load">Training Load (AU)</option><option value="srpe">sRPE</option><option value="duration_min">Durata (min)</option></select></label></div><div id="trainingCompareInner"></div>`;
 const redraw=()=>{
  const typ=$("#cmpTrainType").value,metric=$("#cmpTrainMetric").value,list=all.filter(x=>!typ||x.training_types?.name===typ);
  const opts=list.map((x,i)=>`<option value="${x.id}">${fmtDate(effectiveTrainingDate(x))} · ${x.training_types?.name||""} · TL ${x.session_load}</option>`).join("");
  const tlRef=trainingLoadReferenceBand(all);
  $("#trainingCompareInner").innerHTML=`${simpleLineChart(list.map(x=>({label:new Date(x.recorded_at).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"}),value:Number(x[metric]||0)})),metric==="session_load"?"Training Load":metric==="srpe"?"sRPE":"Durata",metric==="session_load"?"AU":metric==="duration_min"?"min":"")}${metric==="session_load"?referenceBandLineChart(tlRef.weeks.slice(-12),"Carico settimanale · fascia personale","AU",tlRef.band):""}
  <div class="card innerCard compareDirect"><h3>Confronto diretto di due sedute</h3><div class="grid two"><label>Seduta A<select id="cmpSessionA">${opts}</select></label><label>Seduta B<select id="cmpSessionB">${opts}</select></label></div><div id="directSessionCompare"></div></div>
  <div class="tableWrap historyGrid"><table><thead><tr><th>Data</th><th>Tipo</th><th>Durata</th><th>sRPE</th><th>TL</th><th>Lavoro</th><th>Tempi</th></tr></thead><tbody>${list.slice().reverse().map(x=>`<tr><td>${fmtDate(effectiveTrainingDate(x))}</td><td><b>${x.training_types?.name||""}</b></td><td>${x.duration_min} min</td><td>${x.srpe}</td><td><b>${x.session_load} AU</b></td><td>${x.work_done||"—"}</td><td>${x.times_results||"—"}</td></tr>`).join("")||'<tr><td colspan="7">Nessun allenamento</td></tr>'}</tbody></table></div>`;
  const direct=()=>{const a=list.find(x=>x.id===$("#cmpSessionA")?.value),b=list.find(x=>x.id===$("#cmpSessionB")?.value);if(!a||!b)return;const d=(bv,av)=>av?((bv-av)/Math.abs(av))*100:null;$("#directSessionCompare").innerHTML=`<div class="comparisonMatrix"><div></div><b>Seduta A</b><b>Seduta B</b><b>Δ B vs A</b><span>Durata</span><strong>${a.duration_min} min</strong><strong>${b.duration_min} min</strong>${changeBadge(d(Number(b.duration_min),Number(a.duration_min)))}<span>sRPE</span><strong>${a.srpe}</strong><strong>${b.srpe}</strong>${changeBadge(d(Number(b.srpe),Number(a.srpe)))}<span>Training Load</span><strong>${a.session_load} AU</strong><strong>${b.session_load} AU</strong>${changeBadge(d(Number(b.session_load),Number(a.session_load)))}</div>`};
  if($("#cmpSessionA")){$("#cmpSessionA").onchange=direct;$("#cmpSessionB").onchange=direct;if(list.length>1)$("#cmpSessionB").value=list.at(-1).id;direct()}
 };
 $("#cmpTrainType").onchange=redraw;$("#cmpTrainMetric").onchange=redraw;redraw();
}
async function drawWellnessCompare(id,days){
 const {data}=await sb.from("wellness").select("*").eq("athlete_id",id).order("wellness_date",{ascending:true});
 const all=filterByDays(data||[],days,"recorded_at");
 $("#compareBody").innerHTML=`<label class="narrowField">Metrica<select id="cmpWellMetric"><option value="score">Score totale</option><option value="sleep">Sonno</option><option value="fatigue">Stanchezza</option><option value="doms">DOMS</option><option value="stress">Stress</option></select></label><div id="wellCmpInner"></div>`;
 const draw=()=>{const m=$("#cmpWellMetric").value,u=m==="score"?"/20":"/5";$("#wellCmpInner").innerHTML=`${m==="score"?referenceBandLineChart(all.map(x=>({label:fmtDate(effectiveWellDate(x)),value:Number(x[m]||0)})),"Wellness — "+$("#cmpWellMetric").selectedOptions[0].text,u,wellnessReferenceBand(all),{fixedMin:4,fixedMax:20}):simpleLineChart(all.map(x=>({label:fmtDate(effectiveWellDate(x)),value:Number(x[m]||0)})),"Wellness — "+$("#cmpWellMetric").selectedOptions[0].text,u)}<div class="tableWrap historyGrid"><table><thead><tr><th>Data</th><th>Sonno</th><th>Stanchezza</th><th>DOMS</th><th>Stress</th><th>Score</th><th>Dolore</th></tr></thead><tbody>${all.slice().reverse().map(x=>`<tr><td>${fmtDate(effectiveWellDate(x))}</td><td>${x.sleep}</td><td>${x.fatigue}</td><td>${x.doms}</td><td>${x.stress}</td><td><b>${x.score}/20</b></td><td>${x.pain||"—"}</td></tr>`).join("")||'<tr><td colspan="7">Nessun dato</td></tr>'}</tbody></table></div>`};$("#cmpWellMetric").onchange=draw;draw();
}
async function drawTestCompare(id,days){
 const {data}=await sb.from("test_results").select("*,tests(name,unit,higher_better)").eq("athlete_id",id).order("recorded_at",{ascending:true});
 const all=filterByDays(data||[],days,"recorded_at"),names=[...new Set(all.map(x=>x.tests?.name).filter(Boolean))];
 $("#compareBody").innerHTML=`<label class="narrowField">Test<select id="cmpTestName">${names.map(n=>`<option>${n}</option>`).join("")}</select></label><div id="testCmpInner"></div>`;
 const draw=()=>{const name=$("#cmpTestName").value,list=all.filter(x=>x.tests?.name===name),meta=list[0]?.tests;$("#testCmpInner").innerHTML=`${simpleLineChart(list.map(x=>({label:new Date(x.recorded_at).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"}),value:Number(x.mean_value)})),name,meta?.unit||"",!meta?.higher_better)}<div class="tableWrap historyGrid"><table><thead><tr><th>Data</th><th>Prove</th><th>Media</th><th>Best</th><th>Δ precedente</th></tr></thead><tbody>${list.slice().reverse().map((x,ri)=>{const originalIndex=list.findIndex(z=>z.id===x.id),prev=originalIndex>0?list[originalIndex-1]:null;return `<tr><td>${fmt(x.recorded_at)}</td><td>${(x.values||[]).join(" · ")}</td><td><b>${Number(x.mean_value).toFixed(2)} ${meta?.unit||""}</b></td><td>${Number(x.best_value).toFixed(2)}</td><td>${prev?changeBadge(pctChange(x.mean_value,prev.mean_value,!meta?.higher_better)):"—"}</td></tr>`}).join("")||'<tr><td colspan="5">Nessun dato</td></tr>'}</tbody></table></div>`};if($("#cmpTestName")){$("#cmpTestName").onchange=draw;draw()}else $("#testCmpInner").innerHTML='<div class="note">Nessun test nel periodo.</div>';
}
async function renderInjuries(){
 const aa=isStaff()?await getAthletes():[athleteProfile];
 const allFields=await getCustomFields("injury");
 const fields=isStaff()?allFields:allFields.filter(f=>f.athlete_visible);
 const athleteField=isStaff()?`<label>Atleta<select id="injAth">${aa.map(a=>`<option value="${a.id}">${a.display_name}</option>`).join("")}</select></label>`:`<p><b>Atleta:</b> ${athleteProfile.display_name}</p>`;
 view.innerHTML=`<div class="card"><div class="sectionTitle"><div><h2>Storico infortuni & problematiche</h2><p class="muted">Registro condiviso tra staff tecnico e medico.</p></div><span class="badge redBadge">MEDICAL LOG</span></div>
 ${canManageInjuries()?`<form id="injuryForm">${athleteField}
 <div class="grid two"><label>Data inizio<input type="date" id="injStart" value="${isoDateToday()}" required></label><label>Sede<input id="injSite" placeholder="es. femorale dx, caviglia sx" required></label></div>
 <label>Problematica / diagnosi riferita<input id="injType" required></label>
 <div class="grid three"><label>Dolore 0–10<input type="number" id="injPain" min="0" max="10" value="0"></label><label>Limitazione<select id="injLimit"><option value="none">Nessuna</option><option value="reduced">Allenamento ridotto</option><option value="stop">Stop allenamento</option></select></label><label>Giorni persi<input type="number" id="injDays" min="0" value="0"></label></div>
 <div class="grid two"><label>Stato<select id="injStatus"><option value="active">Attivo</option><option value="recovering">In recupero</option><option value="resolved">Risolto</option></select></label><label>Data rientro<input type="date" id="injReturn"></label></div>
 ${renderCustomFields(fields,"injcf")}
 <label>Note / trattamento<textarea id="injNotes"></textarea></label><button class="primary">Salva problematica</button>
 </form>`:`<p class="note">Registro consultabile in sola lettura dall'atleta.</p>`}
 </div><div id="injuryList"></div>`;
 async function draw(){
  const id=isStaff()?$("#injAth").value:athleteProfile.id;
  const {data,error}=await sb.from("injuries").select("*").eq("athlete_id",id).order("start_date",{ascending:false});
  if(error){$("#injuryList").innerHTML=`<div class="card note">${error.message}</div>`;return}
  $("#injuryList").innerHTML=`<div class="card"><div class="stats">${stat("Totale",(data||[]).length)}${stat("Attivi",(data||[]).filter(x=>x.status==="active").length)}${stat("Giorni persi",(data||[]).reduce((s,x)=>s+Number(x.days_lost||0),0))}</div>
  <div class="tableWrap historyGrid"><table><thead><tr><th>Inizio</th><th>Sede</th><th>Problematica</th><th>Dolore</th><th>Limitazione</th><th>Giorni persi</th><th>Stato</th><th>Rientro</th><th>Campi extra</th><th>Note</th>${canManageInjuries()?"<th>Azioni</th>":""}</tr></thead><tbody>${(data||[]).map(x=>`<tr><td>${x.start_date}</td><td><b>${x.site}</b></td><td>${x.issue_type}</td><td>${x.pain_score}/10</td><td>${x.limitation}</td><td>${x.days_lost}</td><td><span class="badge ${x.status==="resolved"?"ok":x.status==="active"?"danger":""}">${x.status}</span></td><td>${x.return_date||"—"}</td><td>${customExtrasHTML(x.extras,fields)}</td><td>${x.notes||"—"}</td>${canManageInjuries()?`<td><button class="editBtn" data-edit-injury="${x.id}">✏️ Modifica</button></td>`:""}</tr>`).join("")||'<tr><td colspan="11">Nessuna problematica registrata</td></tr>'}</tbody></table></div></div>`;
  if(canManageInjuries())document.querySelectorAll("[data-edit-injury]").forEach(b=>b.onclick=()=>editInjuryRecord(b.dataset.editInjury,draw));
 }
 if(isStaff()) $("#injAth").onchange=draw;
 if(canManageInjuries()){
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
   sb.from("trainings").select("*,training_types(name)").eq("athlete_id",id).gte("training_date",start).lte("training_date",end),
   sb.from("wellness").select("*").eq("athlete_id",id).gte("wellness_date",start).lte("wellness_date",end),
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
     sb.from("trainings").select("*,training_types(name)").eq("athlete_id",id).order("training_date",{ascending:true}),
     sb.from("wellness").select("*").eq("athlete_id",id).order("wellness_date",{ascending:true}),
     sb.from("test_results").select("*,tests(name,unit,higher_better)").eq("athlete_id",id).order("recorded_at",{ascending:true}),
     sb.from("races").select("*,race_types(name,unit)").eq("athlete_id",id).order("race_date",{ascending:true})
   ]);
   cache={a,t:t||[],w:w||[],te:te||[],r:r||[]};
 }
 async function draw(){
   if(!cache) await loadData();
   const filtered={
     training:filterByDays(cache.t,days,"training_date"),
     wellness:filterByDays(cache.w,days,"wellness_date"),
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
   if(canCoachEdit()){
     document.querySelectorAll("[data-hist-edit-training]").forEach(b=>b.onclick=()=>editTrainingRecord(b.dataset.histEditTraining,async()=>{cache=null;await draw()}));
     document.querySelectorAll("[data-hist-volume-training]").forEach(b=>b.onclick=()=>editTrainingVolume(b.dataset.histVolumeTraining,async()=>{cache=null;await draw()}));
     document.querySelectorAll("[data-hist-del-training]").forEach(b=>b.onclick=()=>deleteCoachRecord("trainings",b.dataset.histDelTraining,async()=>{cache=null;await draw()},"allenamento"));
     document.querySelectorAll("[data-hist-edit-well]").forEach(b=>b.onclick=()=>editWellnessRecord(b.dataset.histEditWell,async()=>{cache=null;await draw()}));
     document.querySelectorAll("[data-hist-del-well]").forEach(b=>b.onclick=()=>deleteCoachRecord("wellness",b.dataset.histDelWell,async()=>{cache=null;await draw()},"wellness"));
     document.querySelectorAll("[data-hist-edit-test]").forEach(b=>b.onclick=()=>editTestRecord(b.dataset.histEditTest,async()=>{cache=null;await draw()}));
     document.querySelectorAll("[data-hist-del-test]").forEach(b=>b.onclick=()=>deleteCoachRecord("test_results",b.dataset.histDelTest,async()=>{cache=null;await draw()},"test"));
     document.querySelectorAll("[data-hist-edit-race]").forEach(b=>b.onclick=()=>editRaceRecord(b.dataset.histEditRace,async()=>{cache=null;await draw()}));
     document.querySelectorAll("[data-hist-del-race]").forEach(b=>b.onclick=()=>deleteCoachRecord("races",b.dataset.histDelRace,async()=>{cache=null;await draw()},"gara"));
   }
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
   const prev=all.filter(x=>{const d=new Date(effectiveTrainingDate(x)+"T12:00:00");return d>=b.previousStart&&d<=b.previousEnd});
   previousTL=prev.reduce((s,x)=>s+Number(x.session_load||0),0);
   delta=pctChange(tl,previousTL,false);
 }
 const byDay={};
 current.forEach(x=>{const k=fmtDate(effectiveTrainingDate(x));byDay[k]=(byDay[k]||0)+Number(x.session_load||0)});
 const points=Object.entries(byDay).map(([label,value])=>({label,value}));
 return `<div class="stats">
   ${stat("Sedute",current.length)}
   ${stat("TL totale",`${Math.round(tl)} AU`)}
   ${stat("sRPE medio",current.length?srpe.toFixed(1):"—")}
   ${stat("Durata",`${Math.round(dur)} min`)}
 </div>
 ${days?`<div class="comparisonCard"><div><span class="muted">Periodo precedente</span><b>${Math.round(previousTL)} AU</b></div><div class="compareArrow">→</div><div><span class="muted">Periodo attuale</span><b>${Math.round(tl)} AU</b></div><div class="right">${previousTL===0&&tl>0?'<span class="badge ok">Nuovo carico</span>':changeBadge(delta)}</div></div>`:""}
 ${(()=>{const ref=trainingLoadReferenceBand(all);return referenceBandLineChart(ref.weeks.slice(-12),"Training Load settimanale · fascia personale","AU",ref.band)})()}
 ${simpleBarChart(points,"Training Load giorno per giorno","AU")}
 <div class="tableWrap historyGrid"><table><thead><tr><th>Data</th><th>Tipo</th><th>Lavoro svolto</th><th>Tempi</th><th>Durata</th><th>sRPE</th><th>TL</th><th>Dolore</th>${canCoachEdit()?"<th>Azioni</th>":""}</tr></thead><tbody>
 ${current.slice().reverse().map(x=>`<tr><td>${fmtDate(effectiveTrainingDate(x))}</td><td><b>${x.training_types?.name||""}</b></td><td>${x.work_done||"—"}</td><td>${x.times_results||"—"}</td><td>${x.duration_min} min</td><td>${x.srpe}</td><td><b>${x.session_load} AU</b></td><td>${x.pain_post||"—"}</td>${canCoachEdit()?`<td><div class="rowActions"><button class="editBtn" data-hist-edit-training="${x.id}">✏️</button><button class="secondary" data-hist-volume-training="${x.id}">📊</button><button class="dangerBtn" data-hist-del-training="${x.id}">🗑️</button></div></td>`:""}</tr>`).join("")||'<tr><td colspan="9">Nessun allenamento nel periodo</td></tr>'}
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
   return `<tr><td>${fmt(x.recorded_at)}</td><td><b>${x.tests?.name||""}</b></td><td>${Array.isArray(x.values)?x.values.join(" · "):""}</td><td>${Number(x.mean_value).toFixed(2)} ${x.tests?.unit||""}</td><td>${Number(x.best_value).toFixed(2)} ${x.tests?.unit||""}</td><td>${changeBadge(delta)}</td><td>${isPB?'<span class="badge ok">PB</span>':pb!==null?`${pb.toFixed(2)} ${x.tests?.unit||""}`:"—"}</td>${canCoachEdit()?`<td><div class="rowActions"><button class="editBtn" data-hist-edit-test="${x.id}">✏️</button><button class="dangerBtn" data-hist-del-test="${x.id}">🗑️</button></div></td>`:""}</tr>`;
 }).join("");
 const picker=names.length?`<div class="chartPicker"><label>Grafico test<select id="historyTestSelect">${names.map(n=>`<option value="${n}">${n}</option>`).join("")}</select></label></div><div id="historyTestChart">${testChartHTML(current,all,names[0])}</div>`:"";
 return `<div class="stats">${stat("Test nel periodo",current.length)}${stat("Tipi di test",names.length)}</div>
 ${picker}
 <div class="tableWrap historyGrid"><table><thead><tr><th>Data</th><th>Test</th><th>Prove</th><th>Media</th><th>Best prova</th><th>Δ vs precedente</th><th>PB</th>${canCoachEdit()?"<th>Azioni</th>":""}</tr></thead><tbody>${grid||'<tr><td colspan="7">Nessun test nel periodo</td></tr>'}</tbody></table></div>`;
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
   return `<tr><td>${x.race_date}</td><td><b>${name}</b></td><td>${x.meeting||"—"}</td><td><b>${x.result} ${x.race_types?.unit||""}</b></td><td>${ex.vento||"—"}</td><td>${ex.piazzamento||"—"}</td><td>${ex.turno||"—"}</td><td>${changeBadge(delta)}</td><td>${pb!==null&&Number(x.result)===pb?'<span class="badge ok">PB</span>':pb??"—"}</td><td>${sb!==null&&Number(x.result)===sb?'<span class="badge ok">SB</span>':sb??"—"}</td>${canCoachEdit()?`<td><div class="rowActions"><button class="editBtn" data-hist-edit-race="${x.id}">✏️</button><button class="dangerBtn" data-hist-del-race="${x.id}">🗑️</button></div></td>`:""}</tr>`;
 }).join("");
 const picker=names.length?`<div class="chartPicker"><label>Grafico specialità<select id="historyRaceSelect">${names.map(n=>`<option value="${n}">${n}</option>`).join("")}</select></label></div><div id="historyRaceChart">${raceChartHTML(current,all,names[0])}</div>`:"";
 return `<div class="stats">${stat("Gare nel periodo",current.length)}${stat("Specialità",names.length)}${stat("Stagione",year)}</div>
 ${picker}
 <div class="tableWrap historyGrid"><table><thead><tr><th>Data</th><th>Specialità</th><th>Manifestazione</th><th>Risultato</th><th>Vento</th><th>Pos.</th><th>Turno</th><th>Δ</th><th>PB</th><th>SB</th>${canCoachEdit()?"<th>Azioni</th>":""}</tr></thead><tbody>${grid||'<tr><td colspan="10">Nessuna gara nel periodo</td></tr>'}</tbody></table></div>`;
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
 const series=current.map(x=>({label:fmtDate(effectiveWellDate(x)),value:Number(x.score||0)}));
 return `<div class="stats">${stat("Registrazioni",current.length)}${stat("Wellness medio",mean!==null?`${mean.toFixed(1)}/20`:"—")}${stat("Segnalazioni dolore",pain)}</div>
 ${series.length?referenceBandLineChart(series,"Wellness score · fascia personale","/20",wellnessReferenceBand(current),{fixedMin:4,fixedMax:20}):""}
 <div class="tableWrap historyGrid"><table><thead><tr><th>Data</th><th>Sonno</th><th>Stanchezza</th><th>DOMS</th><th>Stress</th><th>Score</th><th>Dolore</th>${canCoachEdit()?"<th>Azioni</th>":""}</tr></thead><tbody>${current.slice().reverse().map(x=>`<tr><td>${fmtDate(effectiveWellDate(x))}</td><td>${x.sleep}</td><td>${x.fatigue}</td><td>${x.doms}</td><td>${x.stress}</td><td><b>${x.score}/20</b></td><td>${x.pain||"—"}</td>${canCoachEdit()?`<td><div class="rowActions"><button class="editBtn" data-hist-edit-well="${x.id}">✏️</button><button class="dangerBtn" data-hist-del-well="${x.id}">🗑️</button></div></td>`:""}</tr>`).join("")||'<tr><td colspan="8">Nessun wellness nel periodo</td></tr>'}</tbody></table></div>`;
}

function meanSD(values){
 const v=values.map(Number).filter(Number.isFinite);
 if(!v.length)return {mean:0,sd:0};
 const mean=v.reduce((a,b)=>a+b,0)/v.length;
 const sd=Math.sqrt(v.reduce((s,x)=>s+(x-mean)**2,0)/v.length);
 return {mean,sd};
}
function wellnessReferenceBand(records){
 const vals=[...records].sort((a,b)=>new Date(effectiveWellDate(a))-new Date(effectiveWellDate(b))).slice(-28).map(x=>Number(x.score)).filter(Number.isFinite);
 if(vals.length<3)return null;
 const {mean,sd}=meanSD(vals),spread=sd||0.75;
 return {low:Math.max(4,mean-spread),high:Math.min(20,mean+spread),label:`Baseline personale ${vals.length} rilevazioni`};
}
function mondayISO(date){
 const d=new Date(date+"T12:00:00"),day=d.getDay()||7;d.setDate(d.getDate()-day+1);return localISODate(d);
}
function weeklyTrainingLoadSeries(records){
 const map={};
 records.forEach(x=>{const k=mondayISO(effectiveTrainingDate(x));map[k]=(map[k]||0)+Number(x.session_load||0)});
 return Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,value])=>({key:k,label:`Sett. ${fmtDate(k)}`,value}));
}
function trainingLoadReferenceBand(records){
 const weeks=weeklyTrainingLoadSeries(records);
 if(weeks.length<3)return {weeks,band:null};
 const base=weeks.slice(-5,-1).length>=3?weeks.slice(-5,-1):weeks.slice(0,-1);
 const {mean,sd}=meanSD(base.map(x=>x.value)),spread=sd||Math.max(mean*.15,1);
 return {weeks,band:{low:Math.max(0,mean-spread),high:mean+spread,label:`Carico abituale · ${base.length} settimane`}};
}
function referenceBandLineChart(points,title,unit,band,opts={}){
 if(points.length<2)return simpleLineChart(points,title,unit,!!opts.lowerBetter);
 const vals=points.map(p=>Number(p.value)).filter(Number.isFinite);
 const all=band?[...vals,band.low,band.high]:vals;
 const min=opts.fixedMin??Math.min(...all),max=opts.fixedMax??Math.max(...all),range=Math.max(max-min,0.0001);
 const w=760,h=220,pad=30;
 const y=v=>pad+(max-Number(v))/range*(h-pad*2);
 const coords=points.map((p,i)=>({x:pad+i*((w-pad*2)/Math.max(points.length-1,1)),y:y(p.value),p}));
 const poly=coords.map(c=>`${c.x},${c.y}`).join(" ");
 const bandY=band?Math.min(y(band.high),y(band.low)):0,bandH=band?Math.abs(y(band.low)-y(band.high)):0;
 const first=vals[0],last=vals.at(-1),delta=pctChange(last,first,!!opts.lowerBetter);
 return `<div class="chartCard referenceChart"><div class="sectionTitle"><h4>${title}</h4><div>${changeBadge(delta)} <span class="muted">${Number(first).toFixed(1)} → ${Number(last).toFixed(1)} ${unit}</span></div></div>
 <svg class="lineChart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
   ${band?`<rect class="referenceBand" x="${pad}" y="${bandY}" width="${w-pad*2}" height="${Math.max(bandH,4)}" rx="5"/>`:""}
   <polyline points="${poly}" fill="none" stroke="currentColor" stroke-width="3" vector-effect="non-scaling-stroke"/>
   ${coords.map(c=>`<circle cx="${c.x}" cy="${c.y}" r="4.5" fill="currentColor"/>`).join("")}
 </svg>
 <div class="chartLabels"><span>${points[0].label}</span><span>${points.at(-1).label}</span></div>
 ${band?`<div class="referenceLegend"><span class="referenceSwatch"></span><span>Fascia personale di riferimento: <b>${band.low.toFixed(1)}–${band.high.toFixed(1)} ${unit}</b> · ${band.label}</span></div>`:"<div class='note'>Servono più dati per costruire una fascia personale affidabile.</div>"}
 <p class="monitoringNote">La fascia è individuale e descrittiva: supporta la lettura del trend, non è una soglia diagnostica né un limite universale.</p></div>`;
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
   const x=filterByDays(cache.t,days,"training_date");
   downloadCSV(`${athlete}_allenamenti_${period}.csv`,
    ["Data","Tipo","Lavoro svolto","Tempi/risultati","Durata min","sRPE","Training Load AU","Dolore post","Note"],
    x.map(r=>[fmtDate(effectiveTrainingDate(r)),r.training_types?.name||"",r.work_done||"",r.times_results||"",r.duration_min,r.srpe,r.session_load,r.pain_post||"",r.notes||""]));
 }else if(section==="wellness"){
   const x=filterByDays(cache.w,days,"wellness_date");
   downloadCSV(`${athlete}_wellness_${period}.csv`,
    ["Data","Sonno","Stanchezza","DOMS","Stress","Score","Dolore"],
    x.map(r=>[fmtDate(effectiveWellDate(r)),r.sleep,r.fatigue,r.doms,r.stress,r.score,r.pain||""]));
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
