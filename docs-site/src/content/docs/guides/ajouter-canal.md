---
title: Canaux disponibles et comment en ajouter un
description: Liste de tous les canaux supportés par NanoClaw, leurs credentials requis, et la procédure complète pour en ajouter un.
---

Les canaux ne sont pas inclus dans l'installation de base. Chacun s'installe via un skill `/add-<canal>` qui copie l'adaptateur depuis la branche `channels`, installe les dépendances, et met à jour les imports.

Seul le canal **CLI** est toujours présent (pas d'installation requise).

---

## Canaux disponibles

### Messageries personnelles

| Canal | Skill | Variables `.env` requises | Notes |
|-------|-------|--------------------------|-------|
| **Telegram** | `/add-telegram` | `TELEGRAM_BOT_TOKEN` | Créer un bot via @BotFather |
| **WhatsApp** (Baileys) | `/add-whatsapp` | `WHATSAPP_PHONE_NUMBER`, `WHATSAPP_ENABLED=true` | QR scan au démarrage, non officiel |
| **WhatsApp Cloud** | `/add-whatsapp-cloud` | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | API officielle Meta Business |
| **Signal** | `/add-signal` | `SIGNAL_ACCOUNT`, `SIGNAL_TCP_HOST`, `SIGNAL_TCP_PORT` | Adaptateur natif (daemon signal-cli TCP) — pas de Chat SDK bridge |
| **iMessage** | `/add-imessage` | `IMESSAGE_ENABLED`, `IMESSAGE_LOCAL`, `IMESSAGE_SERVER_URL`, `IMESSAGE_API_KEY` | macOS uniquement (local) ou Photon API (distant) |
| **WeChat** | `/add-wechat` | `WECHAT_ENABLED=true` | iLink Bot API Tencent, scan QR |
| **DeltaChat** | `/add-deltachat` | `DC_EMAIL`, `DC_PASSWORD`, `DC_IMAP_HOST`, `DC_IMAP_PORT`, `DC_SMTP_HOST`, `DC_SMTP_PORT` | Adaptateur natif (@deltachat/stdio-rpc-server) — pas de Chat SDK bridge. Messagerie chiffrée via email |

### Messageries professionnelles

| Canal | Skill | Variables `.env` requises | Notes |
|-------|-------|--------------------------|-------|
| **Slack** | `/add-slack` | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` | Chat SDK bridge |
| **Discord** | `/add-discord` | `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID` | Chat SDK bridge |
| **Microsoft Teams** | `/add-teams` | `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD`, `TEAMS_APP_TENANT_ID`, `TEAMS_APP_TYPE` | Chat SDK bridge |
| **Google Chat** | `/add-gchat` | `GCHAT_CREDENTIALS` | Chat SDK bridge |
| **Webex** | `/add-webex` | `WEBEX_BOT_TOKEN`, `WEBEX_WEBHOOK_SECRET` | Chat SDK bridge |
| **Matrix** | `/add-matrix` | `MATRIX_BASE_URL` + `MATRIX_ACCESS_TOKEN` + `MATRIX_USER_ID` **ou** `MATRIX_USERNAME` + `MATRIX_PASSWORD` | E2EE supporté avec `MATRIX_RECOVERY_KEY` |

### Outils de développement

| Canal | Skill | Variables `.env` requises | Notes |
|-------|-------|--------------------------|-------|
| **GitHub** | `/add-github` | `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_BOT_USERNAME` | PR et issue comment threads |
| **Linear** | `/add-linear` | `LINEAR_API_KEY` **ou** (`LINEAR_CLIENT_ID` + `LINEAR_CLIENT_SECRET`) + `LINEAR_WEBHOOK_SECRET`, `LINEAR_BOT_USERNAME`, `LINEAR_TEAM_KEY` | Issue comment threads |

### Email et autres

| Canal | Skill | Variables `.env` requises | Notes |
|-------|-------|--------------------------|-------|
| **Resend** (email) | `/add-resend` | `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `RESEND_FROM_NAME`, `RESEND_WEBHOOK_SECRET` | Envoi/réception email via Resend |
| **Emacs** | `/add-emacs` | aucune | Interface HTTP locale pour Emacs |
| **CLI** | *(intégré)* | aucune | Toujours disponible, pas d'installation |

---

## Ajouter un canal

### 1. Installer l'adaptateur

Lancer le skill correspondant dans Claude Code :

```
/add-slack
/add-telegram
/add-discord
# etc.
```

Le skill installe l'adaptateur, les dépendances npm, et reconstruit le host.

### 2. Configurer les credentials

Ajouter les variables requises dans le fichier `.env` à la racine du projet :

```bash
# Exemple pour Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
```

Redémarrer le service pour prendre en compte les nouvelles variables :

```bash
systemctl --user restart nanoclaw   # Linux
```

### 3. Configurer le webhook (si applicable)

La plupart des canaux (Slack, Discord, GitHub, Linear…) utilisent des webhooks entrants.
NanoClaw expose ses webhooks sur le port configuré (défaut : `3000`).

L'URL à enregistrer sur la plateforme a la forme :
```
https://<votre-domaine>:<port>/webhook/<canal>
```

Le skill `/add-<canal>` indique l'URL exacte et les étapes de configuration sur la plateforme.

### 4. Wirer le canal à un agent

Une fois l'adaptateur actif, le canal apparaît automatiquement dans `ncl messaging-groups list` au premier message reçu. Il faut ensuite créer un wiring :

```bash
# Récupérer l'ID du messaging group créé automatiquement
ncl messaging-groups list

# Récupérer l'ID de l'agent cible
ncl groups list

# Créer le wiring
ncl wirings create \
  --messaging-group-id <mg-id> \
  --agent-group-id <ag-id> \
  --engage-mode pattern \
  --engage-pattern "."
```

> Voir [Référence ncl](/reference/ncl/) pour les options de wiring (`engage_mode`, `session_mode`, etc.).

---

## Canal déjà installé ?

Pour vérifier quels canaux sont actifs sur votre installation :

```bash
ncl messaging-groups list
```

Les canaux listés sont ceux pour lesquels au moins un messaging group existe.
Pour voir les adaptateurs enregistrés dans le code, les fichiers sont dans `src/channels/`.
