# CCO Mirian

Plataforma do Centro de Controle Operacional da rede Mirian: registro e acompanhamento de ocorrências, painel com indicadores, manutenção de câmeras, relatório mensal por posto e cadastros. Substitui a planilha `Registro_de_Ocorrencias-CCO.xlsx` e já vem com os dados dela.

- **Backend:** Node.js puro (sem `npm install`), banco SQLite embutido no próprio Node.
- **Frontend:** HTML, CSS e JavaScript sem framework, em `public/`.
- **Ao vivo:** quando alguém registra ou altera algo, as outras telas abertas (PCs do CCO, TV) atualizam sozinhas.

## 1. O que instalar (uma vez)

1. **Node.js 22.13 ou mais novo.** Baixe a versão LTS em https://nodejs.org e instale. Para conferir, abra um terminal e rode `node -v`.
2. **VS Code**, se ainda não tiver.

## 2. Abrir e rodar no VS Code

1. Descompacte o `cco-mirian.zip` numa pasta, por exemplo `C:\projetos\cco-mirian`.
2. No VS Code: **Arquivo → Abrir Pasta…** e escolha a pasta `cco-mirian`. Se ele sugerir as extensões recomendadas, aceite (REST Client e SQLite Viewer).
3. Abra o terminal: **Terminal → Novo Terminal** (ou `` Ctrl+` ``).
4. Importe os dados da planilha (só na primeira vez):
   ```
   npm run importar
   ```
5. Suba o servidor:
   ```
   npm start
   ```
   Na primeira vez, o terminal mostra a **senha do usuário `admin`**. Anote.
6. Abra **http://localhost:3000** no navegador e entre com `admin` e essa senha.
7. Clique em **Senha** (canto superior direito) e troque a senha do admin.
8. Em **Cadastros → Usuários**, crie os logins da equipe do CCO e dos gerentes.

Para desenvolver, use `npm run dev`: o servidor reinicia sozinho quando você salva um arquivo de `src/`. Também dá para apertar **F5** no VS Code e rodar com depurador (configuração "CCO: rodar servidor").

### Deixar rodando sozinho (serviço)

Para o CCO subir sozinho quando você entra no Windows, sem janela aberta e sem depender do VS Code, rode uma vez:

```
npm run servico:instalar
```

Isso cria a tarefa agendada **CCO Mirian** (aparece no Agendador de Tarefas do Windows). Se o servidor cair, ele volta sozinho em 5 segundos. Tudo o que ele imprime fica em `data/logs/`.

```
npm run servico:status     está rodando? último backup e últimas linhas do log
npm run servico:parar      para (volta no próximo login ou com servico:iniciar)
npm run servico:iniciar    inicia de novo
npm run servico:remover    para e apaga a tarefa
```

Com o serviço rodando, `npm start` e `npm run dev` avisam que a porta está em uso. Para mexer no código, rode `npm run servico:parar` antes e `npm run servico:iniciar` depois. Se você mudar a pasta do projeto de lugar, rode `npm run servico:instalar` de novo.

A tarefa sobe quando o usuário entra no Windows. Deixe o PC do CCO com login automático, sem suspender e, se for notebook, sem suspender ao fechar a tampa.

> A mensagem `.env not found. Continuing without it.` é normal. Se quiser mudar porta ou pastas, copie `.env.example` para `.env` e ajuste.

## 3. Perfis de acesso

| Perfil | O que pode fazer |
|---|---|
| Administrador | Tudo, inclusive cadastros, usuários e excluir registros |
| Operador do CCO | Registrar e editar ocorrências e defeitos de câmera, anexar prints |
| Gerente de posto | Ver só as ocorrências e câmeras dos postos dele e registrar o retorno (status, data da solução, retorno) |
| Somente leitura | Ver painel, listas e relatórios |

As permissões são conferidas no servidor, não só na tela.

### Excluir e desfazer

- Todo ✕ pede confirmação na própria tela: o primeiro clique mostra **Excluir?**, o segundo exclui. Clicar fora, Esc ou 5 segundos cancelam.
- Depois de excluir, o aviso no rodapé traz **Desfazer** por 10 segundos (o tempo para com o mouse em cima). Vale para ocorrências, câmeras, postos, tipos e prints, inclusive print tirado de uma ocorrência que já foi salva.
- Ocorrências e câmeras excluídas não somem: vão para a **Lixeira** (Cadastros, no fim da página), de onde o administrador restaura quando quiser. O registro volta com o mesmo número, e o histórico mostra quem excluiu e quem restaurou.
- Postos e tipos removidos só saem de verdade ao clicar em **Salvar cadastros**. Antes disso, recarregar a página também desfaz.
- Enquanto houver alterações não salvas em Cadastros, aparece **Alterações não salvas** ao lado do botão e um ponto na aba. **Sair** pede confirmação, e o navegador pergunta antes de fechar ou recarregar a página.

## 4. Acessar de outros computadores e da TV do CCO

O servidor aceita conexões da rede. Nos outros PCs, abra `http://IP-DA-MAQUINA:3000` (veja o IP com `ipconfig` no Windows). Se não abrir, libere a porta 3000 no Firewall do Windows da máquina que roda o servidor.

Não exponha a porta direto na internet. Para acesso de fora (gerentes nos postos), use a VPN que vocês já têm ou coloque o servidor atrás de HTTPS e mude `COOKIE_SECURE=true` no `.env`.

## 5. Onde ficam os dados

- `data/cco.db`: banco de dados (ocorrências, câmeras, cadastros, usuários).
- `data/anexos/`: prints anexados às ocorrências.
- `data/seed.json`: dados exportados da planilha, usados só pelo `npm run importar`.
- `data/backups/`: backups automáticos.
- `data/logs/`: o que o servidor imprimiu, um arquivo por mês (quando roda como serviço).

### Backup

O servidor faz backup sozinho: ao subir e depois a cada hora. Fica um arquivo por dia em `data/backups/cco-AAAA-MM-DD.db`, sempre com a versão mais recente daquele dia, e são guardados os últimos 30. Os prints anexados são copiados para `data/backups/anexos/`.

```
npm run backup                          faz um backup agora (bom antes de algo arriscado)
npm run backup -- listar                lista os backups, com quantas ocorrências cada um tem
npm run backup -- restaurar 2026-11-10  volta o banco para o backup desse dia
```

Para restaurar, pare o servidor antes (`npm run servico:parar`) e depois suba de novo (`npm run servico:iniciar`). O banco que estava em uso é guardado em `data/backups/antes-de-restaurar-...db`, para dar para voltar atrás.

O backup em `data/backups/` protege contra exclusão errada e banco corrompido, mas não contra perder o PC ou o disco. Para isso, ponha uma segunda pasta no `.env`, por exemplo uma pasta de rede ou do OneDrive: `BACKUP_COPIA=C:\Users\SEU_USUARIO\OneDrive\Backup CCO`. Lembre que esses dados têm informações de funcionários e clientes (LGPD): use uma pasta só da empresa.

Para abrir o banco dentro do VS Code, clique em `data/cco.db` (extensão SQLite Viewer). Ferramentas como Power BI também conseguem ler o SQLite.

## 6. Estrutura do projeto

```
src/
  server.js     servidor HTTP, rotas da API, atualização ao vivo, arquivos da interface
  db.js         banco SQLite, migrações (tabelas) e conversão linha <-> JSON
  auth.js       senhas, sessões e cookie
  regras.js     perfis, validações e texto do histórico
  backup.js     backup do banco e dos prints
public/
  index.html    a plataforma (abas Painel, Ocorrências, Câmeras, Relatório, Cadastros)
  login.html    tela de entrada
  css/app.css   visual (tema claro e escuro)
  js/app.js     telas, gráficos, formulários e cálculos (duração, faixa, prazo, situação)
scripts/
  importar.js   importa data/seed.json (planilha) para o banco
  usuario.js    cria usuário ou redefine senha pelo terminal
  backup.js     backup na hora, lista e restauração
  servico.js    serviço do Windows (tarefa agendada + supervisor que reinicia o servidor)
api.http        exemplos de chamadas da API para testar no VS Code (REST Client)
```

### API

| Método e rota | Para quê |
|---|---|
| `POST /api/login`, `POST /api/logout` | Entrar e sair |
| `GET /api/me`, `PUT /api/me/senha` | Usuário logado e troca de senha |
| `GET /api/estado` | Cadastros, ocorrências e câmeras visíveis para o usuário |
| `GET /api/eventos` | Avisos ao vivo de mudança (Server-Sent Events) |
| `POST /api/ocorrencias`, `PUT/DELETE /api/ocorrencias/:id` | Registrar, alterar, excluir (excluir manda para a lixeira) |
| `POST /api/cameras`, `PUT/DELETE /api/cameras/:id` | Idem para defeitos de câmera |
| `GET /api/lixeira`, `POST /api/lixeira/:id/restaurar` | Ver registros excluídos e restaurar (quem pode excluir) |
| `PUT /api/cadastros` | Salvar cadastros (admin) |
| `POST /api/anexos`, `GET /api/anexos/:id` | Enviar e ver prints |
| `GET/POST /api/usuarios`, `PUT /api/usuarios/:id` | Gerenciar usuários (admin) |

### Mudando o banco

Para acrescentar uma coluna ou tabela, adicione um novo item no fim da lista `MIGRACOES` em `src/db.js`, por exemplo:

```js
`ALTER TABLE ocorrencias ADD COLUMN placa TEXT;`
```

Ao reiniciar, o servidor aplica só as migrações novas. Nunca edite uma migração que já rodou.

## 7. Comandos úteis

```
npm start                     sobe o servidor
npm run dev                   sobe e reinicia ao salvar
npm run importar              importa a planilha (se o banco estiver vazio)
npm run importar -- --substituir   apaga ocorrências e câmeras e importa de novo
npm run usuario -- --login leila --nome "Leila" --papel operador
npm run usuario -- --login geova --nome "Geová" --papel gerente --postos "Mirian 15 Campos de Julio"
npm run usuario -- --login admin --redefinir     gera nova senha (se esquecer a do admin)
npm run servico:instalar      roda sozinho ao entrar no Windows (veja a seção 2)
npm run servico:status        está rodando?
npm run backup                backup agora (veja a seção 5)
```

## 8. Git

Crie um repositório **privado** para o projeto. O `.gitignore` já deixa de fora o banco, os anexos, o `.env` e o `data/seed.json`. Essas coisas têm dados de funcionários e clientes e não devem ir para o Git (LGPD).

## 9. Próximos passos sugeridos

1. **Subir antes do login:** hoje o serviço sobe quando o usuário entra no Windows. Para subir assim que o PC liga, mesmo sem ninguém logado, a tarefa precisa ser criada como administrador.
2. **Vídeo ao vivo:** instalar o go2rtc no servidor do CCO, apontando para os DVRs dos postos que chegam por VPN, e criar a aba de mosaicos e ronda virtual na TV. Os postos que só chegam pela cloud da Intelbras precisam de VPN para entrar nessa parte.
3. **Saúde das câmeras automática:** o servidor testar os DVRs e câmeras de tempos em tempos e abrir o defeito sozinho quando uma câmera ficar sem sinal.
4. **PostgreSQL**, quando o volume ou o número de acessos crescer. As consultas ficam concentradas em `src/db.js` e `src/server.js` para facilitar a troca.
