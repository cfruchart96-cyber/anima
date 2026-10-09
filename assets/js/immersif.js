(() => {
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const stage=document.querySelector('.image-story');
let queued=false;
function update(){queued=false;if(!stage)return;const r=stage.getBoundingClientRect();const p=reduce.matches?0:Math.min(1,Math.max(0,-r.top/Math.max(1,r.height-innerHeight)));stage.style.setProperty('--progress',p.toFixed(3))}
addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(update)}},{passive:true});
addEventListener('resize',update);reduce.addEventListener('change',update);update();
const art=document.querySelector('[data-tilt]');
art?.addEventListener('pointermove',e=>{if(reduce.matches||e.pointerType!=='mouse')return;const r=art.getBoundingClientRect();art.style.setProperty('--ry',((e.clientX-r.left)/r.width*10-5)+'deg');art.style.setProperty('--rx',(-((e.clientY-r.top)/r.height-.5)*6)+'deg')});
art?.addEventListener('pointerleave',()=>{art.style.removeProperty('--ry');art.style.removeProperty('--rx')});
const d=document.querySelector('.photo-dialog');let trigger;
document.querySelectorAll('[data-zoom]').forEach(b=>b.addEventListener('click',()=>{trigger=b;const img=d.querySelector('img');img.src=b.dataset.zoom;img.alt=b.querySelector('img').alt;d.querySelector('p').textContent=b.querySelector('strong').textContent;d.showModal();document.body.classList.add('dialog-open')}));
d?.querySelector('button').addEventListener('click',()=>d.close());
d?.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}});
d?.addEventListener('close',()=>{document.body.classList.remove('dialog-open');trigger?.focus()});
})();
(() => {
const section=document.querySelector('.detail-journey');
const slides=[...document.querySelectorAll('.detail-slide')];
const count=document.querySelector('[data-detail-count]');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let pending=false;
function update(){pending=false;if(!section||reduced.matches||innerWidth<=760)return;const rect=section.getBoundingClientRect();const span=Math.max(1,rect.height-innerHeight);const progress=Math.min(1,Math.max(0,-rect.top/span));const active=Math.min(slides.length-1,Math.floor(progress*slides.length));section.style.setProperty('--detail-progress',progress.toFixed(3));slides.forEach((slide,index)=>slide.classList.toggle('is-active',index===active));if(count)count.textContent=String(active+1).padStart(2,'0')}
addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(update)}},{passive:true});
addEventListener('resize',update);reduced.addEventListener('change',update);update();
})();
