---
title: Équipe dev Spec / Dev / Reviewer / Doc avec Jira
description: Mettre en place quatre agents spécialisés qui implémentent automatiquement un ticket Jira — de la spec à la MR GitLab en passant par la revue et la doc.
---

Ce tutoriel met en place un pipeline de développement piloté par quatre agents NanoClaw. Tu envoies un numéro de ticket Jira ; les agents se passent le travail jusqu'à la MR GitLab approuvée et le ticket clôturé.

```
Toi (Telegram)
     │  "Implémente PROJ-42"
     ▼
┌──────────────┐   questions si besoin   ┌─────────┐
│     Spec     │ ◄─────────────────────► │   Toi   │
│  (Telegram)  │                         │(Telegram│
└──────┬───────┘
       │  spec structurée
       ▼
┌──────────────┐
│     Dev      │  lit le repo, implémente, pousse MR GitLab
└──────┬───────┘
       │  MR + spec
       ▼
┌──────────────┐
│   Reviewer   │  analyse code vs spec
└──────┬───────┘
       │ corrections → Dev (boucle max 3x)
       │ approbation ↓
┌──────────────┐
│     Doc      │  met à jour la doc, clôture Jira
└──────┬───────┘
       │  "PROJ-42 terminé"
       ▼
     Spec → Toi (Telegram)
```

---

## Prérequis

- NanoClaw installé et en cours d'exécution
- Telegram configuré et wired à un agent existant (voir [Créer un agent Telegram](/tutoriels/creer-agent-telegram/))
- OneCLI Agent Vault opérationnel (`onecli version` répond)
- Un dépôt GitLab cloné localement sur la machine host
- Un compte Jira (Cloud ou Server) avec token API
- Un Personal Access Token GitLab avec les scopes `api` et `write_repository`

---

## Étape 1 — Configurer les credentials dans OneCLI

### Token Jira

Jira Cloud utilise l'authentification Basic : `email:api_token` encodé en base64.

Depuis le dashboard OneCLI (`http://127.0.0.1:10254`) → **Secrets → New secret** :

| Champ | Valeur |
|-------|--------|
| Name | `Jira` |
| Type | `Generic` |
| Value | `votre-email@example.com:votre-api-token` |
| Host pattern | `votre-org.atlassian.net` |
| Injection | Header `Authorization: Basic base64(value)` |

Via CLI si ton instance OneCLI supporte les generic secrets avec injection config :

```bash
onecli secrets create \
  --name "Jira" \
  --type generic \
  --value "email@example.com:votre-token-jira" \
  --host-pattern "votre-org.atlassian.net"
```

### Token GitLab (API REST)

```bash
onecli secrets create \
  --name "GitLab API" \
  --type api_key \
  --value "glpat-votre-token" \
  --host-pattern "gitlab.com"
```

### Token GitLab (git over HTTPS)

Git over HTTPS utilise Basic auth avec `oauth2:<token>` :

```bash
onecli secrets create \
  --name "GitLab Git" \
  --type generic \
  --value "oauth2:glpat-votre-token" \
  --host-pattern "gitlab.com"
```

:::note
Si ton GitLab est auto-hébergé (ex : `gitlab.monentreprise.com`), remplace `gitlab.com` par ton domaine dans chaque secret.
:::

### Vérifier les secrets

```bash
onecli secrets list
```

Tu dois voir : Anthropic, Jira, GitLab API, GitLab Git.

### Assigner les secrets aux agents (après création)

On reviendra assigner les secrets aux agents après leur création. Note les IDs des secrets pour plus tard :

```bash
onecli secrets list   # noter les ids de Jira, GitLab API, GitLab Git
```

---

## Étape 2 — Créer les quatre agents

```bash
# Créer les dossiers
mkdir -p groups/spec groups/dev groups/reviewer groups/doc

# Créer les agents dans la base
ncl groups create --name "Spec" --folder "spec"
# → noter l'ID : ag-spec-XXXXX

ncl groups create --name "Dev" --folder "dev"
# → noter l'ID : ag-dev-XXXXX

ncl groups create --name "Reviewer" --folder "reviewer"
# → noter l'ID : ag-rev-XXXXX

ncl groups create --name "Doc" --folder "doc"
# → noter l'ID : ag-doc-XXXXX
```

Vérifier :

```bash
ncl groups list
```

---

## Étape 3 — Personnalités des agents

### `groups/spec/CLAUDE.local.md`

