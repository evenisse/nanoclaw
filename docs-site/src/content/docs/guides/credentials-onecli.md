---
title: Gérer les credentials OneCLI
description: Ajouter des secrets dans le vault OneCLI, les assigner à un agent, et configurer les approbations.
---

OneCLI est le gestionnaire de credentials de NanoClaw. Il s'interpose en proxy HTTPS transparent entre les containers agents et les APIs externes, et injecte les credentials stockés dans le vault à la volée. Les agents ne voient jamais les clés brutes.

## Fonctionnement

```
Container agent → requête HTTPS → proxy OneCLI → API externe
                                        ↑
                              injecte le secret
                              (Authorization: Bearer ...)
```

Chaque secret dans le vault a un **host pattern** (ex : `api.openai.com`). Quand un agent fait une requête vers ce host, le proxy injecte le secret correspondant automatiquement. Si aucun secret ne correspond, la requête passe sans modification.

---

## Secrets actuels

```bash
onecli secrets list
```

Sur cette installation :

| Nom | Type | Host pattern |
|-----|------|-------------|
| Anthropic | anthropic | `api.anthropic.com` |

---

## Ajouter un secret dans le vault

```bash
onecli secrets create \
  --name "Nom affiché"   \
  --type <type>          \
  --value <valeur>       \
  --host-pattern <host>
```

Types courants :

| Type | Usage |
|------|-------|
| `anthropic` | Clé API Anthropic ou token Claude |
| `api_key` | Clé API générique (OpenAI, etc.) |
| `generic` | Autre credential (OAuth token, bearer token…) |

### Exemples

```bash
# OpenAI
onecli secrets create --name OpenAI --type api_key \
  --value sk-... --host-pattern api.openai.com

# GitHub (REST API)
onecli secrets create --name GitHub --type api_key \
  --value ghp_... --host-pattern api.github.com

# Service custom
onecli secrets create --name MonAPI --type generic \
  --value <token> --host-pattern api.monservice.com
```

:::note
GitHub utilise deux hosts distincts : `api.github.com` pour l'API REST (Bearer) et `github.com` pour git over HTTPS (Basic). Ce sont deux secrets séparés avec des formats d'injection différents.
:::

---

## Assigner des secrets à un agent

Chaque agent créé par NanoClaw démarre en mode **`selective`** : aucun secret ne lui est assigné par défaut, même si le vault en contient. Il faut explicitement lui donner accès.

### Mode `all` — accès à tous les secrets

L'agent reçoit automatiquement tous les secrets dont le host pattern correspond à ses requêtes sortantes.

```bash
# Trouver l'id de l'agent (identifier = agent_group_id)
onecli agents list

# Passer en mode all
onecli agents set-secret-mode --id <agent-id> --mode all
```

Aucun redémarrage nécessaire — le proxy résout les secrets à chaque requête.

### Mode `selective` — assigner des secrets précis

```bash
# Lister les secrets disponibles (noter les ids)
onecli secrets list

# Assigner en faisant un merge safe (set-secrets remplace, ne pas écraser)
AGENT_ID=<agent-id>
CURRENT=$(onecli agents secrets --id "$AGENT_ID" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(','.join(s['id'] for s in d['data']))")
onecli agents set-secrets --id "$AGENT_ID" \
  --secret-ids "${CURRENT:+$CURRENT,}<nouveau-secret-id>"
```

:::caution
`set-secrets` **remplace** la liste entière. Toujours lire les secrets actuels et fusionner avant d'appeler, sinon vous révoqueriez les accès existants.
:::

### Vérifier les secrets d'un agent

```bash
onecli agents secrets --id <agent-id>
```

---

## État actuel des agents

```bash
onecli agents list
```

Sur cette installation :

| Agent | Mode | Secrets assignés |
|-------|------|-----------------|
| Nano | `all` | Tous (Anthropic, …) |
| Terminal Agent | `all` | Tous (Anthropic, …) |

---

## Interface web

Toutes ces opérations sont également disponibles dans l'interface web OneCLI :

```
http://127.0.0.1:10254
```

L'interface permet aussi de configurer des **règles d'approbation** (approval policies) sur un secret — pour qu'une utilisation de credential par un agent déclenche une demande de confirmation à un admin avant d'être exécutée. Cette fonctionnalité n'est pas encore exposée dans la CLI OneCLI et doit être configurée depuis l'interface web.

---

## Symptôme courant : `401 Unauthorized`

Si un agent reçoit une `401` sur une API dont les credentials sont dans le vault :

1. Vérifier que le secret existe : `onecli secrets list`
2. Vérifier que l'agent est en mode `all` ou que le secret lui est assigné : `onecli agents secrets --id <id>`
3. Vérifier que le host pattern du secret correspond exactement au host appelé
4. Consulter les logs du proxy : `docker logs onecli 2>&1 | grep <host>`

Le log affiche `injections_applied=1` si un secret a été injecté, `injections_applied=0` sinon.
