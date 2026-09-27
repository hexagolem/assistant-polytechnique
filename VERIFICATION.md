# Vérifications du paquet

Date : 27 septembre 2026.

## Résultats obtenus

- `npm test` : **14 tests réussis, aucun échec**, sur Node 24.19.0, avec une API Dust simulée et des données fictives.
- Syntaxe vérifiée avec `node --check` pour `server.mjs`, `dust.mjs`, `public/app.js` et `public/admin.js`.
- Aucun appel à votre compte Dust, aucun crédit consommé, aucun déploiement Render effectué.

Les tests couvrent notamment :

- le refus des requêtes sans session et des accès administrateur par un testeur ;
- le contrôle d’origine des requêtes, les cookies HttpOnly/SameSite et les en-têtes de sécurité ;
- le stockage des codes sous forme de hashes et le refus d’un code associé à une autre adresse ;
- l’isolation des conversations, résultats et avis entre deux testeurs ;
- les quotas, leur conservation après redémarrage et après renouvellement d’un code ;
- la révocation d’un accès et la suppression du résultat d’une recherche encore en cours ;
- l’absence de routes publiques pour le code serveur, les secrets et la base SQLite ;
- la restitution du seul texte final, sans configuration, raisonnement ni résultats bruts d’outils ;
- les URL, en-têtes et paramètres envoyés par l’adaptateur Dust, ainsi que le refus des redirections ;
- le refus de configurations de production non sécurisées.

## Limites de cette vérification

La vérification visuelle sur ordinateur et téléphone n’a pas pu être effectuée : le navigateur de test n’était pas disponible et son installation a échoué. La mise en page responsive est préparée, mais son rendu doit encore être vérifié dans un navigateur.

Les réponses HTTP de Dust sont simulées conformément aux schémas consultés. Ces essais ne valident pas votre clé API, votre région, les droits de votre workspace, les sources accessibles par votre agent, ses outils ni sa capacité à répondre à vos questions réelles. Le déploiement Render et son disque persistant doivent également être essayés après configuration.

Ce travail ne constitue pas un audit de sécurité indépendant. Il ne garantit pas qu’un testeur autorisé ne pourra pas extraire des données par ses questions. L’application contrôle l’accès au chat ; le périmètre des données autorisées doit être configuré dans Dust. Commencez avec des données fictives ou anonymisées.

## Premier essai après déploiement

1. Vérifier que le site et `/admin` s’ouvrent en HTTPS et que les identifiants apparaissent uniquement dans les champs prévus.
2. Créer son propre code testeur, puis se connecter dans une fenêtre privée.
3. Poser une question dont la réponse est connue et vérifier la référence affichée.
4. Essayer le site sur téléphone et ordinateur, puis tester les avis et une nouvelle conversation.
5. Retirer cet accès depuis l’administration et vérifier que la session testeur ne peut plus poser de question.
6. Contrôler le coût du premier appel dans Dust avant d’inviter d’autres personnes.
