---
title: Ce que chaque agent sait faire
description: Capacités et spécialités des agents configurés sur cette installation NanoClaw.
---

Cette page décrit les capacités des agents actifs sur cette installation. Toutes les capacités listées ici sont chargées automatiquement à chaque démarrage de container — il n'y a pas de mode "activé/désactivé" pour les fonctionnalités de base.

---

## Capacités communes à tous les agents

Les deux agents partagent les mêmes capacités de base, issues des **container skills** chargés dans chaque session.

### Conversation et raisonnement

Chaque agent tourne sur Claude Sonnet 4.6 (défaut de l'installation). Il peut rédiger, analyser, résumer, coder, traduire, expliquer — toutes les tâches de langage classiques.

### Navigation web

Via l'outil `agent-browser`, l'agent peut ouvrir des pages, cliquer, remplir des formulaires, prendre des captures d'écran et extraire du contenu. Aucune configuration supplémentaire n'est nécessaire.

```
Vous : Résume les dernières nouvelles sur Hacker News
→ L'agent ouvre news.ycombinator.com, lit les titres, vous fait un résumé
```

### Accès aux APIs externes (OneCLI gateway)

Les appels HTTP sortants passent automatiquement par le proxy OneCLI, qui injecte les credentials stockés dans le vault. L'agent n'a jamais accès aux clés brutes — il fait ses requêtes directement, le proxy s'occupe de l'authentification.

Services actuellement connectés :
- **Gmail** — lecture et envoi d'emails via le MCP Gmail

Pour ajouter un service, voir [Gérer les credentials OneCLI](/guides/credentials-onecli/).

### Planification de tâches

L'agent peut planifier des tâches récurrentes ou ponctuelles avec `schedule_task`. La tâche persiste entre les sessions et les redémarrages. Elle peut inclure un script de condition (bash) qui ne réveille l'agent que si la condition est vraie — utile pour surveiller un état sans consommer de tokens inutilement.

```
Vous : Rappelle-moi chaque lundi matin les tâches en cours sur GitHub
→ L'agent planifie une tâche récurrente avec un script qui vérifie les issues ouvertes
```

### Création d'agents collaborateurs

L'agent peut créer des agents spécialisés avec `create_agent`. Chaque agent créé a son propre container, son propre workspace persistant, et peut recevoir des tâches en parallèle. Pratique pour déléguer un travail long sans bloquer la conversation principale.

```
Vous : Lance une recherche approfondie sur les alternatives à PostgreSQL pour notre use case
→ L'agent crée un "Researcher" qui travaille en parallèle et vous envoie un rapport
```

Voir le tutoriel [Deux agents qui collaborent](/tutoriels/agents-collaboratifs/) pour un exemple concret.

### Commandes ncl (portée limitée)

Les agents ont accès aux commandes `ncl` avec un `cli_scope` de type `group` : ils peuvent consulter et modifier leur propre configuration (groupe, sessions, destinations, membres), mais pas les autres agents ni les wirings globaux.

---

## Nano

| Propriété | Valeur |
|-----------|--------|
| Canal | Telegram (DM privé) |
| Modèle | claude-sonnet-4-6 |
| Engage mode | `pattern "."` — répond à tout message |
| Personnalité | Défaut Claude (aucune instruction spécifique) |

Nano est l'agent principal accessible via Telegram. Il n'a pas de rôle prédéfini — il s'adapte aux demandes au fil de la conversation et accumule du contexte dans son workspace persistant (`groups/nano/`).

---

## Terminal Agent

| Propriété | Valeur |
|-----------|--------|
| Canal | CLI local |
| Modèle | claude-sonnet-4-6 |
| Engage mode | `pattern "."` — répond à tout message |
| Personnalité | Assistant personnel concis |

Terminal Agent est accessible depuis le terminal de la machine hôte. Sa personnalité est configurée dans `groups/_ping-test/CLAUDE.local.md` : il se présente brièvement au premier contact et garde des réponses concises.

---

## Étendre les capacités

Les capacités d'un agent peuvent être étendues de deux façons :

**Depuis une conversation avec l'agent** (auto-modification) :
- Installer un paquet système ou npm : `install_packages` → demande d'approbation admin
- Ajouter un serveur MCP : `add_mcp_server` → demande d'approbation admin
- Modifier ses instructions : édition directe de `CLAUDE.local.md`, sans approbation

**Depuis le terminal opérateur** :
```bash
# Ajouter un serveur MCP à un agent
ncl groups config add-mcp-server --id <agent-id> --name <nom> --command <cmd>

# Ajouter un paquet npm global
ncl groups config add-package --id <agent-id> --type npm --package <pkg>
```

Pour les credentials d'APIs externes, voir [Gérer les credentials OneCLI](/guides/credentials-onecli/).
