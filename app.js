/* TCC - Transport Company Computerisation | data kept in browser localStorage */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const KEY='tcc-db-v1', FLOW=['Booked','Allocated','In Transit','Delivered'];
const GOODS={General:1,Fragile:1.5,Perishable:1.8,Hazardous:2.2};
const cls=s=>s.replace(' ','').replace('InTransit','Transit');
const seed=()=>({seq:1000,
 branches:[{name:'Bhubaneswar',lat:20.30,lon:85.82},{name:'Cuttack',lat:20.46,lon:85.88},{name:'Kolkata',lat:22.57,lon:88.36},{name:'Visakhapatnam',lat:17.69,lon:83.22},{name:'Ranchi',lat:23.34,lon:85.31}],
 trucks:[['OD-02-AB-1234',5000,'Bhubaneswar'],['OD-05-CD-4521',8000,'Bhubaneswar'],['WB-06-EF-7788',10000,'Kolkata'],['AP-31-GH-9012',6000,'Visakhapatnam'],['JH-01-KL-3345',7500,'Ranchi'],['OD-33-MN-6610',3000,'Cuttack']].map((t,i)=>({id:'T'+(i+1),plate:t[0],cap:t[1],branch:t[2]})),
 cons:[]});
let db=JSON.parse(localStorage.getItem(KEY)||'null')||seed(), view='dashboard', lastTrack='';
const save=()=>localStorage.setItem(KEY,JSON.stringify(db));
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)};
const now=()=>new Date().toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});

/* ---------- business logic ---------- */
const br=n=>db.branches.find(b=>b.name===n);
function dist(a,b){const A=br(a),B=br(b),r=Math.PI/180,dl=(B.lat-A.lat)*r,dn=(B.lon-A.lon)*r;
 const h=Math.sin(dl/2)**2+Math.cos(A.lat*r)*Math.cos(B.lat*r)*Math.sin(dn/2)**2;return 1.25*2*6371*Math.asin(Math.sqrt(h));} // 1.25 = road factor
function quote(from,to,w,type){const d=from===to?0:dist(from,to),f=150+w*d*0.012*GOODS[type],g=f*0.18;return{d,f,g,t:f+g};}
const active=id=>db.cons.filter(c=>c.truck===id&&c.status!=='Delivered');
const load=t=>active(t.id).reduce((s,c)=>s+c.w,0);
const tstatus=t=>active(t.id).some(c=>c.status==='In Transit')?'On Trip':active(t.id).length?'Allocated':'Available';
const eligible=c=>db.trucks.filter(t=>{const a=active(t.id);return t.branch===c.from&&tstatus(t)!=='On Trip'&&t.cap-load(t)>=c.w&&a.every(x=>x.to===c.to)});
function advance(id){const c=db.cons.find(x=>x.id===id),n=FLOW[FLOW.indexOf(c.status)+1];if(!n||n==='Allocated')return;
 const set=x=>{x.status=n;if(n==='In Transit')x.dep=Date.now();x.log.push({s:n,t:now()})};
 if(n==='In Transit')db.cons.filter(x=>x.truck===c.truck&&x.status==='Allocated').forEach(set);else set(c);
 if(n==='Delivered')db.trucks.find(t=>t.id===c.truck).branch=c.to; save();}
function allocate(id,tid){const c=db.cons.find(x=>x.id===id);c.truck=tid;c.status='Allocated';c.log.push({s:'Allocated to '+db.trucks.find(t=>t.id===tid).plate,t:now()});save();}

