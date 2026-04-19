# Protéger les credentials dans un skill

Quand un skill doit accéder à une base de données externe ou une API tierce, trois approches sont disponibles. Chacune a un niveau de sécurité différent et une complexité différente.

---

## Comparatif rapide

| Approche | Sécurité | Isolation par agent | Fonctionne avec |
|----------|----------|---------------------|-----------------|
| OneCLI vault | ✅ Élevée | ✅ Oui (mode sélectif) | APIs HTTP uniquement |
| `container_config` en DB | ⚠️ Moyenne (clair dans v2.db) | ✅ Oui (par agent_group) | Connexions DB natives + HTTP |
| `.env` | ⚠️ Faible | ❌ Partagé entre agents | Tout |
| Approval flow | ✅ Élevée | ✅ Indirectement | Complément aux autres |

> **Important :** OneCLI est un proxy HTTP — il intercepte des requêtes HTTPS sortantes et injecte des en-têtes. Il est **incompatible** avec les protocoles binaires natifs (PostgreSQL wire protocol, MySQL, MongoDB, Redis, etc.). Pour une connexion DB directe, utilise le Cas 2 ou place une couche HTTP devant ta DB (PostgREST, Hasura, PocketBase…).

---

## Cas 1 : OneCLI vault (APIs HTTP uniquement)

OneCLI est un proxy de credentials. Quand NanoClaw spawn un container, il appelle `onecli.applyContainerConfig()` qui injecte dans le container les secrets auxquels l'agent a accès. Le container ne connaît jamais la valeur brute — OneCLI intercepte les requêtes HTTPS sortantes et injecte l'en-tête `Authorization` automatiquement.

**Cas d'usage :** APIs REST, GraphQL, PostgREST, Hasura, Supabase (via HTTP), etc.
**Pas adapté à :** connexions PostgreSQL, MySQL, MongoDB, Redis directes (protocole binaire non HTTP).

Si ta DB expose une API HTTP (ex: PostgREST devant PostgreSQL), OneCLI est la solution idéale — isolation par agent, credentials jamais exposés dans les variables d'environnement.

**Isoler un secret à un agent précis :**

Par défaut un agent peut être en mode `all` (accès à tous les secrets) ou `selective` (uniquement les secrets explicitement assignés). Le mode `selective` + `agents set-secrets` est la bonne approche pour limiter l'accès.

### Exemple complet (PostgREST devant PostgreSQL)

**Étape 1 — Créer le secret dans OneCLI**

```bash
# Créer un secret de type générique pour une API PostgREST
onecli secrets create \
  --name "PostgREST Mon Projet" \
  --type generic \
  --value "mon-token-super-secret" \
  --host-pattern "api.monprojet.internal"

# Noter l'ID retourné, ex: "a1b2c3d4-..."
```

OneCLI injectera automatiquement `Authorization: Bearer mon-token-super-secret` sur toutes les requêtes HTTPS vers `api.monprojet.internal`.

**Étape 2 — Créer (ou identifier) l'agent OneCLI correspondant à ton agent NanoClaw**

NanoClaw crée automatiquement un agent OneCLI lors du premier spawn d'un `agent_group`. Son identifiant suit le pattern `ag-<timestamp>-<random>`. Pour le retrouver :

```bash
onecli agents list
# Repérer l'agent dont le "name" correspond au nom de ton agent_group NanoClaw
```

**Étape 3 — Passer l'agent en mode sélectif et assigner le secret**

```bash
# Passer en mode sélectif (n'accède qu'aux secrets explicitement listés)
onecli agents set-secret-mode --id <AGENT_ID> --mode selective

# Assigner le secret à cet agent uniquement
onecli agents set-secrets --id <AGENT_ID> --secret-ids <SECRET_ID>

# Vérifier
onecli agents secrets --id <AGENT_ID>
```

**Étape 4 — Écrire le skill**

Le skill fait simplement ses requêtes HTTP normalement — OneCLI est transparent :

```typescript
// groups/mon-agent/skills/db-query/query.ts
export async function queryPostgREST(table: string, filter?: string) {
  const url = `https://api.monprojet.internal/${table}${filter ? `?${filter}` : ''}`;

  // Pas de token ici — OneCLI l'injecte automatiquement dans l'en-tête
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PostgREST error: ${res.status}`);
  return res.json();
}
```

Le `SKILL.md` décrit à Claude quand appeler cette fonction.

---

## Cas 2 : `container.json` par agent_group (connexions DB natives)

La config container n'est **pas** dans la DB — c'est un fichier JSON par agent :

```
groups/<folder>/container.json
```

Structure complète (tous les champs sont optionnels) :

```json
{
  "mcpServers": {
    "nom-serveur": {
      "command": "npx",
      "args": ["-y", "@mon/mcp-server"],
      "env": { "CLE": "valeur" }
    }
  },
  "packages": {
    "apt": ["libpq-dev"],
    "npm": ["pg"]
  },
  "additionalMounts": [
    {
      "hostPath": "/chemin/host",
      "containerPath": "/workspace/data",
      "readonly": true
    }
  ]
}
```

