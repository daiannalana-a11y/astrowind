# Monitoramentos (app profissional)

App de campo para piezômetros, poços, cava e ETE. Funciona **sem depender do Claude**: PWA instalável + **APK Android** (Capacitor), com **banco externo (Supabase/PostgreSQL)**, uso **offline** e sincronização automática.

## Recursos
- Login por e-mail/senha; papéis **campo**, **gestor**, **admin**; acesso por unidade (RLS no banco).
- Multi-unidade; cadastro editável de unidades e pontos.
- Registro offline (fila local + envio quando há rede); fotos com envio ao Storage.
- Alertas: limites por ponto (nível, vazão m³/dia, h/dia, dias sem leitura), avisos antes de salvar.
- Dashboard, histórico, exportação CSV/Excel e **relatório PDF técnico** (capa, alertas, gráficos, resumo, leituras, assinatura).
- Trilha de auditoria gravada por triggers no servidor; exclusão lógica.
- Sem servidor configurado, roda em **modo local** (dados só no aparelho).
- Removido: leitura de foto por IA (dependia do Claude).

## 1. Banco de dados
1. Crie um projeto em supabase.com.
2. SQL Editor → cole e execute `supabase/schema.sql`.
3. Authentication → Users → crie o primeiro usuário (vira **admin**). Os demais entram como "campo"; ajuste em Cadastro → Usuários.
4. Copie *Project URL* e *anon key* (Settings → API).

## 2. Rodar / instalar
```bash
cd apps/monitoramento
cp .env.example .env   # preencha URL e chave
npm install
npm run dev            # desenvolvimento
npm test               # testes de domínio
npm run build          # gera dist/ (PWA)
```
Sem `.env`, a tela de login permite informar servidor e chave no próprio app.

## 3. APK
**Pelo GitHub (sem instalar nada):** em Settings → Secrets, crie `SUPABASE_URL` e `SUPABASE_ANON_KEY`; rode o workflow *Monitoramentos APK* e baixe `app-debug.apk` nos artefatos. Instale no celular (permitir fontes desconhecidas).

**Local** (JDK 21 + Android SDK): `npm run android:debug` → `android/app/build/outputs/apk/debug/`.
Para publicar na Play Store, gere um keystore e use `npm run android:release` com assinatura.

## Estrutura
`src/domain` regras e cálculos · `src/data` IndexedDB, sincronização, Supabase · `src/ui` telas · `src/export` CSV/XLSX/PDF · `supabase/schema.sql` banco e segurança.
