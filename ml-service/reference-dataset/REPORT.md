# Évaluation du modèle « livré à l'heure »

Source : **données de référence (generate.py)**. 2615 réclamations clôturées avec échéance connue, taux de livraison à l'heure 69.8%. Modèle trivial (toujours la classe majoritaire) : exactitude 69.8%.

> Ces chiffres concernent des données **générées (jeu de référence)** : ils montrent que la chaîne de traitement retrouve des relations connues, pas la performance sur l'historique réel de Coficab. Sur l'historique réel, ré-entraîner puis relire ce rapport.

## Validation croisée (5 plis, 4 répétitions)

| Modèle | AUC | Brier | Exactitude |
|---|---|---|---|
| Réclamation seule (gravité, défaut, délai alloué), régression logistique | 0.767 ± 0.014 | 0.172 | 0.742 |
| Réclamation + employé, régression logistique | 0.795 ± 0.012 | 0.163 | 0.755 |
| Réclamation + employé, gradient boosting | 0.783 ± 0.013 | 0.168 | 0.748 |

L'AUC vaut 0,5 pour le hasard. Le Brier mesure la qualité des probabilités (plus bas = mieux).

## Découpage dans le temps (70 % les plus anciens pour apprendre, 30 % les plus récents pour tester)

| Modèle | AUC | Brier | Exactitude | Modèle trivial |
|---|---|---|---|---|
| Réclamation seule (gravité, défaut, délai alloué), régression logistique | 0.756 | 0.172 | 0.757 | 0.703 |
| Réclamation + employé, régression logistique | 0.790 | 0.163 | 0.758 | 0.703 |
| Réclamation + employé, gradient boosting | 0.787 | 0.167 | 0.754 | 0.703 |

## Calibration (probabilité prédite en 5 groupes égaux, modèle réclamation + employé)

| Groupe | Réclamations | Probabilité prédite | Taux observé |
|---|---|---|---|
| 1 | 523 | 0.36 | 0.36 |
| 2 | 523 | 0.59 | 0.58 |
| 3 | 523 | 0.73 | 0.74 |
| 4 | 523 | 0.85 | 0.86 |
| 5 | 523 | 0.96 | 0.96 |

## L'historique de l'employé ordonne-t-il ses résultats ?

Réclamations regroupées par taux de ponctualité passé de l'employé au moment de l'assignation.

| Groupe | Réclamations | Taux à l'heure observé |
|---|---|---|
| Q1 (plus bas) | 654 | 0.58 |
| Q2 | 654 | 0.66 |
| Q3 | 653 | 0.74 |
| Q4 (plus haut) | 654 | 0.81 |

## Le top 3 du modèle contre le reste (claims du dernier 30 %, équipe de 22)

Pour chaque réclamation, tous les employés sont classés par probabilité prédite telle qu'elle était à l'assignation. On regarde si l'employé qui a réellement traité la réclamation était dans le top 3.

| Employé assigné | Réclamations | Livrées à l'heure |
|---|---|---|
| Dans le top 3 du modèle | 150 | 88.7% |
| Hors du top 3 | 635 | 66.0% |

Écart : **+22.7 points** (intervalle de confiance à 95 % : +16.4 à +29.0). Rang médian de l'employé assigné : 9 sur 22. Part des cas dans le top 3 : 19% (hasard : 14%).

*Observation, pas expérience : les assignations n'ont pas été faites par le modèle. Ce tableau montre que le classement est cohérent avec les résultats, pas ce qui arriverait si le modèle choisissait.*

## Test de récupération (uniquement possible sur données de référence)

Corrélation entre le taux de ponctualité estimé de chaque employé et sa capacité cachée dans le jeu de référence : **0.95** (22 employés). Une valeur nettement positive montre que la chaîne retrouve l'effet qui a été introduit.

## Limites

- Les effets sont modestes : le délai respecté dépend surtout de facteurs que ces données ne contiennent pas.
- Un modèle utile au classement des employés doit améliorer l'AUC grâce aux variables **de l'employé** (ligne « réclamation seule » comparée à « réclamation + employé »).
- Les données réelles de Coficab devront être importées avec l'employé assigné, la date d'assignation et l'échéance.
- Rapport généré le 2026-10-27.
