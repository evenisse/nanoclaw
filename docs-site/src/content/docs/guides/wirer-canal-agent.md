---
title: Wirer un canal à un agent
description: Comment connecter un canal de messagerie (Telegram, Slack, etc.) à un agent NanoClaw existant.
---

Un **wiring** est le lien entre un canal (messaging group) et un agent (agent group). Sans wiring, les messages arrivant sur un canal ne sont acheminés vers aucun agent.

## Prérequis

Avant de wirer un canal :

1. **L'adaptateur canal est installé** — le canal a été ajouté via `/add-<canal>` (token dans `.env`, import dans `src/channels/index.ts`)
2. **L'agent group existe** — visible dans `ncl groups list`
3. **Le service NanoClaw est en cours d'exécution** — requis pour le pairing Telegram et les canaux qui nécessitent un handshake

---

## Méthode standard : le script register

La méthode recommandée pour wirer un nouveau canal est le script de setup. Il crée en une commande le messaging group, le wiring, et la destination retour (pour que l'agent puisse répondre sur ce canal).

```bash
pnpm exec tsx setup/index.ts --step register -- \
  --platform-id "<id>"         \
  --name "<nom affiché>"       \
  --folder "<dossier agent>"   \
  --channel "<type>"           \
  --session-mode "<mode>"      \
  --assistant-name "<nom>"
```

| Paramètre | Description |
|-----------|-------------|
| `--platform-id` | ID de la conversation sur la plateforme (chat ID Telegram, channel ID Slack…) |
| `--name` | Nom affiché dans NanoClaw pour ce canal |
| `--folder` | Dossier de l'agent group existant (ex : `groups/nano/`) |
| `--channel` | Type de canal : `telegram`, `slack`, `discord`, etc. |
| `--session-mode` | `shared`, `per-thread`, ou `agent-shared` — voir [Modes de session](/reference/modes-session/) |
| `--assistant-name` | Nom de l'agent tel qu'il se présente sur ce canal |

### Exemple — ajouter un groupe Slack à l'agent Nano

```bash
pnpm exec tsx setup/index.ts --step register -- \
  --platform-id "C08XXXXXXX"  \
  --name "equipe-projet"       \
  --folder "groups/nano/"      \
  --channel "slack"            \
  --session-mode "per-thread"  \
  --assistant-name "Nano"
```

---

## Cas Telegram : pairing d'un nouveau groupe

Telegram nécessite un **pairing** avant le register : le bot doit recevoir un message du groupe cible pour en connaître le `platform_id`.

```bash
# 1. Lancer le pairing (intent = wire-to:<dossier> ou new-agent:<dossier>)
pnpm exec tsx setup/index.ts --step pair-telegram -- --intent wire-to:groups/nano/
```

Le script affiche un **code** à poster dans le groupe Telegram cible sous la forme `@<nomdubot> CODE`. Une fois le message posté, le script confirme le pairing et affiche le `platform_id`.

```bash
# 2. Enregistrer avec l'id récupéré
pnpm exec tsx setup/index.ts --step register -- \
  --platform-id "<platform_id>" \
  --name "<nom-du-groupe>"       \
  --folder "groups/nano/"        \
  --channel "telegram"           \
  --session-mode "shared"        \
  --assistant-name "Nano"
```

---

## Méthode manuelle : ncl

Si le messaging group existe déjà en base (créé automatiquement lors d'un premier message), vous pouvez créer le wiring directement :

```bash
# Trouver les IDs
ncl messaging-groups list   # → id du canal
ncl groups list             # → id de l'agent

# Créer le wiring
ncl wirings create \
  --messaging-group-id <mg-id> \
  --agent-group-id <ag-id>     \
  --engage-mode pattern        \
  --engage-pattern "."         \
  --session-mode shared
```

:::note
`ncl wirings create` depuis le terminal (hors container) est exécuté directement. Depuis l'intérieur d'un container agent, les opérations `create`, `update` et `delete` sur les wirings passent par une approbation admin.
:::

---

## Modifier le wiring d'un canal

Pour déplacer un canal vers un autre agent, ou changer l'engage_mode :

```bash
# Voir les wirings existants avec leurs IDs
ncl wirings list

# Modifier
ncl wirings update --id <wiring-id> --engage-mode pattern --engage-pattern "^max:"
```

Pour changer d'agent, il faut supprimer le wiring existant et en créer un nouveau :

```bash
ncl wirings delete --id <ancien-wiring-id>
ncl wirings create --messaging-group-id <mg-id> --agent-group-id <nouvel-ag-id> ...
```

:::caution
Les sessions existantes restent attachées à l'ancien agent. Les nouveaux messages seront routés vers le nouvel agent, mais l'historique de conversation ne migre pas automatiquement.
:::

:::note
Lors du premier message sur un canal nouvellement wiré, l'agent envoie un message de bienvenue. Ce message est émis **une seule fois** par session (à la création). Si l'agent ne répond pas au premier message, consulter [Déboguer un agent](/guides/deboguer-agent/) — c'est généralement un problème de routing ou de container, pas du welcome.
:::

---

## Supprimer un wiring

```bash
ncl wirings delete --id <wiring-id>
```

Le messaging group et l'agent group restent en place — seul le lien entre les deux est supprimé. Si vous voulez aussi retirer la destination retour (pour que l'agent ne puisse plus envoyer sur ce canal), supprimez-la manuellement :

```bash
ncl destinations list          # trouver la destination liée à ce canal
ncl destinations remove --id <destination-id>
```

---

## Vérifier la configuration

```bash
# Résumé des wirings actifs
ncl wirings list

# Détail d'un wiring
ncl wirings get --id <wiring-id>

# Destinations d'un agent
ncl destinations list
```

Pour un aperçu global agents / canaux, voir [Tableau agents / canaux](/reference/tableau-agents-canaux/).
