---
title: Référence ncl — Commandes essentielles
description: Toutes les commandes du CLI ncl classées par ressource, avec les options et les opérations nécessitant une approbation.
---

`ncl` est le CLI d'administration de NanoClaw. Il interroge et modifie la base centrale (`data/v2.db`).
Il doit être lancé depuis le host (le service doit tourner).

```
ncl <ressource> <verbe> [--flags]
ncl <ressource> help
ncl help
```

Les opérations marquées **[approbation]** déclenchent une demande d'approbation admin avant d'être appliquées.

:::note
L'approbation ne s'applique qu'aux appels `ncl` depuis **l'intérieur d'un container** (un agent qui modifie sa propre config ou déclenche une action sensible). Depuis le terminal host, toutes les commandes s'exécutent immédiatement sans approbation.
:::

---

## Agents (`groups`)

| Commande | Description |
|----------|-------------|
| `ncl groups list` | Liste tous les agents |
| `ncl groups get --id <id>` | Détail d'un agent |
| `ncl groups create --name <nom> --folder <dossier>` | Crée un agent **[approbation]** |
| `ncl groups update --id <id> --name <nom>` | Renomme un agent **[approbation]** |
| `ncl groups delete --id <id>` | Supprime un agent et toutes ses dépendances (sessions, wirings, destinations, approbations en attente, membres, rôles, config container) en une transaction. **[approbation]** |
| `ncl groups restart --id <id>` | Redémarre le container (au prochain message) **[approbation]** |
| `ncl groups restart --id <id> --rebuild` | Redémarre + rebuild l'image (requis après changement de packages) **[approbation]** |
| `ncl groups restart --id <id> --message "texte"` | Redémarre et envoie une instruction au container au démarrage **[approbation]** |

### Config container

| Commande | Description |
|----------|-------------|
| `ncl groups config get --id <id>` | Affiche la config container (modèle, MCP, packages…) |
| `ncl groups config update --id <id> --model <modèle>` | Change le modèle Claude **[approbation]** |
| `ncl groups config update --id <id> --cli-scope <disabled\|group\|global>` | Contrôle l'accès ncl depuis le container **[approbation]** |
| `ncl groups config update --id <id> --set-env KEY=VALUE` | Définit une variable d'environnement injectée dans le container **[approbation]** |
| `ncl groups config update --id <id> --unset-env KEY` | Supprime une variable d'environnement du container **[approbation]** |
| `ncl groups config add-mcp-server --id <id> --name <nom> --command <cmd>` | Ajoute un serveur MCP **[approbation]** |
| `ncl groups config remove-mcp-server --id <id> --name <nom>` | Retire un serveur MCP **[approbation]** |
| `ncl groups config add-package --id <id> --apt <pkg>` | Ajoute un package apt **[approbation]** |
| `ncl groups config add-package --id <id> --npm <pkg>` | Ajoute un package npm **[approbation]** |
| `ncl groups config remove-package --id <id> --apt <pkg>` | Retire un package **[approbation]** |

> Les changements de config prennent effet au prochain `ncl groups restart`.
> Les changements de packages nécessitent `--rebuild`.

---

## Canaux (`messaging-groups`)

Un messaging group représente un canal sur une plateforme (DM Telegram, channel Slack, etc.).

| Commande | Description |
|----------|-------------|
| `ncl messaging-groups list` | Liste tous les canaux |
| `ncl messaging-groups get --id <id>` | Détail d'un canal |
| `ncl messaging-groups update --id <id> --unknown-sender-policy <valeur>` | Politique nouveaux expéditeurs **[approbation]** |

**Valeurs `unknown_sender_policy` :**

| Valeur | Comportement |
|--------|-------------|
| `strict` | Messages inconnus ignorés silencieusement |
| `request_approval` | Envoie une demande d'approbation à l'admin |
| `public` | Tout le monde peut écrire |

---

## Wirings (`wirings`)

Un wiring connecte un canal à un agent. C'est ici que se configure le comportement de déclenchement.

| Commande | Description |
|----------|-------------|
| `ncl wirings list` | Liste tous les wirings |
| `ncl wirings get --id <id>` | Détail d'un wiring |
| `ncl wirings create --messaging-group-id <id> --agent-group-id <id>` | Crée un wiring **[approbation]** |
| `ncl wirings update --id <id> --engage-mode <mode>` | Change le mode de déclenchement **[approbation]** |
| `ncl wirings update --id <id> --engage-mode pattern --engage-pattern "^@nano"` | Pattern regex **[approbation]** |
| `ncl wirings delete --id <id>` | Supprime un wiring **[approbation]** |

### Modes `engage_mode`

| Mode | L'agent répond quand… |
|------|----------------------|
| `mention` | Il est @mentionné sur la plateforme |
| `mention-sticky` | Il est @mentionné (puis répond à tout le thread automatiquement) |
| `pattern` | Le message correspond à `engage_pattern` (regex). `"."` = toujours |

### Modes `session_mode`

| Mode | Comportement |
|------|-------------|
| `shared` | Une session par (agent, canal) |
| `per-thread` | Une session par thread/sujet |
| `agent-shared` | Une session unique pour tous les canaux de l'agent |

### Autres options de wiring

| Option | Valeurs | Description |
|--------|---------|-------------|
| `sender_scope` | `all` / `known` | `known` = membres ou admins du groupe uniquement |
| `ignored_message_policy` | `drop` / `accumulate` | `accumulate` stocke les messages non déclencheurs comme contexte |

---

## Utilisateurs et rôles

### Utilisateurs (`users`)

| Commande | Description |
|----------|-------------|
| `ncl users list` | Liste tous les utilisateurs |
| `ncl users get --id <id>` | Détail d'un utilisateur |

Les IDs utilisateur ont la forme `<canal>:<handle>` (ex: `telegram:johndoe`).

### Rôles (`roles`)

| Commande | Description |
|----------|-------------|
| `ncl roles list` | Liste tous les rôles |
| `ncl roles grant --user <id> --role admin` | Donne le rôle admin global **[approbation]** |
| `ncl roles grant --user <id> --role admin --group <group-id>` | Admin scopé à un agent **[approbation]** |
| `ncl roles revoke --user <id> --role admin` | Retire un rôle **[approbation]** |

**Rôles disponibles :**
- `owner` — contrôle total, toujours global
- `admin` — peut gérer les agents et approuver des actions (global ou scopé à un agent)

### Membres (`members`)

Les membres ont accès à un agent sans avoir de rôle admin. Utilisé quand `sender_scope=known`.

| Commande | Description |
|----------|-------------|
| `ncl members list` | Liste les membres |
| `ncl members add --user <id> --group <group-id>` | Ajoute un membre **[approbation]** |
| `ncl members remove --user <id> --group <group-id>` | Retire un membre **[approbation]** |

---

## Sessions (`sessions`)

Les sessions sont créées automatiquement par le routeur. Lecture seule.

| Commande | Description |
|----------|-------------|
| `ncl sessions list` | Liste les sessions actives |
| `ncl sessions get --id <id>` | Détail d'une session (statut container, dernière activité) |

**Statuts container :**
- `running` — container actif, en train de poller
- `stopped` — container arrêté, redémarrera au prochain message

---

## Divers

| Commande | Description |
|----------|-------------|
| `ncl approvals list` | Liste les approbations en attente |
| `ncl dropped-messages list` | Messages rejetés (expéditeurs inconnus) |
| `ncl user-dms list` | Cache des DMs froids |
| `ncl destinations list` | Canaux de destination d'un agent |
