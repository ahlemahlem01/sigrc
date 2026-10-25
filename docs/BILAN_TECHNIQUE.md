# Bilan technique (dossier de soutenance)

État du système au 25/10/2026, après la boucle d'apprentissage de la vision par ordinateur et la capture mobile.

## Tests automatisés

| Suite | Résultat |
|---|---|
| .NET : application (unitaires) | 66 réussis, 0 échec |
| .NET : API (intégration, SQLite en mémoire) | 187 réussis, 0 échec |
| Jest (frontend) | 75 réussis sur 18 suites, 0 échec |
| Typage du frontend (`tsc --noEmit`) | sans erreur |
| Service ML (pytest) | 24 réussis, 0 échec |

## Base de données

| Contrôle | Résultat |
|---|---|
| Migrations appliquées | 12 (API plans, dernière : `AddClaimCvFeedback`) et 3 (API d'authentification) |
| Réclamations | 4 325 |
| Plans d'actions / actions | 219 / 769 |
| Actions sans plan (orphelines) | 0 |
| Réclamations sans type de défaut | 0 |
| Réclamations marquées pour l'apprentissage (`CvCorrectionLogged`) | 0 (aucune photo analysée en production) |
| Tableau de bord | 609 réclamations ouvertes, 25 en retard |
| Sauvegarde / retour arrière | chaque correction de données a son script de restauration (non versionné) |

Le détail des contrôles avant / après chaque évolution est dans `docs/NON_REGRESSION.md`.

## Fonctionnalités récentes

- Comparaison des départements sur le tableau de bord admin (organisations vides masquées).
- Listes de référence : 5 codes défaut d'inspection avec libellés, 9 sites clients cabliers ; libellé affiché partout, valeur stockée inchangée.
- Boucle d'apprentissage : proposition du service d'image, confirmation ou correction en un clic, fanion d'apprentissage calculé par le serveur.
- Capture mobile / tablette : bouton « Prendre une photo » (caméra arrière), limite 10 Mo.
- Mode démonstration du service d'image (`scripts/demo-cv.ps1`), signalé à l'écran.

## Points à annoncer honnêtement

- Le service d'image n'a pas de modèle entraîné : l'interface et la boucle de retour sont prêtes, la prédiction réelle reste à brancher.
- Les données sont en grande partie un **jeu de référence généré** (bandeau affiché sur la vue d'ensemble) : les performances du modèle de recommandation ne sont pas celles de l'historique réel de Coficab.
- Le rapport 8D, les alertes et la recommandation fonctionnent sur ces données ; la validation sur l'historique réel est l'étape suivante.
