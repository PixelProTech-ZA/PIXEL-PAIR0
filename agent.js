"use strict";
// PIXEL PAIR agent v1 — Windows. Zero npm dependencies. Serves the phone UI + desktop UI and injects input via user32.
const http=require("http"),fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto"),{spawn}=require("child_process");
const PORT=+process.env.PIXELPAIR_PORT||7777,DRY=process.env.PIXELPAIR_DRY==="1",DIR=__dirname,HOST=os.hostname().toUpperCase();
const DB=path.join(process.env.APPDATA||os.homedir(),"PixelPair-devices.json");
if(process.platform!=="win32"&&!DRY){console.log("PIXEL PAIR agent v1 supports Windows only.");process.exit(1)}
const log=(...a)=>console.log(new Date().toLocaleTimeString(),...a),sha=s=>crypto.createHash("sha256").update(s).digest("hex");
const DEF={mouse:true,keyboard:true,system:false,power:false};
let devices=[];try{devices=JSON.parse(fs.readFileSync(DB,"utf8")).devices||[]}catch(e){}
const persist=()=>{try{fs.writeFileSync(DB,JSON.stringify({devices}))}catch(e){log("Could not save pairing store:",e.message)}};
/* ---- OS input bridge: one persistent PowerShell process calling user32 ---- */
const PS=`
Add-Type -TypeDefinition @"
using System;using System.Runtime.InteropServices;
public class PP{
[DllImport("user32.dll")]public static extern void mouse_event(uint f,int dx,int dy,int d,UIntPtr e);
[DllImport("user32.dll")]public static extern void keybd_event(byte vk,byte sc,uint f,UIntPtr e);
[StructLayout(LayoutKind.Sequential)]public struct MI{public int dx,dy;public uint md,fl,t;public IntPtr x;}
[StructLayout(LayoutKind.Sequential)]public struct KI{public ushort vk,sc;public uint fl,t;public IntPtr x;}
[StructLayout(LayoutKind.Explicit)]public struct IN{[FieldOffset(0)]public uint type;[FieldOffset(8)]public KI ki;[FieldOffset(8)]public MI mi;}
[DllImport("user32.dll")]public static extern uint SendInput(uint n,IN[] i,int sz);
public static void U(ushort c){IN[] a=new IN[2];a[0].type=1;a[0].ki.sc=c;a[0].ki.fl=4;a[1].type=1;a[1].ki.sc=c;a[1].ki.fl=6;SendInput(2,a,Marshal.SizeOf(typeof(IN)));}
}
"@
while(($l=[Console]::In.ReadLine()) -ne $null){$p=$l.Split(' ')
switch($p[0]){
'm'{[PP]::mouse_event(1,[int]$p[1],[int]$p[2],0,[UIntPtr]::Zero)}
'b'{[PP]::mouse_event([uint32]$p[1],0,0,0,[UIntPtr]::Zero)}
'w'{[PP]::mouse_event(2048,0,0,[int]$p[1],[UIntPtr]::Zero)}
'k'{[PP]::keybd_event([byte][int]$p[1],0,[uint32]$p[2],[UIntPtr]::Zero)}
'u'{foreach($c in $p[1..($p.Length-1)]){[PP]::U([uint16][int]$c)}}
}}`;
let ps=null,psReady=false;
function startPS(){if(DRY){psReady=true;return}
 ps=spawn("powershell.exe",["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-EncodedCommand",Buffer.from(PS,"utf16le").toString("base64")],{windowsHide:true,stdio:["pipe","ignore","pipe"]});
 psReady=true;ps.stdin.on("error",()=>{});ps.stderr.on("data",d=>log("input bridge:",String(d).trim().slice(0,200)));
 ps.on("exit",()=>{psReady=false;ps=null;setTimeout(startPS,1500)})}
