/* Orquestração: renderização geral, telas (agenda / cirurgião / comercial / despesas), menu e eventos. */
const on = (id, type, fn) => $(id).addEventListener(type, fn);

function renderAll() {
  ensureCatalogs();
  applyTheme();
  applyModes();
  applyCellHeight();
  renderDow();
  renderCalendar();
  refreshHideButton();
  renderSummary();
  renderPayments();
  renderPayables();
  renderSurgeryPanel();
  renderCRMPanel();
  renderAnalytics();
  applyReportCollapse();
  renderPersonal();
  renderCatalogs();
  refreshUndoButton();
  applyPanels();
}

/* ---------- telas ---------- */
const setScreen = label => { const b = $('activeScreenBadge'); b.textContent = label; b.title = 'Tela/função atual: ' + label; };

function applyModes() {
  applySurgeonMode();
  document.body.classList.toggle('crm-mode', !!state.ui.crmMode);
  document.body.classList.toggle('personal-finance-mode', !!state.ui.personalFinanceMode);
  $('btnPersonalExpenses').classList.toggle('modeActive', !!state.ui.personalFinanceMode);
  if (state.ui.personalFinanceMode) setScreen('Despesas pessoais');
}

function goAgenda() {
  Object.assign(state.ui, { surgeonMode: false, crmMode: false, personalFinanceMode: false });
  delete document.body.dataset.crmView;
  save(); setScreen('Agenda'); renderAll();
}