/* ---------- tracking logic ---------- */
// Demo clock: 1 real minute = 1 hour of road time, so progress is visible while you watch.
const SPEED=45; // km/h average
const tripMs=c=>c.q.d/SPEED*60000;
const prog=c=>c.status==='Delivered'?100:c.status==='In Transit'?Math.min(99,(Date.now()-(c.dep||Date.now()))/tripMs(c)*100):0;
const hm=h=>h<1?Math.max(1,Math.round(h*60))+' min':Math.floor(h)+' h '+Math.round(h%1*60)+' min';
const plate=id=>(db.trucks.find(t=>t.id===id)||{}).plate;
function where(c){const p=prog(c);
 if(c.status==='Booked')return'At '+c.from+' branch, waiting for a truck';
 if(c.status==='Allocated')return'Loading on '+plate(c.truck)+' at '+c.from;
 if(c.status==='Delivered')return'Delivered at '+c.to;
 return'On the road: '+Math.round(c.q.d*p/100)+' km from '+c.from+', '+Math.round(c.q.d*(1-p/100))+' km to '+c.to;}
const eta=c=>c.status==='In Transit'?hm(c.q.d/SPEED*(1-prog(c)/100)):c.status==='Delivered'?'Arrived':hm(c.q.d/SPEED)+' after dispatch';
const tripOf=t=>active(t.id).find(c=>c.status==='In Transit');
function twhere(t){const x=active(t.id)[0];if(!x)return'Parked at '+t.branch;return x.status==='In Transit'?where(x):'Loading at '+t.branch+' for '+x.to;}

/* ---------- views ---------- */
const pill=s=>`<span class="pill ${cls(s)}">${s}</span>`;
const opts=(arr,sel)=>arr.map(b=>`<option ${b===sel?'selected':''}>${esc(b)}</option>`).join('');
const names=()=>db.branches.map(b=>b.name);
const revenue=c=>c.q.t;
const route=(a,b,p)=>`<div class="row"><span>${a}</span><div class="bar"><b style="width:${p}%"></b></div><span>${b}</span></div>`;
function trackCard(c){const i=FLOW.indexOf(c.status);
 return`<div class="card"><h2>${c.id} · ${c.from} → ${c.to} ${pill(c.status)}</h2><p>${esc(c.sn)} to ${esc(c.rn)} · ${c.w} kg ${c.type}</p>
 <div class="steps">${FLOW.map((s,k)=>`<div class="step ${k<=i?'d':''}"><i>${k<=i?'✓':k+1}</i>${s}</div>`).join('')}</div>
 <div class="quote"><div><span>Current location</span><b>${where(c)}</b></div><div><span>Truck</span><b>${c.truck?plate(c.truck):'Not assigned yet'}</b></div><div><span>Travel time left</span><b>${eta(c)}</b></div></div>
 ${c.status==='In Transit'?route(c.from,c.to,prog(c)):''}
 <ul class="log">${c.log.map(l=>`<li><b>${l.s}</b> · ${l.t}</li>`).join('')}</ul><br><button class="btn s" data-inv="${c.id}">View bill</button></div>`;}
function truckCard(t){const a=active(t.id),x=tripOf(t),p=x?prog(x):0,u=load(t)/t.cap*100;
 return`<div class="card"><h2>${t.plate} ${pill(tstatus(t))}</h2><p>${twhere(t)}</p>
 ${x?route(x.from,x.to,p)+`<p><small>${p.toFixed(0)}% done · arrives in ${eta(x)}</small></p>`:''}
 <p><small>Load ${load(t)} / ${t.cap} kg (${u.toFixed(0)}%)</small></p>
 ${a.length?`<ul class="log">${a.map(c=>`<li><b>${c.id}</b> ${c.from} → ${c.to}, ${c.w} kg ${pill(c.status)}</li>`).join('')}</ul>`:'<p><small>No consignments on board.</small></p>'}</div>`;}
