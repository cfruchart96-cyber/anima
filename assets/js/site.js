document.documentElement.classList.add('js');
const menuButton=document.querySelector('.menu-button');
const mobileMenu=document.querySelector('#mobile-menu');
if(menuButton&&mobileMenu){menuButton.addEventListener('click',()=>{const open=mobileMenu.classList.toggle('is-open');menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Fermer le menu':'Ouvrir le menu')});mobileMenu.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{mobileMenu.classList.remove('is-open');menuButton.setAttribute('aria-expanded','false')}))}
const revealElements=document.querySelectorAll('.reveal');
if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}}),{threshold:.08});revealElements.forEach(element=>observer.observe(element))}else{revealElements.forEach(element=>element.classList.add('is-visible'))}
document.querySelectorAll('[data-year]').forEach(element=>element.textContent=new Date().getFullYear());
const filters=document.querySelectorAll('.filter');const galleryCards=document.querySelectorAll('.gallery-card');filters.forEach(filter=>filter.addEventListener('click',()=>{filters.forEach(item=>item.classList.remove('is-active'));filter.classList.add('is-active');const category=filter.dataset.filter;galleryCards.forEach(card=>card.classList.toggle('is-hidden',category!=='all'&&card.dataset.category!==category))}));
const dialog=document.querySelector('.image-dialog');if(dialog){const dialogImage=dialog.querySelector('img');const closeButton=dialog.querySelector('.dialog-close');document.querySelectorAll('.zoomable').forEach(button=>button.addEventListener('click',()=>{dialogImage.src=button.dataset.image;dialogImage.alt=button.dataset.alt||'';dialog.showModal();document.body.classList.add('dialog-open')}));const closeDialog=()=>{dialog.close();document.body.classList.remove('dialog-open');dialogImage.src=''};closeButton.addEventListener('click',closeDialog);dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog()});dialog.addEventListener('close',()=>document.body.classList.remove('dialog-open'))}
const form=document.querySelector('#access-form');
if(form){
  const button=document.querySelector('#submit-button');
  const status=document.querySelector('#form-status');
  const showStatus=(message,type)=>{status.textContent=message;status.className=`form-status is-visible is-${type}`};
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!form.checkValidity()){
      form.reportValidity();
      showStatus('Merci de compléter tous les champs obligatoires.','error');
      return;
    }
    button.disabled=true;
    button.textContent='Envoi en cours…';
    form.setAttribute('aria-busy','true');
    try{
      const response=await fetch(form.action,{method:'POST',body:new FormData(form),headers:{Accept:'application/json'}});
      let payload=null;
      try{payload=await response.json()}catch(_){}
      if(!response.ok){
        const detail=payload?.errors?.map(item=>item.message).filter(Boolean).join(' ')||`Le service de réception a renvoyé l’erreur ${response.status}.`;
        throw new Error(detail);
      }
      form.reset();
      showStatus('Votre demande a bien été envoyée. Nous revenons vers vous après vérification.','success');
    }catch(error){
      const detail=error instanceof Error&&error.message?error.message:'Connexion impossible avec le service de réception.';
      showStatus(`L’envoi n’a pas abouti : ${detail} Vous pouvez aussi nous écrire directement à c.fruchart96@gmail.com.`,'error');
    }finally{
      form.removeAttribute('aria-busy');
      button.disabled=false;
      button.textContent='Demander mon accès professionnel';
    }
  });
}
