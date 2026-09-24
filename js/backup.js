/* Backups versionados (nuvem: users/{uid}/backups/{id}), exportação e importação JSON. */
const MAX_AUTO_BACKUPS = 30;
let backupsCache = [];

const deviceType = () => (window.matchMedia && matchMedia('(max-width: 1024px)').matches) ? 'mobile_tablet' : 'desktop';

function makeBackup(reason = 'manual') {
  const savedAt = new Date().toISOString();
  const snapshot = normalizeState(state);
  return {
    id: 'backup_' + savedAt.replace(/[^0-9]/g, '') + '_' + Math.random().toString(16).slice(2, 8),
    savedAt, reason, device: deviceType(), appVersion: 'cloud-backup-v1',
    userEmail: user?.email || '', summary: backupSummary(snapshot), state: snapshot
  };
}

async function saveBackupDoc(backup) {
  const col = backupsRef();
  if (!col) return false;
  try {
    await col.doc(backup.id).set({ ...backup, createdAt: firebase.firestore.FieldValue.serverTimestamp(), userUid: user.uid, userEmail: user.email || '' }, { merge: false });
    return true;
  } catch (err) { console.error('Backup em nuvem não foi criado:', err); return false; }
}

async function fetchBackups(limit = 50) {
  const col = backupsRef();
  if (!col) { backupsCache = []; return []; }
  try {
    const snap = await col.orderBy('savedAt', 'desc').limit(limit).get();
    backupsCache = snap.docs.map(d => { const data = d.data() || {}; return { id: data.id || d.id, ...data }; });
    return backupsCache;
  } catch (err) {
    console.error('Erro ao carregar backups da nuvem:', err);
    alert('Não foi possível carregar os backups da nuvem. Verifique as regras do Firestore para users/{uid}/backups/{backupId}.');
    backupsCache = [];
    return [];
  }
}

async function pruneAutoBackups() {
  const col = backupsRef();
  if (!col) return;
  try {
    const snap = await col.orderBy('savedAt', 'desc').limit(100).get();
    const auto = snap.docs.filter(d => /auto|diario/.test(String(d.data().reason || '')));
    for (const d of auto.slice(MAX_AUTO_BACKUPS)) await d.ref.delete();
  } catch (err) { console.warn('Não foi possível limpar backups automáticos antigos:', err); }
}

async function createBackup(reason = 'manual', { silent = false } = {}) {
  if (!user || !cloudLoadDone) { if (!silent) alert('Entre na conta e aguarde a nuvem carregar antes de criar backup.'); return null; }
  const backup = makeBackup(reason);
  if (!await saveBackupDoc(backup)) { if (!silent) alert('Não foi possível criar o backup na nuvem. Nada foi salvo no navegador.'); return null; }
  backupsCache.unshift(backup);
  await pruneAutoBackups();
  if (!silent) { await renderBackupCenter(); alert('Backup criado na nuvem com sucesso.'); }
  return backup;
}

async function maybeDailyBackup(reason = 'auto-diario') {
  if (!user || !cloudLoadDone || !hasData(state)) return;
  const today = new Date().toISOString().slice(0, 10);
  const list = await fetchBackups(50);
  if (!list.some(b => String(b.savedAt || '').slice(0, 10) === today && String(b.reason || '').includes('auto'))) await createBackup(reason, { silent: true });
}

