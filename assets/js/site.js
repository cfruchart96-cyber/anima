document.documentElement.classList.add('js');
const menuButton=document.querySelector('.menu-button');
const mobileMenu=document.querySelector('#mobile-menu');
if(menuButton&&mobileMenu){menuButton.addEventListener('click',()=>{const open=mobileMenu.classList.toggle('is-open');menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Fermer le menu':'Ouvrir le menu')});mobileMenu.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{mobileMenu.classList.remove('is-open');menuButton.setAttribute('aria-expanded','false')}))}
const revealElements=document.querySelectorAll('.reveal');
if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}}),{threshold:.08});revealElements.forEach(element=>observer.observe(element))}else{revealElements.forEach(element=>element.classList.add('is-visible'))}
document.querySelectorAll('[data-year]').forEach(element=>element.textContent=new Date().getFullYear());
const filters=document.querySelectorAll('.filter');const galleryCards=document.querySelectorAll('.gallery-card');filters.forEach(filter=>filter.addEventListener('click',()=>{filters.forEach(item=>item.classList.remove('is-active'));filter.classList.add('is-active');const category=filter.dataset.filter;galleryCards.forEach(card=>card.classList.toggle('is-hidden',category!=='all'&&card.dataset.category!==category))}));
const dialog=document.querySelector('.image-dialog');if(dialog){const dialogImage=dialog.querySelector('img');const closeButton=dialog.querySelector('.dialog-close');document.querySelectorAll('.zoomable').forEach(button=>button.addEventListener('click',()=>{dialogImage.src=button.dataset.image;dialogImage.alt=button.dataset.alt||'';dialog.showModal();document.body.classList.add('dialog-open')}));const closeDialog=()=>{dialog.close();document.body.classList.remove('dialog-open');dialogImage.src=''};closeButton.addEventListener('click',closeDialog);dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog()});dialog.addEventListener('close',()=>document.body.classList.remove('dialog-open'))}
const recipient=[99,46,102,114,117,99,104,97,114,116,57,54,64,103,109,97,105,108,46,99,111,109].map(code=>String.fromCharCode(code)).join('');
const openMail=(subject,body)=>{
  window.location.href=`mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};
const accessButton=document.querySelector('#access-email-button');
const status=document.querySelector('#form-status');
if(accessButton){
  accessButton.addEventListener('click',()=>{
    openMail('Demande d’accès professionnel — ANIMA','Bonjour,\n\nJe souhaite obtenir un accès professionnel ANIMA.\n\nEntreprise :\nNom et prénom :\nE-mail professionnel :\nTéléphone :\nAdresse / ville :\n\nVotre demande :\n\nCordialement,');
    if(status){status.textContent='Votre application e-mail s’ouvre avec une demande déjà préparée.';status.className='form-status is-visible is-success'}
  });
}
const footerEmailLink=document.querySelector('#footer-email-link');
if(footerEmailLink){
  footerEmailLink.addEventListener('click',event=>{
    event.preventDefault();
    openMail('Contact — ANIMA','Bonjour,\n\nJe vous contacte au sujet de ANIMA.\n\nCordialement,');
  });
}