const inj=l=>{if(DRY)return void log("inj",l);if(ps&&psReady)ps.stdin.write(l+"\n")};
const spawnQ=(c,a)=>{if(DRY)return void log("spawn",c,a.join(" "));try{spawn(c,a,{detached:true,stdio:"ignore",windowsHide:true}).unref()}catch(e){log("spawn failed",e.message)}};
const run=a=>spawnQ("cmd.exe",["/c","start","",...a]);
/* ---- keys ---- */
const VK={esc:27,tab:9,enter:13,backspace:8,delete:46,space:32,up:38,down:40,left:37,right:39,home:36,end:35,pgup:33,pgdn:34,ctrl:17,alt:18,shift:16,win:91,prtsc:44,playpause:179,next:176,prev:177,volup:175,voldown:174,mute:173};
for(let i=0;i<26;i++)VK[String.fromCharCode(97+i)]=65+i;for(let i=0;i<10;i++)VK[""+i]=48+i;for(let i=1;i<=12;i++)VK["f"+i]=111+i;
const EXT=new Set([38,40,37,39,36,35,33,34,46,91,44,176,177,179,175,174,173]);
const kev=(n,down)=>inj(`k ${VK[n]} ${(down?0:2)|(EXT.has(VK[n])?1:0)}`);
function combo(keys){if(!Array.isArray(keys)||!keys.length||keys.length>5||!keys.every(k=>typeof k==="string"&&Object.hasOwn(VK,k)))return false;
 keys.forEach(k=>kev(k,1));[...keys].reverse().forEach(k=>kev(k,0));return true}
const SYS={taskmgr:["system",()=>run(["taskmgr"])],terminal:["system",()=>run(["powershell"])],network:["system",()=>run(["ms-settings:network-status"])],
 lock:["system",()=>spawnQ("rundll32.exe",["user32.dll,LockWorkStation"])],restart:["power",()=>spawnQ("shutdown",["/r","/t","5"])],shutdown:["power",()=>spawnQ("shutdown",["/s","/t","5"])]};
const APPS={chrome:"chrome",edge:"msedge",explorer:"explorer",notepad:"notepad",calc:"calc"};
/* ---- WebSocket (RFC 6455, minimal) ---- */
const frame=(p,op=1)=>{p=Buffer.isBuffer(p)?p:Buffer.from(p);const n=p.length,h=n<126?Buffer.from([128|op,n]):Buffer.from([128|op,126,n>>8,n&255]);return Buffer.concat([h,p])};
function wsServe(sock,onText,onClose){let buf=Buffer.alloc(0);
 sock.on("data",d=>{buf=Buffer.concat([buf,d]);for(;;){if(buf.length<2)return;const op=buf[0]&15,mk=buf[1]&128;let len=buf[1]&127,o=2;
  if(len===126){if(buf.length<4)return;len=buf.readUInt16BE(2);o=4}else if(len===127){sock.destroy();return}
  if(!mk||len>16384){sock.destroy();return}if(buf.length<o+4+len)return;
  const key=buf.subarray(o,o+4),p=Buffer.from(buf.subarray(o+4,o+4+len));for(let i=0;i<len;i++)p[i]^=key[i&3];buf=buf.subarray(o+4+len);
  if(op===8){sock.end();return}if(op===9)sock.write(frame(p,10));else if(op===1)onText(p.toString("utf8"))}});
 sock.on("close",onClose);sock.on("error",()=>{})}
