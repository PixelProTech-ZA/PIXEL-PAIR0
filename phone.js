(()=>{"use strict";
const $=s=>document.querySelector(s),LS=localStorage,esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safe=s=>{try{return JSON.parse(s)||{}}catch{return{}}};
let tok=LS.getItem("pp.tok"),ws,perms={},pc="",on=false,retry=0,rtt=null,timer,tab="touch";
const cfg=Object.assign({sens:1.4,nat:true,tech:false,custom:[]},safe(LS.getItem("pp.cfg"))),saveCfg=()=>LS.setItem("pp.cfg",JSON.stringify(cfg));
const tx=o=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify(o))},buzz=()=>navigator.vibrate&&navigator.vibrate(6);
let tt;function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("on");clearTimeout(tt);tt=setTimeout(()=>t.classList.remove("on"),1600)}
function gate(h,p,b){$("#app").hidden=true;const g=$("#gate");g.hidden=false;g.innerHTML=`<h1>PIXEL PAIR</h1><h2>${h}</h2><p>${p}</p>${b?`<button class="pri" id="gb">${b[0]}</button>`:""}`;if(b)$("#gb").onclick=b[1]}
async function boot(){const p=new URLSearchParams(location.search).get("p");
 if(p){try{const r=await fetch("/api/peek?code="+encodeURIComponent(p));if(!r.ok)throw 0;const j=await r.json();gate("PC FOUND",`<code>${esc(j.pc)}</code><br><br>Trust this computer?`,["PAIR",()=>pair(p)])}
  catch{gate("PAIRING CODE EXPIRED","Press PAIR DEVICE on the PC to make a new code, then scan it again.")}return}
 if(tok){showApp();connect()}else gate("NOT PAIRED","On your PC open PIXEL PAIR, press PAIR DEVICE, then scan the QR code with this phone's camera.")}
async function pair(p){const name=prompt("Name this phone","My phone")||"Phone";
 try{const r=await fetch("/api/pair",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:p,name})});if(!r.ok)throw 0;const j=await r.json();
  tok=j.token;LS.setItem("pp.tok",tok);history.replaceState(null,"","/");showApp();connect()}catch{gate("PAIRING CODE EXPIRED","Generate a new code on the PC and scan again.")}}
function setStatus(){$("#st").innerHTML=on?'<span class="ok">●</span> CONNECTED':"○ DISCONNECTED";$("#sub").textContent=pc?`PC: ${pc} · Connection: Local`:""}
function ban(t,b){const e=$("#ban");if(!t){e.hidden=true;return}e.hidden=false;e.innerHTML=`<span>${t}</span>${b?`<button id="bb">${b[0]}</button>`:""}`;if(b)$("#bb").onclick=b[1]}
function connect(){clearTimeout(timer);let ok=false;ws=new WebSocket("ws://"+location.host+"/ws");
 ws.onopen=()=>ws.send(JSON.stringify({t:"auth",token:tok}));
 ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}
  if(m.t==="ok"){ok=on=true;retry=0;pc=m.pc;perms=m.perms;setStatus();ban()}
  else if(m.t==="perms")perms=m.perms;else if(m.t==="pong")rtt=Date.now()-m.ts;
  else if(m.t==="deny")toast(({mouse:"MOUSE CONTROL IS OFF ON THE PC",keyboard:"KEYBOARD CONTROL IS OFF ON THE PC",system:"SYSTEM COMMANDS ARE OFF ON THE PC",power:"SHUTDOWN / RESTART IS OFF ON THE PC"})[m.k]||"NOT ALLOWED");
  else if(m.t==="bad")toast("UNKNOWN KEY OR ACTION");else if(m.t==="confirm")confirmSys(m)};
 ws.onclose=ev=>{on=false;setStatus();
  if(ev.code===4001||ev.code===4002){LS.removeItem("pp.tok");tok=null;gate("REMOVED BY PC","This phone is no longer paired. Scan a new QR code on the PC.");return}
  if(ev.code===4000){ban("DISCONNECTED BY PC",["RECONNECT",()=>{ban();connect()}]);return}
  retry++;ban(retry>=3&&!ok?"PIXEL PAIR AGENT NOT RUNNING — start PIXEL PAIR on the PC (start-pixel-pair.bat) and keep both on the same Wi-Fi.":"CONNECTION LOST — reconnecting…");timer=setTimeout(connect,Math.min(400*retry,4000))}}
