# Up! Fluxo

Quadro de produção de conteúdo da Up! Digital — mesma estrutura de colunas e
checklist do fluxo Trello, mas rodando como site próprio, com login por
e-mail, banco de dados e upload de arquivo.

Este projeto usa duas peças:
- **Vercel** hospeda o site (o código que você está vendo aqui).
- **Supabase** guarda os dados, cuida do login de cada pessoa e armazena os
  arquivos anexados. É gratuito no seu tamanho de uso.

Nenhuma das duas guarda seu cartão de crédito no plano gratuito.

---

## Passo 1 — Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e entre com sua conta (ou crie uma).
2. Clique em **New project**. Dê um nome (ex.: `up-fluxo`), escolha uma senha
   forte para o banco (guarde-a, só é usada internamente) e a região mais
   próxima (South America).
3. Espere o projeto ser criado (1–2 minutos).
4. No menu lateral, vá em **SQL Editor** → **New query**.
5. Abra o arquivo `supabase/schema.sql` deste projeto, copie todo o conteúdo,
   cole no editor do Supabase e clique em **Run**.
   - Isso cria a tabela de peças, as regras de segurança (só quem está
     logado acessa) e o espaço de arquivos.
   - Depois, faça o mesmo com `supabase/002_calendario.sql` (cria os
     clientes e o calendário de temas de cada um) e com
     `supabase/003_permissoes.sql` (usuários, papéis e permissões).
6. Vá em **Storage** no menu lateral e confirme que o bucket **anexos** foi
   criado (o script do passo 5 já cria; se não aparecer, crie manualmente com
   esse nome exato, marcado como **privado**).
7. Vá em **Project Settings** (ícone de engrenagem) → **API**. Copie dois
   valores, você vai usar no Passo 3:
   - **Project URL**
   - **anon public key**

### Desligar cadastro livre (importante)

Por padrão o Supabase deixaria qualquer e-mail se cadastrar sozinho. Você
quer o contrário: só entra quem você convidar.

1. **Authentication** → **Providers** → **Email**.
2. Desmarque **"Allow new users to sign up"** (deixe só habilitado o login,
   não o cadastro automático).
3. Salve.

### Convidando sua equipe e seus clientes

1. **Authentication** → **Users** → **Add user** → **Invite user**.
2. Digite o e-mail da pessoa (funcionário ou cliente) e envie.
3. Ela recebe um e-mail de convite; a partir daí, ela entra no site normal
   através da tela de login (é enviado um "link mágico" por e-mail, sem
   precisar de senha).
4. Repita para cada pessoa que deve ter acesso. Não existe hoje distinção de
   permissão entre "equipe" e "cliente" dentro do app — todo mundo que você
   convidar pode ver e editar todas as peças do quadro. Se mais adiante você
   quiser limitar o que cada cliente vê (só as peças dele, por exemplo), me
   avise — dá para adicionar isso depois.

---

## Passo 2 — Colocar o código no GitHub

1. Crie um repositório novo e vazio no GitHub (ex.: `up-fluxo`).
2. Na pasta deste projeto, rode:
   ```bash
   git init
   git add .
   git commit -m "Up! Fluxo — versão inicial"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/up-fluxo.git
   git push -u origin main
   ```

---

## Passo 3 — Publicar no Vercel

1. Acesse [vercel.com](https://vercel.com) e entre com sua conta (dá para
   entrar direto com o GitHub).
2. Clique em **Add New** → **Project** e escolha o repositório `up-fluxo`
   que você acabou de subir.
3. Antes de clicar em Deploy, abra **Environment Variables** e adicione as
   duas variáveis que você copiou do Supabase no Passo 1:
   - `NEXT_PUBLIC_SUPABASE_URL` → a Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → a anon public key (ou a publishable key)
   - `SUPABASE_SECRET_KEY` → a secret key (fica só no servidor; é o que permite
     ao administrador convidar e remover usuários pela tela "Usuários e permissões")
4. Clique em **Deploy**. Em 1–2 minutos o Vercel te dá um link
   (`algo.vercel.app`) já no ar.
5. (Opcional) Em **Settings** → **Domains**, você pode apontar um domínio
   próprio (ex. `fluxo.updigital.com.br`) para essa mesma aplicação.

Pronto: esse link já é o site final, funcionando para qualquer pessoa que
você tiver convidado no Supabase.

---

## Rodando no seu computador antes de publicar (opcional)

Só necessário se você quiser testar mudanças antes de subir:

```bash
npm install
cp .env.local.example .env.local   # depois edite com suas chaves do Supabase
npm run dev
```

Abra `http://localhost:3000`.

---

## O que fazer se quiser mudar algo depois

Qualquer alteração no código, texto ou nas colunas do fluxo é feita nos
arquivos deste projeto (o coração do quadro está em `lib/pipeline.js` para as
colunas/checklist, e `components/Board.js` para o comportamento). Depois de
editar, é só `git push` de novo — o Vercel publica a nova versão sozinho a
cada push na branch `main`.