async function renderBackupCenter() {
  const list = $('backupList'), s = backupSummary(state);
  $('backupEventsCount').textContent = s.events;
  $('backupSurgeriesCount').textContent = s.surgeries;
  $('backupRulesCount').textContent = s.payRules + s.bonusRules;
  if (!user || !cloudLoadDone) {
    $('backupLastAt').textContent = '—';
    list.innerHTML = '<div class="helper">Entre na sua conta e aguarde a mensagem <b>Nuvem conectada</b> para visualizar e criar backups.</div>';
    return;
  }
  list.innerHTML = '<div class="helper">Carregando backups da nuvem...</div>';
  const backups = await fetchBackups(50);
  $('backupLastAt').textContent = backups[0] ? stamp(backups[0].savedAt) : '—';
  list.innerHTML = backups.length ? backups.map(b => {
    const sm = b.summary || backupSummary(b.state || {});
    return `<div class="backupItem">
      <div><div class="backupTitle">${esc(stamp(b.savedAt))}</div>
        <div class="backupInfo">Motivo: ${esc(b.reason || 'manual')} · Dispositivo: ${esc(b.device || '—')}<br>${sm.events || 0} evento(s), ${sm.surgeries || 0} cirurgia(s), ${(sm.payRules || 0) + (sm.bonusRules || 0)} regra(s)</div></div>
      <div class="backupActions">
        <button class="smallBtn" type="button" data-backup-export="${escAttr(b.id)}">Baixar JSON</button>
        <button class="smallBtn primary" type="button" data-backup-restore="${escAttr(b.id)}">Restaurar</button>
      </div></div>`;
  }).join('') : '<div class="helper">Nenhum backup na nuvem ainda. Clique em <b>Criar backup na nuvem</b> antes de fazer alterações importantes.</div>';
}

const openBackupCenter = async () => { closeModal('ovLogin'); closeModal('ovAccount'); openModal('ovBackupCenter'); await renderBackupCenter(); };

async function exportBackupPack() {
  const backups = user && cloudLoadDone ? await fetchBackups(50) : [];
  downloadJson(`agenda_backups_nuvem_${Date.now()}.json`, { exportedAt: new Date().toISOString(), currentState: state, backups });
}

async function findBackup(id) {
  const list = backupsCache.length ? backupsCache : await fetchBackups(50);
  return list.find(b => b.id === id);
}
async function exportBackupById(id) {
  const b = await findBackup(id);
  if (!b) return alert('Backup não encontrado na nuvem.');
  downloadJson(`agenda_backup_${String(b.savedAt || Date.now()).replace(/[^0-9]/g, '')}.json`, b);
}
async function restoreBackupById(id) {
  const b = await findBackup(id);
  if (!b || !b.state) return alert('Backup inválido ou não encontrado na nuvem.');
  if (!confirm(`Restaurar o backup de ${stamp(b.savedAt)}?\n\nAntes de restaurar, o sistema criará um backup de segurança na nuvem com o estado atual.`)) return;
  if (!await createBackup('antes-de-restaurar-backup', { silent: true })) return alert('Restauração cancelada: não foi possível criar o backup de segurança na nuvem.');
  pushHistory();
  setState(b.state);
  if (user && cloudLoadDone) await saveCloudNow();
  resetTransientScopes(); renderAll();
  await renderBackupCenter();
  setStatus('saved', 'Backup restaurado e sincronizado');
  alert('Backup restaurado com sucesso.');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    let data;
    try { data = JSON.parse(reader.result); } catch { return alert('Arquivo JSON inválido.'); }
    if (user && cloudLoadDone && !await createBackup('antes-de-importar-json', { silent: true })) return alert('Importação cancelada: não foi possível criar backup de segurança na nuvem.');
    pushHistory();
    setState(data.state || data);
    if (user && cloudLoadDone) await saveCloudNow();
    resetTransientScopes(); renderAll();
    alert('Importação concluída e sincronizada.');
  };
  reader.readAsText(file);
}

async function resetAll() {
  if (!confirm('Tem certeza que deseja zerar os dados da agenda?')) return;
  if (user && cloudLoadDone && !await createBackup('antes-de-zerar', { silent: true })) return alert('Ação cancelada: não foi possível criar backup de segurança na nuvem.');
  pushHistory();
  setState(defaultState());
  if (user && cloudLoadDone) saveCloudNow();
  resetTransientScopes(); renderAll();
  setStatus('saved', user ? 'Zerado e sincronizado' : 'Zerado');
}