function setCommercialView(view) {
  const register = view === 'register';
  document.body.dataset.crmView = register ? 'register' : 'dashboard';
  Object.assign(state.ui, { crmMode: true, surgeonMode: false, personalFinanceMode: false });
  $('crmScreenTitle').textContent = register ? 'Cadastro de pacientes' : 'Controle Comercial';
  $('crmScreenSubtitle').textContent = register ? 'Cadastro independente de pacientes e leads' : 'Dashboard, filtros, relatórios e acompanhamento comercial';
  setScreen(register ? 'Cadastro de pacientes' : 'Controle Comercial');
  renderAll();
  $('crmPageCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openPersonalFinance() {
  Object.assign(state.ui, { personalFinanceMode: true, surgeonMode: false, crmMode: false });
  delete document.body.dataset.crmView;
  state.ui.personalFinanceMonth ||= monthKey(state.view.y, state.view.m);
  save(); renderAll();
  $('personalFinancePageCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- menu hambúrguer (painel fixo sob o botão) ---------- */
function positionMenu() {
  const r = $('hambBtn').getBoundingClientRect(), menu = $('hambMenu');
  const w = Math.min(330, innerWidth - 24);
  menu.style.width = w + 'px';
  menu.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + 'px';
  menu.style.top = Math.max(12, Math.min(r.bottom + 10, innerHeight - 96)) + 'px';
}
function setMenu(open) {
  $('hambWrap').classList.toggle('open', open);
  $('hambBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) positionMenu();
}

function openLogin() {
  if (user) { clearAuthFields(); syncUserHeader(); return openModal('ovAccount'); } // já conectado: abre a conta
  clearAuthFields({ keepEmail: true });
  openModal('ovLogin');
}
function openRegister() {
  $('regEmail').value ||= $('loginEmail').value.trim();
  closeModal('ovLogin'); openModal('ovRegister');
}

/* ---------- eventos ---------- */
function bindEvents() {
  // menu
  on('hambBtn', 'click', () => setMenu(!$('hambWrap').classList.contains('open')));
  document.addEventListener('click', e => { if (!e.target.closest('#hambWrap')) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  addEventListener('resize', () => { if ($('hambWrap').classList.contains('open')) positionMenu(); });
  $$('#hambMenu .menuItem').forEach(b => b.addEventListener('click', () => setTimeout(() => setMenu(false), 120)));

  const labels = { btnPay: 'Regras', btnNewSurgery: 'Cirurgião', btnTheme: 'Tema', btnAdminCenter: 'Administração', btnAuditCenter: 'Auditoria', btnToggleCalendarEvents: 'Eventos', btnDayH: 'Altura do dia', btnBackupCenter: 'Backups', btnImport: 'Importar', btnExport: 'Exportar', btnReset: 'Zerar', btnUndo: 'Desfazer', btnSaveNow: 'Salvar', btnBonusRules: 'Bonificação' };
  Object.entries(labels).forEach(([id, label]) => on(id, 'click', () => setScreen(label)));
  on('btnNew', 'click', () => { setScreen('Agenda'); openEventNew(state.selDate || todayISO()); });

  on('btnAgendaScreen', 'click', goAgenda);
  on('btnNewSurgery', 'click', toggleSurgeonMode);
  on('btnPatientRegister', 'click', () => { setCRMTab('patient'); clearCRMForm('patient'); setCommercialView('register'); });
  on('btnCommercialControl', 'click', () => setCommercialView('dashboard'));
  on('btnPersonalExpenses', 'click', openPersonalFinance);
  on('btnTheme', 'click', openThemeStudio);
  on('btnAdminCenter', 'click', openAdmin);
  on('btnAuditCenter', 'click', openAudit);
  on('btnSaveNow', 'click', () => persist(true));
  on('btnUndo', 'click', undo);
  on('btnToggleCalendarEvents', 'click', openHideOptions);
  on('btnLogin', 'click', openLogin);
  on('btnReset', 'click', resetAll);

  // painéis
  on('btnToggleSummary', 'click', () => togglePanel('summaryCollapsed'));
  on('btnTogglePayments', 'click', () => togglePanel('paymentsCollapsed'));
  on('btnTogglePayables', 'click', () => togglePanel('payablesCollapsed'));
  on('btnToggleSurgeries', 'click', () => togglePanel('surgeriesCollapsed'));
  on('btnToggleNetBalance', 'click', () => { state.ui.showNetBalance = !state.ui.showNetBalance; save(); renderPayables(); });
  ['payList', 'payablesList'].forEach(id => $(id).addEventListener('click', e => { const b = e.target.closest('[data-row-toggle]'); if (b) toggleRow(b.dataset.rowToggle, b.dataset.key); }));

  // calendário
  on('sidePrev', 'click', () => changeMonth(-1));
  on('sideNext', 'click', () => changeMonth(1));
  bindCalendarSwipe();

  // ocultar eventos
  on('hideOptionsClose', 'click', () => closeModal('ovHideOptions'));
  on('btnCancelHideOptions', 'click', () => closeModal('ovHideOptions'));
  on('btnApplyHideOptions', 'click', applyHideOptions);
  on('btnShowAllCalendarEvents', 'click', showAllEvents);

  // evento
  on('evClose', 'click', () => closeModal('ovEvent'));
  on('evCancel', 'click', () => { clearScope(); closeModal('ovEvent'); });
  on('evSave', 'click', saveEvent);
  on('evDelete', 'click', deleteEvent);
  on('btnEventNewSurgery', 'click', () => { const d = $('evDate').value || state.selDate || todayISO(); closeModal('ovEvent'); openSurgeryOn(d); });
  on('btnCopySpecificDates', 'click', () => openSpecificDates('copy'));
  on('btnDeleteSpecificDates', 'click', () => openSpecificDates('delete'));
  ['evName', 'evTime', 'evRate', 'evHours', 'evFullAmount', 'evNote'].forEach(id => on(id, 'input', updateEventUi));
  ['evType', 'evDate', 'evEnd', 'evRec', 'evFinanceKind', 'evRetroMode', 'evRetroSingleDate', 'evRetroStartDate', 'evRetroEndDate', 'evRetroInfoDate'].forEach(id => on(id, 'change', updateEventUi));
  on('btnRetroToday', 'click', () => {
    const today = todayISO(), start = $('evDate').value || today;
    const maxEnd = parseISO(start) <= parseISO(today) ? addDays(start, -1) : today;
    $('evRetroEndDate').value = maxEnd < ($('evRetroStartDate').value || '') ? $('evRetroStartDate').value : maxEnd;
    updateEventUi();
  });
  on('scopeClose', 'click', () => { clearScope(); closeModal('ovScope'); });
  on('scopeSingle', 'click', () => chooseScope('single'));
  on('scopeFuture', 'click', () => chooseScope('future'));
  on('scopeAll', 'click', () => chooseScope('all'));
  on('delScopeClose', 'click', () => { clearDelScope(); closeModal('ovDelScope'); });
  on('delSingle', 'click', () => confirmDeleteScope('single'));
  on('delFuture', 'click', () => confirmDeleteScope('future'));
  on('delAll', 'click', () => confirmDeleteScope('all'));
  on('retroDelScopeClose', 'click', () => { clearRetroDel(); closeModal('ovRetroDelScope'); });
  on('retroDelSingle', 'click', () => confirmRetroDelete('single'));
  on('retroDelAll', 'click', () => confirmRetroDelete('all'));
  on('retroDelRange', 'click', () => confirmRetroDelete('range'));
  on('specificDatesClose', 'click', () => closeModal('ovSpecificDates'));
  on('specificDatesCancel', 'click', () => closeModal('ovSpecificDates'));
  on('specificDatesConfirm', 'click', applySpecificDates);
  on('btnSpecificFillRange', 'click', () => fillSpecificRange(1));
  on('btnSpecificFillWeekly', 'click', () => fillSpecificRange(7));
  on('btnSpecificFillBiweekly', 'click', () => fillSpecificRange(14));
  on('btnSpecificClear', 'click', () => { $('specificDatesText').value = ''; });

  // cor e altura das datas
  on('btnPickColor', 'click', () => { buildColorGrid(); openModal('ovColor'); });
  on('colorClose', 'click', () => closeModal('ovColor'));
  on('colorOk', 'click', () => closeModal('ovColor'));
  on('colorPicker', 'input', e => setPickedColor(e.target.value));
  on('colorHex', 'input', e => setPickedColor(e.target.value));
  // ajuste em tempo real: sem fundo desfocado; se aberto de dentro do Estúdio de Tema, esconde o estúdio para o calendário ficar visível
  const studio = $('ovThemeSelector'), closeDayH = () => { closeModal('ovDayH'); studio.classList.remove('parked'); };
  ['btnDayH', 'btnDayHCal'].forEach(id => on(id, 'click', () => { applyCellHeight(); studio.classList.toggle('parked', studio.classList.contains('open')); openModal('ovDayH'); }));
  on('dayHClose', 'click', closeDayH);
  on('dayHOk', 'click', closeDayH);
  on('dayHRange', 'input', e => { state.cellH = Number(e.target.value || 128); applyCellHeight(); save(); renderCalendar(); });

  // regras
  on('btnPay', 'click', openRules);
  on('payClose', 'click', () => closeModal('ovPay'));
  on('addRule', 'click', () => addRule('receivable'));
  on('addPayableRule', 'click', () => addRule('payable'));
  on('saveRules', 'click', saveRules);
  bindRuleHost('rulesHost'); bindRuleHost('payableRulesHost'); bindBonusHost();
  on('btnBonusRules', 'click', openBonus);
  on('bonusRulesClose', 'click', () => closeModal('ovBonusRules'));
  on('addBonusRule', 'click', addBonus);
  on('saveBonusRules', 'click', saveBonus);

  // conta e nuvem
  on('btnLoginTop', 'click', openLogin);
  on('userBadge', 'click', () => { if (user) { clearAuthFields(); syncUserHeader(); openModal('ovAccount'); } });
  on('accountClose', 'click', () => { clearAuthFields(); closeModal('ovAccount'); });
  on('loginClose', 'click', () => { clearAuthFields(); closeModal('ovLogin'); });
  on('btnOpenRegister', 'click', openRegister);
  on('registerForm', 'submit', e => { e.preventDefault(); createAccount(); });
  on('btnBackToLogin', 'click', () => { closeModal('ovRegister'); openLogin(); });
  on('registerClose', 'click', () => { clearRegisterForm(); closeModal('ovRegister'); });
  on('authForm', 'submit', e => { e.preventDefault(); signIn(); });
  on('toggleLoginPassword', 'click', () => togglePassword('loginPassword', 'toggleLoginPassword'));
  on('toggleRegPassword', 'click', () => togglePassword('regPassword', 'toggleRegPassword'));
  on('toggleRegPasswordConfirm', 'click', () => togglePassword('regPasswordConfirm', 'toggleRegPasswordConfirm'));
  ['btnLogoutTop', 'btnSignOutAccount'].forEach(id => on(id, 'click', signOut));
  on('btnUpdateProfile', 'click', updateProfileName);
  on('btnChangePassword', 'click', changePassword);
  on('btnPasswordReset', 'click', resetPassword);
  on('btnSyncLocalToCloud', 'click', () => saveCloudNow(true));

  // backups
  on('btnBackupCenter', 'click', openBackupCenter);
  on('backupClose', 'click', () => closeModal('ovBackupCenter'));
  on('btnCreateBackupNow', 'click', () => createBackup('manual'));
  on('btnExportBackupPack', 'click', exportBackupPack);
  on('btnRefreshBackups', 'click', renderBackupCenter);
  on('btnImport', 'click', () => $('fileImport').click());
  on('btnExport', 'click', () => downloadJson(`agenda_backup_${Date.now()}.json`, state));
  on('fileImport', 'change', e => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ''; });
  on('backupList', 'click', e => {
    const x = e.target.closest('[data-backup-export]'), r = e.target.closest('[data-backup-restore]');
    if (x) exportBackupById(x.dataset.backupExport); else if (r) restoreBackupById(r.dataset.backupRestore);
  });

  // tema
  on('themeSelectorClose', 'click', () => closeModal('ovThemeSelector'));
  on('themeSelectorCancel', 'click', () => closeModal('ovThemeSelector'));
  on('btnResetMyTheme', 'click', resetMyTheme);
  bindThemeStudio();

  // cirurgias
  on('btnNewSurgeryRecord', 'click', () => openSurgeryOn(state.selDate || todayISO()));
  on('surgeryClose', 'click', () => closeModal('ovSurgeryCenter'));
  on('surgSave', 'click', saveSurgery);
  on('surgClear', 'click', clearSurgeryForm);
  ['surgerySearch', 'surgeryPeriodFrom', 'surgeryPeriodTo', 'surgeryHospitalFilter', 'surgeryCategoryFilter', 'surgeryRoleFilter', 'surgeryStatusFilter'].forEach(id => on(id, 'input', renderSurgeryPanel));
  on('surgeryDownloadDoc', 'click', surgeryDoc);
  on('surgeryDownloadPdf', 'click', surgeryPdf);
  ['surgeryPreviewList', 'surgeryFullList'].forEach(id => on(id, 'click', onSurgeryAction));

  // comercial
  on('crmNewPatient', 'click', () => { setCRMTab('patient'); clearCRMForm('patient'); setCommercialView('register'); });
  on('crmNewLead', 'click', () => { setCRMTab('lead'); clearCRMForm('lead'); setCommercialView('register'); });
  on('crmTabPatients', 'click', () => setCRMTab('patient'));
  on('crmTabLeads', 'click', () => setCRMTab('lead'));
  on('crmTabDue', 'click', () => setCRMTab('due'));
  on('crmSave', 'click', saveCRM);
  on('crmClear', 'click', () => clearCRMForm(CRMForm.tab === 'due' ? 'lead' : CRMForm.tab));
  ['crmOriginOrganic', 'crmOriginInternet'].forEach(id => on(id, 'change', syncCheckboxes));
  $$('[data-crm-internet],[data-crm-interest]').forEach(el => el.addEventListener('change', syncCheckboxes));
  on('crmSearch', 'input', renderCRMPanel);
  ['crmQuickFilter', 'crmListDoctor', 'crmListFrom', 'crmListTo'].forEach(id => on(id, 'change', renderCRMPanel));
  ['crmDoctorPeriodFrom', 'crmDoctorPeriodTo', 'crmDoctorPeriodBasis', 'crmDoctorPeriodType', 'crmDoctorPeriodDoctor'].forEach(id => on(id, 'change', renderDoctorReport));
  on('crmDoctorPeriodThisMonth', 'click', reportThisMonth);
  on('crmToggleDoctorReport', 'click', toggleReportCollapse);
  on('crmDownloadReport', 'click', commercialCsv);
  on('crmDownloadDoc', 'click', commercialDoc);
  on('crmDownloadPdf', 'click', commercialPdf);
  on('crmPrintReport', 'click', commercialPrint);
  ['crmList', 'crmOverdueBox'].forEach(id => on(id, 'click', onCRMAction));
  on('crmGlobalAlertStrip', 'click', e => {
    const hit = e.target.closest('[data-crm-alert]');
    if (!hit) return;
    Object.assign(state.ui, { crmMode: true, surgeonMode: false, personalFinanceMode: false });
    save(); renderAll();
    setCRMTab(hit.dataset.crmAlert === 'renew' ? 'patient' : 'due');
  });

  // despesas pessoais
  on('personalExpenseSave', 'click', saveExpense);
  on('personalExpenseClear', 'click', clearExpenseForm);
  on('personalUseAgendaMonth', 'click', useAgendaMonth);
  on('personalFinanceMonth', 'change', e => { state.ui.personalFinanceMonth = e.target.value; save(); renderPersonal(); });
  on('personalExpenseSearch', 'input', renderPersonal);
  on('personalExpenseFilterStatus', 'change', renderPersonal);
  on('personalExpenseSort', 'change', e => { state.ui.personalExpenseSort = e.target.value || 'manual'; save(); renderPersonal(); });
  on('personalExpenseList', 'click', onExpenseAction);

  bindAdmin();
  $$('.ov').forEach(ov => ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); }));
}

bindEvents();
clearAuthFields();
syncUserHeader();
renderAll();
AutoContrast.start();
initFirebase();
