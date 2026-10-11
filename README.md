# Agenda Financeira FIT (v4)

Agenda de Plantões & Produtividade: calendário, valores a receber e a pagar, cirurgias, CRM (Controle Comercial), despesas pessoais, temas e backups. Tudo é gravado na nuvem (Firebase Auth + Firestore); nada é salvo no navegador (sem `localStorage`/`sessionStorage`/IndexedDB).

## Como usar

Abra `index.html` num navegador comum (Chrome, Edge, Firefox, Safari) ou publique a pasta como está em qualquer hospedagem estática (GitHub Pages, Firebase Hosting…). Não há build nem dependências além do SDK do Firebase (carregado por CDN).

## Mapa do projeto — onde mexer em cada coisa

### Páginas e estilos

| Arquivo | Responsabilidade | Regra |
|---|---|---|
| `index.html` | Marcação de todas as telas e janelas; ordem de carregamento dos scripts | A ordem dos `<script>` importa (veja abaixo) |
| `css/base.css` | Tokens padrão (cores, medidas), reset e ajustes de Safari/iPhone | Só variáveis e base. Nada de componente aqui |
| `css/themes.css` | Cores e superfícies de cada tema | **Gerado. Não editar à mão.** Para mudar um tema, use o Estúdio de Tema |
| `css/app.css` | Desktop: cabeçalho, calendário, painéis, avisos do CRM | Só regras de tela grande |
| `css/screens.css` | Desktop: janelas (modais), formulários, tema, backups, administração | Só regras de tela grande |
| `css/crm.css` | Desktop: Controle Comercial e Despesas pessoais | Só regras de tela grande |
| `css/decor.css` | Decoração por tema (faixa do Senna, miniaturas) | Só aparência de tema |
| `css/responsive.css` | **Tudo** que muda em tablet e celular | Único lugar com `@media`. Último a carregar |

### Scripts (`js/`)

| Arquivo | Responsabilidade |
|---|---|
| `util.js` | Utilitários: DOM, datas, moeda, cores, download, abertura de janelas |
| `state.js` | Estado do app, normalização, desfazer, gravação com atraso (debounce) |
| `cloud.js` | Login, leitura e gravação no Firestore, logout por inatividade |
| `backup.js` | Backups versionados, restaurar, importar, exportar, zerar |
| `finance.js` | Regras financeiras: total do evento, bônus, ocorrências, competência, vencimento |
| `calendar.js` | Calendário: grade, resumo do mês, troca de mês, ocultar eventos |
| `event-form.js` | Editor de evento: formulário, cores, escopo da série, abertura do modal |
| `event-actions.js` | Ações: retroativos, cópias em datas específicas, salvar, excluir |
| `panels.js` | Painéis laterais: valores a receber, contas a pagar |
| `surgery.js` | Controle cirúrgico e Modo Cirurgião |
| `crm.js` | Controle Comercial: pacientes, leads, recontatos, relatórios |
| `personal.js` | Despesas pessoais |
| `admin.js` | Cadastros (médicos, hospitais, convênios) e auditoria |
| `reports.js` | Relatórios em PDF, DOC e CSV |
| `theme.js` | Temas, "Meu tema" por áreas, tamanho dos dias |
| `contrast.js` | Contraste automático: corrige texto ilegível sobre o fundo real, em qualquer tema |
| `main.js` | Orquestração: renderização geral, menu, ligação dos eventos, inicialização |

**Ordem dos scripts:** são arquivos comuns que compartilham o mesmo escopo (sem módulos). Um arquivo só pode usar, ao carregar, o que veio antes dele. As funções chamadas depois da inicialização podem vir de qualquer arquivo. `main.js` é sempre o último.

## Regras para mudar sem bagunçar

1. **Celular e tablet só em `css/responsive.css`**, na seção da área (cabeçalho, calendário, janelas, comercial…). Não crie `@media` em outro arquivo e não repita o mesmo seletor no mesmo ponto de quebra (1100 px tablet, 700 px celular, 400 px celular estreito).
2. **Cores e medidas por variável** (`--ui-*`, `--component-*`, `--chip-h`, `--ui-fs`…), em vez de repetir o valor em vários lugares.
3. **Regra nova vai no arquivo do componente.** Se um ajuste "não pega", descubra qual regra está vencendo em vez de empilhar outra por cima.
4. **Um arquivo por assunto.** Se um arquivo passar de umas 500 linhas, divida por assunto (foi o que aconteceu com o `calendar.js`).
5. **Dados:** o estado inteiro vai para `users/{uid}/agenda/state`. Ao criar um campo novo, defina o valor padrão em `state.js` (`defaultState`/`normalizeState`) para que dados antigos continuem abrindo.
6. **Textos legíveis:** não é preciso escolher cor de texto "na mão" para cada fundo; `contrast.js` garante o contraste. Cores de eventos usam `bestText()` (`util.js`).

## Antes de publicar

- Abra o site localmente e confira as telas mexidas em **desktop, tablet (~820 px) e celular (~390–430 px)**.
- Para eventos: crie uma série semanal, edite "só este", "este e os futuros" e "todos", copie para outra data e exclua. Confira o total do mês.
- Faça um backup pela Central de Backups.
- Envie ao GitHub **só os arquivos alterados**. Nunca envie arquivos `.json` de backup (têm dados pessoais).

## Persistência

- Estado: `users/{uid}/agenda/state` → `{ state, updatedAt, userEmail }` (`set` com `merge:false`, gravação após ~1,2 s sem edições).
- Cadastro: `users/{uid}/profile/info` → `{ name, birthDate, email, createdAt }`.
- Backups: `users/{uid}/backups/{id}` (formato `cloud-backup-v1`), com backup diário automático e backup de segurança antes de restaurar, importar ou zerar.
- Chaves desconhecidas do estado são preservadas ao salvar, então dados de versões diferentes não se perdem.
- Modo visitante não grava. Logout automático após 20 min de inatividade.

## Temas

- **Temas prontos** não são alterados. Ao mexer em qualquer cor, o app cria o **"Meu tema"** (cópia do tema ativo), com 8 áreas editáveis; "Zerar meu tema" o apaga.
- Para criar uma área nova de personalização, acrescente um item em `THEME_AREAS` (`js/theme.js`).

> Projeto independente: usa o próprio Firebase (`agenda-financeira-fit`, configurado em `js/cloud.js`). Contas e dados começam vazios; para trazer dados antigos, use a importação de JSON.
