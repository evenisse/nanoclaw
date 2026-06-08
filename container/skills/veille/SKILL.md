---
name: veille
description: >
  Veille tech francophone pour développeurs. Agrège les flux RSS de sources tech
  francophones (Journal du Hacker, Human Coders News, etc.) et produit un récap
  des articles récents trié par jour. Utiliser /veille pour les 7 derniers jours,
  /veille 3 pour 3 jours, /veille linux pour filtrer par catégorie,
  /veille 7 linux pour combiner les deux. Si aucune catégorie n'est précisée,
  l'agent demande. Mots-clés : veille, recap, news tech, actu dev, francophone, RSS.
user-invokable: true
argument-hint: "[nombre_de_jours] [categorie]"
allowed-tools:
  - Read
  - Bash
---

# Veille Tech Francophone

Tu es un assistant de veille technologique. Tu agrèges les flux RSS de sources tech francophones et tu produis un récap structuré des articles récents.

## Procédure

Suis ces étapes dans l'ordre :

### Étape 1 : Parser les arguments

Extrais depuis les arguments :
- **DAYS** : le premier token numérique trouvé, sinon **7** par défaut.
- **CATEGORY** : le premier token non numérique trouvé (ignoré si c'est "toutes" ou "all"), sinon non défini.

Exemples :
- `/veille` → DAYS=7, CATEGORY=non défini
- `/veille 3` → DAYS=3, CATEGORY=non défini
- `/veille linux` → DAYS=7, CATEGORY=linux
- `/veille 7 linux` → DAYS=7, CATEGORY=linux
- `/veille linux 3` → DAYS=3, CATEGORY=linux

### Étape 1.5 : Demander la catégorie si non précisée

Si CATEGORY n'est **pas** définie :

1. Lis le fichier `~/.claude/skills/veille/sources.yml` (outil `Read`).
2. Extrais toutes les valeurs du champ `categories` et dédoublonne-les pour obtenir la liste des catégories disponibles.
3. Demande à l'utilisateur :

```
Voulez-vous filtrer par catégorie ?
Catégories disponibles : `dev`, `linux`, `devops`, `sécurité`, …

Répondez avec une catégorie, ou **toutes** pour tout afficher.
```

4. Attends la réponse avant de continuer.
   - Si la réponse est "toutes" ou "all" : CATEGORY reste non définie (pas de filtre).
   - Sinon : utilise la réponse comme CATEGORY.

### Étape 2 : Récupérer et parser les articles

Exécute le script via Bash :

```bash
# Sans filtre catégorie
bun ~/.claude/skills/veille/fetch_feeds.js DAYS

# Avec filtre catégorie
bun ~/.claude/skills/veille/fetch_feeds.js DAYS --category CATEGORY
```

Ce script :
- Lit `sources.yml` depuis le même répertoire
- Filtre les sources par catégorie si `--category` est précisé
- Récupère tous les flux RSS en parallèle
- Parse le XML et filtre par date
- Dédoublonne par URL
- Affiche le résultat au format TSV (tab-separated) trié par date décroissante :
  `DATE\tTITLE\tLINK\tCATEGORY\tDESCRIPTION\tSOURCE`

Si le script ne retourne aucun article (catégorie inconnue ou aucune actualité sur la période), indique-le clairement à l'utilisateur.

### Étape 3 : Formater le résultat

À partir de la sortie du script, produis le récap en markdown :

1. **En-tête** :

```
# Veille Tech -- du [date_debut] au [date_fin]
> X articles de Y sources sur les Z derniers jours[, catégorie : CATEGORY]
```

Dates au format français lisible (ex: "3 avril 2026").

2. **Articles groupés par jour**, du plus récent au plus ancien :

```
## [Jour de la semaine] [date au format français]

- **[Titre de l'article](URL)** -- `catégorie` -- *Nom de la source*
  Description courte de l'article...
```

- Jour de la semaine en français : lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche
- Catégorie principale entre backticks (une seule, la plus pertinente)
- Nom de la source en italique
- Si la description est vide ou "N/A", ne pas afficher de ligne de description

3. **Pied de page** : le script affiche une section `SOURCES:` à la fin. Formate-la :

```
---

### Sources
- [Nom de la source](URL du site) -- Description courte
```

### Étape 4 : Gérer les erreurs

- Si le script affiche des lignes `ERROR: ...` (sur stderr), affiche un avertissement au début du récap :

```
> **Note :** Le flux "Nom de la source" n'a pas pu être récupéré.
```

- Si aucun article ne correspond aux critères, indique-le clairement.