**Il n'y a pas de champ `env` top-level** pour le container. Pour passer des credentials à un agent spécifique, trois sous-options :

### Sous-option A — Via un serveur MCP (isolation par agent ✅)

Si ton skill est implémenté comme un serveur MCP, les credentials vont dans `mcpServers[*].env`. Chaque agent a son propre `container.json` → isolation garantie.

```json
{
  "mcpServers": {
    "db-proxy": {
      "command": "node",
      "args": ["/workspace/skills/db-proxy/server.js"],
      "env": {
        "DB_HOST": "db.monprojet.internal",
        "DB_USER": "app_user",
        "DB_PASSWORD": "monmotdepasse123",
        "DB_NAME": "mydb"
      }
    }
  }
}
```

Le serveur MCP tourne dans le container et expose des tools à Claude. Les credentials ne transitent jamais dans le contexte de la conversation.

### Sous-option B — Mount d'un fichier de secrets (isolation par agent ✅)

Stocker les credentials dans un fichier sur le host, le monter en readonly dans le container :

```json
{
  "additionalMounts": [
    {
      "hostPath": "/home/user/.secrets/mon-agent-db.json",
      "containerPath": "/run/secrets/db.json",
      "readonly": true
    }
  ]
}
```

Le skill lit `/run/secrets/db.json` au runtime. Le fichier n'est pas dans le repo.

### Sous-option C — `.env` (partagé, pas d'isolation ❌)

Pour du dev local uniquement :

```bash
# .env à la racine de NanoClaw
DB_PASSWORD=monmotdepasse123
DB_HOST=db.monprojet.internal
```

Tous les containers de tous les agents reçoivent ces variables. Aucune isolation.

**Étape 3 — Écrire le skill**

```typescript
// groups/mon-agent/skills/db-query/query.ts
import { createClient } from 'pg'; // ou mysql2, etc.

export function getDbClient() {
  return createClient({
    host: process.env.MY_DB_HOST,
    user: process.env.MY_DB_USER,
    password: process.env.MY_DB_PASSWORD,
    database: 'mydb',
  });
}

export async function runQuery(sql: string) {
  const client = getDbClient();
  await client.connect();
  try {
    return await client.query(sql);
  } finally {
    await client.end();
  }
}
```

---

## Cas 3 : Approval flow pour actions critiques

Si l'action est irréversible (DELETE, UPDATE, écriture en prod), tu peux forcer une approbation humaine avant que l'agent l'exécute. L'agent envoie une demande d'approbation via le système `pending_approvals`, et l'action n'est réalisée qu'après confirmation.

Ce cas ne protège pas le credential lui-même — il protège contre une **action non souhaitée** avec ce credential. À combiner avec l'un des deux cas précédents.

### Exemple complet

**Étape 1 — Le skill demande une approbation avant d'écrire**

Dans le `SKILL.md` du skill, instruis Claude à toujours demander confirmation avant toute écriture :

```markdown
# DB Write Skill

## Instructions

- Pour toute opération SELECT : exécute directement.
- Pour toute opération INSERT, UPDATE, DELETE : demande TOUJOURS une confirmation
  explicite à l'utilisateur avant d'appeler la fonction d'écriture.
- Format de confirmation : "Je vais exécuter : `<SQL>`. Confirmes-tu ? (oui/non)"
- N'exécute PAS si la réponse n'est pas clairement affirmative.
```

**Étape 2 — Utiliser le système d'approbation natif (optionnel, pour des flows plus formels)**

NanoClaw a un système `pending_approvals` dans la DB centrale. L'agent peut émettre une `system_action` de type `request_approval` via `outbound.db`. Le host la traite dans `src/modules/approvals/request-approval.ts` et notifie un admin.

Un skill peut déclencher ce flow en incluant une destination spéciale dans son message de réponse :

```typescript
// Dans un MCP tool ou une action système émise par l'agent-runner
// outbound.db — messages_out avec system_action
{
  type: 'system_action',
  action: 'request_approval',
  payload: {
    description: 'Supprimer les entrées archivées de la table `orders`',
    sql: 'DELETE FROM orders WHERE status = \'archived\' AND created_at < NOW() - INTERVAL 1 YEAR',
    requester: sessionId,
  }
}
```

L'approbateur reçoit la demande sur son canal, répond `approve` ou `deny`, et le host exécute ou annule.

Voir `src/modules/approvals/` pour l'implémentation complète.

---

## Quelle approche choisir ?

```
Credential de prod / haute sensibilité ?
  └─► OneCLI vault (Cas 1) + mode sélectif par agent

Dev local / token peu sensible ?
  └─► .env (Cas 2)

Action irréversible (DELETE, écriture en prod) ?
  └─► Cas 1 ou 2 pour le credential + Cas 3 pour l'action
```
