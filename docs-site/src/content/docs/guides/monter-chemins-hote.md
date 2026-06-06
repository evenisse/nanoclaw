---
title: Monter des chemins hôte dans un agent
description: Donner à un agent l'accès à des dossiers de la machine hôte via additionalMounts et mount-allowlist.json.
---

Par défaut, un container agent ne voit que son workspace interne (`/workspace`). Pour lui donner accès à un dossier de la machine hôte — un dépôt Git, un dossier de documents, un serveur MCP local — il faut déclarer un **mount additionnel** et l'autoriser dans l'**allowlist opérateur**.

Les deux mécanismes sont intentionnellement séparés : l'un est côté agent (ce qu'il demande), l'autre est côté opérateur (ce qui est autorisé).

---

## `additionalMounts` — ce que l'agent demande

Chaque agent group peut déclarer des mounts additionnels dans sa configuration container. Ces mounts sont stockés dans la base centrale et matérialisés dans `groups/<dossier>/container.json` à chaque spawn.

### Ajouter un mount via ncl

```bash
# Lire la config actuelle
ncl groups config get --id <group-id>

# Ajouter un mount (merge avec la config existante)
ncl groups config update --id <group-id> \
  --additional-mounts '[{"hostPath":"~/projets/mon-repo","containerPath":"mon-repo","readonly":false}]'
```

### Structure d'un mount

```json
{
  "hostPath": "~/projets/mon-repo",
  "containerPath": "mon-repo",
  "readonly": false
}
```

| Champ | Obligatoire | Description |
|-------|-------------|-------------|
| `hostPath` | Oui | Chemin sur la machine hôte. `~` est résolu vers le home. |
| `containerPath` | Oui | Chemin relatif dans le container (sans `/`). Préfixé automatiquement par `/workspace/extra/`. |
| `readonly` | Non | `true` par défaut si non spécifié ou si l'allowlist ne l'autorise pas. |

### Où le mount apparaît dans le container

```
/workspace/extra/<containerPath>
```

Exemple : `containerPath: "mon-repo"` → `/workspace/extra/mon-repo`

---

## `mount-allowlist.json` — ce que l'opérateur autorise

L'allowlist est le gardien de sécurité. **Si elle n'existe pas ou si un mount n'y figure pas, le mount est bloqué au spawn.** L'allowlist est stockée hors du projet (`~/.config/nanoclaw/mount-allowlist.json`) pour qu'aucun agent ne puisse la modifier.

### Créer ou éditer l'allowlist

```bash
# Emplacement
~/.config/nanoclaw/mount-allowlist.json
```

```json
{
  "allowedRoots": [
    {
      "path": "~/projets",
      "allowReadWrite": true,
      "description": "Dépôts de code"
    },
    {
      "path": "~/Documents/travail",
      "allowReadWrite": false,
      "description": "Documents en lecture seule"
    }
  ],
  "blockedPatterns": [
    "password",
    "secret",
    "token"
  ]
}
```

### Champs de l'allowlist

| Champ | Description |
|-------|-------------|
| `allowedRoots` | Liste des dossiers hôte autorisés à être montés. |
| `allowedRoots[].path` | Chemin racine autorisé. `~` est résolu au chargement. |
| `allowedRoots[].allowReadWrite` | `true` pour autoriser l'écriture. `false` force le read-only même si le mount demande `readonly: false`. |
| `allowedRoots[].description` | Optionnel, pour la lisibilité. |
| `blockedPatterns` | Patterns supplémentaires à rejeter (s'ajoutent aux patterns bloqués par défaut). |

### Patterns bloqués par défaut

Ces patterns sont toujours bloqués, quel que soit le contenu de l'allowlist :

`.ssh` · `.gnupg` · `.gpg` · `.aws` · `.azure` · `.gcloud` · `.kube` · `.docker` · `credentials` · `.env` · `.netrc` · `.npmrc` · `.pypirc` · `id_rsa` · `id_ed25519` · `private_key` · `.secret`

Un path est rejeté si **l'un de ses composants** correspond à l'un de ces patterns.

:::note
L'allowlist est mise en cache en mémoire au démarrage du host. Une modification du fichier ne prend effet qu'au prochain **redémarrage du service NanoClaw** (pas seulement du container agent).
:::

---

## Comment les deux mécanismes interagissent

À chaque spawn de container, le host valide chaque mount déclaré dans `additionalMounts` :

```
Mount déclaré dans additionalMounts
         │
         ▼
1. containerPath valide ?
   (relatif, sans .., sans :)
         │
         ▼
2. hostPath résolu et existant ?
   (~ expandé, symlinks suivis)
         │
         ▼
3. Aucun composant du path ne matche un blockedPattern ?
         │
         ▼
4. Path sous un allowedRoot de l'allowlist ?
         │
         ▼
5. readonly effectif = readonly demandé AND allowedRoot.allowReadWrite
         │
         ▼
   Mount ajouté à la liste des volumes Docker
```

Si l'une des étapes échoue, le mount est **silencieusement ignoré** (le container démarre quand même, sans le mount).

---

## Exemple concret : monter un serveur MCP local

```json
{
  "hostPath": "~/.local/share/mcp-gmail",
  "containerPath": "mcp-gmail",
  "readonly": true
}
```

Allowlist correspondante :

```json
{
  "allowedRoots": [
    {
      "path": "~/.local/share",
      "allowReadWrite": false,
      "description": "Données d'applications locales (lecture seule)"
    }
  ],
  "blockedPatterns": []
}
```

Le container accède au serveur MCP via `/workspace/extra/mcp-gmail`.

---

## Dépannage

**Le mount n'apparaît pas dans le container**

1. Vérifier que l'allowlist existe : `ls ~/.config/nanoclaw/mount-allowlist.json`
2. Vérifier que le `hostPath` existe sur le host et n'est pas un symlink cassé
3. Vérifier que le path n'inclut pas de composant dans les patterns bloqués
4. Vérifier que le path est sous un `allowedRoot` déclaré
5. Redémarrer le service si l'allowlist a été modifiée après le démarrage

**Erreur au spawn : `mount validation failed`**

Consulter les logs host pour le détail de la validation :

```bash
grep -i "mount" logs/nanoclaw.error.log | tail -20
```
