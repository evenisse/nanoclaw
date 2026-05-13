---
title: Deux agents qui collaborent
description: Mettez en place un Coordinateur et un Analyste qui se délèguent des tâches via le bus de messages interne de NanoClaw.
---

Ce tutoriel met en place deux agents qui se délèguent des tâches :

- **Coordinateur** — reçoit les messages de l'utilisateur sur Telegram, évalue la demande, et délègue les recherches approfondies à Analyste
- **Analyste** — spécialiste silencieux, ne parle jamais à l'utilisateur directement, travaille uniquement sur commande du Coordinateur et lui renvoie ses résultats

```
Utilisateur (Telegram)
        │
        ▼
  ┌─────────────┐   délègue   ┌──────────────┐
  │ Coordinateur│ ──────────► │   Analyste   │
  │  (Telegram) │ ◄────────── │  (interne)   │
  └─────────────┘   résultat  └──────────────┘
```

---

## Prérequis

- NanoClaw installé et en cours d'exécution
- Telegram configuré (voir [Ajouter un canal](/guides/ajouter-canal/))
- L'agent Coordinateur est wired à Telegram (voir [Créer un agent Telegram](/tutoriels/creer-agent-telegram/))

---

## Étape 1 — Créer les deux agents

### Agent Coordinateur

```bash
mkdir -p groups/coordinateur
```

`groups/coordinateur/CLAUDE.local.md` :

```markdown
Tu es Coordinateur, l'interface principale avec l'utilisateur.

Ton rôle :
- Répondre aux questions simples directement
- Pour les questions complexes nécessitant une recherche approfondie,
  déléguer à Analyste via `<message to="analyste">...</message>`
- Synthétiser et reformuler les résultats d'Analyste avant de les transmettre
  à l'utilisateur (ne jamais faire suivre un résultat brut sans l'adapter)
- Informer l'utilisateur quand tu délègues : "Je consulte Analyste sur ce point…"

Tu ne réponds jamais à la place d'Analyste sur des sujets techniques profonds —
délègue plutôt que de donner une réponse incertaine.
```

```bash
ncl groups create --name "Coordinateur" --folder "coordinateur"
# Noter l'ID retourné : ag-COORD-XXXXX
```

### Agent Analyste

```bash
mkdir -p groups/analyste
```

`groups/analyste/CLAUDE.local.md` :

```markdown
Tu es Analyste, un agent de recherche spécialisé.

Ton rôle :
- Traiter les requêtes de recherche et d'analyse envoyées par Coordinateur
- Produire des réponses précises, sourcées, structurées
- Renvoyer tes résultats exclusivement à Coordinateur via
  `<message to="coordinateur">...</message>`
- Ne jamais contacter l'utilisateur final directement

Format de réponse : toujours commencer par un résumé en 2-3 phrases,
suivi des détails si nécessaire.
```

```bash
ncl groups create --name "Analyste" --folder "analyste"
# Noter l'ID retourné : ag-ANAL-XXXXX
```

---

## Étape 2 — Autoriser la communication entre agents

La communication inter-agents est contrôlée par la table `agent_destinations`.
Il faut créer une entrée dans chaque sens.

```bash
# Coordinateur peut envoyer à Analyste (nom local : "analyste")
ncl destinations add \
  --agent-group-id ag-COORD-XXXXX \
  --local-name analyste \
  --target-type agent \
  --target-id ag-ANAL-XXXXX

# Analyste peut renvoyer à Coordinateur (nom local : "coordinateur")
ncl destinations add \
  --agent-group-id ag-ANAL-XXXXX \
  --local-name coordinateur \
  --target-type agent \
  --target-id ag-COORD-XXXXX
```

> Le `local_name` est le nom que l'agent utilise dans ses messages (`<message to="analyste">`).
> Il est local à chaque agent — les deux peuvent utiliser des noms différents pour la même cible.

Vérifier les destinations créées :

```bash
ncl destinations list
```