const conns=new Set(),tx=(c,o)=>{if(c.sock.writable)c.sock.write(frame(JSON.stringify(o)))};
const closeWith=(c,code)=>{if(c.sock.writable)c.sock.write(frame(Buffer.from([code>>8,code&255]),8));c.sock.end()};
const cl=(v,l=2000)=>Math.max(-l,Math.min(l,Math.round(+v)||0));
function msg(c,txt){let m;try{m=JSON.parse(txt)}catch{return}
 if(m.t==="auth"){const h=sha(String(m.token||"")),d=devices.find(x=>x.hash===h);if(!d)return closeWith(c,4002);
  c.dev=d;clearTimeout(c.at);conns.add(c);d.seen=Date.now();tx(c,{t:"ok",pc:HOST,name:d.name,perms:d.perms});log("connected:",d.name);return}
 if(!c.dev)return;const P=c.dev.perms,need=k=>P[k]?true:(tx(c,{t:"deny",k}),false);
 switch(m.t){
  case"m":if(need("mouse"))inj(`m ${cl(m.x)} ${cl(m.y)}`);break;
  case"w":if(need("mouse"))inj(`w ${cl(m.d,1200)}`);break;
  case"b":if(need("mouse")){const r=m.b==="r",d=m.d?1:0;c[r?"rb":"lb"]=d;inj(`b ${r?(d?8:16):(d?2:4)}`)}break;
  case"combo":if(need("keyboard")&&!combo(m.keys))tx(c,{t:"bad"});break;
  case"text":if(need("keyboard")&&Array.isArray(m.c))inj("u "+m.c.slice(0,200).map(x=>(+x||0)&65535).join(" "));break;
  case"p":tx(c,{t:"pong",ts:m.ts});break;
  case"sys":{const a=String(m.a);
   if(a.startsWith("app:")&&Object.hasOwn(APPS,a.slice(4))){if(need("system")){log("app",a);run([APPS[a.slice(4)]])}}
   else if(Object.hasOwn(SYS,a)){if(need(SYS[a][0])){c.n={id:crypto.randomBytes(6).toString("hex"),a,exp:Date.now()+2e4};tx(c,{t:"confirm",a,n:c.n.id})}}
   else tx(c,{t:"bad"});break}
  case"go":{const n=c.n;c.n=null;if(n&&n.id===m.n&&n.exp>Date.now()&&need(SYS[n.a][0])){log("EXEC",n.a,"by",c.dev.name);SYS[n.a][1]()}break}
 }}