```markdown
Tu es Spec, l'agent de spécification du pipeline de développement.

## Jira
- Instance : https://VOTRE-ORG.atlassian.net
- Projet par défaut : PROJ
- Auth injectée automatiquement par OneCLI pour votre-org.atlassian.net
- Lire un ticket : GET /rest/api/3/issue/{TICKET_ID}
- Ajouter un commentaire : POST /rest/api/3/issue/{TICKET_ID}/comment  { "body": { "type": "doc", "version": 1, "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "..." }] }] } }
- Transitions disponibles : GET /rest/api/3/issue/{TICKET_ID}/transitions
- Changer de statut : POST /rest/api/3/issue/{TICKET_ID}/transitions  { "transition": { "id": "..." } }

## Workflow
1. Extraire l'ID de ticket (ex: PROJ-42) du message utilisateur
2. Lire le ticket Jira (summary, description, acceptance criteria)
3. Identifier les ambiguïtés — 1 à 3 questions ciblées, pas plus
4. Si questions : les poser à l'utilisateur et attendre. Recommencer si nécessaire.
5. Une fois la spec claire, la rédiger (format ci-dessous)
6. Envoyer la spec à Dev : <message to="dev">{spec complète}</message>
7. Commenter le ticket Jira avec la spec
8. Transitionner le ticket vers "In Progress"
9. Informer l'utilisateur : "Spec PROJ-42 prête, transmise à Dev."

## Format de spec
# Spec: {TICKET_ID} — {titre}

## Contexte
{contexte métier}

## Critères d'acceptation
- [ ] ...

## Approche technique
{description de l'implémentation proposée}

## Fichiers concernés
- `src/...`

## Contraintes
{performance, compatibilité, sécurité}

## Quand Doc te notifie que c'est terminé
Informer l'utilisateur sur Telegram : "✓ PROJ-{ID} implémenté et documenté. MR : {url}"
```

### `groups/dev/CLAUDE.local.md`

```markdown
Tu es Dev, l'agent développeur du pipeline.

## Environnement
- Dépôt Git : /workspace/repo
- Remote : https://gitlab.com/VOTRE-ORG/VOTRE-REPO.git
- ID du projet GitLab : VOTRE_PROJECT_ID  (visible dans GitLab → Settings → General)
- Auth git et API injectées par OneCLI pour gitlab.com

## Workflow
1. Lire la spec reçue de Spec (extraire le TICKET_ID)
2. Se placer sur main et créer une branche :
   git -C /workspace/repo checkout main && git -C /workspace/repo pull
   git -C /workspace/repo checkout -b feat/{TICKET_ID}
3. Implémenter les changements selon la spec
4. Committer et pousser :
   git -C /workspace/repo add -A
   git -C /workspace/repo commit -m "feat({TICKET_ID}): {titre}"
   git -C /workspace/repo push origin feat/{TICKET_ID}
5. Créer la MR GitLab :
   POST https://gitlab.com/api/v4/projects/VOTRE_PROJECT_ID/merge_requests
   Headers: Authorization: Bearer <injecté par OneCLI>
   Body: { "source_branch": "feat/{TICKET_ID}", "target_branch": "main",
           "title": "feat({TICKET_ID}): {titre}", "description": "{résumé}" }
6. Envoyer à Reviewer :
   <message to="reviewer">SPEC:\n{spec}\n\nMR: {mr_web_url}\nBranche: feat/{TICKET_ID}</message>

## En cas de retour du Reviewer
Lire les corrections, modifier le code, recommitter et pousser (pas besoin de recréer la MR).
Notifier Reviewer : <message to="reviewer">Corrections appliquées. MR: {mr_url}</message>
```

### `groups/reviewer/CLAUDE.local.md`

```markdown
Tu es Reviewer, l'agent de revue de code du pipeline.

## GitLab
- ID projet : VOTRE_PROJECT_ID
- Auth injectée par OneCLI pour gitlab.com
- Lire les diffs d'une MR : GET /api/v4/projects/{id}/merge_requests/{iid}/diffs
- Lire les changements de fichiers : GET /api/v4/projects/{id}/merge_requests/{iid}/changes
- Approuver : POST /api/v4/projects/{id}/merge_requests/{iid}/approve
- Commenter : POST /api/v4/projects/{id}/merge_requests/{iid}/notes

## Critères de revue
- Le code implémente tous les critères d'acceptation de la spec
- Pas de régressions évidentes
- Code lisible et cohérent avec le style existant
- Gestion des erreurs présente là où nécessaire

## Workflow
1. Extraire l'URL de MR et la spec du message de Dev
2. Récupérer les diffs via API GitLab
3. Analyser le code contre la spec
4. **Approbation** (tout est correct) :
   - POST /approve sur la MR
   - <message to="doc">SPEC:\n{spec}\n\nMR approuvée: {mr_web_url}</message>
5. **Corrections requises** (max 3 itérations) :
   - Lister les problèmes de façon précise et actionnable
   - Commenter la MR sur GitLab
   - <message to="dev">Corrections requises:\n{liste numérotée des problèmes}</message>

Après 3 itérations sans résolution, notifier Spec pour escalade humaine.
```

