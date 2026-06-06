---
title: Planifier des tâches récurrentes
description: Utiliser schedule_task pour automatiser des rappels, surveillances, rapports — avec ou sans script de condition.
---

Les tâches planifiées permettent à un agent de s'auto-réveiller à une heure donnée ou selon une récurrence, sans qu'un message humain soit nécessaire. Elles persistent entre les sessions et les redémarrages du service.

---

## Créer une tâche depuis un agent

La planification se fait depuis une conversation avec l'agent — pas depuis la ligne de commande. L'agent utilise l'outil `schedule_task` :

```
Vous : Rappelle-moi tous les lundis matin à 9h de faire le point sur mes tâches en cours.
```

L'agent exécutera quelque chose comme :

```
mcp__nanoclaw__schedule_task({
  prompt: "Envoie un rappel à l'utilisateur : faire le point sur les tâches en cours.",
  processAfter: "2026-05-18T09:00:00",   ← prochain lundi 9h (heure locale)
  recurrence: "0 9 * * 1"               ← chaque lundi à 9h
})
```

L'agent interprète automatiquement l'heure dans votre fuseau horaire local.

---

## Paramètres de `schedule_task`

| Paramètre | Requis | Description |
|-----------|--------|-------------|
| `prompt` | oui | Instructions que l'agent recevra au moment du déclenchement |
| `processAfter` | oui | Date/heure ISO 8601 du premier déclenchement (ex : `"2026-05-20T09:00:00"`) |
| `recurrence` | non | Expression cron pour la récurrence |
| `script` | non | Script bash qui s'exécute avant l'agent (voir ci-dessous) |

### Expressions cron courantes

| Expression | Signification |
|------------|--------------|
| `0 9 * * 1-5` | Du lundi au vendredi à 9h |
| `0 9 * * 1` | Chaque lundi à 9h |
| `0 8 * * *` | Tous les jours à 8h |
| `0 */6 * * *` | Toutes les 6 heures |
| `0 9 1 * *` | Le 1er de chaque mois à 9h |

Les expressions cron sont interprétées dans le fuseau horaire local de l'utilisateur.

---

## Script de condition

Pour les tâches fréquentes, un **script de condition** permet de n'éveiller l'agent que si quelque chose a changé — économisant les tokens et évitant les rate limits.

### Principe

```
Tâche se déclenche
    ↓
Script bash s'exécute
    ↓ retourne { "wakeAgent": true/false, "data": {...} }
    ↓
wakeAgent=false → rien, attendre la prochaine occurrence
wakeAgent=true  → l'agent se réveille avec les données du script + le prompt
```

### Exemple — surveiller les PRs GitHub ouvertes

```
Vous : Vérifie toutes les heures si j'ai des PRs GitHub ouvertes.
       Si oui, résume-les moi. Sinon, ne fais rien.
```

L'agent créera une tâche avec un script comme :

```bash
node --input-type=module -e "
  const r = await fetch('https://api.github.com/repos/mon-org/mon-repo/pulls?state=open');
  const prs = await r.json();
  console.log(JSON.stringify({ wakeAgent: prs.length > 0, data: prs.slice(0, 5) }));
"
```

Si `prs.length === 0`, le script retourne `wakeAgent: false` et l'agent ne se réveille pas. Si des PRs existent, il les reçoit dans `data` et produit un résumé.

:::tip
Toujours tester le script manuellement avant de le confier à une tâche. Demandez à l'agent de le tester dans la conversation d'abord.
:::

### Quand ne pas utiliser de script

Si la tâche nécessite le jugement de l'agent à chaque fois (rapport quotidien, synthèse, briefing), n'utilisez pas de script — le prompt seul suffit.

---

## Gérer les tâches existantes

### Lister les tâches

```
Vous : Liste mes tâches planifiées.
→ L'agent appelle list_tasks et vous affiche la liste avec les IDs de série.
```

### Modifier une tâche

```
Vous : Décale la tâche de rapport hebdo à 10h au lieu de 9h.
→ L'agent appelle update_task avec le nouvel horaire.
```

`update_task` est préférable à annuler + recréer : il conserve l'historique de la série.

### Suspendre et reprendre

```
Vous : Suspend le rappel du lundi pendant mes vacances.
→ pause_task

Vous : Reprends le rappel du lundi.
→ resume_task
```

### Annuler définitivement

```
Vous : Annule le rapport hebdo, je n'en ai plus besoin.
→ cancel_task
```

---

## Bonnes pratiques

**Fréquence et coûts** — chaque déclenchement consomme des tokens API. Plus d'une fois par heure sans script de condition risque de générer des coûts importants et de déclencher des rate limits. Utilisez toujours un script pour les tâches très fréquentes.

**Prompts précis** — le prompt de la tâche est tout ce que l'agent voit au moment du déclenchement. Il n'a pas accès au contexte de la conversation dans laquelle la tâche a été créée. Rédigez le prompt comme s'il était autonome.

**Fuseaux horaires** — l'agent interprète les heures dans votre fuseau horaire. Si vous êtes sur Europe/Paris, `"9h"` devient `"2026-05-18T07:00:00Z"` en UTC. Vous n'avez pas besoin de gérer l'UTC vous-même.
