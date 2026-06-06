---
title: Modes de session
description: Référence des modes de session NanoClaw — shared, per-thread, agent-shared — et les trois niveaux d'isolation entre canaux.
---

Le mode de session contrôle **comment les sessions sont créées** quand des messages arrivent sur un canal. Il se configure sur chaque wiring (`ncl wirings update --session-mode <mode>`).

Il y a deux niveaux de décision distincts : le `session_mode` du wiring (granularité intra-canal), et l'isolation entre canaux (choix du même agent_group ou de groupes séparés).

---

## Les trois valeurs de `session_mode`

### `shared` — une session par canal

Tous les messages d'un même canal partagent la même session, quel que soit l'expéditeur ou le sujet.

```
Canal Telegram (DM)
  message 1 ──┐
  message 2 ──┤──► session unique ──► container
  message 3 ──┘
```

**Usage :** assistant personnel en DM, canal Slack dédié à un seul projet, n'importe quel canal où la continuité de la conversation est la bonne unité.

**Cas limites :** dans un groupe multi-utilisateurs, tous les participants partagent le même contexte de conversation. L'agent mémorise les échanges de tout le monde dans la même fenêtre.

---

### `per-thread` — une session par thread

Chaque thread (fil de discussion) obtient sa propre session indépendante. Les messages sans thread ID partagent une session commune.

```
Canal Slack
  #thread-A message 1 ──► session A ──► container A
  #thread-A message 2 ──► session A
  #thread-B message 1 ──► session B ──► container B
  message sans thread ──► session partagée
```

**Usage :** bot dans un groupe ou un channel de discussion où chaque sujet/ticket doit être traité isolément. Cas typique : un bot de review de PR où chaque thread de PR est une session séparée.

:::note
Pour les canaux qui gèrent nativement les threads (Slack, Discord, Linear, GitHub), le `thread_id` est extrait automatiquement par l'adaptateur. Pour les canaux sans threads (Telegram DM, WhatsApp), tous les messages ont un `thread_id` nul et tombent dans une session partagée — `per-thread` se comporte alors comme `shared`.
:::

---

### `agent-shared` — une session unique pour tous les canaux

Une seule session est partagée entre **tous les canaux** wired à cet agent_group, peu importe d'où vient le message.

```
Canal Telegram ──┐
Canal Slack ─────┤──► session unique ──► container
Webhook GitHub ──┘
```

**Usage :** agent de monitoring ou d'agrégation qui reçoit des événements de plusieurs sources et doit les voir tous dans le même contexte. Exemple classique : un agent couplé à la fois à un channel Slack et à des webhooks GitHub — les PR et les discussions Slack apparaissent côte à côte dans son contexte.

:::caution
Avec `agent-shared`, les messages de tous les canaux sont mélangés dans une seule conversation. Les participants d'un canal peuvent indirectement influencer le contexte que voient les participants d'un autre. À utiliser uniquement si vous êtes seul sur tous les canaux, ou si ce mélange est délibéré.
:::

---

## Les trois niveaux d'isolation entre canaux

Au-delà du `session_mode`, la question de l'isolation entre canaux dépend du choix de l'agent_group.

### Niveau 1 — Sessions fusionnées (`agent-shared`)

Plusieurs canaux alimentent **la même conversation**. L'agent voit tout dans un seul contexte.

| Partagé | Séparé |
|---------|--------|
| Workspace, mémoire, CLAUDE.md, historique de conversation | Rien |

**Configuration :** wirer plusieurs canaux au même agent_group avec `session_mode = agent-shared`.

**Quand l'utiliser :** canaux complémentaires que vous êtes seul à utiliser (webhook + chat, plusieurs notifications vers un même agent de traitement).

---

### Niveau 2 — Même agent, conversations séparées (`shared` ou `per-thread`)

Plusieurs canaux partagent le même agent (mêmes compétences, même mémoire persistante, même workspace) mais ont des **conversations indépendantes**.

| Partagé | Séparé |
|---------|--------|
| Workspace, mémoire, CLAUDE.md, outils | Historique de conversation, fenêtre de contexte |

**Configuration :** wirer plusieurs canaux au même agent_group avec `session_mode = shared`.

**Quand l'utiliser :** vous êtes le seul utilisateur sur plusieurs canaux (Telegram perso + Slack pro + Discord), ou vous avez plusieurs groupes sur une même plateforme. L'agent garde une identité cohérente sans que les conversations se mélangent.

---

### Niveau 3 — Agents séparés

Chaque canal a son propre agent_group. Rien n'est partagé.

| Partagé | Séparé |
|---------|--------|
| Rien | Tout — workspace, mémoire, CLAUDE.md, conversations |

**Configuration :** créer un agent_group distinct par canal et wirer chacun séparément.

**Quand l'utiliser :** dès que des **personnes différentes** sont impliquées sur des canaux différents, ou quand une information d'un canal ne doit jamais être accessible depuis un autre. L'agent accumule de la mémoire à travers les sessions — sans isolation, elle finit par traverser les canaux.

---

## Comment choisir

**Question clé : acceptez-vous que toute information d'un canal soit disponible dans l'autre ?**

```
Non → Niveau 3 (agents séparés)
 │
Oui → les conversations doivent-elles se voir mutuellement ?
       │
       Oui → Niveau 1 (agent-shared)
       Non → Niveau 2 (même agent, sessions séparées)
```

**Règles pratiques :**

| Situation | Recommandation |
|-----------|---------------|
| Vous seul, plusieurs plateformes (Telegram + Slack + Discord) | Niveau 2 — même agent, `shared` |
| Vous seul, plusieurs groupes sur une plateforme | Niveau 2 — même agent, `shared` |
| Webhook + chat (GitHub + Slack) | Niveau 1 — `agent-shared` |
| Canal avec personne A et canal avec personne B | Niveau 3 — agents séparés |
| Canal personnel et canal professionnel | Niveau 3 — agents séparés |
| Bot dans un groupe avec threads (Slack, Discord) | Niveau 2 — même agent, `per-thread` |

En cas de doute : **si les participants sont différents → agents séparés**.

---

## Configurer

```bash
# Voir le mode actuel
ncl wirings list

# Changer le mode d'un wiring
ncl wirings update --id <wiring-id> --session-mode shared
ncl wirings update --id <wiring-id> --session-mode per-thread
ncl wirings update --id <wiring-id> --session-mode agent-shared
```

:::note
Changer le `session_mode` d'un wiring existant n'affecte pas les sessions déjà créées — elles restent actives. Le nouveau mode s'applique aux **prochains messages** qui créeraient une nouvelle session. Pour repartir d'un état propre, les anciennes sessions peuvent être clôturées manuellement via la base de données.
:::
