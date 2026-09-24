# Agenda Financeira v4

Reescrita enxuta da Agenda de Plantões & Produtividade: mesmo layout, mesmas funcionalidades e **mesma forma de gravação** (Firebase Auth + Firestore). Nada é salvo no navegador (sem `localStorage`/`sessionStorage`/IndexedDB).

## Como usar

Abra `index.html` num navegador comum (Chrome, Edge, Firefox; funciona direto do disco, mas visualizadores embutidos que bloqueiam `file://` mostram a página sem estilos) ou publique a pasta como está em qualquer hospedagem estática (GitHub Pages, Firebase Hosting, Netlify…). Não há build nem dependências além do SDK do Firebase (carregado por CDN).

## Estrutura

| Pasta/arquivo | Conteúdo |
|---|---|
| `index.html` | Marcação de todas as telas e modais |
| `css/base.css` | Tokens padrão (tema escuro) |
| `css/themes.css` | Tokens e superfícies de cada tema |
| `css/app.css`, `screens.css`, `crm.css`, `decor.css` | Cabeçalho, calendário, modais, CRM, decoração dos temas |
| `js/util.js` | Utilitários (DOM, datas, moeda, download) |
| `js/state.js` | Estado, normalização, desfazer, gravação com debounce |
| `js/cloud.js` | Login, leitura/gravação no Firestore, logout por inatividade |
| `js/backup.js` | Backups versionados, restaurar, importar, exportar, zerar |
| `js/finance.js` | Regras financeiras (bônus, competência, recebimento) |
| `js/calendar.js`, `panels.js` | Calendário, eventos, painéis de recebimentos/contas |
| `js/surgery.js`, `crm.js`, `personal.js`, `admin.js` | Cirurgias, CRM, despesas pessoais, cadastros/auditoria |
| `js/reports.js`, `theme.js`, `main.js` | Relatórios (PDF/DOC/CSV), temas, inicialização |
| `js/contrast.js` | Contraste automático: mede texto x fundo real e corrige cores ilegíveis em qualquer tema (mín. 4,6:1) |

## Persistência

- Estado: `users/{uid}/agenda/state` → `{ state, updatedAt, userEmail }` (`set` com `merge:false`, gravação após ~1,2 s sem edições).
- Backups: `users/{uid}/backups/{id}` (formato `cloud-backup-v1`), com backup diário automático e backup de segurança antes de restaurar, importar ou zerar.
- Chaves desconhecidas do estado são preservadas ao salvar, então dados de versões diferentes não se perdem.
- Modo visitante não grava. Logout automático após 20 min de inatividade.

> Este projeto é independente do app antigo: usa o próprio projeto Firebase (`agenda-financeira-fit`, configurado em `js/cloud.js`). Contas e dados começam vazios; para trazer dados antigos, use a importação de JSON.
