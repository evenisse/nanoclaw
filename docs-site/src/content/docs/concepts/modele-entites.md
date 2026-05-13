---
title: Modèle d'entités
description: Les entités clés de NanoClaw — users, agent_groups, messaging_groups, sessions — leurs relations et comment les gérer.
---

Toutes les entités de NanoClaw vivent dans `data/v2.db`. Voici comment elles s'articulent et ce qu'elles contrôlent concrètement.

---

## Vue d'ensemble

```
          users
         /     \
   user_roles   agent_group_members
                        │
  messaging_groups ─────┤ messaging_group_agents (wirings)
  (un canal/chat)        │
                    agent_groups
                    (un agent logique)
                         │
                       sessions
                  (container + 2 bases SQLite)
                         │
                  agent_destinations
                  (où l'agent peut envoyer)
```

---

## users

Un **user** représente une identité sur une plateforme de messagerie. Un même humain peut avoir plusieurs identités s'il utilise plusieurs canaux.

**Identifiant** : `<channel_type>:<handle>` — ex : `telegram:123456789`, `slack:U01ABC`.

```bash
ncl users list
ncl users get --id telegram:123456789
```

Les users sont créés automatiquement à la première interaction (message entrant, approbation, etc.). Vous ne créez jamais de user manuellement.

---

## Rôles et permissions

### user_roles — privilèges

Deux rôles, deux portées :

| Rôle | Portée | Peut faire |
|------|--------|-----------|
| `owner` | toujours global | Tout. Premier user à s'appairer devient owner automatiquement. |
| `admin` | global **ou** scopé à un agent_group | Approuver des actions, gérer les membres, certaines commandes ncl. |

Un `admin` global a les mêmes droits sur tous les agents. Un `admin` scopé ne peut agir que sur l'agent_group auquel il est assigné.

Les admins sont aussi implicitement **membres** de leur agent_group — pas besoin d'une entrée séparée dans `agent_group_members`.

```bash
ncl roles list
ncl roles grant --user telegram:123456 --role admin                     # admin global
ncl roles grant --user telegram:123456 --role admin --group <ag-id>    # admin scopé
ncl roles revoke --user telegram:123456 --role admin
```

### agent_group_members — accès non-privilégié

Permet à un user d'interagir avec un agent sans avoir de rôle admin. Utilisé quand le wiring a `sender_scope=known` — seuls les membres (et admins) peuvent écrire à cet agent.

```bash
ncl members list
ncl members add --user telegram:123456 --group <ag-id>
ncl members remove --user telegram:123456 --group <ag-id>
```

**Résumé des niveaux d'accès** :

```
owner  ──────────► accès total, global
admin global ────► accès total, tous agents
admin scopé ─────► accès complet sur un agent
membre ──────────► peut écrire à un agent (si sender_scope=known)
sans rôle ───────► bloqué si sender_scope=known, autorisé si =all
```

---

## messaging_groups — canaux

Un **messaging_group** représente **un chat sur une plateforme** : un DM Telegram, un channel Slack, un dépôt GitHub, une adresse email.

**Identifié par** : `(channel_type, platform_id)` — unique. Deux canaux sur deux plateformes différentes peuvent avoir le même `platform_id`, mais pas sur la même.

**Propriétés clés** :

| Propriété | Valeurs | Description |
|-----------|---------|-------------|
| `channel_type` | `telegram`, `slack`, `discord`, … | Le type de canal |
| `is_group` | `0` / `1` | DM privé (`0`) ou groupe/canal multi-utilisateurs (`1`) |
| `unknown_sender_policy` | `strict`, `request_approval`, `public` | Que faire d'un message d'un expéditeur inconnu |

**`unknown_sender_policy` en détail** :

- `strict` — le message est silencieusement ignoré. Personne n'est notifié.
- `request_approval` — une carte d'approbation est envoyée à un admin en DM. Si l'admin approuve, l'expéditeur est enregistré et le message est traité.
- `public` — n'importe qui peut écrire, aucune vérification.

Les messaging_groups sont créés **automatiquement** au premier message reçu depuis un nouveau chat. Vous n'en créez pas manuellement.

```bash
ncl messaging-groups list
ncl messaging-groups get --id <mg-id>
ncl messaging-groups update --id <mg-id> --unknown-sender-policy request_approval
```

---

## agent_groups — agents

Un **agent_group** est l'identité logique d'un agent. C'est lui qui définit **qui est l'agent** — son nom, sa personnalité, ses capacités.

Chaque agent_group a son propre dossier sur le host : `groups/<folder>/`

```
groups/nano/
  CLAUDE.md           ← instructions composées au démarrage du container
  CLAUDE.local.md     ← personnalité spécifique (à éditer)
  skills/             ← skills container montés dans ce groupe
  container.json      ← config container (généré au spawn)
```

**Propriétés clés** :

| Propriété | Description |
|-----------|-------------|
| `name` | Nom affiché dans les logs et l'admin CLI |
| `folder` | Nom du dossier sous `groups/` — immutable après création |

La config container (modèle Claude, MCP servers, packages, `cli_scope`) est gérée séparément via `ncl groups config`.

