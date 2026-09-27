# AlumniX — refonte visuelle

Base : sauvegarde du dépôt `hexagolem/assistant-polytechnique`, commit `f74a977d1f50c3c6d8ec15b9a74a378fcd472444`.

## Choix retenus

- Composition de la deuxième proposition ; Bodoni Moda pour les titres et Hanken Grotesk pour la lecture.
- Fond clair `#f7f9f6`, verts `#28634e` et `#284d3d`, surlignement `#e1edc0`.
- Nom AlumniX, titre « Les parcours se croisent ici. ».
- Petit X dans le nom AlumniX : tracé vectoriel exact extrait du kit officiel, uniquement recoloré pour la palette. Le grand X de la composition, les légendes des portraits et la phrase en haut à droite ont été retirés à la demande de l’utilisateur.
- Portraits dans l’ordre des promotions : Poincaré 1873, Giscard 1944, Arnault 1969, Mensch 2011. Version sélectionnée par l’utilisateur : avant-avant-dernière retouche, Arnault fortement désaturé, Mensch en couleur. Montage photographique retouché par le générateur d’images intégré, pas une photographie de groupe historique.
- Attente plein écran : sphère de particules centrée, apparition en fondu et texte « Ton réseau s’active. ». Tout le reste est masqué et non interactif pendant la requête ; la réponse prend ensuite la place de l’attente. La préférence système de mouvement réduit est respectée.
- Titre et portraits recadrés dans une composition équilibrée ; aucun rappel de la question ne précède la réponse.

## Périmètre

`public/index.html` et `public/alumnix.css` présentent la connexion et le chat. `experience.js` observe les états visuels existants et ajuste le champ de saisie ; il n’émet aucune requête réseau. Dans `app.js`, les noms affichés « Toi » et « AlumniX » changent et les réponses passent par le lecteur Markdown local `markdown.js`. Les requêtes, les messages transmis à Dust et les états de conversation restent inchangés.

`server.mjs` ajoute uniquement une liste explicite de fichiers visuels et autorise les images de la même origine. Les scripts, styles, images et polices restent locaux. Les routes API, l’authentification, les quotas, le stockage, les conversations Dust et la configuration de déploiement sont inchangés. Les fichiers d’administration sont inchangés.

## Vérifications

- Les 36 tests passent, dont les 29 contrôles existants et 7 tests du rendu Markdown (mise en forme, liens, tableaux, code littéral et contenus malveillants).
- Syntaxe JavaScript vérifiée.
- Polices, images et styles servis avec le type approprié ; `.env`, `server.mjs` et la base SQLite restent inaccessibles depuis le navigateur.
- Parcours testé avec le serveur réel et un adaptateur Dust de démonstration local séparé : connexion, suggestion, envoi, attente, réponse, retour Oui/Non, nouvelle conversation, erreur et déconnexion pendant une recherche.
- Affichage vérifié à 320, 390, 768 et 1440 pixels, sans débordement horizontal. Les colonnes deviennent une pile compacte sur téléphone ; les portraits disparaissent dès le début d’une conversation.

L’aperçu local utilise des données de démonstration. Le script d’aperçu, sa base de données et ses accès ne font pas partie de ce dossier. Aucun appel Dust réel n’a été fait pendant les vérifications visuelles. Pour déployer, garder les variables d’environnement et le disque persistant déjà configurés ; les consignes du README restent valides.

## Sources visuelles

Les crédits des photos sont accessibles dans l’interface. Le montage est distribué sous CC BY-SA 4.0 avec les crédits des sources conservés. Les licences SIL Open Font des deux familles de caractères sont dans `public/assets`.

- X : https://www.polytechnique.edu/presse/kit-media
- Poincaré : https://commons.wikimedia.org/wiki/File:Henri_Poincar%C3%A9_sitting.jpg
- Giscard : https://commons.wikimedia.org/wiki/File:Val%C3%A9ry_Giscard_d%E2%80%99Estaing_1978(2).jpg
- Arnault : https://commons.wikimedia.org/wiki/File:Bernard_Arnault_(2)_-_2017_(cropped).jpg
- Mensch : https://commons.wikimedia.org/wiki/File:Arthur_Mensch.jpg

Instruction de la retouche retenue : réduire uniquement la saturation de Bernard Arnault d’environ 65 %, en gardant Poincaré et Giscard en noir et blanc, Arthur Mensch en couleur, la composition et le contour vert. Retouche faite avec l’outil intégré, sans API personnelle.