### `groups/doc/CLAUDE.local.md`

```markdown
Tu es Doc, l'agent documentation du pipeline.

## Environnement
- Dépôt Git : /workspace/repo (documentation dans /workspace/repo/docs/)
- ID projet GitLab : VOTRE_PROJECT_ID
- Auth Git et API injectées par OneCLI pour gitlab.com
- Auth Jira injectée pour votre-org.atlassian.net

## Workflow
1. Lire la spec et l'URL de MR reçues de Reviewer
2. Extraire le TICKET_ID de la spec
3. Récupérer les diffs de la MR pour comprendre les changements
4. Identifier les fichiers de doc à créer ou mettre à jour dans /workspace/repo/docs/
5. Appliquer les modifications de documentation
6. Committer sur la même branche que Dev :
   git -C /workspace/repo checkout feat/{TICKET_ID}
   git -C /workspace/repo add docs/
   git -C /workspace/repo commit -m "docs({TICKET_ID}): update documentation"
   git -C /workspace/repo push origin feat/{TICKET_ID}
7. Clôturer le ticket Jira :
   - Commenter : "Implémenté et documenté. MR : {mr_url}"
   - Transitionner vers "Done"
8. Notifier Spec :
   <message to="spec">PROJ-{ID} terminé. MR: {mr_web_url}</message>
```

---

## Étape 4 — Autoriser la communication inter-agents

```bash
# Spec → Dev
ncl destinations add \
  --agent-group-id ag-spec-XXXXX \
  --local-name dev \
  --target-type agent \
  --target-id ag-dev-XXXXX

# Dev → Reviewer
ncl destinations add \
  --agent-group-id ag-dev-XXXXX \
  --local-name reviewer \
  --target-type agent \
  --target-id ag-rev-XXXXX

# Reviewer → Dev (boucle corrections)
ncl destinations add \
  --agent-group-id ag-rev-XXXXX \
  --local-name dev \
  --target-type agent \
  --target-id ag-dev-XXXXX

# Reviewer → Doc
ncl destinations add \
  --agent-group-id ag-rev-XXXXX \
  --local-name doc \
  --target-type agent \
  --target-id ag-doc-XXXXX

# Doc → Spec (notification finale)
ncl destinations add \
  --agent-group-id ag-doc-XXXXX \
  --local-name spec \
  --target-type agent \
  --target-id ag-spec-XXXXX
```

Vérifier :

```bash
ncl destinations list
```

---

## Étape 5 — Wirer Spec à Telegram

```bash
# Récupérer l'ID du messaging group Telegram (DM avec le bot)
ncl messaging-groups list

# Créer le wiring
ncl wirings create \
  --messaging-group-id <mg-telegram-id> \
  --agent-group-id ag-spec-XXXXX \
  --engage-mode pattern \
  --engage-pattern "." \
  --session-mode shared
```

:::note
Si un autre agent (Nano) est déjà wired à ce canal avec `engage-pattern "."`, les deux répondront. Utilise un pattern discriminant pour Spec : `--engage-pattern "^spec:"` et préfixe tes demandes de `spec: PROJ-42`.
:::

---

## Étape 6 — Monter le dépôt Git dans Dev

### 6a. Autoriser le chemin dans le mount allowlist

```bash
pnpm exec tsx setup/index.ts --step mounts --force -- \
  --json '{"allowedRoots":[{"path":"/chemin/vers/ton/repo","readOnly":false}],"blockedPatterns":[],"nonMainReadOnly":false}'

systemctl --user restart nanoclaw
```

### 6b. Configurer le mount dans la config container de Dev et Doc

```bash
# Pour Dev
pnpm exec tsx scripts/q.ts data/v2.db \
  "UPDATE container_configs SET additional_mounts = '[{\"hostPath\":\"/chemin/vers/ton/repo\",\"containerPath\":\"/workspace/repo\",\"readonly\":false}]' WHERE agent_group_id = 'ag-dev-XXXXX'"

# Pour Doc (même dépôt, pour committer la documentation)
pnpm exec tsx scripts/q.ts data/v2.db \
  "UPDATE container_configs SET additional_mounts = '[{\"hostPath\":\"/chemin/vers/ton/repo\",\"containerPath\":\"/workspace/repo\",\"readonly\":false}]' WHERE agent_group_id = 'ag-doc-XXXXX'"
```

### 6c. Configurer git dans le container Dev

