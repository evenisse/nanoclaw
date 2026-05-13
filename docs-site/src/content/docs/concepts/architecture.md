---
title: Architecture NanoClaw
description: Vue d'ensemble de l'architecture de NanoClaw — host Node, containers Docker, bus de messages via SQLite, et modèle de sessions.
---

NanoClaw est composé de deux processus distincts qui ne se parlent jamais directement : un **host Node** qui orchestre tout, et des **containers Docker** qui font tourner les agents. Leur seul point de contact est une paire de bases de données SQLite montées dans chaque container.

---

## Vue d'ensemble

```
  Telegram / Slack / CLI / …
           │
           ▼
  ┌─────────────────────────┐
  │       HOST (Node)       │
  │                         │
  │  Channel adapters       │
  │  Router                 │
  │  Delivery               │
  │  Session manager        │
  └────────┬────────────────┘
           │  SQLite (inbound.db / outbound.db)
           ▼
  ┌─────────────────────────┐
  │   CONTAINER (Docker)    │
  │                         │
  │   Agent-runner (Bun)    │
  │   Claude SDK            │
  │   MCP tools             │
  └─────────────────────────┘
```

**Host** — process Node permanent. Il reçoit les messages des canaux, les route vers les bons agents, réveille les containers, et délivre les réponses.

**Container** — process Docker éphémère, un par session active. Il contient le runtime de l'agent (Bun), le SDK Claude, et les outils MCP. Il s'arrête après une période d'inactivité et redémarre au prochain message.

---

## Flux d'un message

Du message entrant à la réponse délivrée :

```
1. Message reçu sur Telegram
        │
        ▼
2. Channel adapter extrait l'ID de chat et l'ID de thread
        │
        ▼
3. Router : chat ID → messaging group → agent group → session
        │
        ▼
4. Host écrit le message dans inbound.db de la session
        │
        ▼
5. Host réveille le container (ou le crée s'il n'existe pas)
        │
        ▼
6. Agent-runner poll inbound.db, trouve le message
        │
        ▼
7. Claude traite le message
        │
        ▼
8. Agent-runner écrit la réponse dans outbound.db
        │
        ▼
9. Host poll outbound.db, trouve la réponse
        │
        ▼
10. Host délivre via l'adaptateur Telegram
```

**Tout est un message.** Pas d'IPC, pas de stdin/stdout entre host et container. Les deux bases SQLite sont l'unique surface d'échange.

---

## Les deux bases de session

Chaque session possède **deux fichiers SQLite** dans `data/v2-sessions/<session_id>/` :

| Fichier | Écrit par | Lu par | Contenu |
|---------|-----------|--------|---------|
| `inbound.db` | Host | Container | Messages entrants, questions en attente |
| `outbound.db` | Container | Host | Réponses de l'agent, actions système |

Cette séparation est fondamentale : **un seul writer par fichier**. Il n'y a jamais de conflit d'écriture entre host et container.

---

## La base centrale

`data/v2.db` contient tout ce qui n'est pas lié à une session spécifique :

- **Entités** — users, agent_groups, messaging_groups, sessions
- **Routage** — wirings (quelle conversation va vers quel agent)
- **Permissions** — user_roles, agent_group_members
- **État** — pending_approvals, unregistered_senders

Le host y lit à chaque message entrant pour résoudre la route. Les containers n'y accèdent jamais directement.

---

## Modèle d'entités

```
users
  └─ user_roles (owner, admin)
  └─ agent_group_members

messaging_groups  ←──────────────────────────────┐
  (un canal sur une plateforme)                   │
        │                                         │
        │ messaging_group_agents (wirings)         │
        ▼                                         │
agent_groups                                      │
  (un agent logique, avec son dossier,            │
   CLAUDE.md, skills, config container)           │
        │                                         │
        ▼                                         │
sessions ────────────────────────────────────────►┘
  (agent_group + messaging_group + thread_id
   → un container, deux bases SQLite)
```

**messaging_group** — un canal sur une plateforme : un DM Telegram, un channel Slack, un dépôt GitHub. Identifié par `(channel_type, platform_id)`.

**agent_group** — l'identité logique d'un agent : son nom, son dossier `groups/<nom>/`, sa personnalité (`CLAUDE.local.md`), sa config container. Plusieurs canaux peuvent pointer vers le même agent.

**session** — l'unité d'exécution. Une session = un triplet `(agent_group, messaging_group, thread_id)`. C'est la session qui a son propre container et ses propres bases SQLite. La même agent_group peut avoir plusieurs sessions actives simultanément (ex : un mode `per-thread` crée une session par thread).

---

## Cycle de vie du container

```
[stopped] ──── message entrant ────► [running]
                                          │
                              délai d'inactivité
                                          │
                                          ▼
                                      [stopped]
```

- **stopped** — le container n'existe pas. Le host balaye toutes les 60s les messages en attente et réveille les containers si nécessaire.
- **running** — container actif. Le host poll `outbound.db` toutes les secondes pour détecter les nouvelles réponses.
- Le container se coupe de lui-même quand il n'a plus de messages à traiter. Le host détecte l'arrêt et passe le statut à `stopped`.

Un container démarre **à froid** à chaque fois — pas de pool préchauffé. Le démarrage prend quelques secondes.

---

## Workspace du container

À l'intérieur du container, deux répertoires sont montés depuis le host :

```
/workspace/                   ← dossier de session (inbound.db, outbound.db, fichiers temporaires)
  inbound.db
  outbound.db
  inbox/                      ← fichiers reçus d'autres agents
  outbox/                     ← fichiers à envoyer

/workspace/agent/             ← dossier de l'agent_group (partagé entre toutes ses sessions)
  CLAUDE.md                   ← instructions composées au démarrage
  CLAUDE.local.md             ← personnalité spécifique à cet agent
  skills/                     ← skills container installés
  … (fichiers de travail de l'agent)
```

Le dossier de session est propre à chaque session. Le dossier agent est partagé — si plusieurs sessions du même agent tournent en parallèle, elles accèdent au même espace de travail.

---

## Agents et canaux : la relation many-to-many

Un agent peut être connecté à **plusieurs canaux**, et un canal peut être connecté à **plusieurs agents**. La table `messaging_group_agents` (wirings) définit ces connexions et contrôle le comportement de chaque lien :

- `engage_mode` — quand l'agent répond (`pattern`, `mention`, `mention-sticky`)
- `session_mode` — comment les sessions sont scopées (`shared`, `per-thread`, `agent-shared`)
- `sender_scope` — qui peut écrire (`all` ou membres/admins uniquement)

Voir [Référence ncl](/reference/ncl/) pour la gestion des wirings.

---

## Communication inter-agents

Les agents peuvent s'envoyer des messages via le même mécanisme que les messages utilisateur. Un agent écrit dans `outbound.db` avec `channel_type='agent'` et un `platform_id` ciblant l'agent_group destinataire. Le host valide les permissions (table `agent_destinations`) et écrit dans l'`inbound.db` de la session cible.

Voir [Deux agents qui collaborent](/tutoriels/agents-collaboratifs/) pour un exemple concret.

---

## Credentials et secrets (OneCLI)

Les API keys, tokens OAuth, et credentials ne transitent jamais par les variables d'environnement du container ni par les bases de données. Ils sont injectés à la volée par le **proxy OneCLI** qui intercepte les requêtes HTTP sortantes du container et y ajoute les headers d'authentification appropriés.

L'agent ne manipule jamais de credentials directement — il appelle l'API normalement, le proxy se charge du reste.
