(()=>{"use strict";
const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const api=(p,b)=>fetch("/api/admin/"+p,{method:b?"POST":"GET",headers:{"x-pp":"1","Content-Type":"application/json"},body:b?JSON.stringify(b):undefined}).then(r=>{if(!r.ok)throw 0;return r.json()});
const PN=[["mouse","Mouse"],["keyboard","Keyboard"],["system","System commands"],["power","Shutdown / restart"]];
let S=null,key="",expired=false,devCount=-1,cancelled=false;
async function poll(){try{const s=await api("state");
 if(devCount>=0&&s.devices.length>devCount)expired=false;devCount=s.devices.length;
 if(S&&S.pairing&&!s.pairing&&s.devices.length===S.devices.length&&!cancelled)expired=true;cancelled=false;if(s.pairing)expired=false;
 S=s;const k=JSON.stringify([s,expired]).replace(/"exp":\d+/,"");if(k!==key){key=k;draw()}
 $("#st").innerHTML=s.ready?'<span class="ok">●</span> READY':"○ STARTING"}catch{$("#st").innerHTML='<span class="bad">○ AGENT STOPPED</span>';key=""}}
function draw(){const s=S,anyOn=s.devices.some(d=>d.online);let h="";
 if(s.noNet)h+=`<div class="empty"><b class="bad">NO LOCAL NETWORK FOUND</b>Connect this PC to Wi-Fi or Ethernet, then reload.</div>`;
 if(s.pairing){h+=`<div class="pairbox"><div class="qr" id="qr"></div><div><b style="font:600 14px var(--mono);letter-spacing:.14em">SCAN WITH YOUR PHONE CAMERA</b><p style="color:var(--m);margin:8px 0">Phone and PC must be on the same Wi-Fi.<br>Code expires in <b id="cd"></b>.</p><button id="cancel">CANCEL</button></div></div>`}
 else if(expired)h+=`<div class="empty"><b>PAIRING CODE EXPIRED</b><button class="pri" data-a="pair">NEW CODE</button></div>`;
 if(!s.devices.length&&!s.pairing&&!expired)h+=`<div class="empty"><b>This computer is not paired.</b><p style="color:var(--m);margin-bottom:16px">Pair a phone to use it as a trackpad and keyboard.</p><button class="pri" data-a="pair">PAIR DEVICE</button></div>`;
 if(s.devices.length){h+=`<h3 style="font:600 10px var(--mono);letter-spacing:.2em;color:var(--m);margin-bottom:10px">PAIRED DEVICES</h3>`;
  h+=s.devices.map(d=>`<div class="dev"><div class="h"><b>${esc(d.name)}</b><span class="${d.online?"ok":""}">${d.online?"● CONNECTED":"○ OFFLINE"}</span></div><div class="pm">${PN.map(([k,l])=>`<button data-perm="${k}" data-id="${d.id}" data-on="${d.perms[k]?0:1}" class="${d.perms[k]?"on":""}">${l} ${d.perms[k]?"✓":"OFF"}</button>`).join("")}</div>
  <div class="acts"><button data-a="disc" data-id="${d.id}"${d.online?"":" disabled"}>DISCONNECT</button><button class="danger" data-a="rm" data-id="${d.id}">REMOVE DEVICE</button></div></div>`).join("");
  h+=`<div class="acts">${s.pairing?"":`<button class="pri" data-a="pair">PAIR NEW DEVICE</button>`}<button class="danger" data-a="all"${anyOn?"":" disabled"}>DISCONNECT ALL DEVICES</button></div>`}
 h+=`<details><summary>ADVANCED</summary><p>PC: ${esc(s.pc)}<br>Port: ${s.port}<br>Address: ${s.ips.map(i=>"http://"+i+":"+s.port).join(", ")||"—"}<br>Link is plain HTTP on your local network only. Use trusted Wi-Fi.</p></details>`;
 $("#root").innerHTML=h;
 if(s.pairing){const q=qrcode(0,"M");q.addData(s.pairing.url);q.make();$("#qr").innerHTML=`<img alt="Pairing QR code" src="${q.createDataURL(6,0)}">`;$("#cancel").onclick=()=>{cancelled=true;api("pair",{cancel:1}).catch(()=>{})}}}
setInterval(()=>{const c=$("#cd");if(c&&S&&S.pairing){const r=Math.max(0,Math.round((S.pairing.exp-Date.now())/1000));c.textContent=Math.floor(r/60)+":"+String(r%60).padStart(2,"0")}},500);
document.addEventListener("click",async e=>{const b=e.target.closest("button");if(!b)return;const d=b.dataset;
 try{if(d.a==="pair"){expired=false;await api("pair",{})}
 if(d.perm)await api("perm",{id:d.id,perm:d.perm,on:d.on==="1"});
 if(d.a==="disc")await api("disconnect",{id:d.id});if(d.a==="all"&&confirm("Disconnect every connected phone?"))await api("disconnect",{});
 if(d.a==="rm"&&confirm("Remove this phone? It must be paired again to reconnect."))await api("remove",{id:d.id});poll()}catch{}});
poll();setInterval(poll,1200);
})();
