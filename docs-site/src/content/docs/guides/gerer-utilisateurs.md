---
title: Gérer les utilisateurs et les droits
description: Membres, rôles, sender_scope, unknown_sender_policy — tout ce qui contrôle qui peut écrire à un agent et qui peut l'administrer.
---

NanoClaw a deux niveaux de contrôle d'accès indépendants : **qui peut envoyer des messages** à un agent, et **qui peut administrer** NanoClaw. Ce guide couvre les deux.

---

## Comment un utilisateur est créé

Les utilisateurs sont créés **automatiquement** à la première interaction. Quand un message arrive d'un expéditeur inconnu, NanoClaw enregistre son identité sous la forme `<canal>:<handle>` :

| Canal | Format | Exemple |
|-------|--------|---------|
| Telegram | `telegram:<user_id>` | `telegram:928685700` |
| Slack | `slack:<user_id>` | `slack:U01ABCDEF` |
| Discord | `discord:<user_id>` | `discord:123456789` |
| CLI | `cli:local` | `cli:local` |

```bash
ncl users list
ncl users get --id telegram:928685700
```

Vous ne créez jamais un utilisateur manuellement — il apparaît dès son premier message.

---

## Qui peut écrire à un agent

Deux mécanismes contrôlent l'accès en écriture, appliqués dans cet ordre :

### 1. `unknown_sender_policy` — politique du canal

Configuré sur le **messaging group** (le canal), pas sur l'agent. S'applique à tout expéditeur non encore enregistré dans la base.

```bash
ncl messaging-groups update --id <mg-id> --unknown-sender-policy <valeur>
```

| Valeur | Comportement |
|--------|-------------|
| `strict` *(défaut)* | Messages d'inconnus ignorés silencieusement |
| `request_approval` | Un admin reçoit une demande de validation. Si approuvé, l'expéditeur est enregistré et son message traité |
| `public` | Tout le monde peut écrire sans restriction |

`request_approval` est la valeur la plus utile pour un canal semi-ouvert : vous voyez qui frappe à la porte et décidez au cas par cas.

### 2. `sender_scope` — restriction du wiring

Configuré sur le **wiring** (le lien canal ↔ agent). S'applique même aux expéditeurs déjà enregistrés.

```bash
ncl wirings update --id <wiring-id> --sender-scope <valeur>
```

| Valeur | Comportement |
|--------|-------------|
| `all` *(défaut)* | Tout expéditeur reconnu peut déclencher l'agent |
| `known` | Seuls les membres et les admins de l'agent peuvent déclencher l'agent |

Avec `sender_scope=known`, il faut ajouter explicitement chaque utilisateur autorisé.

---

## Membres — accès non-privilégié

Un **membre** peut envoyer des messages à un agent (quand `sender_scope=known`) sans avoir de droits d'administration.

```bash
# Lister les membres d'un agent
ncl members list

# Ajouter un membre
ncl members add --user telegram:928685700 --group <ag-id>

# Retirer un membre
ncl members remove --user telegram:928685700 --group <ag-id>
```

:::note
Les admins sont implicitement membres de leur agent group — pas besoin d'une entrée séparée.
:::

---

## Rôles — droits d'administration

Les rôles donnent des droits d'administration sur NanoClaw. Ils sont indépendants des membres.

### Rôles disponibles

| Rôle | Portée | Peut faire |
|------|--------|-----------|
| `owner` | Toujours global | Tout — seul rôle qui peut en accorder d'autres |
| `admin` | Global **ou** scopé à un agent | Approuver les actions sensibles, gérer les membres, certaines commandes `ncl` |

Un `admin` global a les mêmes droits sur tous les agents. Un `admin` scopé ne peut agir que sur l'agent_group auquel il est assigné.

### Gérer les rôles

```bash
# Voir les rôles actuels
ncl roles list

# Donner le rôle admin global à un utilisateur
ncl roles grant --user telegram:928685700 --role admin

# Donner le rôle admin scopé à un agent précis
ncl roles grant --user telegram:928685700 --role admin --group <ag-id>

# Révoquer un rôle
ncl roles revoke --user telegram:928685700 --role admin
```

### Qui reçoit les demandes d'approbation ?

Quand un agent demande une approbation (installation de package, création de wiring…), le message est envoyé en DM à un admin. L'ordre de préférence :

1. Admins scopés à l'agent group concerné
2. Admins globaux
3. Owner

Si aucun admin n'a de DM connu, l'approbation reste en attente indéfiniment :

```bash
ncl approvals list
```

---

## Récapitulatif — qui peut quoi

```
Expéditeur inconnu
  → unknown_sender_policy=strict           : rejeté silencieusement
  → unknown_sender_policy=request_approval : demande à l'admin
  → unknown_sender_policy=public           : accepté, user créé

Expéditeur connu
  → sender_scope=all    : peut déclencher l'agent
  → sender_scope=known  : doit être membre ou admin pour déclencher l'agent

Membre         → peut écrire (si sender_scope=known)
Admin scopé    → peut écrire + approuver actions sur son agent
Admin global   → peut tout faire sur tous les agents
Owner          → contrôle total
```

---

## Cas pratiques

### Ouvrir un agent à un nouveau collaborateur

```bash
# 1. Vérifier que l'utilisateur existe (il doit avoir envoyé au moins un message)
ncl users list

# 2. L'ajouter comme membre de l'agent
ncl members add --user <canal>:<handle> --group <ag-id>
```

Si l'utilisateur n'a jamais envoyé de message, passer temporairement `unknown_sender_policy` en `request_approval` pour qu'il puisse se faire connaître.

### Restreindre un agent à vous seul

```bash
# Restreindre le wiring
ncl wirings update --id <wiring-id> --sender-scope known

# Vous ajouter comme membre (si vous n'êtes pas admin)
ncl members add --user <votre-id> --group <ag-id>
```

### Déléguer l'administration d'un agent à quelqu'un

```bash
# Admin scopé à un seul agent
ncl roles grant --user <id> --role admin --group <ag-id>
```

L'utilisateur pourra approuver les actions de cet agent et gérer ses membres, sans toucher aux autres agents.