const V={
dashboard(){const C=db.cons,rev=C.reduce((s,c)=>s+revenue(c),0),act=C.filter(c=>c.status!=='Delivered').length;
 const st=[['Total consignments',C.length,'var(--cyan)'],['Active shipments',act,'var(--amber)'],['Delivered',C.length-act,'var(--lime)'],['Revenue billed',inr(rev),'var(--pink)'],['Trucks free',db.trucks.filter(t=>tstatus(t)==='Available').length+' / '+db.trucks.length,'var(--violet)']];
 return['Dashboard','Live overview of consignments, fleet and billing',
 `<div class="grid">${st.map(s=>`<div class="card stat" style="--c:${s[2]}"><span>${s[0]}</span><div class="num">${s[1]}</div></div>`).join('')}</div>
 <div class="card"><h2>Recent consignments</h2>${table(C.slice(-6).reverse())}</div>`]},
book(){return['Book consignment','Enter details, see the transport charge instantly',
 `<div class="two"><form class="card f" id="bookForm">
 <label>Sender name<input name="sn" required></label><label>Receiver name<input name="rn" required></label>
 <label>From branch<select name="from">${opts(names())}</select></label><label>To branch<select name="to">${opts(names(),names()[1])}</select></label>
 <label>Goods type<select name="type">${opts(Object.keys(GOODS))}</select></label>
 <label>Weight (kg)<input name="w" type="number" min="1" max="10000" value="500" required></label>
 <button class="btn wide">Book consignment</button></form>
 <div class="card"><h2>Charge estimate</h2><div class="quote" id="quote"></div></div></div>`]},
dispatch(){const B=db.cons.filter(c=>c.status==='Booked'),A=db.cons.filter(c=>['Allocated','In Transit'].includes(c.status));
 return['Allocate & dispatch','Assign trucks, dispatch and mark deliveries',
 `<div class="card" style="margin-bottom:18px"><h2>Waiting for a truck</h2>${B.length?`<div class="tw"><table><tr><th>ID</th><th>Route</th><th>Weight</th><th>Truck</th><th></th></tr>${B.map(c=>{const e=eligible(c);return`<tr><td>${c.id}</td><td>${c.from} → ${c.to}</td><td>${c.w} kg</td>
 <td>${e.length?`<select data-sel="${c.id}">${e.map(t=>`<option value="${t.id}">${t.plate} (free ${t.cap-load(t)} kg)</option>`).join('')}</select>`:'<small>No truck at '+c.from+' with enough space</small>'}</td>
 <td>${e.length?`<button class="btn s" data-alloc="${c.id}">Allocate</button>`:''}</td></tr>`}).join('')}</table></div>`:'<p>No consignments are waiting. Book one to get started.</p>'}</div>
 <div class="card"><h2>On the move</h2>${A.length?`<div class="tw"><table><tr><th>ID</th><th>Route</th><th>Truck</th><th>Status</th><th></th></tr>${A.map(c=>`<tr><td>${c.id}</td><td>${c.from} → ${c.to}</td><td>${plate(c.truck)}</td><td>${pill(c.status)}</td>
 <td><button class="btn s" data-adv="${c.id}">${c.status==='Allocated'?'Dispatch':'Mark delivered'}</button></td></tr>`).join('')}</table></div>`:'<p>Nothing is allocated yet.</p>'}</div>`]},
track(){const c=db.cons.find(x=>x.id===lastTrack.toUpperCase());
 return['Track consignment','Enter a consignment ID to see where it is',
 `<form class="card f" id="trackForm" style="margin-bottom:18px"><label class="wide">Consignment ID<input name="id" value="${esc(lastTrack)}" placeholder="e.g. TCC1001" required></label><button class="btn wide">Track</button></form>
 ${lastTrack?c?`<div id="trackRes">${trackCard(c)}</div>`:'<div class="card">No consignment found with that ID. Check the ID on the bill and try again.</div>':''}`]},
fleet(){const T=db.trucks,n=s=>T.filter(t=>tstatus(t)===s).length;
 const st=[['Available',n('Available'),'var(--lime)'],['Allocated',n('Allocated'),'var(--cyan)'],['On trip',n('On Trip'),'var(--pink)']];
 return['Truck tracking','Where every truck is and what it is carrying',
 `<div class="grid">${st.map(s=>`<div class="card stat" style="--c:${s[2]}"><span>${s[0]}</span><div class="num">${s[1]}</div></div>`).join('')}</div>
 <div class="two">${T.map(truckCard).join('')}</div>`]},
branches(){return['Branches','Manage branch offices and see their traffic',
 `<div class="two"><form class="card f" id="brForm"><label class="wide">Branch name<input name="n" required></label><label>Latitude<input name="la" type="number" step="any" required></label><label>Longitude<input name="lo" type="number" step="any" required></label><button class="btn wide">Add branch</button></form>
 <div class="card"><h2>All branches</h2><div class="tw"><table><tr><th>Branch</th><th>Booked here</th><th>Trucks parked</th></tr>${db.branches.map(b=>`<tr><td>${esc(b.name)}</td><td>${db.cons.filter(c=>c.from===b.name).length}</td><td>${db.trucks.filter(t=>t.branch===b.name).length}</td></tr>`).join('')}</table></div></div></div>`]},
trucks(){const avg=db.trucks.reduce((s,t)=>s+load(t)/t.cap,0)/db.trucks.length*100;
 return['Trucks & utilization','Fleet status and how full each truck is',
 `<div class="two"><form class="card f" id="trForm"><label>Plate number<input name="p" required></label><label>Capacity (kg)<input name="c" type="number" min="500" required></label><label class="wide">Home branch<select name="b">${opts(names())}</select></label><button class="btn wide">Add truck</button></form>
 <div class="card"><h2>Average utilization: ${avg.toFixed(0)}%</h2>${db.trucks.map(t=>{const p=load(t)/t.cap*100;return`<div class="row"><span>${t.plate}<br><small>${t.branch}</small></span><div class="bar"><b style="width:${p}%"></b></div><span>${pill(tstatus(t))} ${p.toFixed(0)}%</span></div>`}).join('')}</div></div>`]},
reports(){const C=db.cons,tot=C.reduce((s,c)=>s+revenue(c),0),by=(k)=>{const m={};C.forEach(c=>m[c[k]]=(m[c[k]]||0)+revenue(c));return Object.entries(m).sort((a,b)=>b[1]-a[1])};
 const bars=a=>a.length?a.map(([k,v])=>`<div class="row"><span>${k}</span><div class="bar"><b style="width:${v/a[0][1]*100}%"></b></div><span>${inr(v)}</span></div>`).join(''):'<p>No revenue yet. Book a consignment to see reports.</p>';
 return['Revenue reports','Transportation statistics at a glance',
 `<div class="grid"><div class="card stat" style="--c:var(--pink)"><span>Total revenue</span><div class="num">${inr(tot)}</div></div><div class="card stat" style="--c:var(--cyan)"><span>Average bill</span><div class="num">${inr(C.length?tot/C.length:0)}</div></div><div class="card stat" style="--c:var(--amber)"><span>Total weight moved</span><div class="num">${C.reduce((s,c)=>s+c.w,0)} kg</div></div></div>
 <div class="two"><div class="card"><h2>Revenue by origin branch</h2>${bars(by('from'))}</div><div class="card"><h2>Revenue by goods type</h2>${bars(by('type'))}</div></div>
 <br><button class="btn" data-csv>Download CSV</button> <button class="btn g" data-reset>Reset demo data</button>`]}
};
function table(rows){return rows.length?`<div class="tw"><table><tr><th>ID</th><th>Sender → Receiver</th><th>Route</th><th>Weight</th><th>Bill</th><th>Status</th><th></th></tr>${rows.map(c=>`<tr><td>${c.id}</td><td>${esc(c.sn)} → ${esc(c.rn)}</td><td>${c.from} → ${c.to}</td><td>${c.w} kg</td><td>${inr(c.q.t)}</td><td>${pill(c.status)}</td><td><button class="btn s g" data-inv="${c.id}">Bill</button></td></tr>`).join('')}</table></div>`:'<p>No consignments yet. Use “Book consignment” to create the first one.</p>'}
function render(){const [t,s,h]=V[view]();$('#title').textContent=t;$('#sub').textContent=s;$('#view').innerHTML=h;
 document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===view));if(view==='book')upQuote();}
