import { playInstrumentNote, resume } from './audio-engine.js';
const $ = id => document.getElementById(id);
const banks = {
  dubstep: [['KICK',36],['SNARE',38],['CLAP',39],['HAT',42],['SUB C',48],['SUB D',50],['SUB F',53],['SUB G',55],['IMPACT',49],['RIDE',51],['TOM',45],['NOISE',55],['FX 1',57],['FX 2',52],['PERC 1',47],['PERC 2',48]],
  metal: [['KICK',36],['SNARE',38],['CHINA',52],['CRASH',49],['DOUBLE KICK',36],['SNARE 2',40],['RIDE',51],['OPEN HAT',46],['LOW TOM',45],['MID TOM',47],['HIGH TOM',48],['CHOKE',55],['TAMBOUR',54],['CLAP',39],['BELL',56],['CRASH 2',57]],
  rock: [['KICK',36],['SNARE',38],['CLOSED HAT',42],['OPEN HAT',46],['CRASH',49],['RIDE',51],['LOW TOM',45],['MID TOM',47],['HIGH TOM',48],['CLAP',39],['RIM',37],['BELL',56],['PERC 1',50],['PERC 2',52],['TAMBOUR',54],['CHINA',52]],
  electronic: [['KICK',36],['SNARE',38],['CLAP',39],['HAT',42],['RIM',37],['TOM',45],['CRASH',49],['RIDE',51],['SUB',48],['BASS',43],['PERC 1',47],['PERC 2',50],['FX 1',52],['FX 2',55],['FX 3',57],['NOISE',56]]
};
export function mountLaunchpad(){
 const host=$('view-launchpad'); if(!host || host.dataset.mounted) return; host.dataset.mounted='1';
 const wrap=document.createElement('section');wrap.className='creative-view';
 const heading=document.createElement('h2');heading.className='creative-heading';heading.textContent='LAUNCHPAD / PERFORMANCE PADS';
 const bar=document.createElement('div');bar.className='creative-toolbar';
 const select=document.createElement('select');select.className='studio-select';
 Object.keys(banks).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=k.toUpperCase();select.append(o);});
 const vel=document.createElement('input');vel.type='range';vel.min='.1';vel.max='1';vel.step='.05';vel.value='.85';vel.className='studio-select';vel.style.width='120px';vel.setAttribute('aria-label','Velocity');
 const label=document.createElement('span');label.className='creative-label';label.textContent='16 PADS · TOUCH';
 bar.append(select,vel,label);
 const grid=document.createElement('div');grid.className='launchpad-grid';
 function draw(){grid.replaceChildren();banks[select.value].forEach(([name,note],i)=>{const b=document.createElement('button');b.type='button';b.className='launchpad-pad';b.textContent=name;b.style.setProperty('--pad-hue',String((i*23+12)%360));const hit=()=>{resume();const voice=(select.value==='dubstep'&&i>=4&&i<=7)||name==='BASS'?'bass':'drum';playInstrumentNote(voice,note,Number(vel.value));b.classList.add('hit');setTimeout(()=>b.classList.remove('hit'),100);};b.addEventListener('pointerdown',e=>{e.preventDefault();hit();});b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();hit();}});grid.append(b);});}
 select.addEventListener('change',draw);draw();
 const note=document.createElement('p');note.className='creative-footnote';note.textContent='Banco de percusión con muestras grabadas CC0. Se guarda en caché para seguir funcionando sin conexión tras la primera carga.';
 wrap.append(heading,bar,grid,note);host.append(wrap);
}