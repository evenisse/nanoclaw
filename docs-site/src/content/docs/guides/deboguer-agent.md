---
title: Déboguer un agent qui ne répond pas
description: Méthode de diagnostic pas à pas quand un agent NanoClaw ne répond pas — logs, routing, container, credentials.
---

Un agent silencieux peut avoir plusieurs causes. Ce guide suit la chaîne de traitement de bout en bout pour isoler le problème.

---

## Diagnostic rapide

```bash
# 1. Erreurs récentes
tail -50 logs/nanoclaw.error.log

# 2. Messages rejetés (expéditeurs non reconnus)
ncl dropped-messages list

# 3. État des sessions (containers actifs ?)
ncl sessions list
```

Si l'une de ces commandes révèle l'origine du problème, aller directement à la section correspondante ci-dessous.

---

## Étape 1 — Le message est-il arrivé au host ?

Vérifier les logs host :

```bash
tail -100 logs/nanoclaw.log | grep -i "inbound\|routing\|dropped\|unknown"
```

### Cas : le message n'apparaît pas du tout

L'adaptateur canal n'est pas en cours d'exécution ou ne reçoit pas les messages.

- **Telegram** : vérifier que `TELEGRAM_BOT_TOKEN` est dans `.env` et que le service tourne (`systemctl --user status nanoclaw`)
- **Slack / Discord / GitHub** : vérifier que le webhook est correctement configuré sur la plateforme et que le port est accessible
- **Tous canaux** : vérifier les erreurs d'adaptateur dans `logs/nanoclaw.error.log`

### Cas : `dropped_message` dans les logs

