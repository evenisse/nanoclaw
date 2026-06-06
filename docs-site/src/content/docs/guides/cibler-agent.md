---
title: Cibler un agent spécifique
description: Syntaxe et mécanismes pour adresser un agent précis quand plusieurs agents sont disponibles sur le même canal.
---

Quand plusieurs agents sont wired au même canal, NanoClaw évalue chacun indépendamment contre son `engage_mode`. Plusieurs agents peuvent répondre au même message — il n'y a pas d'exclusivité automatique. Ce guide explique comment configurer et utiliser la discrimination.

## Comment ça marche : fan-out

À chaque message entrant, le routeur parcourt tous les agents wired au canal **dans l'ordre de priorité** (du plus élevé au plus bas) et applique le `engage_mode` de chacun. Chaque agent qui matche est déclenché.

```
Message → Canal
           ├─ Agent A (priority 10, pattern "^nano:")  → match → déclenché
           ├─ Agent B (priority  5, pattern "^max:")   → pas de match → ignoré
           └─ Agent C (priority  0, pattern ".")       → match → déclenché
```

Dans cet exemple, les agents A et C répondent tous les deux.

---

## Méthode recommandée : regex discriminante

La méthode canonique pour cibler un agent précis est `engage_mode='pattern'` avec une regex qui identifie l'agent.

### Configuration

```bash
# Agent A : répond uniquement si le message commence par "nano:"
ncl wirings update --id <wiring-id-A> --engage-mode pattern --engage-pattern "^nano:"

# Agent B : répond uniquement si le message commence par "max:"
ncl wirings update --id <wiring-id-B> --engage-mode pattern --engage-pattern "^max:"
```

### Utilisation

```
Vous : nano: quelle est la météo ?
→ Agent A (Nano) répond

Vous : max: résume ce document
→ Agent B (Max) répond

Vous : bonjour
→ Aucun agent ne répond (aucune regex ne matche)
```

:::tip
Pour avoir un agent "par défaut" qui répond quand aucun autre n'est ciblé, ajoutez un troisième agent avec le pattern `"."` et une priorité inférieure.
:::

---

## Mention plateforme (`mention` / `mention-sticky`)

En mode `mention`, l'agent répond si le message est une mention au niveau plateforme (ex : `@nomdubot` sur Telegram, Slack, Discord). Ce mode identifie le **compte bot**, pas le nom NanoClaw de l'agent.

Cela fonctionne bien si chaque agent correspond à un compte bot distinct sur la plateforme :

```
@nano quelle heure est-il ?   → bot Telegram "@nano_bot" → Agent A
@max résume ce document       → bot Telegram "@max_bot"  → Agent B
```

Si deux agents sont wired via le même compte bot, `mention` ne permet pas de les distinguer — ils sont tous deux marqués comme mentionnés.

---

## Priorité

Le champ `priority` (entier, défaut 0) contrôle l'ordre de traitement, pas l'exclusivité. Un agent avec `priority=10` est évalué avant un agent avec `priority=0`, mais les deux peuvent répondre s'ils matchent tous les deux.

```bash
# Modifier la priorité d'un wiring
ncl wirings update --id <wiring-id> --priority 10
```

La priorité est utile quand vous combinez un pattern discriminant et un agent "catchall" (pattern `"."`), pour vous assurer que l'agent spécialisé est évalué en premier.

---

## Voir les wirings en place

```bash
ncl wirings list
```

Pour inspecter le détail d'un wiring (engage_mode, pattern, priorité) :

```bash
ncl wirings get --id <wiring-id>
```
