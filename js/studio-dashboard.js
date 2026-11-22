import { state, createTrack } from './state.js';
import { saveProject } from './storage.js';
import { refreshAll } from './playlist.js';
const $=id=>document.getElementById(id);
function render(){
 const select=$('studio-track-select'),summary=$('studio-track-summary');if(!select||!summary)return;
 const previous=state.selectedTrackId;select.replaceChildren();
 state.tracks.forEach((track,index)=>{const option=document.createElement('option');option.value=track.id;option.textContent=track.name+' · '+(track.instrumentRole||track.kind||'audio');select.append(option);});
 if(state.tracks.some(t=>t.id===previous))select.value=previous;else if(state.tracks[0])select.value=state.tracks[0].id;
 state.selectedTrackId=select.value||null;
 summary.replaceChildren();
 state.tracks.forEach(track=>{const card=document.createElement('div');card.className='studio-track-chip';const strong=document.createElement('strong');strong.textContent=track.name;const small=document.createElement('small');small.textContent=(track.instrumentRole||track.kind||'audio')+' · '+(track.clips?.length||0)+' clips';card.append(strong,small);summary.append(card);});
}
document.addEventListener('DOMContentLoaded',()=>{
 const select=$('studio-track-select');if(!select)return;
 select.addEventListener('change',()=>{state.selectedTrackId=select.value;});
 $('studio-record')?.addEventListener('click',()=>{state.selectedTrackId=select.value;$('btn-rec')?.click();});
 $('studio-play')?.addEventListener('click',()=>$('btn-play')?.click());
 $('studio-stop')?.addEventListener('click',()=>$('btn-stop')?.click());
 $('studio-open-playlist')?.addEventListener('click',()=>document.querySelector('[data-target="playlist"]')?.click());
 $('studio-open-mixer')?.addEventListener('click',()=>document.querySelector('[data-target="mixer"]')?.click());
 $('studio-add-track')?.addEventListener('click',async()=>{const t=createTrack('audio','Nueva pista '+(state.tracks.length+1));state.selectedTrackId=t.id;await saveProject();refreshAll();render();});
 render();window.addEventListener('focus',render);document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
});
