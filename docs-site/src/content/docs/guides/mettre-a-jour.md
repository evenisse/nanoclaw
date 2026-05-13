---
title: Mettre à jour NanoClaw
description: Deux approches pour intégrer les mises à jour upstream — /update-nanoclaw (merge) et /migrate-nanoclaw (migration propre).
---

NanoClaw est un fork que vous personnalisez. Deux skills gèrent les mises à jour upstream, adaptés selon l'ampleur des changements :

| Skill | Quand l'utiliser |
|-------|-----------------|
| `/update-nanoclaw` | Mises à jour régulières, peu de conflits attendus |
| `/migrate-nanoclaw` | Refactorings majeurs upstream, nombreux conflits, ou pour repartir sur une base propre |

---

## `/update-nanoclaw` — mise à jour par merge

Ce skill intègre les commits upstream dans votre branche via `git merge` (ou `cherry-pick` / `rebase` au choix). Il est conçu pour minimiser l'effort tout en préservant vos personnalisations.

### Ce qu'il fait

1. **Preflight** — vérifie que le working tree est propre, configure le remote `upstream` si absent
2. **Backup** — crée une branche et un tag de rollback (`backup/pre-update-<hash>-<timestamp>`)
3. **Preview** — affiche les commits upstream depuis votre dernière sync, groupés par zone (skills, host source, container, config)
4. **Dry-run** — montre quels fichiers seraient en conflit avant de toucher quoi que ce soit
5. **Merge** — résout les conflits fichier par fichier, en préservant vos modifications
6. **Validation** — lance `pnpm build`, tests, et rebuild container si nécessaire
7. **Breaking changes** — lit le CHANGELOG pour signaler les changements cassants et proposer les skills de migration

### Lancer la mise à jour

Dans Claude Code :

```
/update-nanoclaw
```

### Options de merge

Le skill propose plusieurs stratégies :

| Option | Comportement |
|--------|-------------|
| `merge` *(défaut)* | `git merge upstream/main` — résolution en une passe |
| `cherry-pick` | Sélectionner uniquement certains commits upstream |
| `rebase` | Historique linéaire, conflits résolus commit par commit |
| `abort` | Juste voir le changelog, ne rien modifier |

### Rollback

Si quelque chose se passe mal, le tag de rollback est affiché à la fin. Pour revenir en arrière :

```bash
git reset --hard pre-update-<hash>-<timestamp>
```

---

## `/migrate-nanoclaw` — migration propre

Ce skill adopte une approche différente : au lieu de merger, il **extrait vos personnalisations** dans un guide de migration, puis les réapplique sur une base upstream propre. Aucun conflit git — les changements sont rejoués sur le code neuf.

### Quand l'utiliser

- L'upstream a fait un refactoring majeur (renommages, restructurations) qui rendrait le merge douloureux
- Votre fork a beaucoup divergé et accumulé de nombreux commits locaux
- Vous voulez repartir sur une base propre tout en conservant vos personnalisations
- Vous migrez d'une installation v1 vers v2

### Ce qu'il fait

**Phase 1 — Extraction**
1. Analyse la divergence entre votre branche et upstream
2. Identifie vos personnalisations (fichiers modifiés, ajouts, config)
3. Génère un **guide de migration** (`.nanoclaw-migrations/guide.md`) qui capture l'intention et les détails d'implémentation de chaque personnalisation

**Phase 2 — Upgrade**
1. Crée un worktree isolé avec la version upstream propre
2. Relit le guide de migration et réapplique chaque personnalisation
3. Valide le build dans le worktree avant d'affecter l'install live
4. Bascule l'install live vers la nouvelle base

:::note
Les répertoires de données (`groups/`, `data/`, `.env`, `store/`) ne sont jamais touchés — seul le code est migré.
:::

### Lancer la migration

```
/migrate-nanoclaw
```

Le skill détermine automatiquement si une extraction est nécessaire ou si un guide existant peut être réutilisé.

---

## Quelle approche choisir ?

```
Combien de fichiers locaux avez-vous modifiés ?
        │
  Peu (< 20)                  Beaucoup (> 50)
        │                           │
/update-nanoclaw          /migrate-nanoclaw
        │
L'upstream a-t-il refactoré des fichiers que vous avez modifiés ?
        │
   Non → merge rapide
   Oui → /migrate-nanoclaw si les conflits semblent complexes
```

En cas de doute, commencez par `/update-nanoclaw` avec l'option `abort` pour voir le preview — vous pouvez toujours basculer vers `/migrate-nanoclaw` si le diff semble trop compliqué.

---

## Vérifier l'état de synchronisation

```bash
# Commits upstream non encore intégrés
git log HEAD..upstream/main --oneline

# Fichiers divergents
git diff upstream/main --stat HEAD
```
