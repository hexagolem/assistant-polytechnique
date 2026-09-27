# Assistant Polytechnique — page de test privée

Une page de chat en français reliée à **votre agent Dust existant**, avec des accès individuels, des quotas et une petite interface d’administration. Projet indépendant, sans affiliation officielle avec l’École polytechnique.

**État : code préparé et testé localement avec une API Dust simulée. La connexion à votre vrai agent et le déploiement Render restent à faire.** Aucun fichier Sigma, classement ou Gargantua n’est inclus. Aucune clé réelle n’est incluse.

## Ce que reçoit un testeur

Vous créez son accès dans `/admin`. Vous lui transmettez le lien, son e-mail et un **code aléatoire personnel**. Il les saisit pour ouvrir le chat. Son accès expire à la date choisie et peut être retiré immédiatement.

Cette première version n’envoie **pas d’e-mail automatiquement** et ne vérifie pas la possession de la boîte e-mail : c’est à vous de transmettre le code au bon destinataire. Le code est réutilisable pendant sa validité, comme un mot de passe temporaire. Ce n’est pas un code à usage unique. Un testeur peut transmettre son code ou copier les informations affichées ; aucun site ne peut empêcher complètement cela.

## Étape 1 — Ajouter les fichiers à GitHub

1. Décompressez `assistant_polytechnique_render.zip` sur votre ordinateur.
2. Ouvrez votre dépôt GitHub **privé**, `assistant-polytechnique`.
3. Choisissez **Add file → Upload files**.
4. Glissez **le contenu** du dossier décompressé dans GitHub : `package.json`, `package-lock.json`, `server.mjs`, `dust.mjs`, `render.yaml`, le dossier `public`, le dossier `test`, et les documents. Ne déposez pas l’archive ZIP elle-même. Le fichier `package.json` doit être directement à la racine du dépôt.
5. Si un README existe déjà, remplacez-le par celui-ci. Cliquez sur **Commit changes**.

Le fichier `.gitignore` peut être masqué par votre ordinateur. Il est fourni pour éviter les ajouts accidentels lors d’un futur travail avec Git. L’upload manuel GitHub ne doit jamais inclure de CSV, de base `.db`, de fichier `.env`, de jeton ou de clé API.

## Étape 2 — Préparer l’agent de test dans Dust

1. Dupliquez votre agent en une version de test. Accordez-lui uniquement les sources que **tous les testeurs de cette page** peuvent consulter. Pour démarrer, utilisez un extrait de données anonymisées ou des données fictives.
2. Retirez les outils inutiles, notamment ceux qui permettent d’envoyer des informations vers l’extérieur ou d’explorer d’autres sources. Vérifiez aussi les sources accessibles par les skills de découverte et les agents appelés indirectement.
3. Relevez l’identifiant du workspace et celui de l’agent. Ce sont des identifiants, pas leurs noms. Utilisez les paramètres et informations d’agent de Dust pour les retrouver.
4. Créez une clé API dédiée à ce projet, avec les droits les plus restreints disponibles. La limitation à un seul agent dans le code ne réduit pas les droits de la clé si elle est volée. Un workspace distinct peut isoler davantage le test.
5. Vérifiez la région de votre workspace : `https://dust.tt` ou `https://eu.dust.tt`.
6. Approvisionnez les crédits destinés aux appels API et configurez un plafond de consommation programmatique dans Dust. Le quota de questions de cette page ne constitue **pas** un plafond monétaire : les questions ont des coûts différents.

**Limite de sécurité essentielle :** cette application protège l’accès à la page, sépare les conversations et limite le nombre de demandes. Elle n’ajoute pas de droits par ligne aux outils Dust. Si votre agent peut librement interroger l’intégralité de Sigma, un testeur autorisé peut tenter d’en extraire des informations, y compris en plusieurs questions. Un simple prompt d’interdiction ne suffit pas. Pour donner accès à de vraies coordonnées tout en limitant l’extraction, il faut un outil de recherche spécialisé dont les contrôles s’exécutent avant de fournir les données au modèle. Cet outil n’est pas inclus dans cette première interface.

La clé API exécute les requêtes avec les droits qui lui sont attachés, pas avec un compte Dust propre à chaque testeur. Cette version suppose donc un périmètre de données commun à tous les testeurs.

## Étape 3 — Déployer dans Render