---

## Étape 3 — Wirer Coordinateur à Telegram

Analyste n'est jamais wired à un canal utilisateur — il est interne.
Seul Coordinateur reçoit les messages Telegram.

```bash
# Récupérer l'ID du messaging group Telegram (créé au premier message)
ncl messaging-groups list

# Créer le wiring
ncl wirings create \
  --messaging-group-id <mg-telegram-id> \
  --agent-group-id ag-COORD-XXXXX \
  --engage-mode pattern \
  --engage-pattern "."
```

---

## Étape 4 — Comment les agents communiquent

### Envoyer un message à un autre agent (réponse finale)

Dans sa réponse finale, un agent utilise des blocs `<message>` pour adresser
un destinataire par son nom local :

```xml
<message to="analyste">
Recherche les dernières avancées en matière de modèles de langage multimodaux
publiées en 2025. Résume les 3 développements les plus significatifs.
</message>
```

Si l'agent n'a qu'un seul destinataire, le `to` peut être omis.

### Envoyer un message en cours de traitement (`send_message`)

Pour envoyer une mise à jour pendant un traitement long (avant la réponse finale) :

```
mcp__nanoclaw__send_message({ to: "analyste", text: "Voici la tâche..." })
```

### Transférer un fichier entre agents (`send_file`)

```
mcp__nanoclaw__send_file({ path: "/workspace/agent/rapport.pdf", to: "coordinateur" })
```

---

## Étape 5 — Tester

Envoyer un message à Coordinateur via Telegram :

```
Quelles sont les dernières avancées en fusion nucléaire en 2025 ?
```

Flux attendu :
1. Coordinateur reçoit la question
2. Coordinateur répond à l'utilisateur : *"Je consulte Analyste sur ce point…"*
3. Coordinateur envoie la tâche à Analyste via `<message to="analyste">`
4. Analyste produit une analyse et la renvoie à Coordinateur via `<message to="coordinateur">`
5. Coordinateur synthétise et transmet le résultat à l'utilisateur sur Telegram

---

## Alternative — Création dynamique d'un agent (depuis un agent admin)

Si le Coordinateur a le scope `cli_scope=global`, il peut créer lui-même un agent
spécialisé à la volée, sans configuration préalable :

```
mcp__nanoclaw__create_agent({
  name: "Analyste",
  instructions: "Tu es un agent d'analyse..."
})
```

Cette approche est **fire-and-forget** : l'appel retourne immédiatement, l'agent
est créé en arrière-plan. La destination bidirectionnelle est créée automatiquement.

> Réserver `create_agent` aux agents qui ont besoin de leur propre mémoire et contexte
> persistant dans le temps. Pour une tâche ponctuelle, utiliser l'outil `Agent` du SDK
> (stateless, pas de footprint persistant).

---

## Isolation et sécurité

- Un agent ne peut envoyer qu'aux destinations explicitement autorisées dans `agent_destinations`
- Le host re-valide chaque message inter-agent côté livraison, indépendamment de la table locale du container
- Les auto-messages (un agent vers lui-même) sont toujours autorisés
- `create_agent` est réservé aux agents avec `cli_scope=global` (accordé manuellement via `ncl roles grant`)

---

## Récapitulatif des commandes

```bash
# Créer les agents
ncl groups create --name "Coordinateur" --folder "coordinateur"
ncl groups create --name "Analyste" --folder "analyste"

# Autoriser la communication dans les deux sens
ncl destinations add --agent-group-id <coord-id> --local-name analyste \
  --target-type agent --target-id <anal-id>
ncl destinations add --agent-group-id <anal-id> --local-name coordinateur \
  --target-type agent --target-id <coord-id>

# Wirer uniquement Coordinateur à Telegram
ncl wirings create --messaging-group-id <mg-id> --agent-group-id <coord-id> \
  --engage-mode pattern --engage-pattern "."

# Vérifier
ncl destinations list
ncl wirings list
```
