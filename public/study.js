/* Studio · logica originale dell'app; i dati (D) arrivano dal server solo dopo il login */
window.startStudy=function(D,userName,logout){
const B=D.B,S=D.S,R=document.querySelector('#root'),$=s=>document.querySelector(s);
const bn=t=>{const m=new Map();for(const b of D.B){m.set(b.u,b.ut);m.set(b.t,b.tb)}return m.get(t)||''},bd=n=>Number(n).toLocaleString('bn-BD'),NA='অনুবাদ এখনো যোগ করা হয়নি';
let user=userName||'';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sec=0,sub='',qs='',lim=140,L=[],i=0,sc=0;
function res(){try{return JSON.parse(localStorage.getItem('pbr:'+user)||'[]')}catch(e){return[]}}
function save(s,n){try{const r=res();r.unshift({d:new Date().toLocaleDateString('it-IT'),s,n});localStorage.setItem('pbr:'+user,JSON.stringify(r.slice(0,10)))}catch(e){}}
function shell(p,body){R.innerHTML=`<nav><b>Scuola Guida</b>${[['home','Home'],['studio','Studio · পড়ুন'],['quiz','Quiz · কুইজ'],['indice','Indice · সূচি']].map(([k,v])=>`<a class="${p==k?'on':''}" data-r="${k}">${v}</a>`).join('')}<a id="lo" title="Esci · বের হন">Esci · বের হন</a></nav><main>${body}</main>`;
 R.querySelectorAll('nav a[data-r]').forEach(a=>a.onclick=()=>{location.hash=a.dataset.r});
 const lo=$('#lo');if(lo)lo.onclick=logout}
const figs=b=>b&&b.g&&b.g.length?`<div class="figs">${b.g.map(x=>`<img loading="lazy" src="${D.I[x]}" alt="Figura">`).join('')}</div>`:'';
const tot=B.reduce((a,b)=>a+b.q.length,0);
const trn=B.reduce((a,b)=>a+b.q.filter(x=>x[3]).length,0);
function home(){
 shell('home',`<h1>Benvenuto${user?', '+esc(user):''} · স্বাগতম</h1><p class="sub">Tutte le ${bd(tot)} domande vere/false del Listato ministeriale A e B, in italiano con traduzione bengalese a fianco · মন্ত্রণালয়ের লিস্টাটো A ও B-এর সব প্রশ্ন, ইতালীয় ও বাংলায়।</p>
 <div class="grid"><div class="card"><div class="big">${bd(S.length)}</div>sezioni · বিভাগ</div><div class="card"><div class="big">${bd(B.length)}</div>blocchi · ব্লক</div><div class="card"><div class="big">${bd(tot)}</div>domande · প্রশ্ন</div><div class="card"><div class="big">${bd(trn)}</div>tradotte · অনূদিত</div></div>
 <div class="card"><h2>Avanzamento per sezione</h2>${S.map(s=>{const q=B.filter(b=>b.s==s[0]).flatMap(b=>b.q),t=q.filter(x=>x[3]).length;return`<div>${bd(s[0])}. ${s[1]} · ${s[2]} <span class="sub">${bd(t)}/${bd(q.length)}</span></div><div class="pb"><i style="width:${t/q.length*100}%"></i></div>`}).join('')}</div>
 <div class="card"><h2>Ultimi quiz</h2>${res().map(r=>`<div>${r.d} · ${bd(r.s)}/${bd(r.n)}</div>`).join('')||'<span class="sub">Nessun quiz ancora.</span>'}</div>
 <button class="pri nx" id="gi">Vai all'indice · সূচিতে যান →</button>`);const gi=$('#gi');if(gi)gi.onclick=()=>{location.hash='indice'}}
function indice(){
 const rows=S.map(s=>{const bs=B.filter(b=>b.s==s[0]);const q=bs.flatMap(b=>b.q).length;
  return`<a href="#studio" data-sec="${s[0]}"><span class="n">${String(s[0]).padStart(2,'0')}</span><span>${s[1]}<span class="u">${s[2]} · ${bd(bs.length)} blocchi · ${bd(q)} quiz</span></span></a>`}).join('');
 const arg=S.map(s=>{const us=[...new Set(B.filter(b=>b.s==s[0]).map(b=>b.u))];
  return`<div style="margin-bottom:14px"><b>${String(s[0]).padStart(2,'0')} · ${s[1]} <span class="sub">${s[2]}</span></b>${us.map(u=>{const bs=B.filter(b=>b.s==s[0]&&b.u==u);const q=bs.flatMap(b=>b.q).length;return`<div class="sub" style="margin:2px 0 0 12px">– ${u} · ${bn(u)||''} <span class="tag">${bd(bs.length)} b · ${bd(q)} q</span></div>`}).join('')}</div>`}).join('');
 shell('indice',`<h1>Indice · সূচি</h1><div class="tox"><h2>10 sezioni · ১০ বিভাগ</h2><p class="sub">Clicca una sezione per aprirne lo studio · একটি বিভাগে ক্লিক করে পড়া শুরু করুন</p><div class="toc">${rows}</div></div>
 <div class="tox"><h2>31 argomenti · ৩১টি বিষয়</h2>${arg}</div>
 <div class="tox"><h2>Fonte · উৎস</h2><p class="sub">Listato A e B — Edizioni Neca, aggiornato al 27/02/2025. Testo italiano originale; traduzione bengalese a fianco.</p><p class="sub">মূল: Listato A e B — Edizioni Neca (২৭/০২/২০২৫)। ইতালীয় মূল পাঠ, পাশে বাংলা অনুবাদ।</p></div>`);
 R.querySelectorAll('.toc a').forEach(a=>a.onclick=e=>{e.preventDefault();sec=+a.dataset.sec;sub='';qs='';lim=140;location.hash='studio';setTimeout(()=>studio(),10)})}
function ctl(){const u=[...new Set(B.filter(b=>!sec||b.s==sec).map(b=>b.u))];
 return`<div class="bar"><select id="sec"><option value="0">Tutte le sezioni · সব বিভাগ</option>${S.map(s=>`<option value="${s[0]}" ${sec==s[0]?'selected':''}>${bd(s[0])}. ${s[1]} · ${s[2]}</option>`).join('')}</select><select id="sub"><option value="">Tutti gli argomenti · সব বিষয়</option>${u.map(x=>`<option ${sub==x?'selected':''}>${x}</option>`).join('')}</select><input id="q" placeholder="Cerca in italiano o bengalese… · খুঁজুন" value="${qs.replace(/"/g,'&quot;')}"></div>`}
function bind(p){$('#sec').onchange=e=>{sec=+e.target.value;sub='';lim=140;p()};$('#sub').onchange=e=>{sub=e.target.value;lim=140;p()};$('#q').onchange=e=>{qs=e.target.value;lim=140;p()}}
function scope(){const t=qs.toLowerCase();return B.map(b=>({...b,q:b.q.filter(x=>!t||x[2].toLowerCase().includes(t)||(x[3]||'').toLowerCase().includes(t))})).filter(b=>(!sec||b.s==sec)&&(!sub||b.u==sub)&&b.q.length)}
function studio(){const bl=scope();let n=0,h='',lastS=null,lastU=null;
 for(const b of bl){if(n>=lim)break;
  if(b.s!==lastS){const q=B.filter(x=>x.s==b.s).flatMap(x=>x.q).length;const s=S.find(x=>x[0]==b.s);
   h+=`<div class="sech"><b>${String(b.s).padStart(2,'0')} · ${s[1]}</b><span>${s[2]}</span><span class="k">${bd(q)} quiz · সেকশন ${bd(b.s)}</span></div>`;lastS=b.s;lastU=null}
  if(b.u!==lastU){const bs=B.filter(x=>x.s==b.s&&x.u==b.u);const q=bs.flatMap(x=>x.q).length;
   h+=`<div class="uh"><h3>${b.u}</h3><span class="b">${b.ut||''}</span><span class="c">${bd(bs.length)} blocchi · ${bd(q)} quiz</span></div>`;lastU=b.u}
  h+=`<h3 style="margin-top:14px">${b.t}<span class="tb">${b.tb||''}</span><span class="tag">${b.i}</span></h3>${figs(b)}`;
  for(const x of b.q){h+=`<div class="row"><div class="vf ${x[0]?'V':'F'}">${x[0]?'V':'F'}</div><div>${x[2]}</div><div class="bn ${x[3]?'':'na'}">${x[3]||NA}</div></div>`;n++}}
 const all=bl.reduce((a,b)=>a+b.q.length,0);
 shell('studio',`<h1>Studio · পড়ুন</h1>${ctl()}<div class="ctl2"><button data-all="1">Tutte le sezioni</button>${S.map(s=>`<button data-s="${s[0]}">${bd(s[0])} · ${s[1]}</button>`).join('')}</div>${h||'<p>Nessun risultato.</p>'}${n<all?`<button id="more" class="nx" style="width:100%">Mostra altre · আরও দেখান (${bd(n)}/${bd(all)})</button>`:`<p class="sub">${bd(all)} domande · প্রশ্ন</p>`}`);
 bind(studio);
 R.querySelectorAll('.ctl2 button').forEach(btn=>btn.onclick=()=>{sec=+btn.dataset.s||0;sub='';lim=140;studio()});
 const m=$('#more');if(m)m.onclick=()=>{lim+=140;studio()}}
function start(){L=scope().flatMap(b=>b.q.map(x=>Object.assign([...x],{b}))).sort(()=>Math.random()-.5);i=0;sc=0;quiz()}
function quiz(s){const top=ctl();
 if(!L.length||i>=L.length){if(L.length&&i==L.length&&s===undefined&&!quiz.d){save(sc,L.length);quiz.d=1}
  shell('quiz',`<h1>Quiz · কুইজ</h1>${top}<div class="card">${L.length?`<h2>${bd(sc)} / ${bd(L.length)}</h2>`:'<p>Scegli una selezione e premi Inizia · একটি নির্বাচন করে শুরু করুন।</p>'}<button class="pri nx" id="st">${L.length?'Ricomincia':'Inizia'} · শুরু</button></div>`);bind(()=>{L=[];quiz()});$('#st').onclick=()=>{quiz.d=0;start()};return}
 const x=L[i];let h=`<p class="sub">${bd(i+1)}/${bd(L.length)} · ${bd(sc)} ✓</p><div class="card">${figs(x.b)}<div class="it">${x[2]}</div><div class="bn ${x[3]?'':'na'}" style="margin-top:8px">${x[3]||NA}</div><div class="ans">`;
 [1,0].forEach(v=>{let c='';if(s!==undefined){if(v==x[0])c='ok';else if(v==s)c='no'}h+=`<button class="${c}" data-v="${v}" ${s!==undefined?'disabled':''}>${v?'Vero · সত্য':'Falso · মিথ্যা'}</button>`});
 h+='</div>'+(s!==undefined?`<p><b>${s==x[0]?'✅':'❌'}</b> ${x[0]?'Vero · সত্য':'Falso · মিথ্যা'}</p><button class="pri nx" id="nx">→</button>`:'')+'</div>';
 shell('quiz',`<h1>Quiz · কুইজ</h1>${h}`);R.querySelectorAll('.ans button').forEach(b=>b.onclick=()=>{const v=+b.dataset.v;if(v==x[0])sc++;quiz(v)});const nx=$('#nx');if(nx)nx.onclick=()=>{i++;quiz()}}
function route(){const r=location.hash.slice(1);r==='studio'?studio():r==='quiz'?quiz():r==='indice'?indice():home()}
addEventListener('hashchange',route);route();
};
