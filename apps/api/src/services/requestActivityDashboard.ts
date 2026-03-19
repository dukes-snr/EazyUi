export function renderRequestActivityDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EazyUI API Operations</title>
  <style>
    :root{color-scheme:dark;--bg:#020202;--panel:#090909;--panel2:#101010;--line:rgba(255,255,255,.08);--text:#f5f5f5;--muted:#8c8c8c;--muted2:#666;--green:#35d07f;--teal:#2ec7b5;--amber:#c9a22c;--red:#cf5a68;--blue:#4a9cff}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%}body{background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif}
    .shell{width:100vw;min-height:100vh;display:grid;grid-template-columns:220px 1fr;background:var(--bg)}
    .side{padding:18px 14px;border-right:1px solid var(--line);background:#040404;display:flex;flex-direction:column;gap:18px}
    .brand{display:flex;justify-content:space-between;align-items:center;padding:11px 12px;border:1px solid var(--line);font-size:12px;font-weight:800}.brand small{color:var(--muted);font-weight:500}
    .nav,.foot{display:grid;gap:4px}.foot{margin-top:auto;padding-top:12px;border-top:1px solid var(--line)}
    .nav a{display:flex;align-items:center;gap:10px;min-height:40px;padding:10px 12px;color:var(--muted);text-decoration:none;font-size:12px;border:1px solid transparent}.nav a.active{color:#fff;background:#0c0c0c;border-color:var(--line)}
    .dot{width:10px;height:10px;border:1px solid currentColor;border-radius:2px}
    .main{padding:14px 16px 16px;display:grid;gap:14px;min-width:0}
    .top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.title{font-size:21px;font-weight:800;letter-spacing:-.05em}.title small{margin-left:8px;color:var(--muted);font-size:11px;font-weight:500}
    .meta{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.12em}
    .chip{display:inline-flex;align-items:center;min-height:30px;padding:0 9px;border:1px solid var(--line);background:var(--panel);font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
    .cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.card,.panel{border:1px solid var(--line);background:var(--panel)}
    .card{min-height:102px;padding:12px;display:grid;align-content:space-between}.card.green{background:linear-gradient(180deg,rgba(25,92,54,.38),#090909)}.card.teal{background:linear-gradient(180deg,rgba(20,83,75,.38),#090909)}.card.amber{background:linear-gradient(180deg,rgba(88,67,18,.38),#090909)}.card.red{background:linear-gradient(180deg,rgba(89,22,34,.38),#090909)}
    .card h3{margin:0;font-size:12px}.card p{margin:4px 0 0;color:var(--muted);font-size:10px;line-height:1.45}.card strong{display:block;font-size:23px;letter-spacing:-.05em}.tag{display:inline-flex;align-items:center;min-height:22px;padding:0 7px;border:1px solid currentColor;font-size:9px;text-transform:uppercase;letter-spacing:.1em}
    .grid{display:grid;grid-template-columns:minmax(0,1.55fr) 360px;gap:14px;min-width:0}.left,.right{display:grid;gap:14px;min-width:0}.sec{padding:14px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}.head h2{margin:0;font-size:13px;letter-spacing:-.03em}.head p{margin:4px 0 0;color:var(--muted);font-size:10px}.mono{color:var(--muted);font-size:10px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
    .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:10px}.stat{min-height:90px;padding:12px;border:1px solid var(--line);background:var(--panel2)}.stat label{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.12em}.stat strong{display:block;margin-top:10px;font-size:26px;letter-spacing:-.05em}.stat span{display:block;margin-top:5px;color:var(--muted2);font-size:10px;line-height:1.45}
    .chart{border:1px solid var(--line);background:#070707;padding:12px;min-height:316px}.chart p{margin:0 0 8px;color:var(--muted);font-size:10px}.chart svg{display:block;width:100%;height:236px}.axis{display:flex;justify-content:space-between;color:var(--muted2);font-size:9px;text-transform:uppercase;letter-spacing:.1em;margin-top:8px}
    .split{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .controls{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.controls input,.controls select{min-height:36px;padding:0 10px;border:1px solid var(--line);background:var(--panel2);color:#fff;font:inherit;font-size:11px}.controls input{flex:1 1 220px}
    .console{border:1px solid var(--line);background:#070707;overflow:hidden}.console-head,.row{display:grid;grid-template-columns:108px 130px 138px 118px 80px 80px minmax(220px,1fr);gap:10px;align-items:center;min-width:0}
    .console-head{padding:10px 12px;border-bottom:1px solid var(--line);background:#0c0c0c;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.1em}.rows{max-height:560px;overflow:auto}.row{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.05);font-size:11px}.row:last-child{border-bottom:0}.row.error{background:rgba(78,18,28,.18)}.row.running{background:rgba(79,58,12,.12)}.row:hover{background:rgba(255,255,255,.03)}.row>div{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mainv{color:#e7e7e7}.subv{color:var(--muted)}.pill{display:inline-flex;align-items:center;justify-content:center;min-height:22px;padding:0 8px;border:1px solid currentColor;font-size:9px;text-transform:uppercase;letter-spacing:.1em}.ok{color:var(--green)}.warn{color:var(--amber)}.bad{color:var(--red)}
    .list,.providers,.bars{display:grid;gap:10px}.item{padding:11px 12px;border:1px solid var(--line);background:var(--panel2)}.topline{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.label{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.11em}.label:before{content:"";width:5px;height:5px;border-radius:999px;background:currentColor}
    .item h3{margin:8px 0 6px;font-size:12px}.item p{margin:0;color:#d2d2d2;font-size:10px;line-height:1.55}.mini{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.mini span{display:inline-flex;align-items:center;min-height:20px;padding:0 7px;border:1px solid var(--line);color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.1em}
    .critical{background:linear-gradient(180deg,rgba(97,21,33,.5),rgba(28,10,14,.94))}.warning{background:linear-gradient(180deg,rgba(85,63,13,.46),rgba(31,24,9,.94))}.info{background:linear-gradient(180deg,#191919,#111)}
    .provider-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.provider{padding:11px 12px;border:1px solid var(--line);background:var(--panel2);min-height:84px}.provider strong{display:block;margin-top:10px;font-size:14px}.provider p{margin:4px 0 0;color:var(--muted);font-size:10px;line-height:1.45}
    .barrow{display:grid;gap:5px}.barhead{display:flex;justify-content:space-between;gap:10px;font-size:10px;color:#d2d2d2}.bar{height:8px;border:1px solid var(--line);background:#080808;overflow:hidden}.bar span{display:block;height:100%}.bar.green span{background:linear-gradient(90deg,rgba(53,208,127,.88),rgba(53,208,127,.28))}.bar.amber span{background:linear-gradient(90deg,rgba(201,162,44,.9),rgba(201,162,44,.24))}.bar.blue span{background:linear-gradient(90deg,rgba(74,156,255,.9),rgba(74,156,255,.24))}
    .empty,.error{padding:14px 12px;border:1px dashed var(--line);background:var(--panel2);color:var(--muted);font-size:11px;text-align:center}.error{display:none;border-style:solid;border-color:rgba(207,90,104,.35);background:rgba(82,19,28,.76);color:#ffd8de}
    .note{color:var(--muted);font-size:10px;line-height:1.6}
    @media (max-width:1280px){.grid{grid-template-columns:1fr}.provider-grid,.split{grid-template-columns:1fr}}
    @media (max-width:1120px){.shell{grid-template-columns:1fr}.side{border-right:0;border-bottom:1px solid var(--line)}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media (max-width:860px){.top{flex-direction:column;align-items:flex-start}.cards,.stats,.provider-grid,.split{grid-template-columns:1fr}.console-head,.row{grid-template-columns:repeat(2,minmax(0,1fr))}}
  </style>
</head>
<body>
  <div class="shell">
    <aside class="side">
      <div class="brand"><span>MexAI</span><small>Ops</small></div>
      <nav class="nav">
        <a class="active" href="#"><span class="dot"></span><span>Overview</span></a>
        <a href="#ctx"><span class="dot"></span><span>Models</span></a>
        <a href="#cost"><span class="dot"></span><span>Costs</span></a>
        <a href="#inc"><span class="dot"></span><span>AI Insights</span></a>
        <a href="#traces"><span class="dot"></span><span>Analytics</span></a>
      </nav>
      <div class="foot nav">
        <a href="/api/health" target="_blank" rel="noreferrer"><span class="dot"></span><span>Health JSON</span></a>
        <a href="/api/models" target="_blank" rel="noreferrer"><span class="dot"></span><span>Model Index</span></a>
        <a href="/api/server/activity?limit=250" target="_blank" rel="noreferrer"><span class="dot"></span><span>Activity Feed</span></a>
      </div>
    </aside>
    <main class="main">
      <div class="top">
        <div class="title">AI Operations <small>| EazyUI API</small></div>
        <div class="meta">
          <span id="live">live</span>
          <span class="chip" id="retention">retention --</span>
          <span class="chip" id="window">window --</span>
          <span class="chip" id="updated">syncing...</span>
        </div>
      </div>
      <section class="cards" id="cards"></section>
      <div class="grid">
        <section class="left">
          <article class="panel sec" id="cost">
            <div class="head"><div><h2>API Cost Over Time</h2><p>Recent request cost, queue pressure, and failure heat across the retained window.</p></div><div class="mono" id="summary">waiting for snapshot</div></div>
            <div class="stats">
              <div class="stat"><label>Window Cost</label><strong id="mCost">$0.00</strong><span id="mCostSub">No charged requests in view</span></div>
              <div class="stat"><label>Error Rate</label><strong id="mErr">0%</strong><span id="mErrSub">No recent failures</span></div>
              <div class="stat"><label>Active Queue</label><strong id="mRun">0</strong><span id="mRunSub">No active work in flight</span></div>
              <div class="stat"><label>Auth Users</label><strong id="mUsers">0</strong><span id="mUsersSub">No authenticated traffic yet</span></div>
            </div>
            <div class="chart"><p>White line shows estimated request value. Amber dashed line tracks failure pressure. Blue line tracks concurrent running load.</p><svg id="chart" viewBox="0 0 760 236" preserveAspectRatio="none"></svg><div class="axis" id="axis"><span>window start</span><span>window end</span></div></div>
          </article>
          <div class="split">
            <article class="panel sec"><div class="head"><div><h2>Route Pressure</h2><p>Busiest endpoints in the current retained window.</p></div></div><div class="bars" id="routes"><div class="empty">No route traffic yet.</div></div></article>
            <article class="panel sec"><div class="head"><div><h2>Auth And Traffic Mix</h2><p>How traffic is split across auth surfaces and request outcomes.</p></div></div><div class="bars" id="auth"><div class="empty">No auth activity yet.</div></div></article>
          </div>
          <article class="panel sec" id="traces">
            <div class="head"><div><h2>Live Trace Console</h2><p>Searchable request stream with user, model, route, cost, and error context.</p></div></div>
            <div class="controls">
              <input id="q" type="search" placeholder="Search request id, key, user, route, prompt, model, error..." />
              <select id="fStatus"><option value="all">All status</option><option value="running">Running</option><option value="success">Success</option><option value="error">Error</option></select>
              <select id="fUser"><option value="all">All users</option></select>
              <select id="fRoute"><option value="all">All routes</option></select>
            </div>
            <div class="error" id="err"></div>
            <div class="console">
              <div class="console-head"><div>Time</div><div>Route</div><div>User</div><div>Model</div><div>Status</div><div>Cost</div><div>Trace</div></div>
              <div class="rows" id="rows"><div class="empty">Waiting for activity snapshot...</div></div>
            </div>
          </article>
        </section>
        <aside class="right">
          <article class="panel sec" id="ctx"><div class="head"><div><h2>Platform Context</h2><p>Live provider configuration and API surface context.</p></div></div><div class="provider-grid" id="providers"><div class="empty">Waiting for service health...</div></div></article>
          <article class="panel sec" id="inc"><div class="head"><div><h2>Incidents And Actions</h2><p>Current failures, route pressure, and infrastructure warnings.</p></div></div><div class="list" id="incidents"><div class="empty">No incidents yet.</div></div></article>
          <article class="panel sec"><div class="head"><div><h2>Running Queue</h2><p>Requests still open right now.</p></div></div><div class="list" id="queue"><div class="empty">No running requests.</div></div></article>
          <article class="panel sec"><div class="head"><div><h2>Top Users</h2><p>Users generating the most request volume in the current window.</p></div></div><div class="list" id="users"><div class="empty">No user activity yet.</div></div></article>
          <article class="panel sec"><div class="note" id="note">Persisted activity keeps this dashboard useful even when new traces push older requests out of the live in-memory queue.</div></article>
        </aside>
      </div>
    </main>
  </div>
  <script>
    const els={cards:cards,live:live,retention:retention,window:window,updated:updated,summary:summary,mCost:mCost,mCostSub:mCostSub,mErr:mErr,mErrSub:mErrSub,mRun:mRun,mRunSub:mRunSub,mUsers:mUsers,mUsersSub:mUsersSub,chart:chart,axis:axis,routes:routes,auth:auth,rows:rows,providers:providers,incidents:incidents,queue:queue,users:users,note:note,err:err,q:q,fStatus:fStatus,fUser:fUser,fRoute:fRoute};
    let state={items:[],topUsers:[],topRoutes:[],summary:null,retention:0,health:null,models:null};
    const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    const num=v=>Number.isFinite(Number(v))?Number(v).toLocaleString():'--';
    const money=v=>'$'+(Number.isFinite(Number(v))?Number(v).toFixed(Number(v)>=10?2:3):'0.00');
    const tm=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'--':d.toLocaleTimeString()};
    const dt=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'--':d.toLocaleString()};
    const dur=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0)return'--';if(n<1e3)return n+'ms';if(n<6e4)return(n/1e3).toFixed(1)+'s';return(n/6e4).toFixed(1)+'m'};
    const usd=i=>{const c=Number(i.finalCredits??i.reserveCredits??i.estimatedCredits??0);return Number.isFinite(c)&&c>0?c/100:0};
    const tone=s=>s==='error'?'bad':s==='running'?'warn':'ok';
    const authKey=i=>i.authType||(i.uid||i.userEmail?'firebase':'anonymous');
    const userKey=i=>i.userEmail||i.uid||'anonymous';
    const pill=(txt,cls)=>'<span class="pill '+cls+'">'+esc(txt)+'</span>';
    const bar=(label,value,max,cls,meta)=>'<div class="barrow"><div class="barhead"><span>'+esc(label)+'</span><span>'+esc(meta)+'</span></div><div class="bar '+cls+'"><span style="width:'+Math.max(value?10:0,Math.round((value/(max||1))*100))+'%"></span></div></div>';
    function modelData(items,models){const m=new Map();items.forEach(i=>{const k=String(i.preferredModel||(models&&models.defaultTextModel)||'server-default').trim();const v=m.get(k)||{name:k,requests:0,running:0,errors:0,usd:0};v.requests++;v.usd+=usd(i);if(i.status==='running')v.running++;if(i.status==='error')v.errors++;m.set(k,v)});const seeded=[...m.values()].sort((a,b)=>(b.requests-a.requests)||(b.errors-a.errors)).slice(0,4);return seeded.length?seeded:[{name:(models&&models.defaultTextModel)||'gemini-2.5-pro',requests:0,running:0,errors:0,usd:0},{name:'groq',requests:0,running:0,errors:0,usd:0},{name:'nvidia',requests:0,running:0,errors:0,usd:0},{name:'planner',requests:0,running:0,errors:0,usd:0}]}
    function draw(items){const recent=items.slice().reverse().slice(-24);if(!recent.length){els.chart.innerHTML='';return}const costs=recent.map(usd),errs=recent.map(i=>i.status==='error'?1:0),runs=recent.map(i=>i.status==='running'?1:0),max=Math.max(.25,...costs,...errs.map(v=>v*.5),...runs.map(v=>v*.35));const pt=(v,i,t)=>{const x=10+(740*(t<=1?.5:i/(t-1)));const y=222-((Math.min(v,max)/max)*198);return[x,y]},line=a=>a.map((v,i)=>pt(v,i,a.length).join(',')).join(' ');els.chart.innerHTML='<line x1="10" y1="22" x2="750" y2="22" stroke="rgba(255,255,255,.08)" stroke-dasharray="4 6"></line><line x1="10" y1="88" x2="750" y2="88" stroke="rgba(255,255,255,.06)" stroke-dasharray="4 6"></line><line x1="10" y1="154" x2="750" y2="154" stroke="rgba(255,255,255,.06)" stroke-dasharray="4 6"></line><polyline fill="none" stroke="rgba(74,156,255,.92)" stroke-width="2" points="'+line(runs.map(v=>v*(max*.8)))+'"></polyline><polyline fill="none" stroke="rgba(201,162,44,.9)" stroke-width="2" stroke-dasharray="4 4" points="'+line(errs.map(v=>v*(max*.9)))+'"></polyline><polyline fill="none" stroke="#f5f5f5" stroke-width="2.2" points="'+line(costs)+'"></polyline>';els.axis.innerHTML='<span>'+esc(tm(recent[0].startedAt))+'</span><span>'+esc(tm(recent[recent.length-1].startedAt))+'</span>'}
    function renderCards(items,models){const styles=['green','teal','amber','red'];els.cards.innerHTML=modelData(items,models).map((x,i)=>'<article class="card '+styles[i%styles.length]+'"><div><h3>'+esc(x.name)+'</h3><p>'+esc(x.requests?x.requests+' recent requests':'No recent requests in retained window')+'</p></div><div><strong>'+esc(money(x.usd))+'</strong><span class="tag">'+esc(x.running?x.running+' running':x.errors?x.errors+' errors':x.requests?x.requests+' requests':'waiting')+'</span></div></article>').join('')}
    function renderRoutes(routes){if(!routes.length){els.routes.innerHTML='<div class="empty">No route traffic yet.</div>';return}const max=Math.max(...routes.map(r=>Number(r.requests||0)),1);els.routes.innerHTML=routes.slice(0,6).map(r=>bar(r.route,Number(r.requests||0),max,r.errors>0?'amber':'green',num(r.requests)+' req')+'<div class="mini"><span>'+esc(num(r.running))+' running</span><span>'+esc(num(r.errors))+' errors</span><span>'+esc('last '+tm(r.lastSeenAt))+'</span></div>').join('')}
    function renderAuth(items){const auths=new Map();items.forEach(i=>auths.set(authKey(i),(auths.get(authKey(i))||0)+1));const a=[...auths.entries()].map(([k,v])=>({k,v})).sort((x,y)=>y.v-x.v),maxA=Math.max(1,...a.map(x=>x.v));const statuses=[{k:'success',v:items.filter(i=>i.status==='success').length,c:'green'},{k:'running',v:items.filter(i=>i.status==='running').length,c:'amber'},{k:'error',v:items.filter(i=>i.status==='error').length,c:'blue'}],maxS=Math.max(1,...statuses.map(x=>x.v));els.auth.innerHTML=(a.length?a.map(x=>bar(x.k,x.v,maxA,'blue',num(x.v)+' req')).join(''):'')+statuses.map(x=>bar(x.k,x.v,maxS,x.c,num(x.v))).join('')}
    function provider(title,status,detail,extra,cls){return '<article class="provider">'+pill(status,cls)+'<strong>'+esc(title)+'</strong><p>'+esc(detail)+'</p><p>'+esc(extra)+'</p></article>'}
    function renderProviders(health,models,summary){if(!health){els.providers.innerHTML='<div class="empty">Waiting for service health...</div>';return}els.providers.innerHTML=[provider('Gemini',health.gemini&&health.gemini.apiKeyPresent?'ready':'missing',(health.gemini&&health.gemini.model)?'default '+health.gemini.model:'No default Gemini model','Primary text generation provider',health.gemini&&health.gemini.apiKeyPresent?'ok':'bad'),provider('Stripe',health.stripe&&health.stripe.configured?'ready':'partial','publishable '+((health.stripe&&health.stripe.publishableKeyPresent)?'yes':'no')+', webhook '+((health.stripe&&health.stripe.webhookSecretPresent)?'yes':'no'),'Billing checkout and webhook surface',health.stripe&&health.stripe.configured&&health.stripe.webhookSecretPresent?'ok':'warn'),provider('Storage/Auth',health.firebase&&health.firebase.serviceAccountPresent?'ready':'missing','firebase service account '+((health.firebase&&health.firebase.serviceAccountPresent)?'loaded':'not found'),num(summary&&summary.authenticatedUsers?summary.authenticatedUsers:0)+' authenticated users in window',health.firebase&&health.firebase.serviceAccountPresent?'ok':'bad'),provider('Ops Stack',(health.database&&health.database.configured)&&health.frontendUrlConfigured?'online':'review','db '+((health.database&&health.database.configured)?'yes':'no')+', frontend url '+(health.frontendUrlConfigured?'yes':'no'),'groq '+(((health.groq&&health.groq.models)||[]).length)+', nvidia '+(((health.nvidia&&health.nvidia.models)||[]).length)+', planner '+(((models&&models.planner)||[]).length),(health.database&&health.database.configured)&&health.frontendUrlConfigured?'ok':'warn')].join('')}
    function renderIncidents(items,routes,health){const cards=[],latest=items.find(i=>i.status==='error'),stress=(routes||[]).find(r=>Number(r.errors||0)>0||Number(r.running||0)>0);if(latest)cards.push('<article class="item critical"><div class="topline"><span class="label">P1 Critical</span><span class="mono">'+esc(tm(latest.startedAt))+'</span></div><h3>'+esc(latest.route+' request failed')+'</h3><p>'+esc(latest.errorMessage||latest.requestPreview||'Recent request failed without a captured preview.')+'</p><div class="mini"><span>'+esc(latest.id)+'</span></div></article>');if(stress)cards.push('<article class="item warning"><div class="topline"><span class="label">P2 Warning</span><span class="mono">'+esc(stress.route)+'</span></div><h3>'+esc(stress.route+' is carrying pressure')+'</h3><p>'+esc(num(stress.requests)+' recent requests, '+num(stress.running)+' running, '+num(stress.errors)+' failures in the current window.')+'</p></article>');if(health&&health.gemini&&!health.gemini.apiKeyPresent)cards.push('<article class="item warning"><div class="topline"><span class="label">Config</span><span class="mono">gemini</span></div><h3>Gemini API key missing</h3><p>Generation will fail until GEMINI_API_KEY is configured on the API host.</p></article>');cards.push('<article class="item info"><div class="topline"><span class="label">Info</span><span class="mono">live</span></div><h3>Persisted request telemetry active</h3><p>This dashboard is reading from the Postgres-backed activity ledger, so older requests stay visible even after heavy traffic bursts.</p></article>');els.incidents.innerHTML=cards.join('')}
    function renderQueue(items){const running=items.filter(i=>i.status==='running');if(!running.length){els.queue.innerHTML='<div class="empty">No running requests.</div>';return}els.queue.innerHTML=running.slice(0,6).map(i=>'<article class="item"><div class="topline"><span class="label">Running</span><span class="mono">'+esc(dur(Date.now()-new Date(i.startedAt).getTime()))+'</span></div><h3>'+esc(i.userEmail||i.uid||'Anonymous request')+'</h3><p>'+esc(i.method+' '+i.route)+'</p><div class="mini"><span>'+esc(i.preferredModel||'server-default')+'</span><span>'+esc(i.requestKey||i.id)+'</span></div></article>').join('')}
    function renderUsers(users){if(!users.length){els.users.innerHTML='<div class="empty">No user activity yet.</div>';return}els.users.innerHTML=users.slice(0,6).map(i=>'<article class="item"><div class="topline"><span class="label">User</span><span class="mono">'+esc(num(i.requests))+' req</span></div><h3>'+esc(i.userEmail||i.uid||'Anonymous cluster')+'</h3><p>'+esc((i.authType||'anonymous')+' last seen '+dt(i.lastSeenAt))+'</p><div class="mini"><span>'+esc(num(i.running))+' running</span><span>'+esc(num(i.errors))+' errors</span></div></article>').join('')}
    function pass(i){const qv=els.q.value.trim().toLowerCase(),sv=els.fStatus.value,uv=els.fUser.value,rv=els.fRoute.value,u=userKey(i);if(sv!=='all'&&i.status!==sv)return false;if(uv!=='all'&&u!==uv)return false;if(rv!=='all'&&i.route!==rv)return false;if(!qv)return true;return [i.id,i.requestKey,i.uid,i.userEmail,i.route,i.method,i.operation,i.requestPreview,i.preferredModel,i.errorMessage].filter(Boolean).join(' ').toLowerCase().includes(qv)}
    function renderRows(items){if(!items.length){els.rows.innerHTML='<div class="empty">No requests match the current filters.</div>';return}els.rows.innerHTML=items.map(i=>{const trace=i.errorMessage||i.requestPreview||'No request preview captured.';return '<div class="row '+esc(i.status)+'"><div><div class="mainv">'+esc(tm(i.startedAt))+'</div><div class="subv">'+esc(dur(i.durationMs))+'</div></div><div><div class="mainv">'+esc(i.method+' '+i.route)+'</div><div class="subv">'+esc(i.operation||i.requestKey||i.id)+'</div></div><div><div class="mainv">'+esc(i.userEmail||i.uid||'anonymous')+'</div><div class="subv">'+esc(authKey(i))+'</div></div><div><div class="mainv">'+esc(i.preferredModel||(state.models&&state.models.defaultTextModel)||'server-default')+'</div><div class="subv">'+esc(i.tokensUsed?num(i.tokensUsed)+' tokens':'no tokens logged')+'</div></div><div>'+pill(i.status,tone(i.status))+'</div><div><div class="mainv">'+esc(money(usd(i)))+'</div><div class="subv">'+esc(i.balanceCredits!=null?num(i.balanceCredits)+' cr left':'balance --')+'</div></div><div title="'+esc(trace)+'"><div class="mainv">'+esc(trace)+'</div><div class="subv">'+esc(i.id)+'</div></div></div>'}).join('')}
    function syncFilters(items){const users=[...new Set(items.map(userKey))].sort((a,b)=>a.localeCompare(b)),routes=[...new Set(items.map(i=>i.route).filter(Boolean))].sort((a,b)=>a.localeCompare(b));const fill=(el,vals,label)=>{const cur=el.value;el.innerHTML=['<option value="all">All '+label+'</option>'].concat(vals.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>')).join('');el.value=vals.includes(cur)?cur:'all'};fill(els.fUser,users,'users');fill(els.fRoute,routes,'routes')}
    function renderAll(){const items=Array.isArray(state.items)?state.items:[],summary=state.summary||{total:0,running:0,errors:0,authenticatedUsers:0,avgDurationMs:null},filtered=items.filter(pass),totalUsd=items.reduce((s,i)=>s+usd(i),0),errRate=summary.total>0?(summary.errors/summary.total)*100:0,running=items.filter(i=>i.status==='running'),oldest=running.length?running[running.length-1]:null;els.mCost.textContent=money(totalUsd);els.mCostSub.textContent=summary.total>0?num(summary.total)+' requests in retained window':'No charged requests in view';els.mErr.textContent=errRate.toFixed(errRate>=10?1:2)+'%';els.mErrSub.textContent=num(summary.errors)+' recent failures';els.mRun.textContent=num(summary.running);els.mRunSub.textContent=oldest?'oldest started '+tm(oldest.startedAt):'No active work in flight';els.mUsers.textContent=num(summary.authenticatedUsers);els.mUsersSub.textContent=summary.authenticatedUsers?'avg duration '+dur(summary.avgDurationMs):'No authenticated traffic yet';els.summary.textContent=num(summary.total)+' traces retained, avg '+dur(summary.avgDurationMs)+', default '+((state.models&&state.models.defaultTextModel)||(state.health&&state.health.gemini&&state.health.gemini.model)||'--');els.retention.textContent='retention '+num(state.retention);els.window.textContent='window '+(items.length?tm(items[items.length-1].startedAt)+' to '+tm(items[0].startedAt):'--');els.note.textContent='Persisted activity keeps this dashboard useful when more than '+num(state.retention)+' requests accumulate over time and the live memory queue no longer tells the full story.';renderCards(items,state.models);draw(items);renderRoutes(state.topRoutes||[]);renderAuth(items);renderProviders(state.health,state.models,summary);renderIncidents(items,state.topRoutes||[],state.health);renderQueue(items);renderUsers(state.topUsers||[]);renderRows(filtered)}
    async function refresh(){try{const [a,h,m]=await Promise.all([fetch('/api/server/activity?limit=250',{headers:{Accept:'application/json'}}),fetch('/api/health',{headers:{Accept:'application/json'}}),fetch('/api/models',{headers:{Accept:'application/json'}})]);if(!a.ok)throw new Error('activity HTTP '+a.status);if(!h.ok)throw new Error('health HTTP '+h.status);if(!m.ok)throw new Error('models HTTP '+m.status);const [ap,hp,mp]=await Promise.all([a.json(),h.json(),m.json()]);state={items:Array.isArray(ap.items)?ap.items:[],topUsers:Array.isArray(ap.topUsers)?ap.topUsers:[],topRoutes:Array.isArray(ap.topRoutes)?ap.topRoutes:[],summary:ap.summary||null,retention:Number(ap.retention||0),health:hp||null,models:mp||null};syncFilters(state.items);els.updated.textContent='updated '+new Date().toLocaleTimeString();els.err.style.display='none';renderAll()}catch(error){els.err.textContent='Failed to load dashboard data. '+(error&&error.message?error.message:'');els.err.style.display='block'}}
    function tick(){els.live.textContent='live '+new Date().toLocaleTimeString()}
    [els.q,els.fStatus,els.fUser,els.fRoute].forEach(el=>{el.addEventListener('input',renderAll);el.addEventListener('change',renderAll)});
    tick();refresh();setInterval(tick,1000);setInterval(refresh,2500);
  </script>
</body>
</html>`;
}