```bash
ncl groups list
ncl groups get --id <ag-id>
ncl groups create --name "Veille" --folder "veille"
ncl groups config get --id <ag-id>
ncl groups config update --id <ag-id> --model claude-sonnet-4-6
ncl groups restart --id <ag-id>
```

**`cli_scope`** — contrôle ce que l'agent peut faire avec `ncl` depuis l'intérieur de son container :

| Valeur | L'agent peut… |
|--------|--------------|
| `disabled` | Rien — ncl n'est pas disponible dans le container |
| `group` *(défaut)* | Gérer son propre groupe (membres, destinations, sessions) |
| `global` | Tout — réservé aux agents owner/admin de confiance |

---

## messaging_group_agents — wirings

Un **wiring** connecte un messaging_group à un agent_group. C'est la table pivot many-to-many qui définit **quel agent répond sur quel canal**, et **comment**.

Un canal peut être wired à plusieurs agents, et un agent peut être wired à plusieurs canaux.

**Propriétés clés** :

| Propriété | Valeurs | Description |
|-----------|---------|-------------|
| `engage_mode` | `pattern`, `mention`, `mention-sticky` | Quand l'agent répond |
| `engage_pattern` | regex | Pattern pour `engage_mode=pattern` (`"."` = toujours) |
| `session_mode` | `shared`, `per-thread`, `agent-shared` | Comment les sessions sont créées |
| `sender_scope` | `all`, `known` | Qui peut déclencher l'agent |
| `ignored_message_policy` | `drop`, `accumulate` | Sort des messages qui ne déclenchent pas l'agent |
| `priority` | entier | Ordre d'évaluation quand plusieurs agents couvrent le même canal |

**`session_mode` en détail** :

| Mode | Comportement | Cas d'usage |
|------|-------------|------------|
| `shared` | Une session par (agent, canal) | Assistant personnel en DM |
| `per-thread` | Une session par thread/sujet | Bot dans un groupe, chaque conversation est isolée |
| `agent-shared` | Une session unique pour tous les canaux de l'agent | Agent de monitoring qui agrège tous ses canaux |

```bash
ncl wirings list
ncl wirings create --messaging-group-id <mg-id> --agent-group-id <ag-id> \
  --engage-mode pattern --engage-pattern "."
ncl wirings update --id <w-id> --engage-mode mention
ncl wirings delete --id <w-id>
```

---

## sessions

Une **session** est l'unité d'exécution : elle correspond à un triplet `(agent_group, messaging_group, thread_id)` selon le `session_mode` du wiring.

Chaque session possède :
- Un dossier dans `data/v2-sessions/<session_id>/`
- Deux bases SQLite : `inbound.db` et `outbound.db`
- Un container Docker quand elle est active

Les sessions sont créées **automatiquement** par le routeur au premier message. Vous ne les créez pas manuellement.

```bash
ncl sessions list
ncl sessions get --id <session-id>
```

**Statuts** :

| `status` | Description |
|----------|-------------|
| `active` | Session en cours d'utilisation |
| `closed` | Session archivée (plus de messages) |

| `container_status` | Description |
|--------------------|-------------|
| `running` | Container actif, en train de traiter |
| `stopped` | Container arrêté, redémarrera au prochain message |

---

## agent_destinations

Une **destination** autorise un agent à envoyer des messages vers une cible (canal ou autre agent) et lui donne un **nom local** pour l'adresser.

Sans destination, un agent ne peut envoyer nulle part — même s'il essaie, le host rejettera l'envoi.

**Exemple** : pour que l'agent `Coordinateur` puisse envoyer à l'agent `Analyste` sous le nom `"analyste"` :

```bash
ncl destinations add \
  --agent-group-id <coord-id> \
  --local-name analyste \
  --target-type agent \
  --target-id <anal-id>
```

L'agent écrit ensuite `<message to="analyste">…</message>` dans sa réponse.

Les destinations vers les canaux sont créées automatiquement lors du wiring. Les destinations inter-agents doivent être créées manuellement (ou par un agent avec `cli_scope=global` via `create_agent`).

```bash
ncl destinations list
ncl destinations add --agent-group-id <id> --local-name <nom> \
  --target-type <channel|agent> --target-id <id>
ncl destinations remove --agent-group-id <id> --local-name <nom>
```

---

## Récapitulatif des relations

| Entité | Créée par | Gérée par |
|--------|-----------|-----------|
| `users` | Auto au premier message | Lecture seule (`ncl users list`) |
| `user_roles` | Manuel | `ncl roles grant/revoke` |
| `agent_group_members` | Manuel | `ncl members add/remove` |
| `messaging_groups` | Auto au premier message | `ncl messaging-groups update` |
| `agent_groups` | Manuel | `ncl groups create/update/delete` |
| `messaging_group_agents` | Manuel | `ncl wirings create/update/delete` |
| `sessions` | Auto par le routeur | Lecture seule (`ncl sessions list`) |
| `agent_destinations` | Auto (wirings) ou Manuel | `ncl destinations add/remove` |
