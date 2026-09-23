(() => {
 'use strict';
 const form=document.getElementById('leadForm');if(!form)return;
 const button=form.querySelector('button[type="submit"]'),status=document.getElementById('leadStatus');
 let pending=null,busy=false,retryAt=0;
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  if(Date.now()<retryAt){status.textContent='Please wait '+Math.ceil((retryAt-Date.now())/1000)+' seconds before retrying.';return;}
  if(!pending){
   if(!form.reportValidity())return;
   const values=new FormData(form);
   const fields=Object.fromEntries(['first_name','last_name','email','company','need'].map(k=>[k,String(values.get(k)||'').trim()]));
   if(Object.values(fields).some(v=>!v)){status.textContent='Please complete each field.';return;}
   pending={...fields,request_id:crypto.randomUUID(),widget_key:'80bf69c2-3189-4db7-af2e-626475a40c98'};
  }
  busy=true;button.disabled=true;button.textContent='Sending…';
  form.querySelectorAll('input,select').forEach(el=>el.disabled=true);
  status.textContent='Saving your enquiry…';
  try{
   const response=await fetch('https://keucuxicejohafnokfkz.supabase.co/functions/v1/contact-lead',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending),signal:AbortSignal.timeout(20000)
   });
   const data=await response.json();
   if(response.status===429){retryAt=Date.now()+Math.max(1,Number(data.retry_after)||60)*1000;throw new Error('Please wait '+Math.ceil((retryAt-Date.now())/1000)+' seconds, then retry.');}
   if(!response.ok||data.received!==true)throw new Error(data.error||'Submission not confirmed.');
   const box=document.createElement('div');box.className='success';box.tabIndex=-1;
   const title=document.createElement('h3');title.textContent='Enquiry received.';
   const detail=document.createElement('p');detail.textContent='Your details have been saved for Serve Link Agency to follow up. Human support is available Monday–Friday, 9 AM–5 PM Eastern Time. This does not reserve a pilot place or confirm an appointment.';
   box.append(title,detail);form.replaceChildren(box);box.focus();pending=null;
  }catch(error){
   status.textContent=(error.name==='TimeoutError'?'The connection timed out.':error.message)+' Your details are kept on this page. Retry to confirm submission.';
   button.disabled=false;button.textContent='Retry submission';
  }finally{busy=false;}
 });
})();