Pour que `git push` fonctionne via OneCLI (HTTPS), il faut que git transmette les credentials. Ajouter dans `groups/dev/CLAUDE.local.md` (section Environnement) :

```markdown
## Config git
À exécuter une fois au démarrage si absent de /workspace/repo :
git -C /workspace/repo config credential.helper ""
git -C /workspace/repo config http.sslVerify false  # uniquement si OneCLI MITM pose problème
git -C /workspace/repo config user.email "agent-dev@nanoclaw.local"
git -C /workspace/repo config user.name "Dev Agent"
```

---

## Étape 7 — Assigner les secrets aux agents

Les agents Dev, Reviewer et Doc ont besoin des credentials GitLab. Spec et Doc ont besoin de Jira.

```bash
# Trouver les IDs OneCLI des agents
onecli agents list

# Récupérer les IDs des secrets
onecli secrets list

# Assigner à Spec : Jira
AGENT_ID=$(onecli agents list | python3 -c "
import json,sys; d=json.load(sys.stdin)
print(next(a['id'] for a in d['data'] if 'ag-spec' in a.get('identifier','')))
")
onecli agents set-secret-mode --id $AGENT_ID --mode all

# Répéter pour Dev, Reviewer, Doc
# (ou passer tous en mode 'all' pour simplifier)
for AGENT in ag-spec-XXXXX ag-dev-XXXXX ag-rev-XXXXX ag-doc-XXXXX; do
  ID=$(onecli agents list | python3 -c "
import json,sys; d=json.load(sys.stdin)
a = next((a for a in d['data'] if '$AGENT' in a.get('identifier','')), None)
print(a['id'] if a else '')
")
  [ -n "$ID" ] && onecli agents set-secret-mode --id $ID --mode all
done
```

---

## Étape 8 — Tester

### Envoyer une demande à Spec

Sur Telegram, envoyer :

```
Implémente PROJ-42
```

### Flux attendu

**1. Spec lit le ticket Jira :**
> "J'ai lu PROJ-42 : *Ajouter un endpoint /health à l'API*. Quelques questions avant de commencer :
> 1. Doit-il retourner la version de l'application ?
> 2. Y a-t-il une authentification requise ?"

**2. Tu réponds :**
> "Oui pour la version, non pour l'auth."

**3. Spec produit la spec et la transmet à Dev :**
> "Spec prête, transmise à Dev."
> *(Le ticket Jira passe en "In Progress" avec la spec en commentaire.)*

**4. Dev implémente :**
> *(Crée la branche `feat/PROJ-42`, implémente, pousse, crée la MR GitLab.)*

**5. Reviewer analyse :**
> *(Si corrections : Dev reçoit un message, corrige, renvoie. Si OK : approuve la MR.)*

**6. Doc met à jour et clôture :**
> *(Commit docs sur la branche, ticket Jira → "Done".)*

**7. Tu reçois sur Telegram :**
> "✓ PROJ-42 implémenté et documenté. MR : https://gitlab.com/.../merge_requests/7"

---

## Dépannage

| Symptôme | Cause probable | Solution |
|----------|---------------|----------|
| Spec ne lit pas Jira (`401`) | Secret Jira non assigné | `onecli agents secrets --id <spec-id>` |
| Dev ne peut pas pousser | Credentials GitLab manquants | Vérifier `onecli agents set-secret-mode` |
| `git push` refusé (SSL) | OneCLI MITM non accepté par git | Ajouter `GIT_SSL_CAINFO=/tmp/onecli-combined-ca.pem` dans la config container via DB |
| Le dépôt n'est pas visible dans Dev | Mount non autorisé | Vérifier `~/.config/nanoclaw/mount-allowlist.json` |
| Spec ne reçoit pas la notification de Doc | Destination `spec` manquante sur Doc | `ncl destinations add` pour Doc → Spec |
| Reviewer boucle indéfiniment | Dev ne corrige pas bien | Reviewer escalade à Spec après 3 itérations (voir CLAUDE.local.md Reviewer) |

---

## Variante — Création dynamique avec `create_agent`

Si tu veux éviter la configuration manuelle et laisser Spec créer le pipeline à la demande, un agent orchestrateur avec `cli_scope=global` peut créer Dev, Reviewer et Doc à la volée :

```
mcp__nanoclaw__create_agent({ name: "Dev-PROJ42", instructions: "..." })
```

Cette approche crée un pipeline éphémère par ticket, au prix d'un démarrage plus lent (création des containers). Elle est utile si les tickets sont rares ou si les besoins varient beaucoup d'un ticket à l'autre.

Le pipeline statique (ce tutoriel) est préférable pour un usage régulier : les containers sont déjà connus, les destinations préconfigurées, et les personnalités stables.
