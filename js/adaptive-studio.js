// MUSICTOOL V7.3 adaptive workspace, precision pointer and device connectivity helpers.
const $=id=>document.getElementById(id);
const storageKey='musictool.workspace.mode';
const modeSelect=document.createElement('div');modeSelect.id='workspace-switcher';
const label=document.createElement('label');label.htmlFor='workspace-mode';label.textContent='VISTA';
const select=document.createElement('select');select.id='workspace-mode';select.setAttribute('aria-label','Modo de espacio de trabajo');
[['auto','Auto'],['mobile','Móvil'],['tablet','Tablet'],['desktop','PC']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;select.append(o);});
modeSelect.append(label,select);
const top=$('topbar');
if(top){const actions=top.querySelector('.top-actions');top.insertBefore(modeSelect,actions||null);}
function detectedMode(){const w=window.innerWidth;const coarse=matchMedia('(pointer:coarse)').matches;if(w<=700)return'mobile';if(w<=1100&&coarse)return'tablet';if(w<=1100)return'tablet';return'desktop';}
function setMode(mode){const actual=mode==='auto'?detectedMode():mode;document.body.dataset.workspace=actual;document.documentElement.dataset.workspace=actual;select.value=mode;try{localStorage.setItem(storageKey,mode);}catch{}}
let saved='auto';try{saved=localStorage.getItem(storageKey)||'auto';}catch{}
select.addEventListener('change',()=>setMode(select.value));setMode(saved);
let resizeFrame=0;window.addEventListener('resize',()=>{if(resizeFrame)return;resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;if(select.value==='auto')setMode('auto');});},{passive:true});
const deviceBar=document.createElement('div');deviceBar.id='device-tools';
const status=document.createElement('span');status.className='device-status';status.textContent='Instrumentos: teclado táctil disponible · conecta MIDI o audio externo para usar hardware.';
const midiButton=document.createElement('button');midiButton.className='compact-toggle';midiButton.type='button';midiButton.textContent='＋ MIDI';midiButton.title='Conectar teclado o controlador MIDI';
const audioButton=document.createElement('button');audioButton.className='compact-toggle';audioButton.type='button';audioButton.textContent='＋ AUDIO';audioButton.title='Preparar entrada de instrumento o interfaz de audio';
deviceBar.append(status,midiButton,audioButton);
const views=$('views');if(views)views.parentNode.insertBefore(deviceBar,views);
midiButton.addEventListener('click',async()=>{if(!navigator.requestMIDIAccess){status.textContent='MIDI externo no disponible en este navegador. Usa un navegador compatible o conexión USB/MIDI admitida por iOS.';return;}try{const access=await navigator.requestMIDIAccess();const update=()=>{const inputs=[...access.inputs.values()];status.textContent=inputs.length?'MIDI conectado: '+inputs.map(x=>x.name||'Controlador').join(', '):'MIDI activado: conecta un controlador compatible.';midiButton.dataset.on=inputs.length?'1':'0';};update();access.onstatechange=update;}catch(e){status.textContent='No se concedió acceso MIDI o el dispositivo no es compatible.';}});
audioButton.addEventListener('click',async()=>{if(!navigator.mediaDevices?.getUserMedia){status.textContent='Entrada de audio no disponible en este navegador.';return;}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const names=stream.getAudioTracks().map(t=>t.label||'Entrada de audio');stream.getTracks().forEach(t=>t.stop());status.textContent='Entrada de audio autorizada: '+names.join(', ')+'. Selecciona la entrada en el canal de grabación.';}catch(e){status.textContent='No se pudo autorizar la entrada. Revisa los permisos del micrófono.';}});
const cursor=document.createElement('div');cursor.id='precision-cursor';cursor.setAttribute('aria-hidden','true');document.body.append(cursor);
let holdTimer=null,precision=false,lastPoint=null;
function showCursor(x,y){cursor.style.left=x+'px';cursor.style.top=y+'px';document.body.classList.add('precision-active');precision=true;}
function hideCursor(){document.body.classList.remove('precision-active');precision=false;}
document.addEventListener('pointermove',e=>{if(e.pointerType==='pen'&&e.buttons===0){showCursor(e.clientX,e.clientY);return;}if(precision&&e.pointerType==='touch')showCursor(e.clientX,e.clientY);},{passive:true});
document.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;lastPoint={x:e.clientX,y:e.clientY};clearTimeout(holdTimer);holdTimer=setTimeout(()=>showCursor(lastPoint.x,lastPoint.y),380);},{passive:true});
document.addEventListener('pointerup',()=>{clearTimeout(holdTimer);if(precision)setTimeout(hideCursor,650);},{passive:true});
document.addEventListener('pointercancel',()=>{clearTimeout(holdTimer);hideCursor();},{passive:true});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideCursor();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)hideCursor();});
