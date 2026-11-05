const $=id=>document.getElementById(id);
const token=new URL(location.href).searchParams.get('token');
let finished=false, result=null;
function message(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
async function send(path,payload){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Circulo-Token':token},body:JSON.stringify(payload)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível iniciar o teste.');
}
$('login-form').addEventListener('submit',async event=>{
  event.preventDefault();$('login').disabled=true;finished=false;result=null;$('result').hidden=true;$('photo').hidden=true;$('photo').removeAttribute('src');$('download').hidden=true;
  const payload={username:$('username').value.trim().toLowerCase(),password:$('password').value,remember:$('remember').checked};
  $('password').value='';
  try{await send('/login',payload);message('Tentativa enviada. Aguarde a resposta do Instagram…');}catch(error){message(error.message,true);$('login').disabled=false;}finally{payload.password='';}
});
$('code-form').addEventListener('submit',async event=>{
  event.preventDefault();$('verify').disabled=true;const payload={code:$('code').value};$('code').value='';
  try{await send('/code',payload);$('code-form').hidden=true;message('Conferindo o código…');}catch(error){message(error.message,true);$('verify').disabled=false;}finally{payload.code='';}
});
async function poll(){
  try{
    const response=await fetch('/status',{headers:{'X-Circulo-Token':token}});
    if(!response.ok)throw Error('A janela de teste expirou. Abra novamente pelo programa local.');
    const state=await response.json();
    if(state.phase!=='ready')message(state.message,state.phase==='error');
    const busy=['logging_in','querying','code_required'].includes(state.phase);
    $('login').disabled=busy;$('username').disabled=busy;$('password').disabled=busy;$('remember').disabled=busy;
    const needsCode=state.phase==='code_required';
    if(needsCode&&$('code-form').hidden){$('code-form').hidden=false;$('verify').disabled=false;$('code').focus();}
    if(!needsCode)$('code-form').hidden=true;
    if(state.phase==='success'&&!finished){
      finished=true;result=state;$('result').hidden=false;
      $('profile-name').textContent=state.profile.name+' (@'+state.profile.username+')';
      $('profile-info').textContent='Seguidores: '+state.profile.followers.toLocaleString('pt-BR')+' · '+(state.profile.verified?'Verificado':'Sem verificação informada')+' · '+(state.profile.private?'Perfil privado':'Perfil público')+(state.remembered?' · Sessão protegida guardada.':' · Sessão não gravada em arquivo.');
      if(state.profile.photo){$('photo').src=state.profile.photo;$('photo').hidden=false;$('download').hidden=false;}
    }
  }catch(error){message(error.message,true);}
}
$('download').addEventListener('click',()=>{
  if(!result?.profile.photo)return;
  const payload={format:'circulo-photos-v1',account:result.account,photos:[{username:result.profile.username,photo:result.profile.photo}]};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='circulo-foto-teste.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
poll();setInterval(poll,1200);
