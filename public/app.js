const form=document.getElementById('checkoutForm');
const btn=document.getElementById('generateButton');
const copy=document.getElementById('copyButton');
const err=document.getElementById('formError');
const qr=document.getElementById('qrImage');
const placeholder=document.getElementById('qrPlaceholder');
const code=document.getElementById('pixCode');
const status=document.getElementById('pixStatus');
const digits=v=>String(v||'').replace(/\D/g,'');
const maskDoc=v=>{const d=digits(v).slice(0,14);return d.length<=11?d.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2'):d.replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})$/,'$1-$2')};
document.getElementById('document').addEventListener('input',e=>e.target.value=maskDoc(e.target.value));
document.getElementById('phone').addEventListener('input',e=>{const d=digits(e.target.value).slice(0,11);e.target.value=d.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d{1,4})$/,'$1-$2')});
form.addEventListener('submit',async e=>{
 e.preventDefault();err.textContent='';btn.disabled=true;btn.textContent='Gerando Pix...';
 try{
  const payload={email:document.getElementById('email').value,emailConfirm:document.getElementById('emailConfirm').value,name:document.getElementById('name').value,document:document.getElementById('document').value,phone:document.getElementById('phone').value};
  const r=await fetch('/api/create-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data.ok) throw new Error(data.message||'Não foi possível gerar o Pix.');
  qr.src=data.pix.qrCodeDataUrl;qr.hidden=false;placeholder.hidden=true;code.value=data.pix.code||'';code.hidden=!data.pix.code;copy.disabled=!data.pix.code;status.hidden=false;
 }catch(ex){err.textContent=ex.message||'Erro ao gerar Pix.'}finally{btn.disabled=false;btn.textContent='⌘  Gerar código QR'}
});
copy.addEventListener('click',async()=>{if(!code.value)return;try{await navigator.clipboard.writeText(code.value);copy.textContent='Código copiado!';setTimeout(()=>copy.textContent='Copiar código Pix',1800)}catch{code.hidden=false;code.select();document.execCommand('copy')}});
