import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const port = parseInt(process.env.DOCS_PORT ?? '4321', 10);

export default defineConfig({
  server: { port, host: '0.0.0.0' },
  preview: { port, host: '0.0.0.0' },
  integrations: [
    starlight({
      title: 'NanoClaw',
      description: 'Documentation opérateur et utilisateur',
      defaultLocale: 'root',
      locales: { root: { label: 'Français', lang: 'fr' } },
      sidebar: [
        {
          label: 'Tutoriels',
          items: [
            { label: 'Créer un agent Telegram', slug: 'tutoriels/creer-agent-telegram' },
            { label: 'Deux agents qui collaborent', slug: 'tutoriels/agents-collaboratifs' },
            { label: 'Équipe dev Spec/Dev/Reviewer/Doc avec Jira', slug: 'tutoriels/equipe-dev-jira' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Ajouter un canal', slug: 'guides/ajouter-canal' },
            { label: 'Envoyer un message à un agent', slug: 'guides/envoyer-message' },
            { label: 'Cibler un agent spécifique', slug: 'guides/cibler-agent' },
            { label: 'Ce que chaque agent sait faire', slug: 'guides/capacites-agents' },
            { label: 'Wirer un canal à un agent', slug: 'guides/wirer-canal-agent' },
            { label: "Configurer l'engage_mode", slug: 'guides/engage-mode' },
            { label: 'Gérer les credentials OneCLI', slug: 'guides/credentials-onecli' },
            { label: 'Monter des chemins hôte', slug: 'guides/monter-chemins-hote' },
            { label: 'Déboguer un agent', slug: 'guides/deboguer-agent' },
            { label: 'Gérer les utilisateurs et les droits', slug: 'guides/gerer-utilisateurs' },
            { label: 'Planifier des tâches récurrentes', slug: 'guides/planifier-taches' },
            { label: 'Mettre à jour NanoClaw', slug: 'guides/mettre-a-jour' },
            { label: "Variables d'environnement", slug: 'guides/variables-env' },
          ],
        },
        {
          label: 'Référence',
          items: [
            { label: 'Commandes ncl', slug: 'reference/ncl' },
            { label: 'Modes de session', slug: 'reference/modes-session' },
            { label: 'Tableau agents / canaux', slug: 'reference/tableau-agents-canaux' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'Architecture NanoClaw', slug: 'concepts/architecture' },
            { label: "Modèle d'entités", slug: 'concepts/modele-entites' },
            { label: 'Sécurité et isolation', slug: 'concepts/securite-isolation' },
          ],
        },
      ],
    }),
  ],
});
