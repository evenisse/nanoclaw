---
title: Créer un agent et le connecter à Telegram
description: Créez votre premier agent NanoClaw ("Veille") et rendez-le accessible via Telegram en quelques minutes.
---

Ce tutoriel crée **Veille**, un assistant de recherche personnel disponible sur Telegram.
Son rôle : répondre à des questions, faire des recherches web, résumer des articles ou des actualités.

---

## Prérequis

- NanoClaw installé et en cours d'exécution
- Telegram configuré (`/add-telegram` déjà effectué, `TELEGRAM_BOT_TOKEN` dans `.env`)
- Votre bot Telegram existant (ou un nouveau bot créé via @BotFather)

Si Telegram n'est pas encore installé, consultez [Ajouter un canal](/guides/ajouter-canal/) avant de continuer.

---

## Étape 1 — Créer le dossier de l'agent

Chaque agent a son propre dossier sous `groups/`. Créer le dossier manuellement :

```bash
mkdir -p groups/veille
```

Créer le fichier de personnalité `groups/veille/CLAUDE.local.md` :

:::note
`CLAUDE.local.md` est chargé automatiquement au démarrage du container comme couche de personnalité propre à cet agent, en complément du `CLAUDE.md` composé par le host. C'est le fichier à éditer pour modifier les instructions sans reconstruire l'image — les changements sont pris en compte au prochain redémarrage du container.
:::

```markdown
Tu es Veille, un assistant de recherche personnel.

Ton rôle :
- Répondre à des questions factuelles avec précision
- Rechercher et résumer des articles ou actualités à la demande
- Synthétiser des informations provenant de plusieurs sources
- Signaler clairement quand tu n'es pas certain d'une information

Style : concis et direct. Pas de formules de politesse inutiles.
Langue : réponds toujours dans la langue de l'utilisateur.
```

---

## Étape 2 — Créer l'agent dans la base

```bash
ncl groups create --name "Veille" --folder "veille"
```

Noter l'ID retourné (format `ag-XXXXX-XXXXX`).

Vérifier que l'agent est bien créé :

```bash
ncl groups list
```

---

## Étape 3 — Configurer le container

Par défaut, l'agent hérite de la config globale. Pour personnaliser :

```bash
# Vérifier la config actuelle
ncl groups config get --id <ag-id>

# Optionnel : changer le modèle
ncl groups config update --id <ag-id> --model claude-opus-4-8
```

> Le modèle par défaut (claude-sonnet-4-6) convient bien pour un assistant de veille.

---

## Étape 4 — Envoyer un premier message sur Telegram pour créer le messaging group

Le messaging group Telegram est créé **automatiquement** au premier message reçu.

1. Dans Telegram, chercher le username de votre bot (celui défini lors de la création via @BotFather)
2. Ouvrir un **chat privé (DM)** avec le bot et lui envoyer n'importe quel message
3. Le message sera rejeté (politique `strict` par défaut) mais le messaging group sera créé

:::note
Un bot Telegram peut aussi être ajouté à un groupe ou un canal — dans ce cas, l'ID de chat est négatif et `is_group=1` est automatiquement détecté. Pour ce tutoriel, on utilise un DM privé (cas le plus courant pour un assistant personnel).
:::

Récupérer son ID :

```bash
ncl messaging-groups list
```

Noter l'ID du messaging group correspondant à votre chat Telegram (format `mg-XXXXX-XXXXX`).

> Si le messaging group n'apparaît pas, vérifier les logs : `logs/nanoclaw.error.log`

---

## Étape 5 — Wirer l'agent au canal Telegram

```bash
ncl wirings create \
  --messaging-group-id <mg-id> \
  --agent-group-id <ag-id> \
  --engage-mode pattern \
  --engage-pattern "."
```

L'option `--engage-pattern "."` signifie que l'agent répond à tous les messages.

Vérifier le wiring :

```bash
ncl wirings list
```

---

## Étape 6 — Tester

Envoyer un message à votre bot Telegram :

```
Résume les dernières actualités sur l'IA
```

L'agent devrait répondre en quelques secondes. Si ce n'est pas le cas, consulter la section dépannage ci-dessous.

---

## Personnalisation

### Restreindre l'accès à certains utilisateurs

Par défaut, n'importe qui peut écrire au bot. Pour restreindre aux membres connus :

```bash
# Restreindre le wiring aux membres connus
ncl wirings update --id <wiring-id> --sender-scope known

# Ajouter un utilisateur autorisé (son ID est visible dans les logs au premier message)
ncl members add --user "telegram:<username>" --group <ag-id>
```

### Modifier la personnalité après création

Éditer `groups/veille/CLAUDE.local.md` puis redémarrer l'agent :

```bash
ncl groups restart --id <ag-id> --message "Ta personnalité a été mise à jour."
```

### Ajouter un outil (ex : recherche web via MCP)

```bash
ncl groups config add-mcp-server \
  --id <ag-id> \
  --name "brave-search" \
  --command "npx" \
  --args '["@modelcontextprotocol/server-brave-search"]' \
  --env '{"BRAVE_API_KEY": "votre-clé"}'

# Redémarrer pour prendre en compte le nouveau serveur MCP
ncl groups restart --id <ag-id> --rebuild
```

---

## Dépannage

| Symptôme | Cause probable | Solution |
|----------|---------------|----------|
| Le messaging group n'apparaît pas après le premier message | Telegram non configuré | Vérifier `TELEGRAM_BOT_TOKEN` dans `.env` et `logs/nanoclaw.error.log` |
| L'agent ne répond pas après le wiring | Container pas encore démarré | Envoyer un second message ; le container démarre au premier message reçu |
| Réponse `401 Unauthorized` dans les logs | Credentials OneCLI non assignés | Vérifier `onecli agents list` et assigner les secrets nécessaires |
| L'agent répond à tous les utilisateurs indésirables | `sender_scope=all` par défaut | Passer à `known` et ajouter les membres autorisés |

---

## Récapitulatif des commandes

```bash
# 1. Créer le dossier et la personnalité
mkdir -p groups/veille
# (éditer groups/veille/CLAUDE.local.md)

# 2. Créer l'agent
ncl groups create --name "Veille" --folder "veille"

# 3. Envoyer un message Telegram pour créer le messaging group
# (via Telegram directement)

# 4. Récupérer les IDs
ncl groups list
ncl messaging-groups list

# 5. Créer le wiring
ncl wirings create \
  --messaging-group-id <mg-id> \
  --agent-group-id <ag-id> \
  --engage-mode pattern \
  --engage-pattern "."
```
