---
title: Variables d'environnement
description: Toutes les variables du fichier .env de NanoClaw — host, canaux, OneCLI, container.
---

Le fichier `.env` à la racine du projet configure le host NanoClaw. Les variables sont lues au démarrage du service. Après toute modification, redémarrer le service :

```bash
systemctl --user restart nanoclaw
```

---

## Host

| Variable | Défaut | Description |
|----------|--------|-------------|
| `TZ` | Fuseau système | Fuseau horaire utilisé par les agents pour interpréter les heures des tâches planifiées (ex : `Europe/Paris`) |
| `WEBHOOK_PORT` | `3000` | Port d'écoute du serveur webhook (Slack, Discord, GitHub, Linear…) |
| `LOG_LEVEL` | `info` | Niveau de log : `debug`, `info`, `warn`, `error`. `debug` affiche le routing complet et les commandes Docker |
| `ASSISTANT_NAME` | `Andy` | Nom par défaut de l'assistant (utilisé si aucun `assistant_name` n'est défini dans la config container) |

---

## OneCLI

| Variable | Défaut | Description |
|----------|--------|-------------|
| `ONECLI_URL` | — | URL du gateway OneCLI (ex : `http://127.0.0.1:10254`). Requis pour le fonctionnement des credentials |
| `ONECLI_API_KEY` | — | Clé API du gateway OneCLI. Générée à l'installation, visible dans le dashboard OneCLI |

---

## Canaux

Ces variables dépendent des canaux installés via `/add-<canal>`. Elles ne sont présentes que si l'adaptateur correspondant est actif.

### Telegram

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Token du bot Telegram obtenu via @BotFather |

### Slack

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Token OAuth du bot (`xoxb-…`) |
| `SLACK_SIGNING_SECRET` | Secret de signature des webhooks Slack |

### Discord

| Variable | Description |
|----------|-------------|
| `DISCORD_BOT_TOKEN` | Token du bot Discord |
| `DISCORD_PUBLIC_KEY` | Clé publique de l'application Discord |
| `DISCORD_APPLICATION_ID` | ID de l'application Discord |

### GitHub

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | Token d'accès personnel GitHub |
| `GITHUB_WEBHOOK_SECRET` | Secret de vérification des webhooks |
| `GITHUB_BOT_USERNAME` | Nom d'utilisateur du bot GitHub (pour la détection des mentions) |

### Linear

| Variable | Description |
|----------|-------------|
| `LINEAR_API_KEY` | Clé API Linear (ou `LINEAR_CLIENT_ID` + `LINEAR_CLIENT_SECRET` pour OAuth) |
| `LINEAR_WEBHOOK_SECRET` | Secret de vérification des webhooks |
| `LINEAR_BOT_USERNAME` | Nom d'utilisateur du bot Linear |
| `LINEAR_TEAM_KEY` | Clé de l'équipe Linear |

### WhatsApp (Baileys — non officiel)

| Variable | Description |
|----------|-------------|
| `WHATSAPP_PHONE_NUMBER` | Numéro de téléphone associé au compte WhatsApp |
| `WHATSAPP_ENABLED` | `true` pour activer l'adaptateur |

### WhatsApp Cloud (API officielle Meta)

| Variable | Description |
|----------|-------------|
| `WHATSAPP_ACCESS_TOKEN` | Token d'accès Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | ID du numéro de téléphone dans Meta Business |
| `WHATSAPP_APP_SECRET` | Secret de l'application Meta |
| `WHATSAPP_VERIFY_TOKEN` | Token de vérification des webhooks |

### Resend (email)

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Clé API Resend |
| `RESEND_FROM_ADDRESS` | Adresse email d'envoi |
| `RESEND_FROM_NAME` | Nom d'affichage de l'expéditeur |
| `RESEND_WEBHOOK_SECRET` | Secret de vérification des webhooks |

Pour les autres canaux (Matrix, Webex, Teams, Signal, iMessage, Google Chat), consulter le skill `/add-<canal>` correspondant pour la liste exacte des variables requises.

---

## Container

Ces variables affectent le comportement des containers Docker qui exécutent les agents.

| Variable | Défaut | Description |
|----------|--------|-------------|
| `CONTAINER_IMAGE` | `nanoclaw-agent:latest` | Image Docker à utiliser pour les containers agents |
| `CONTAINER_TIMEOUT` | `1800000` (30 min) | Durée maximale d'exécution d'un container en ms avant arrêt forcé |
| `IDLE_TIMEOUT` | `1800000` (30 min) | Durée d'inactivité avant qu'un container s'arrête de lui-même |
| `MAX_CONCURRENT_CONTAINERS` | `5` | Nombre maximum de containers agents actifs simultanément |
| `MAX_MESSAGES_PER_PROMPT` | `10` | Nombre maximum de messages passés à Claude dans un seul prompt |
| `CONTAINER_MAX_OUTPUT_SIZE` | `10485760` (10 MB) | Taille maximale de la sortie d'un container en octets |
| `INSTALL_CJK_FONTS` | `false` | `true` pour inclure les polices CJK (chinois, japonais, coréen) dans l'image Docker (+200 MB). Nécessite un rebuild : `./container/build.sh` |

### Variables d'environnement par agent

Certaines variables sont lues par le container lui-même (runtime agent) et non par le host. Elles **ne peuvent pas être définies dans `.env`** — le host ne transmet pas son environnement aux containers. Elles doivent être configurées par agent via `ncl groups config update --set-env` :

```bash
ncl groups config update --id <group-id> --set-env CLAUDE_TRANSCRIPT_ROTATE_AGE_DAYS=3
```

| Variable | Défaut | Description |
|----------|--------|-------------|
| `CLAUDE_TRANSCRIPT_ROTATE_BYTES` | `12582912` (12 MB) | Taille maximale d'un transcript `.jsonl` avant rotation automatique. Au-delà, la session est archivée en Markdown dans `conversations/` et une nouvelle session démarre |
| `CLAUDE_TRANSCRIPT_ROTATE_AGE_DAYS` | `14` | Âge maximal en jours d'une session avant rotation automatique (calculé depuis le premier message du transcript). Utile pour limiter le contexte des agents hub très actifs |

---

## Site de documentation (docs-site)

Le site de documentation a son propre `.env` dans `docs-site/` :

| Variable | Défaut | Description |
|----------|--------|-------------|
| `DOCS_PORT` | `4321` | Port d'écoute du site de documentation |
