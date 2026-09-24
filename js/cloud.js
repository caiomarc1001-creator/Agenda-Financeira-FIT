/* Firebase: autenticação, leitura e gravação do estado na nuvem.
   Documento: users/{uid}/agenda/state  ->  { state, updatedAt, userEmail }  (mesmo formato do app atual). */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCXWUKCt5FPzmP7WIv2S9r9O0b_eSn9HuI',
  authDomain: 'agenda-financeira-fit.firebaseapp.com',
  projectId: 'agenda-financeira-fit',
  storageBucket: 'agenda-financeira-fit.firebasestorage.app',
  messagingSenderId: '303381017372',
  appId: '1:303381017372:web:710d4732ccbf2b679240d9'
};
const INACTIVITY_MS = 20 * 60 * 1000;

let auth = null, db = null, user = null;
let cloudLoadDone = false, cloudSaving = false, cloudPending = false, cloudTimer = null, inactivityTimer = null, leaving = false;

const stateRef = () => (db && user) ? db.collection('users').doc(user.uid).collection('agenda').doc('state') : null;
const backupsRef = () => (db && user) ? db.collection('users').doc(user.uid).collection('backups') : null;
const friendlyName = () => !user ? 'Não conectado' : (user.displayName || (user.email ? user.email.split('@')[0] : 'Usuário'));

const AUTH_ERRORS = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/missing-password': 'Informe a senha.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'Usuário não encontrado. Crie um cadastro ou confira o e-mail.',
  'auth/wrong-password': 'Senha incorreta. Confira a senha ou use “Recuperar senha”.',
  'auth/email-already-in-use': 'Este e-mail já possui cadastro. Use “Entrar” ou recupere a senha.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  'auth/network-request-failed': 'Falha de rede. Confira a internet e tente novamente.',
  'auth/unauthorized-domain': 'Este domínio não está autorizado no Firebase Authentication. Adicione o domínio do GitHub Pages em Authentication > Settings > Authorized domains.',
  'auth/requires-recent-login': 'Por segurança, entre novamente e tente trocar a senha.'
};
const authError = err => AUTH_ERRORS[err?.code] || err?.message || String(err);

function permissionHelp(err, action) {
  const msg = err?.message || String(err || '');
  if (err?.code === 'permission-denied' || /Missing or insufficient permissions/i.test(msg))
    return `Erro ao ${action} a nuvem: o Firebase recusou a operação por falta de permissão.\n\nNo Firebase Console, vá em Firestore Database > Rules e permita o caminho:\nusers/{uid}/agenda/state apenas quando request.auth.uid == uid.\n\nSeus dados NÃO foram apagados. Evite salvar até ajustar as regras.`;
  return `Erro ao ${action} dados da nuvem: ${msg}\n\nSeus dados NÃO foram apagados.`;
}

function setCloudText(text) { $('cloudUserStatus').textContent = text; syncUserHeader(); }

function syncUserHeader() {
  const on = !!user;
  document.body.dataset.auth = on ? 'on' : 'off';
  $('userDisplayName').textContent = on ? friendlyName() : 'Não conectado';
  $('userDisplayEmail').textContent = on ? (user.email || '') : 'Faça login para ver sua agenda';
  if (on) $('loginEmail').value = user.email || '';
  $('accountName').value = on ? (user.displayName || '') : '';
  $('accountEmail').textContent = on ? (user.email || '') : '—';
}

function clearAuthFields({ keepEmail = false } = {}) {
  ['loginPassword', 'regPassword', 'regPasswordConfirm', 'accountCurrentPassword', 'accountNewPassword', 'accountNewPasswordConfirm'].forEach(id => { $(id).value = ''; $(id).type = 'password'; });
  if (!keepEmail && !user) $('loginEmail').value = '';
}
const clearRegisterForm = () => { ['regName', 'regBirth', 'regEmail'].forEach(id => { $(id).value = ''; }); clearAuthFields({ keepEmail: true }); };

/* ---------- ciclo de vida ---------- */
function initFirebase() {
  if (!window.firebase) { setCloudText('Status: erro ao iniciar Firebase: SDK não carregou.'); setStatus('error', 'Erro Firebase'); return; }
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
  } catch (err) { console.error(err); setCloudText('Status: erro ao iniciar Firebase: ' + (err.message || err)); setStatus('error', 'Erro Firebase'); return; }
  auth.onAuthStateChanged(onAuthChange);
  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(e => document.addEventListener(e, resetInactivity, { passive: true }));
}