function upQuote(){const f=$('#bookForm'),v=Object.fromEntries(new FormData(f)),q=quote(v.from,v.to,+v.w||0,v.type);
 $('#quote').innerHTML=`<div><span>Distance</span><b>${q.d.toFixed(0)} km</b></div><div><span>Freight</span><b>${inr(q.f)}</b></div><div><span>GST 18%</span><b>${inr(q.g)}</b></div><div class="t"><span>Total</span><span>${inr(q.t)}</span></div>`;}
function invoice(id){const c=db.cons.find(x=>x.id===id),m=$('#modal');m.hidden=false;
 m.innerHTML=`<div class="invoice"><h2>🚛 TCC Transport Bill</h2><p>Bill no. <b>${c.id}</b> · ${c.log[0].t}</p><br><p><b>Sender:</b> ${esc(c.sn)}<br><b>Receiver:</b> ${esc(c.rn)}<br><b>Route:</b> ${c.from} → ${c.to} (${c.q.d.toFixed(0)} km)<br><b>Goods:</b> ${c.type}, ${c.w} kg</p><br>
 <table><tr><td>Freight</td><td>${inr(c.q.f)}</td></tr><tr><td>GST 18%</td><td>${inr(c.q.g)}</td></tr><tr><th>Total</th><th>${inr(c.q.t)}</th></tr></table><br>
 <div class="noprint"><button class="btn s" onclick="print()">Print bill</button> <button class="btn s g" style="color:#222" data-close>Close</button></div></div>`;}