**Coût : ce paquet utilise un service Render payant et un disque persistant de 1 Go**, en plus des crédits Dust. Le disque conserve les accès, sessions, quotas et journaux après un redémarrage. La version gratuite de Render ne fournit pas ce disque. Le prix exact est affiché dans Render avant validation. Ne validez un déploiement qu’après avoir vérifié le tarif. Aucun achat ni déploiement n’a été effectué lors de la préparation de ces fichiers.

### Parcours recommandé avec le fichier fourni

1. Créez votre compte Render, puis connectez GitHub.
2. Autorisez Render à accéder uniquement à votre dépôt `assistant-polytechnique`.
3. Dans Render, choisissez **New → Blueprint**, puis ce dépôt. Render lit `render.yaml` à sa racine.
4. Renseignez les trois valeurs demandées :

| Variable | Valeur à fournir |
|---|---|
| `DUST_API_KEY` | Votre clé API Dust, uniquement dans Render |
| `DUST_WORKSPACE_ID` | Identifiant du workspace Dust |
| `DUST_AGENT_ID` | Identifiant de l’agent **de test** |

5. Le fichier configure `DUST_ORIGIN=https://dust.tt`. Si votre workspace est en Europe, remplacez cette valeur par `https://eu.dust.tt` dans `render.yaml` avant le déploiement, puis enregistrez la modification dans GitHub.
6. Vérifiez le tarif, puis lancez le déploiement. Le service utilise Node 24, une seule instance et un disque monté sur `/var/data`.
7. Ouvrez l’adresse HTTPS `…onrender.com` fournie par Render. L’origine autorisée est lue dans `RENDER_EXTERNAL_URL`. Si vous ajoutez ensuite votre propre domaine, définissez `PUBLIC_ORIGIN` avec son origine exacte, par exemple `https://chat.exemple.fr`, sans `/` final ni chemin.

### Si vous utilisez « New → Web Service »

Ce parcours ne configure pas automatiquement tout le Blueprint. Utilisez :

| Champ | Valeur |
|---|---|
| Runtime | Node |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/healthz` |
| Instance | Payante, une seule instance |
| Persistent Disk | 1 Go, point de montage `/var/data` |
| `NODE_VERSION` | `24.21.0` |
| `DATA_DIR` | `/var/data` |
| `ADMIN_SECRET` | Secret aléatoire d’au moins 32 caractères, généré dans votre gestionnaire de mots de passe |
| Variables Dust | Les trois valeurs ci-dessus, plus `DUST_ORIGIN` selon votre région |

L’application **refuse de démarrer en production sans disque réellement monté**. Ne contournez pas ce contrôle avec `LOCAL_DEVELOPMENT` : il est réservé à l’ordinateur de développement et interdit sur Render.

## Étape 4 — Inviter et révoquer les testeurs

1. Dans Render, ouvrez votre service, puis **Environment**. Le Blueprint a généré `ADMIN_SECRET`. Consultez cette valeur et conservez-la dans votre gestionnaire de mots de passe. Ne la transmettez pas aux testeurs et ne la copiez pas dans GitHub ou une conversation.
2. Ouvrez `https://votre-site.onrender.com/admin`.
3. Connectez-vous avec `ADMIN_SECRET`.
4. Ajoutez votre propre e-mail pour un premier test, choisissez une validité et un quota, puis cliquez sur **Créer le code**.
5. Copiez le message d’invitation. Le code n’est affiché qu’une seule fois et seul son hash est stocké.
6. Ouvrez une fenêtre de navigation privée pour essayer cet accès. La session organisateur et la session testeur utilisent le même navigateur de façon exclusive ; deux fenêtres ou profils séparés évitent les allers-retours.
7. Posez une vraie question simple et vérifiez la réponse et sa source avant d’inviter d’autres personnes.
8. Dans `/admin`, **Retirer l’accès** bloque les nouvelles requêtes et les sessions existantes. Les informations déjà affichées ou copiées ne peuvent pas être reprises.

Créer un nouveau code pour la même adresse invalide les anciens codes et sessions. Le compteur journalier n’est pas remis à zéro.

## Limites et conservation