async function onAuthChange(u) {
  user = u || null;
  cloudLoadDone = false;
  if (!user) {
    clearTimeout(inactivityTimer);
    setCloudText('Status: não conectado.');
    if (leaving) wipePrivateData('Tela inicial / visitante');
    else { syncUserHeader(); setStatus('saved', 'Modo visitante: não salva'); }
    return;
  }
  if (leaving) return;
  resetInactivity();
  await user.reload().catch(() => {});
  user = auth.currentUser || user;
  syncUserHeader();
  setCloudText(`Conectado: ${friendlyName()} · ${user.email || ''}`);
  setStatus('saving', 'Carregando nuvem...');
  cloudLoadDone = await loadCloud();
  if (cloudLoadDone) { maybeDailyBackup('auto-diario-login'); setStatus('saved', 'Nuvem conectada'); }
  else setStatus('error', 'Nuvem sem permissão');
}

function wipePrivateData(reason) {
  clearTimeout(saveTimer); clearTimeout(cloudTimer);
  dirty = false; cloudLoadDone = false; cloudSaving = false; user = null; undoStack = [];
  setState(defaultState());
  clearAuthFields();
  resetTransientScopes();
  $$('.ov.open').forEach(ov => ov.classList.remove('open'));
  syncUserHeader();
  renderAll();
  setStatus('saved', reason);
}

const reloadAsGuest = () => location.replace(location.pathname + '?logout=' + Date.now());

function resetInactivity() {
  clearTimeout(inactivityTimer);
  if (user) inactivityTimer = setTimeout(signOutByInactivity, INACTIVITY_MS);
}
async function signOutByInactivity() {
  if (!user) return;
  try {
    if (cloudLoadDone) await saveCloudNow();
    leaving = true;
    wipePrivateData('Sessão encerrada por inatividade');
    await auth.signOut();
  } catch (err) { console.error(err); }
  finally { reloadAsGuest(); }
}

/* ---------- leitura / gravação ---------- */
async function loadCloud() {
  const ref = stateRef();
  if (!ref) return false;
  try {
    const snap = await ref.get();
    const exists = typeof snap.exists === 'function' ? snap.exists() : !!snap.exists;
    if (exists) {
      const d = snap.data() || {};
      const raw = d.state || d.currentState || d.appState || d.agendaState || d.agenda || d;
      const remote = normalizeState(raw || {});
      if (hasData(remote)) state = remote;
    }
    let brandNew = false;
    if (!hasData(state)) {
      let backups = [], backupsOk = true;
      try { backups = await fetchBackups(50); } catch { backupsOk = false; }
      const found = backups.map(b => normalizeState(b?.state || b?.currentState || b?.appState || b?.agendaState || b?.agenda || b?.data || {})).find(hasData);
      if (found) state = found;
      /* Conta realmente nova (sem documento e sem backups): nada a proteger, então já libera a gravação. */
      else brandNew = !exists && backupsOk && !backups.length;
    }
    resetEventIndex();
    resetTransientScopes();
    renderAll();
    if (brandNew) { setStatus('saved', 'Conta nova'); setCloudText('Nuvem conectada (conta nova)'); return true; }
    if (!hasData(state)) {
      setStatus('error', 'Nuvem sem conteúdo');
      setCloudText('Login realizado, mas nenhum conteúdo salvo foi encontrado na nuvem.');
      return false;
    }
    setStatus('saved', 'Nuvem carregada');
    setCloudText('Nuvem conectada');
    return true;
  } catch (err) {
    console.error(err);
    alert(permissionHelp(err, 'carregar'));
    setCloudText('Nuvem conectada ao login, mas sem permissão de leitura/gravação. Ajuste as regras do Firestore.');
    setStatus('error', 'Nuvem sem permissão');
    return false;
  }
}

const scheduleCloudSave = (delay = 900) => { clearTimeout(cloudTimer); cloudTimer = setTimeout(() => saveCloudNow(), delay); };

/* force = envio manual explícito ("Enviar dados atuais para nuvem"); libera a gravação automática em conta nova/vazia. */
async function saveCloudNow(force = false) {
  const ref = stateRef();
  if (!ref) return;
  if (cloudSaving) { cloudPending = true; return; }
  cloudSaving = true;
  try {
    setStatus('saving', 'Salvando na nuvem...');
    state._meta = { ...(state._meta || {}), updatedAt: new Date().toISOString(), updatedBy: user.uid };
    await ref.set({ state: normalizeState(state), updatedAt: firebase.firestore.FieldValue.serverTimestamp(), userEmail: user.email || '' }, { merge: false });
    if (force) { cloudLoadDone = true; setCloudText('Nuvem conectada'); }
    setStatus('saved', 'Salvo na nuvem');
    if (force) alert('Dados enviados para a nuvem com sucesso.');
  } catch (err) {
    console.error(err);
    dirty = true;
    if (err?.code === 'permission-denied') cloudLoadDone = false;
    else scheduleCloudSave(10000);
    setStatus('error', 'Erro ao salvar nuvem');
    setCloudText('Login ativo, mas a nuvem recusou o salvamento. Verifique a conexão e as regras do Firestore.');
    if (force) alert(permissionHelp(err, 'salvar'));
  } finally {
    cloudSaving = false;
    if (cloudPending) { cloudPending = false; scheduleCloudSave(250); }
  }
}

