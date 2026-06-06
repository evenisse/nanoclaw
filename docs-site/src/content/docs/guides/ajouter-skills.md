---
title: Ajouter des skills à un agent
description: Comment créer des container skills et les activer sur un groupe d'agents.
---

Les **container skills** sont des fichiers `SKILL.md` chargés dans chaque session d'agent au démarrage du container. Elles définissent des comportements, des commandes ou des workflows que l'agent peut utiliser.

## Où vivent les skills

Toutes les skills partagées sont dans `container/skills/` à la racine du projet :

```
container/skills/
  agent-browser/       # navigation web
  onecli-gateway/      # proxy credentials
  welcome/             # message d'accueil
  self-customize/      # auto-modification
  slack-formatting/    # syntaxe Slack mrkdwn
  ...
```

Au spawn du container, NanoClaw crée des symlinks dans `data/v2-sessions/<group-id>/.claude-shared/skills/` qui pointent vers ces dossiers montés en lecture seule.

## Créer une nouvelle skill

Crée un répertoire dans `container/skills/<nom-skill>/` avec un fichier `SKILL.md` :

```markdown
---
name: ma-skill
description: Ce que fait la skill et quand l'utiliser.
---

Instructions ici...
```

**Règles de format :**
- `name` : minuscules, alphanumérique + tirets, max 64 caractères
- `description` : obligatoire — Claude s'en sert pour décider quand invoquer la skill
- Garder `SKILL.md` sous 500 lignes ; mettre le détail dans des fichiers annexes
- Ne pas mettre de code inline dans le `SKILL.md` — l'isoler dans des fichiers séparés

## Ajouter des scripts à une skill

### Scripts sans dépendances externes

Place les fichiers sources directement dans le répertoire de la skill :

```
container/skills/ma-skill/
  SKILL.md
  mon-script.py    # ou .js, .ts
```

À l'intérieur du container, les fichiers sont accessibles via :
- `/app/skills/ma-skill/mon-script.py` (chemin du mount RO)
- `${CLAUDE_SKILL_DIR}/mon-script.py` (variable Claude Code, préférable dans les instructions)

Cette approche fonctionne sans rebuild tant que le script n'utilise que la stdlib Python, les modules Node built-in, ou Bun (déjà installé dans le container).

### Scripts avec dépendances externes

Le container ne contient pas Python et n'inclut que les paquets npm globaux explicitement installés dans le `Dockerfile` (`vercel`, `agent-browser`, `claude-code`, etc.). Pour ajouter des dépendances :

**Paquet npm global** — ajouter dans le `Dockerfile` et rebuilder :
```dockerfile
ARG MON_OUTIL_VERSION=1.2.3
RUN --mount=type=cache,target=/root/.cache/pnpm \
    pnpm install -g "mon-outil@${MON_OUTIL_VERSION}"
```

**Paquet système (apt)** — même principe, dans le bloc `apt-get install` du `Dockerfile`.

**Sans rebuild** — l'agent peut installer des paquets via `install_packages` (auto-modification), mais c'est une config par groupe, pas par skill.

## Sélection des skills par groupe

La colonne `skills` dans `container_configs` détermine quelles skills sont actives pour un groupe :

| Valeur | Comportement |
|--------|-------------|
| `"all"` | Toutes les skills de `container/skills/` (défaut) — les nouvelles skills apparaissent automatiquement |
| `["skill1", "skill2"]` | Sélection explicite — seules ces skills sont activées |

### Voir la config actuelle

```bash
ncl groups config get --id <group-id>
```

### Passer à une liste explicite

```bash
ncl groups config update --id <group-id> --skills '["onecli-gateway","welcome","ma-skill"]'
```

### Revenir à "all"

```bash
ncl groups config update --id <group-id> --skills '"all"'
```

Les changements prennent effet au prochain démarrage du container (nouveau message ou `ncl groups restart`).

## Skills spécifiques à un seul groupe

Pour une skill propre à un groupe sans l'exposer aux autres, utilise le overlay `agent-runner-src/` du groupe :

```
groups/<folder>/agent-runner-src/
  .claude/
    skills/
      ma-skill-privee/
        SKILL.md
```

Ce répertoire est monté par-dessus le code partagé — son contenu est visible uniquement dans ce groupe.