/* ---------- events ---------- */
document.addEventListener('click',e=>{const d=e.target.dataset;
 if(d.v){view=d.v;render()}
 if(d.alloc){allocate(d.alloc,$(`[data-sel="${d.alloc}"]`).value);toast('Truck allocated');render()}
 if(d.adv){advance(d.adv);toast('Status updated');render()}
 if(d.inv)invoice(d.inv);
 if(d.close!==undefined||e.target.id==='modal')$('#modal').hidden=true;
 if(d.reset!==undefined&&confirm('Erase all data and reload demo branches and trucks?')){db=seed();save();render()}
 if(d.csv!==undefined){const r=['ID,Sender,Receiver,From,To,Type,Weight,Total,Status',...db.cons.map(c=>[c.id,c.sn,c.rn,c.from,c.to,c.type,c.w,Math.round(c.q.t),c.status].join(','))];
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([r.join('\n')],{type:'text/csv'}));a.download='tcc-report.csv';a.click()}});
document.addEventListener('input',e=>{if(e.target.closest('#bookForm'))upQuote()});
document.addEventListener('submit',e=>{e.preventDefault();const f=e.target,v=Object.fromEntries(new FormData(f));
 if(f.id==='bookForm'){if(v.from===v.to)return toast('Choose two different branches');
  const w=+v.w,id='TCC'+(++db.seq);db.cons.push({id,sn:v.sn,rn:v.rn,from:v.from,to:v.to,type:v.type,w,q:quote(v.from,v.to,w,v.type),status:'Booked',truck:null,log:[{s:'Booked',t:now()}]});save();toast('Booked '+id);invoice(id);view='dispatch';render()}
 if(f.id==='trackForm'){lastTrack=v.id.trim();render()}
 if(f.id==='brForm'){if(db.branches.some(b=>b.name.toLowerCase()===v.n.trim().toLowerCase()))return toast('That branch already exists');db.branches.push({name:v.n.trim(),lat:+v.la,lon:+v.lo});save();toast('Branch added');render()}
 if(f.id==='trForm'){db.trucks.push({id:'T'+(db.trucks.length+1),plate:v.p.toUpperCase(),cap:+v.c,branch:v.b});save();toast('Truck added');render()}});

/* live refresh of tracking panels (only the result area, so typing is never interrupted) */
setInterval(()=>{
 if(view==='fleet')$('#view').innerHTML=V.fleet()[2];
 const r=$('#trackRes'),c=db.cons.find(x=>x.id===lastTrack.toUpperCase());
 if(view==='track'&&r&&c)r.innerHTML=trackCard(c);
},5000);
render();