window.addEventListener('beforeunload', e => { if (dirty || cloudSaving || cloudPending) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- conta ---------- */
const needFirebase = () => { if (auth) return true; alert('Firebase ainda não está pronto. Verifique a conexão e se o domínio está autorizado no Firebase Authentication.'); return false; };

async function createAccount() {
  if (!needFirebase()) return;
  const name = $('regName').value.trim(), birth = $('regBirth').value, email = $('regEmail').value.trim(), pass = $('regPassword').value;
  if (!name) return alert('Informe seu nome completo.');
  if (!birth || birth < '1900-01-01' || birth > todayISO()) return alert('Informe uma data de nascimento válida.');
  if (!email || pass.length < 6) return alert('Informe e-mail e senha com pelo menos 6 caracteres.');
  if (pass !== $('regPasswordConfirm').value) return alert('A confirmação de senha não confere.');
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: name });
    /* Ficha do cadastro (nome e nascimento não existem no Auth): users/{uid}/profile/info. Não bloqueia o cadastro se falhar. */
    await db.collection('users').doc(cred.user.uid).collection('profile').doc('info')
      .set({ name, birthDate: birth, email, createdAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(err => console.error(err));
    await cred.user.reload();
    user = auth.currentUser || cred.user;
    syncUserHeader();
    clearRegisterForm(); closeModal('ovRegister');
  } catch (err) { alert('Erro ao criar conta: ' + authError(err)); }
}

async function signIn() {
  if (!needFirebase()) return;
  const email = $('loginEmail').value.trim(), pass = $('loginPassword').value;
  if (!email || !pass) return alert('Informe e-mail e senha.');
  try { await auth.signInWithEmailAndPassword(email, pass); clearAuthFields(); closeModal('ovLogin'); }
  catch (err) { alert('Erro ao entrar: ' + authError(err)); }
}

async function signOut() {
  await createBackup('antes-do-logout', { silent: true });
  if (!auth) return;
  clearTimeout(inactivityTimer);
  try {
    leaving = true;
    wipePrivateData('Tela inicial / visitante');
    setCloudText('Status: não conectado.');
    await auth.signOut();
    reloadAsGuest();
  } catch (err) { leaving = false; clearAuthFields(); alert('Erro ao sair: ' + (err.message || err)); }
}

async function updateProfileName() {
  if (!user) return alert('Entre na sua conta antes de editar o cadastro.');
  const name = $('accountName').value.trim();
  if (!name) return alert('Informe um nome para exibir.');
  try {
    await user.updateProfile({ displayName: name });
    await user.reload();
    user = auth.currentUser || user;
    syncUserHeader();
    setCloudText(`Conectado: ${name} · ${user.email || ''}`);
    alert('Nome atualizado com sucesso.');
  } catch (err) { alert('Erro ao atualizar cadastro: ' + (err.message || err)); }
}

async function changePassword() {
  if (!user) return alert('Entre na sua conta antes de trocar a senha.');
  const cur = $('accountCurrentPassword').value, next = $('accountNewPassword').value;
  if (!cur) return alert('Informe a senha atual.');
  if (next.length < 6) return alert('A nova senha precisa ter pelo menos 6 caracteres.');
  if (next !== $('accountNewPasswordConfirm').value) return alert('A confirmação da nova senha não confere.');
  try {
    await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email, cur));
    await user.updatePassword(next);
    clearAuthFields();
    alert('Senha alterada com sucesso.');
  } catch (err) { alert('Erro ao trocar senha: ' + authError(err)); }
}

async function resetPassword() {
  if (!needFirebase()) return;
  const email = ($('loginEmail').value || user?.email || '').trim();
  if (!email) return alert('Digite seu e-mail no campo de login para receber a recuperação de senha.');
  try { await auth.sendPasswordResetEmail(email); alert('E-mail de recuperação enviado para: ' + email); }
  catch (err) { alert('Erro ao enviar recuperação: ' + authError(err)); }
}

function togglePassword(inputId, btnId) {
  const input = $(inputId), btn = $(btnId), shown = input.type === 'text';
  input.type = shown ? 'password' : 'text';
  btn.textContent = shown ? '👁' : '🙈';
  btn.title = shown ? 'Mostrar senha' : 'Ocultar senha';
}