setInterval(()=>tx({t:"p",ts:Date.now()}),3000);
const LBL={taskmgr:"OPEN TASK MANAGER?",terminal:"OPEN TERMINAL?",network:"OPEN NETWORK SETTINGS?",lock:"LOCK PC?",restart:"RESTART COMPUTER?",shutdown:"SHUT DOWN COMPUTER?"},BTN={restart:"RESTART",shutdown:"SHUT DOWN",lock:"LOCK"};
const dlg=$("#dlg");
function confirmSys(m){dlg.innerHTML=`<h4>${LBL[m.a]||"RUN ACTION?"}</h4><div class="f"><button id="dn">CANCEL</button><button id="dy" class="${m.a==="shutdown"||m.a==="restart"?"danger":"pri"}">${BTN[m.a]||"CONFIRM"}</button></div>`;dlg.showModal();
 $("#dn").onclick=()=>dlg.close();$("#dy").onclick=()=>{tx({t:"go",n:m.n});dlg.close()}}
/* trackpad */
const pad=$("#pad");let T=null,acc={x:0,y:0,w:0},raf=0,drag=false,lastTap=0;
const cnt=e=>e.touches.length,my=e=>[...e.touches].reduce((a,t)=>a+t.clientY,0)/cnt(e);
function flush(){raf=0;const x=Math.trunc(acc.x),y=Math.trunc(acc.y),w=Math.trunc(acc.w);
 if(x||y){tx({t:"m",x,y});acc.x-=x;acc.y-=y}if(w){tx({t:"w",d:w});acc.w-=w}}
const kick=()=>{if(!raf)raf=requestAnimationFrame(flush)};
pad.addEventListener("touchstart",e=>{e.preventDefault();const n=cnt(e),t=e.touches[0],now=performance.now();
 if(!T){T={t0:now,max:n,mv:0,px:t.clientX,py:t.clientY,cy:my(e)};if(n===1&&now-lastTap<300){drag=true;tx({t:"b",b:"l",d:1})}}
 else{T.max=Math.max(T.max,n);T.px=t.clientX;T.py=t.clientY;T.cy=my(e)}},{passive:false});
pad.addEventListener("touchmove",e=>{e.preventDefault();if(!T)return;const n=cnt(e);
 if(n===1&&T.max===1){const t=e.touches[0],dx=t.clientX-T.px,dy=t.clientY-T.py,sp=Math.hypot(dx,dy),g=cfg.sens*(1+Math.min(sp*.06,1.8));
  T.px=t.clientX;T.py=t.clientY;T.mv+=sp;acc.x+=dx*g;acc.y+=dy*g;kick()}
 else if(n===2){const y=my(e),dy=y-T.cy;T.cy=y;T.mv+=Math.abs(dy);acc.w+=dy*(cfg.nat?1:-1)*5;kick()}
 else if(n===1){T.px=e.touches[0].clientX;T.py=e.touches[0].clientY}},{passive:false});
function endT(e){e.preventDefault();if(cnt(e)>0||!T)return;const now=performance.now();
 if(drag){tx({t:"b",b:"l",d:0});drag=false}
 else if(T.mv<10&&now-T.t0<260){buzz();if(T.max===1){tx({t:"b",b:"l",d:1});tx({t:"b",b:"l",d:0});lastTap=now}else if(T.max===2){tx({t:"b",b:"r",d:1});tx({t:"b",b:"r",d:0})}}
 T=null}
pad.addEventListener("touchend",endT,{passive:false});pad.addEventListener("touchcancel",e=>{if(drag){tx({t:"b",b:"l",d:0});drag=false}T=null});
const hold=(id,b)=>{const el=$(id);el.addEventListener("touchstart",e=>{e.preventDefault();buzz();tx({t:"b",b,d:1});el.classList.add("on")},{passive:false});
 const up=e=>{e.preventDefault();tx({t:"b",b,d:0});el.classList.remove("on")};el.addEventListener("touchend",up,{passive:false});el.addEventListener("touchcancel",up,{passive:false});
 el.addEventListener("mousedown",()=>tx({t:"b",b,d:1}));el.addEventListener("mouseup",()=>tx({t:"b",b,d:0}))};
