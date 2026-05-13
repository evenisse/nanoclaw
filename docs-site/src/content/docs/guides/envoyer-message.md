---
title: Envoyer un message à un agent
description: Comment contacter un agent NanoClaw depuis Telegram, le CLI, ou un autre canal — selon le mode de déclenchement configuré.
---

Envoyer un message à un agent NanoClaw, c'est simplement écrire dans le canal auquel il est wired. Le comportement dépend de deux paramètres : l'**engage_mode** et la politique d'accès (**unknown_sender_policy**).

## Engage mode : quand l'agent répond-il ?

Chaque wiring (connexion canal ↔ agent) a un `engage_mode` qui détermine quels messages déclenchent l'agent.

### `pattern` (défaut habituel)

L'agent répond à tout message dont le texte correspond à une expression régulière.

Le pattern `"."` correspond à tout — l'agent répond à chaque message sans exception.

```
Vous : Bonjour
Agent : Bonjour ! Comment puis-je vous aider ?
```

### `mention`

L'agent ne répond que si son nom ou handle est mentionné dans le message.

```
Vous : @nano quelle heure est-il ?
Agent : Il est 15h42.

Vous : et demain il fait beau ?   ← pas de mention → ignoré
```

### `mention-sticky`

Comme `mention`, mais une fois l'agent mentionné, il reste actif pour tous les messages suivants du même thread jusqu'à ce que le thread se termine ou que vous mentionniez un autre agent.

```
Vous : @nano raconte-moi une blague
Agent : Pourquoi les plongeurs plongent-ils...
Vous : encore une     ← pas de mention, mais l'agent répond quand même
Agent : Un homme entre dans une bibliothèque...
```

:::note
Pour savoir quel engage_mode est configuré sur votre installation, voir la page [Tableau agents / canaux](/reference/tableau-agents-canaux/).
:::

---

## Politique d'accès : qui peut écrire ?

Le `unknown_sender_policy` du messaging group contrôle ce qui arrive aux messages d'expéditeurs non reconnus.

| Valeur | Comportement |
|--------|-------------|
| `strict` | Seuls les membres et admins peuvent écrire. Messages des inconnus silencieusement ignorés. |
| `request_approval` | Un message d'un inconnu envoie une demande d'approbation à un admin. Si approuvé, l'expéditeur est enregistré et son message traité. |
| `public` | Tout le monde peut écrire. |

Si vos messages ne reçoivent aucune réponse, vérifiez que votre identité est bien enregistrée :

```bash
ncl users list
```

Les messages rejetés sont visibles dans :

```bash
ncl dropped-messages list
```

---

## Par canal

### Telegram

1. Ouvrez la conversation privée (DM) avec le bot, ou le groupe/canal wired.
2. Envoyez votre message normalement.
3. Si l'engage_mode est `pattern` avec `"."`, chaque message déclenche l'agent.
4. Si c'est `mention`, préfixez avec `@<nom_du_bot>`.

:::tip
Pour créer une conversation avec un bot Telegram, envoyez-lui d'abord un message privé — c'est obligatoire, le bot ne peut pas initier la conversation. Voir le tutoriel [Créer un agent Telegram](/tutoriels/creer-agent-telegram/) pour les détails.
:::

### CLI local

Utilisez la commande `ncl` depuis le terminal :

```bash
# Envoyer un message via le CLI (si un canal CLI est wired)
ncl messaging-groups list   # trouver l'id du canal CLI
```

Ou, si vous utilisez un client de chat local wired au canal, écrivez directement dans l'interface.

---

## Plusieurs agents sur un même canal

Si plusieurs agents sont wired au même canal, l'agent qui répond dépend de la priorité et de l'engage_mode de chacun. Pour cibler un agent précis, voir [Cibler un agent spécifique](/guides/cibler-agent/).
