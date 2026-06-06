---
title: Tableau agents / canaux
description: État actuel des agents configurés, leurs canaux wired, et les paramètres de chaque connexion.
---

:::note[Snapshot statique]
Cette page reflète l'état de l'installation **au dernier build du site**. Pour l'état en temps réel, utiliser `ncl` (voir [Mettre à jour cette page](#mettre-à-jour-cette-page)).
:::

---

## Agents

| Nom | Dossier | Modèle | cli_scope |
|-----|---------|--------|-----------|
| **Nano** | `groups/nano/` | claude-sonnet-4-6 *(défaut)* | `group` |
| **Terminal Agent** | `groups/_ping-test/` | claude-sonnet-4-6 *(défaut)* | `group` |

---

## Canaux wired

### Nano

| Propriété | Valeur |
|-----------|--------|
| Canal | Telegram (DM privé) |
| Session mode | `shared` |
| Engage mode | `pattern` — répond à tous les messages (`"."`) |
| Sender scope | `known` — membres et admins uniquement |

### Terminal Agent

| Propriété | Valeur |
|-----------|--------|
| Canal | CLI local |
| Session mode | `shared` |
| Engage mode | `pattern` — répond à tous les messages (`"."`) |
| Sender scope | `all` — tout le monde |

---

## Destinations

Chaque agent peut envoyer vers les destinations suivantes :

| Agent | Nom local | Type | Cible |
|-------|-----------|------|-------|
| Nano | `telegram-mg-17779` | canal | Telegram (DM) |
| Terminal Agent | `local-cli` | canal | CLI local |

Aucun agent ne peut envoyer à un autre agent pour l'instant. Pour configurer la communication inter-agents, voir [Deux agents qui collaborent](/tutoriels/agents-collaboratifs/).

---

## Rôles et accès

| Utilisateur | Rôle | Portée |
|-------------|------|--------|
| `telegram:928685700` | `owner` | global |

---

## Sessions actives

| Agent | Canal | Statut container | Dernière activité |
|-------|-------|-----------------|-------------------|
| Nano | Telegram | `stopped` | 2026-05-12 |
| Terminal Agent | CLI | `stopped` | 2026-05-12 |

---

## Mettre à jour cette page

Cette page est statique. Pour la mettre à jour après avoir ajouté ou modifié des agents/wirings :

**1. Vérifier l'état actuel avec ncl :**

```bash
# Agents et leur config
ncl groups list

# Canaux wired
ncl messaging-groups list

# Wirings (connexions agents ↔ canaux)
ncl wirings list

# Destinations par agent
ncl destinations list

# Rôles
ncl roles list
```

**2. Mettre à jour le contenu de cette page**, puis rebuilder :

```bash
cd /opt/nanoclaw/docs-site && pnpm build
systemctl --user restart nanoclaw-docs
```