hold("#bl","l");hold("#br","r");$("#bs").onclick=()=>{buzz();tx({t:"combo",keys:["space"]})};
/* keyboard */
const mods={ctrl:0,alt:0,shift:0,win:0},SENT="\u200b",kb=(k,l,r)=>`<button data-k="${k}"${r?' data-r="1"':""}>${l||k}</button>`;
const combo=k=>tx({t:"combo",keys:k.toLowerCase().split("+").map(s=>s.trim())});
function press(k,raw){const ms=raw?[]:Object.keys(mods).filter(m=>mods[m]);tx({t:"combo",keys:[...ms,k]});ms.forEach(m=>{if(mods[m]===1)mods[m]=0});paintMods()}
function paintMods(){document.querySelectorAll("[data-m]").forEach(b=>{const v=mods[b.dataset.m];b.className=v?"on"+(v===2?" lock":""):"";b.textContent=b.dataset.m.toUpperCase()+(v===2?" ⚿":"")})}
const SC=[["CTRL+C","ctrl+c"],["CTRL+V","ctrl+v"],["CTRL+X","ctrl+x"],["CTRL+Z","ctrl+z"],["CTRL+SHIFT+ESC","ctrl+shift+esc"],["ALT+TAB","alt+tab"]];
function buildKey(){$("#v-key").innerHTML=`<button class="wide pri" id="tt">TAP TO TYPE</button><input id="ti" type="text" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="send" aria-label="Type to PC">
<div class="grid g6">${kb("esc","ESC")}${kb("tab","TAB")}${["ctrl","alt","shift","win"].map(m=>`<button data-m="${m}">${m.toUpperCase()}</button>`).join("")}</div>
<div class="grid g4">${kb("up","↑",1)}${kb("down","↓",1)}${kb("left","←",1)}${kb("right","→",1)}</div>
<div class="grid">${kb("enter","ENTER")}${kb("backspace","BACKSPACE",1)}${kb("delete","DELETE",1)}</div><h3>SHORTCUTS</h3><div class="grid">${SC.map(([l,k])=>`<button data-c="${k}">${l}</button>`).join("")}</div>`;
 const ti=$("#ti");let last=SENT;ti.value=SENT;$("#tt").onclick=()=>{ti.value=SENT;last=SENT;ti.focus()};
 ti.addEventListener("input",()=>{const v=ti.value;let i=0;while(i<v.length&&i<last.length&&v[i]===last[i])i++;
  for(let k=last.length-i;k>0;k--)press("backspace",1);const add=v.slice(i);
  if(add){if(add.length===1&&/^[a-z0-9]$/i.test(add)&&Object.values(mods).some(Boolean))press(add.toLowerCase());else tx({t:"text",c:Array.from({length:add.length},(_,j)=>add.charCodeAt(j))})}
  last=v;if(/\s$/.test(v)||!v||v.length>30){ti.value=SENT;last=SENT}});
 ti.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();press("enter")}})}
/* shortcuts, media, tech */
function buildShort(edit){const L=cfg.custom;$("#v-short").innerHTML=`<h3>PRESETS</h3><div class="grid">${[["ALT+TAB","alt+tab"],["CTRL+C","ctrl+c"],["CTRL+V","ctrl+v"],["CTRL+Z","ctrl+z"],["CTRL+S","ctrl+s"],["ESC","esc"],["ENTER","enter"],["SCREENSHOT","win+prtsc"]].map(([l,k])=>`<button data-c="${k}">${l}</button>`).join("")}</div>
<h3>MY DESKTOP</h3><div class="grid">${L.map((b,i)=>`<div><button style="width:100%" data-${b.k.startsWith("app:")?"app":"c"}="${esc(b.k)}"${edit?" disabled":""}>${esc(b.l)}</button>${edit?`<div class="edit"><button data-ed="ren" data-i="${i}">✎</button><button data-ed="l" data-i="${i}">‹</button><button data-ed="r" data-i="${i}">›</button><button data-ed="x" data-i="${i}">✕</button></div>`:""}</div>`).join("")}</div>
<div class="grid"><button data-ed="add">+ ADD BUTTON</button><button data-ed="mode" class="${edit?"on":""}">${edit?"DONE":"EDIT"}</button></div>`}
const MEDIA=[["playpause","PLAY/PAUSE"],["prev","PREVIOUS"],["next","NEXT"],["voldown","VOL −",1],["volup","VOL +",1],["mute","MUTE"]];
const TECH=[["taskmgr","TASK MANAGER"],["terminal","TERMINAL"],["network","NETWORK"],["shot","SCREENSHOT"],["lock","LOCK PC"],["restart","RESTART"],["shutdown","SHUT DOWN"]];
function buildOthers(){$("#v-media").innerHTML=`<div class="grid">${MEDIA.map(([k,l,r])=>kb(k,l,r)).join("")}</div>`;
 $("#v-tech").innerHTML=`<div class="grid">${TECH.map(([k,l])=>`<button data-s="${k}"${k==="shutdown"||k==="restart"?' class="danger"':""}>${l}</button>`).join("")}</div><p style="color:var(--m);font-size:12px">Needs "System commands" (and "Shutdown / restart") allowed on the PC. Every action asks to confirm.</p>`}
