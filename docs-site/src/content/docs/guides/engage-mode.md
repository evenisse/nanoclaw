---
title: Configurer l'engage_mode
description: Comment contrôler quand un agent répond — sur pattern regex, sur mention plateforme, ou sur mention avec persistance de thread.
---

L'`engage_mode` est configuré au niveau du **wiring** (la connexion entre un canal et un agent). Il détermine quels messages déclenchent l'agent.

## Les trois modes

### `pattern` — réponse sur regex

L'agent répond à tout message dont le texte correspond à une expression régulière.

| Pattern | Comportement |
|---------|-------------|
| `"."` | Répond à chaque message sans exception (always-on) |
| `"^nano:"` | Répond uniquement si le message commence par `nano:` |
| `"urgent\|URGENT"` | Répond si le mot "urgent" apparaît |

C'est le mode le plus flexible. Utile pour les canaux dédiés à un seul agent, ou pour discriminer plusieurs agents sur le même canal (voir [Cibler un agent spécifique](/guides/cibler-agent/)).

---

### `mention` — réponse sur mention plateforme

L'agent répond uniquement si le bot est mentionné au sens de la plateforme (`@botname` sur Telegram/Slack/Discord, etc.). Sans mention, le message est ignoré ou accumulé selon `ignored_message_policy`.

:::note
La mention est résolue par l'adaptateur canal — c'est le nom du compte bot sur la plateforme qui compte, pas le nom NanoClaw de l'agent. En DM (conversation privée), tout message est considéré comme une mention.
:::

---

### `mention-sticky` — mention puis thread actif

Comme `mention`, mais une fois l'agent mentionné dans un thread, il reste actif pour tous les messages suivants de ce thread — sans nouvelle mention.

Comportement détaillé :
- Premier message : doit mentionner le bot (`@botname`)
- Messages suivants dans le même thread : l'agent répond sans mention
- Nouveau thread : doit mentionner à nouveau

Ce mode n'a de sens que sur les plateformes qui supportent les threads (Slack, Discord). En DM ou sur les plateformes sans thread, préférer `mention`.

---

## Configurer via ncl

### Voir les wirings existants

```bash
ncl wirings list
```

La sortie montre l'`engage_mode` et l'`engage_pattern` de chaque wiring.

### Modifier le mode d'un wiring

```bash
# Passer en pattern always-on
ncl wirings update --id <wiring-id> --engage-mode pattern --engage-pattern "."

# Passer en pattern discriminant
ncl wirings update --id <wiring-id> --engage-mode pattern --engage-pattern "^nano:"

# Passer en mention
ncl wirings update --id <wiring-id> --engage-mode mention

# Passer en mention-sticky
ncl wirings update --id <wiring-id> --engage-mode mention-sticky
```

:::note
`--engage-pattern` est ignoré si le mode est `mention` ou `mention-sticky`. Il est requis (ou défaut à `"."`) pour le mode `pattern`.
:::

---

## Que faire des messages qui ne déclenchent pas l'agent ?

Le paramètre `ignored_message_policy` du wiring contrôle ce comportement :

| Valeur | Comportement |
|--------|-------------|
| `drop` *(défaut)* | Le message est ignoré. L'agent ne le voit jamais. |
| `accumulate` | Le message est stocké en contexte silencieux (sans réveil du container). L'agent en aura connaissance lors du prochain message qui le déclenche. |

```bash
# Accumuler le contexte même sans engagement
ncl wirings update --id <wiring-id> --ignored-message-policy accumulate
```

`accumulate` est utile sur un canal actif (ex : canal Slack avec plusieurs agents) pour qu'un agent spécialisé garde le fil de la conversation même quand il n'est pas mentionné.

---

## Récapitulatif

| Mode | Déclenché par | Idéal pour |
|------|--------------|------------|
| `pattern "."` | Tout message | Canal dédié à un seul agent |
| `pattern "<regex>"` | Messages correspondant au pattern | Plusieurs agents sur le même canal |
| `mention` | @mention plateforme uniquement | Agent discret dans un canal partagé |
| `mention-sticky` | @mention, puis tout message du thread | Conversations suivies sur Slack/Discord |