L'expéditeur n'est pas reconnu. Voir [Étape 2](#étape-2--lexpéditeur-est-il-autorisé).

### Cas : `no_agent_engaged`

Un ou plusieurs agents ont été évalués mais aucun n'a matché. Voir [Étape 3](#étape-3--le-routing-est-il-correct).

---

## Étape 2 — L'expéditeur est-il autorisé ?

```bash
ncl dropped-messages list
```

Si votre message apparaît ici, le messaging group a rejeté l'expéditeur.

### Cause A : `unknown_sender_policy = strict`

Le messaging group rejette silencieusement les expéditeurs non enregistrés.

```bash
# Vérifier la politique du messaging group
ncl messaging-groups list

# Option 1 : passer en request_approval (l'admin reçoit une demande)
ncl messaging-groups update --id <mg-id> --unknown-sender-policy request_approval

# Option 2 : passer en public (tout le monde peut écrire)
ncl messaging-groups update --id <mg-id> --unknown-sender-policy public
```

### Cause B : `sender_scope = known` sur le wiring

Le wiring est restreint aux membres connus, et l'expéditeur n'est pas membre.

```bash
# Vérifier le sender_scope
ncl wirings get --id <wiring-id>

# Ajouter l'utilisateur comme membre
ncl members add --user <channel>:<handle> --group <ag-id>

# Ou ouvrir à tous
ncl wirings update --id <wiring-id> --sender-scope all
```

L'ID utilisateur (`<channel>:<handle>`) est visible dans les logs au moment du message rejeté :

```bash
grep "dropped\|unknown_sender" logs/nanoclaw.log | tail -10
```

---

## Étape 3 — Le routing est-il correct ?

```bash
ncl wirings list
```

Vérifier que :
1. Un wiring existe entre le messaging group du canal et l'agent
2. L'`engage_mode` correspond au format du message envoyé

```bash
# Détail du wiring
ncl wirings get --id <wiring-id>
```

### engage_mode incorrect

| Symptôme | Cause | Solution |
|----------|-------|----------|
| L'agent répond parfois mais pas toujours | Pattern regex trop restrictif | Vérifier `engage_pattern` avec un test regex |
| L'agent ne répond jamais sur mention | `isMention` non résolu par l'adaptateur | Vérifier les logs adaptateur ; passer en `pattern` si le canal ne supporte pas les mentions |
| L'agent répond la première fois mais plus après | `mention-sticky` sur un canal sans threads | Passer en `mention` ou `pattern` |

---

## Étape 4 — Le container démarre-t-il ?

```bash
# Statut du container de la session
ncl sessions list
ncl sessions get --id <session-id>
```

Un `container_status = stopped` est normal entre deux messages. Le container redémarre automatiquement à chaque message.

Si le container démarre mais plante immédiatement :

```bash
# Logs d'erreur host autour du spawn du container
grep -i "container\|docker\|spawn\|exit" logs/nanoclaw.error.log | tail -30
```

### Container en crash loop

Si le container plante à chaque démarrage :

```bash
# Vérifier que l'image existe
docker images | grep nanoclaw-agent

# Reconstruire l'image si elle est corrompue ou absente
cd /opt/nanoclaw && ./container/build.sh
```

Après rebuild, redémarrer le service pour que les nouvelles sessions utilisent la nouvelle image :

```bash
systemctl --user restart nanoclaw
```

---

## Étape 5 — L'agent répond-il dans outbound.db ?

Si le container démarre mais qu'aucune réponse n'arrive, vérifier si l'agent a bien produit une réponse :

```bash
# Trouver la session concernée
ncl sessions list

# Inspecter la base outbound de la session
pnpm exec tsx scripts/q.ts \
  data/v2-sessions/<session-id>/outbound.db \
  "SELECT id, content, created_at FROM messages_out ORDER BY created_at DESC LIMIT 5"
```

- Si `messages_out` est vide → l'agent n'a pas répondu (voir Étape 6)
- Si `messages_out` contient des lignes → la livraison a échoué (voir Étape 7)

---

## Étape 6 — L'agent a-t-il reçu le message ?

```bash
pnpm exec tsx scripts/q.ts \
  data/v2-sessions/<session-id>/inbound.db \
  "SELECT id, content, trigger, created_at FROM messages_in ORDER BY created_at DESC LIMIT 5"
```

- `trigger = 1` → le message devait réveiller l'agent
- `trigger = 0` → message accumulé (contexte silencieux), l'agent ne sera pas réveillé

Si le message est présent avec `trigger = 1` mais qu'il n'y a pas de réponse dans `outbound.db`, Claude a peut-être rencontré une erreur. Activer les logs debug :

```bash
# Ajouter LOG_LEVEL=debug dans le service, puis redémarrer
systemctl --user edit nanoclaw
# Ajouter : Environment=LOG_LEVEL=debug
systemctl --user restart nanoclaw
```

---

## Étape 7 — La livraison a-t-elle échoué ?

Si la réponse est dans `outbound.db` mais n'est jamais arrivée sur la plateforme :

```bash
grep -i "delivery\|deliver\|platform_message" logs/nanoclaw.error.log | tail -20
```

Causes fréquentes :
- **Token expiré** : re-vérifier les variables d'environnement du canal dans `.env`
- **Rate limit plateforme** : visible dans les logs error comme `429 Too Many Requests`
- **Message mal formé** : l'adaptateur a rejeté le format de la réponse de l'agent

---

## Étape 8 — Problème de credentials OneCLI

Si l'agent répond mais que ses appels d'API externes échouent (Gmail, GitHub, etc.) :

```bash
# Vérifier que le secret est bien dans le vault
onecli secrets list

# Vérifier que l'agent est en mode all ou que le secret lui est assigné
onecli agents list
onecli agents secrets --id <agent-onecli-id>

# Logs du proxy OneCLI
docker logs onecli 2>&1 | grep -E "401|403|injections_applied=0" | tail -20
```

Voir [Gérer les credentials OneCLI](/guides/credentials-onecli/) pour le détail.

---

## Résumé des commandes de diagnostic

```bash
# Logs host (erreurs d'abord)
tail -50 logs/nanoclaw.error.log
tail -100 logs/nanoclaw.log

# Messages rejetés
ncl dropped-messages list

# Routing
ncl wirings list
ncl messaging-groups list

# Sessions et containers
ncl sessions list
ncl sessions get --id <id>

# Bases de session (remplacer <id> par l'id de session)
pnpm exec tsx scripts/q.ts data/v2-sessions/<id>/inbound.db \
  "SELECT id, trigger, created_at FROM messages_in ORDER BY created_at DESC LIMIT 5"
pnpm exec tsx scripts/q.ts data/v2-sessions/<id>/outbound.db \
  "SELECT id, created_at FROM messages_out ORDER BY created_at DESC LIMIT 5"

# Credentials
onecli secrets list
onecli agents list
```