function edAct(d){const L=cfg.custom,i=+d.i,ed=d.ed;
 if(ed==="mode")return buildShort(!$("[data-ed=mode]").classList.contains("on"));
 if(ed==="add"){const l=(prompt("Button name","")||"").trim().slice(0,20);if(!l)return;const k=(prompt("Keys like ctrl+s, or app:chrome (apps: chrome, edge, explorer, notepad, calc)","")||"").trim().toLowerCase();if(!k)return;L.push({l:l.toUpperCase(),k})}
 if(ed==="ren"){const l=(prompt("Button name",L[i].l)||"").trim().slice(0,20);if(l)L[i].l=l.toUpperCase()}
 if(ed==="x")L.splice(i,1);if(ed==="l"&&i>0)[L[i-1],L[i]]=[L[i],L[i-1]];if(ed==="r"&&i<L.length-1)[L[i+1],L[i]]=[L[i],L[i+1]];
 saveCfg();buildShort(true)}
/* wiring */
let rep,repT;const stopRep=()=>{clearTimeout(rep);clearInterval(repT)};
document.addEventListener("pointerdown",e=>{const b=e.target.closest("button");if(!b)return;const d=b.dataset;if(d.k){buzz();const f=()=>d.k.match(/^(playpause|prev|next|mute)$/)?tx({t:"combo",keys:[d.k]}):press(d.k);f();if(d.r){stopRep();rep=setTimeout(()=>{repT=setInterval(f,70)},400)}}});
["pointerup","pointercancel","pointerleave"].forEach(ev=>document.addEventListener(ev,stopRep));
document.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;const d=b.dataset;
 if(d.m){buzz();mods[d.m]=(mods[d.m]+1)%3;paintMods()}
 if(d.c){buzz();combo(d.c)}if(d.app){buzz();tx({t:"sys",a:d.app})}
 if(d.s){d.s==="shot"?combo("win+prtsc"):tx({t:"sys",a:d.s})}
 if(d.ed)edAct(d);if(d.tab)setTab(d.tab)});
function setTab(t){tab=t;["touch","key","short","media","tech"].forEach(x=>{$("#v-"+x).hidden=x!==t});document.querySelectorAll("#tabs button").forEach(b=>b.className=b.dataset.tab===t?"on":"")}
function showApp(){$("#gate").hidden=true;$("#app").hidden=false;buildKey();buildShort();buildOthers();
 $("#tabs").innerHTML=[["touch","TOUCH"],["key","KEYBOARD"],["short","SHORTCUTS"],["media","MEDIA"],...(cfg.tech?[["tech","TECH"]]:[])].map(([k,l])=>`<button data-tab="${k}">${l}</button>`).join("");
 setTab(tab==="tech"&&!cfg.tech?"touch":tab);setStatus()}
$("#gear").onclick=()=>{dlg.innerHTML=`<h4>SETTINGS</h4><label>Pointer speed <input id="s1" type="range" min="0.6" max="3" step="0.1" value="${cfg.sens}"></label><label>Natural scrolling <button id="s2" class="${cfg.nat?"on":""}">${cfg.nat?"ON":"OFF"}</button></label><label>Tech mode <button id="s3" class="${cfg.tech?"on":""}">${cfg.tech?"ON":"OFF"}</button></label>
<label><small>ADVANCED</small></label><p style="font:12px var(--mono);color:var(--m);overflow-wrap:anywhere">PC: ${esc(pc||"—")}<br>Host: ${esc(location.host)}<br>Latency: ${rtt==null?"—":rtt+" ms"}<br>Mouse ${perms.mouse?"✓":"OFF"} · Keyboard ${perms.keyboard?"✓":"OFF"} · System ${perms.system?"✓":"OFF"} · Power ${perms.power?"✓":"OFF"}</p>
<div class="f"><button id="s4" class="danger">FORGET PC</button><button id="s5" class="pri">CLOSE</button></div>`;dlg.showModal();
 $("#s1").oninput=e=>{cfg.sens=+e.target.value;saveCfg()};$("#s2").onclick=e=>{cfg.nat=!cfg.nat;saveCfg();e.target.textContent=cfg.nat?"ON":"OFF";e.target.className=cfg.nat?"on":""};
 $("#s3").onclick=e=>{cfg.tech=!cfg.tech;saveCfg();dlg.close();showApp()};$("#s5").onclick=()=>dlg.close();
 $("#s4").onclick=()=>{if(confirm("Forget this PC on this phone? Also remove the phone in the PC's PIXEL PAIR window.")){LS.removeItem("pp.tok");tok=null;if(ws)ws.close(4003);dlg.close();gate("NOT PAIRED","Scan a QR code from your PC to pair again.")}}};
boot();
})();