| Élément | Comportement |
|---|---|
| Quota individuel par défaut | 20 questions par jour, paramétrable par testeur |
| Quota global par défaut | 200 questions par jour, variable `GLOBAL_DAILY_LIMIT` |
| Réinitialisation des quotas | 00:00 UTC |
| Session | 12 heures au maximum, expiration/révocation vérifiées à chaque requête |
| Connexions concurrentes | Une recherche en cours par testeur |
| Longueur d’une question | 2 000 caractères |
| Longueur d’une réponse affichée | 6 000 caractères maximum ; au-delà, la réponse est refusée, pas tronquée |
| Suivi dans une conversation | 12 questions maximum ; une nouvelle conversation est ensuite nécessaire |
| Réponse longue / erreur Dust | Pas de renvoi automatique de la question ; le quota reste consommé car Dust peut avoir facturé |
| Délai de recherche | Environ 4 minutes, hors délais réseau ; tentative d’annulation si les identifiants des messages sont connus |
| Conservation locale des réponses | Jusqu’à environ 1 heure, suppression automatique toutes les minutes lorsque l’application fonctionne |
| Journaux, compteurs et identifiants de conversation | 30 jours, nettoyage périodique |
| Codes | Hashes uniquement ; invitations expirées supprimées après 30 jours |
| Navigateur | Aucun historique dans `localStorage`. Le contenu affiché reste en mémoire tant que la page est ouverte |
| Dust | Les questions et réponses y sont conservées selon les réglages et droits de votre workspace ; les administrateurs autorisés peuvent y avoir accès |
| Sauvegardes Render | Les snapshots du disque peuvent conserver des données plus longtemps que la base active ; voir les règles Render |

Les réponses sont rendues **en texte**, sans HTML, image externe ou téléchargement automatique. Les citations et liens fournis dans le texte par l’agent restent du texte ; les citations interactives propres à Dust ne sont pas reconstruites. Configurez l’agent pour écrire des références vérifiables, par exemple `Source : annuaire, uid=…, observation=…`.

Ne mettez pas de fichiers de données dans ce dépôt. L’application ne propose aucune route de téléchargement du `.db` ou des CSV. Cela n’empêche pas l’agent de restituer les informations auxquelles vous lui donnez accès. Aucun filtre par mots-clés n’est présenté comme une garantie contre les injections de prompt.

## Vérifications avant les invitations

- Une personne sans code ne peut pas envoyer de question.
- Le testeur A ne peut pas lire les résultats ni reprendre la conversation du testeur B.
- Le bouton de révocation invalide immédiatement une session active.
- Le quota reste atteint après redémarrage du service et après renouvellement d’un code.
- La clé Dust et les réponses brutes des outils n’apparaissent pas dans les réponses de l’API du site.
- Les sources autorisées de **votre vrai agent** sont celles que vous souhaitez partager. Les tests de ce paquet ne valident pas les permissions de votre compte Dust.

Le code a été vérifié localement avec `npm test`. Le fichier `VERIFICATION.md` indique les essais effectués et leurs limites. Ce n’est pas un audit de sécurité indépendant ni une garantie d’absence de vulnérabilité.

## Développement local (facultatif)

Node 24 est nécessaire. Le projet ne dépend d’aucun paquet npm tiers ; il utilise notamment SQLite fourni avec Node.

Créez un fichier `.env` **local et ignoré par Git** avec `LOCAL_DEVELOPMENT=true`, `PUBLIC_ORIGIN=http://localhost:3000`, `DATA_DIR=./local-data`, un `ADMIN_SECRET` aléatoire, puis les valeurs Dust si vous voulez appeler votre véritable agent. Lancez `node --env-file=.env server.mjs`. Gardez ce mode sur votre ordinateur, sans tunnel public.

`npm test` utilise une API simulée, des codes fictifs et des dossiers temporaires. Il ne contacte pas Dust et ne consomme pas de crédits.

## Références techniques

- [Render : Web Services](https://render.com/docs/web-services)
- [Render : disques persistants](https://render.com/docs/disks)
- [Render : variables et secrets](https://render.com/docs/configure-environment-variables)
- [Render : Blueprints](https://render.com/docs/blueprint-spec)
- [Dust : créer une conversation](https://docs.dust.tt/api-reference/conversations/create-a-new-conversation)
- [Dust : ajouter un message](https://docs.dust.tt/api-reference/conversations/create-a-message)
- [Dust : lire une conversation](https://docs.dust.tt/api-reference/conversations/get-a-conversation)
- [Dust : annuler une génération](https://docs.dust.tt/api-reference/conversations/cancel-message-generation-in-a-conversation)

Documentation vérifiée le 27 septembre 2026. Les tarifs et interfaces peuvent évoluer.