function dropped(c){conns.delete(c);clearTimeout(c.at);if(c.lb)inj("b 4");if(c.rb)inj("b 16");if(c.dev)log("disconnected:",c.dev.name)}
/* ---- pairing ---- */
let pend=null,fails=[];const live=()=>pend&&pend.exp>Date.now()?pend:null;
const priv=ip=>/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)?1:0;
const ips=()=>Object.values(os.networkInterfaces()).flat().filter(a=>a&&a.family==="IPv4"&&!a.internal).map(a=>a.address).sort((a,b)=>priv(b)-priv(a));
const remote=r=>(r.socket.remoteAddress||"").replace(/^::ffff:/,""),isLoop=r=>/^(127\.|::1$)/.test(remote(r));
const lanOK=r=>/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fe80:)/i.test(remote(r));
const admin=r=>isLoop(r)&&/^(localhost|127\.0\.0\.1):\d+$/.test(r.headers.host||"")&&r.headers["x-pp"]==="1";
/* ---- HTTP ---- */
const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".png":"image/png",".svg":"image/svg+xml",".webmanifest":"application/manifest+json"};
const FILES=new Set(["pair.css","phone.js","desktop.js","qr.js","manifest.webmanifest","icon-192.png","icon-512.png","icon.svg"]);
const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'self'; connect-src 'self' ws:; img-src 'self' data:; style-src 'self' 'unsafe-inline'"};
const out=(res,code,o)=>{res.writeHead(code,{...H,"Content-Type":"application/json"});res.end(JSON.stringify(o))};
const file=(res,n)=>{try{res.writeHead(200,{...H,"Content-Type":MIME[path.extname(n)]||"application/octet-stream"});res.end(fs.readFileSync(path.join(DIR,n)))}catch{res.writeHead(404);res.end()}};
const body=r=>new Promise(ok=>{let b="";r.on("data",d=>{b+=d;if(b.length>4096)r.destroy()});r.on("end",()=>{try{ok(JSON.parse(b||"{}"))}catch{ok({})}})});
const server=http.createServer(async(req,res)=>{
 if(!lanOK(req)){res.writeHead(403);return res.end()}
 const u=new URL(req.url,"http://x"),p=u.pathname;
 if(req.method==="GET"&&p==="/")return file(res,isLoop(req)&&/^(localhost|127\.0\.0\.1):\d+$/.test(req.headers.host||"")?"desktop.html":"phone.html");
 if(req.method==="GET"&&p==="/phone.html")return file(res,"phone.html");
 if(req.method==="GET"&&FILES.has(p.slice(1)))return file(res,p.slice(1));
 if(req.method==="GET"&&p==="/api/peek"){const s=live();return s&&u.searchParams.get("code")===s.code?out(res,200,{pc:HOST}):out(res,410,{})}
 if(req.method==="POST"&&p==="/api/pair"){const now=Date.now();fails=fails.filter(t=>now-t<6e4);if(fails.length>=8)return out(res,429,{});
  const b=await body(req),s=live();if(!s||typeof b.code!=="string"||b.code!==s.code){fails.push(now);return out(res,410,{})}
  pend=null;const token=crypto.randomBytes(32).toString("base64url"),d={id:crypto.randomBytes(4).toString("hex"),name:String(b.name||"Phone").replace(/[^\w .'-]/g,"").slice(0,40)||"Phone",hash:sha(token),perms:{...DEF},at:now};
  devices.push(d);persist();log("PAIRED:",d.name);return out(res,200,{token,pc:HOST})}
 if(p.startsWith("/api/admin/")){if(!admin(req)){res.writeHead(403);return res.end()}
  if(p==="/api/admin/state"){const s=live(),on=new Set([...conns].map(c=>c.dev.id)),L=ips();
   return out(res,200,{pc:HOST,ready:psReady,port:PORT,ips:L,pairing:s?{url:`http://${L[0]||"localhost"}:${PORT}/?p=${s.code}`,exp:s.exp}:null,noNet:!L.length,
    devices:devices.map(d=>({id:d.id,name:d.name,perms:d.perms,online:on.has(d.id),at:d.at}))})}
  const b=await body(req),d=devices.find(x=>x.id===b.id);
  if(p==="/api/admin/pair"&&b.cancel){pend=null;return out(res,200,{})}
  if(p==="/api/admin/pair"){pend={code:crypto.randomBytes(9).toString("base64url"),exp:Date.now()+12e4};return out(res,200,{})}
  if(p==="/api/admin/perm"&&d&&Object.hasOwn(DEF,b.perm)){d.perms[b.perm]=!!b.on;persist();conns.forEach(c=>{if(c.dev===d)tx(c,{t:"perms",perms:d.perms})});return out(res,200,{})}
  if(p==="/api/admin/remove"&&d){devices=devices.filter(x=>x!==d);persist();conns.forEach(c=>{if(c.dev===d)closeWith(c,4001)});return out(res,200,{})}
  if(p==="/api/admin/disconnect"){conns.forEach(c=>{if(!d||c.dev===d)closeWith(c,4000)});return out(res,200,{})}
  return out(res,404,{})}
 res.writeHead(404);res.end()});
server.on("upgrade",(req,sock)=>{const o=req.headers.origin;
 if(!lanOK(req)||req.url!=="/ws"||!req.headers["sec-websocket-key"]||(o&&new URL(o).host!==req.headers.host)){sock.destroy();return}
 sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: "+crypto.createHash("sha1").update(req.headers["sec-websocket-key"]+"258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64")+"\r\n\r\n");
 sock.setNoDelay(true);const c={sock};c.at=setTimeout(()=>sock.destroy(),4000);wsServe(sock,t=>msg(c,t),()=>dropped(c))});
server.on("error",e=>{console.log(e.code==="EADDRINUSE"?"PIXEL PAIR is already running on port "+PORT+".":e.message);process.exit(1)});
startPS();
server.listen(PORT,"0.0.0.0",()=>{log(`PIXEL PAIR ready — http://localhost:${PORT}   (LAN: ${ips().join(", ")||"no network"})`);if(!DRY)run([`http://localhost:${PORT}`])});
process.on("SIGINT",()=>{conns.forEach(c=>{if(c.lb)inj("b 4");if(c.rb)inj("b 16")});process.exit(0)});
