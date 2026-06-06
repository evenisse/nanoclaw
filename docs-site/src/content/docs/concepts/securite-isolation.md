---
title: Sécurité et isolation
description: Le modèle de sécurité de NanoClaw — cli_scope, sender_scope, user_roles, credentials OneCLI, et isolation des containers.
---

Cette page explique comment NanoClaw contrôle ce que les agents peuvent faire, qui peut leur écrire, et comment les secrets sont protégés.

---

## Quatre périmètres de sécurité

```
1. Qui peut envoyer un message à un agent ?
        → unknown_sender_policy + sender_scope

2. Qui peut administrer NanoClaw ?
        → user_roles (owner / admin)

3. Ce qu'un agent peut faire avec ncl depuis son container
        → cli_scope

4. Comment les credentials API sont-ils protégés ?
        → proxy OneCLI (jamais dans les variables d'env ou la DB)
```

---

## 1. Contrôle des expéditeurs

Deux mécanismes distincts filtrent qui peut déclencher un agent.

### `unknown_sender_policy` (messaging group)

S'applique aux expéditeurs non encore enregistrés dans la base. Configuré par canal.

| Valeur | Comportement |
|--------|-------------|
| `strict` | Rejeté silencieusement |
| `request_approval` | Demande envoyée à un admin |
| `public` | Accepté sans restriction |

### `sender_scope` (wiring)

S'applique même aux utilisateurs déjà connus. Configuré par lien canal ↔ agent.

| Valeur | Comportement |
|--------|-------------|
| `all` | Tout utilisateur reconnu peut déclencher l'agent |
| `known` | Seuls les membres et admins peuvent déclencher l'agent |

Ces deux mécanismes sont indépendants et s'appliquent dans cet ordre : `unknown_sender_policy` en premier (l'expéditeur est-il connu ?), puis `sender_scope` (est-il autorisé sur cet agent ?).

---

## 2. Rôles administratifs

Les rôles contrôlent qui peut modifier la configuration de NanoClaw et approuver les actions sensibles.

| Rôle | Portée | Peut faire |
|------|--------|-----------|
| `owner` | Global | Tout, y compris accorder des rôles |
| `admin` | Global ou scopé | Approuver des actions, gérer les membres |

Les admins reçoivent les demandes d'approbation en DM quand un agent demande à installer un package, modifier sa config, ou créer une wiring.

**Principe** : les rôles sont des attributs d'utilisateur (identité sur une plateforme), pas de canal. Un admin global peut approuver des actions pour n'importe quel agent, quel que soit le canal d'où vient la demande.

---

## 3. `cli_scope` — ce qu'un agent peut faire avec ncl

Depuis l'intérieur d'un container, les agents ont accès à `ncl`. Le `cli_scope` limite ce qu'ils peuvent faire.

| Valeur | L'agent peut… |
|--------|--------------|
| `disabled` | Rien — ncl n'est pas disponible dans le container |
| `group` *(défaut)* | Lire et modifier **son propre** agent group uniquement (membres, sessions, destinations, config) |
| `global` | Tout — identique à un appel depuis le terminal host |

Avec `cli_scope=group`, un agent ne peut pas :
- Lire les autres agent groups
- Modifier les wirings
- Accorder des rôles
- Changer son propre `cli_scope`

Avec `cli_scope=global`, l'agent a les mêmes droits qu'un opérateur humain au terminal. À réserver aux agents de confiance explicitement confiés à l'owner.

:::caution
Un agent avec `cli_scope=global` peut créer des agents, modifier les wirings, accorder des rôles. N'accorder ce niveau qu'à des agents dont le CLAUDE.local.md est explicitement contrôlé.
:::

Les actions mutantes (`create`, `update`, `delete`) depuis un container passent par une **demande d'approbation** envoyée à un admin, même avec `cli_scope=global`. Seules les lectures sont immédiates.

**Approbations scopées au canal** — la demande d'approbation est envoyée à un admin en tenant compte du périmètre de l'action. Un admin scopé à un agent group ne peut approuver que des actions qui concernent cet agent group. Il ne peut pas, via une approbation, connecter un canal à un agent hors de sa portée, même s'il reçoit la notification.

---

## 4. Credentials et proxy OneCLI

Les credentials (clés API, tokens OAuth) ne transitent jamais dans :
- Les variables d'environnement des containers
- Les bases de données SQLite
- Les messages entre host et container

Ils sont gérés exclusivement par le **proxy OneCLI** :

```
Container agent
    │
    │  requête HTTPS vers api.example.com
    ▼
Proxy OneCLI (127.0.0.1:10254)
    │  injecte le header Authorization
    ▼
api.example.com
```

L'agent fait ses appels HTTP normalement. Le proxy intercepte et injecte le credential si le host pattern correspond à un secret dans le vault. L'agent ne voit jamais la valeur du secret.

**Conséquence pratique** : même si un agent était compromis (prompt injection, code malveillant), il ne pourrait pas exfiltrer les credentials — il n'y a rien à voler dans son environnement.

---

## 5. Isolation des containers

Chaque session active est un container Docker distinct. Les containers sont isolés entre eux et du host.

**Ce que chaque container peut voir :**

| Ressource | Accessible ? | Détail |
|-----------|-------------|--------|
| `inbound.db` / `outbound.db` de sa session | Oui | Monté en lecture/écriture |
| Workspace de son agent group (`/workspace/agent/`) | Oui | Partagé entre toutes les sessions du même agent group |
| Workspace des autres agent groups | Non | |
| Base centrale `data/v2.db` | Non | Accessible uniquement depuis le host |
| Credentials OneCLI | Non (valeurs brutes) | Injectés à la volée par le proxy, jamais exposés |

**Un même workspace pour plusieurs sessions**

Si un agent group a plusieurs sessions actives simultanément (mode `per-thread`), elles partagent le même `/workspace/agent/`. Les fichiers qu'un container écrit dans son workspace sont immédiatement visibles des autres containers du même agent group. C'est intentionnel (mémoire partagée de l'agent), mais à garder en tête si l'agent group est partagé entre plusieurs personnes.

---

## Résumé — modèle de confiance

```
Opérateur (terminal host)
  → accès total, aucune approbation requise

Agent owner / admin global (via ncl depuis container)
  → accès total, mais actions mutantes soumises à approbation

Agent group-scoped (cli_scope=group, défaut)
  → lecture/écriture sur son propre groupe uniquement
  → actions mutantes soumises à approbation

Agent disabled (cli_scope=disabled)
  → aucun accès ncl

Expéditeur externe (via canal)
  → filtré par unknown_sender_policy + sender_scope
  → jamais d'accès direct à ncl ou aux bases de données
```
