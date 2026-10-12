# Évaluation du modèle « livré à l'heure »

Source : **données simulées (simulate.py)**. 2682 réclamations clôturées avec échéance connue, taux de livraison à l'heure 74.2%. Modèle trivial (toujours la classe majoritaire) : exactitude 74.2%.

> Ces chiffres concernent des données **simulées** : ils montrent que la chaîne de traitement retrouve des relations connues, pas la performance sur l'historique réel de Coficab. Sur l'historique réel, ré-entraîner puis relire ce rapport.

## Validation croisée (5 plis, 4 répétitions)

| Modèle | AUC | Brier | Exactitude |
|---|---|---|---|
| Réclamation seule (gravité, défaut, délai alloué), régression logistique | 0.759 ± 0.019 | 0.162 | 0.759 |
| Réclamation + employé, régression logistique | 0.791 ± 0.020 | 0.151 | 0.777 |
| Réclamation + employé, gradient boosting | 0.782 ± 0.023 | 0.153 | 0.778 |

L'AUC vaut 0,5 pour le hasard. Le Brier mesure la qualité des probabilités (plus bas = mieux).

## Découpage dans le temps (70 % les plus anciens pour apprendre, 30 % les plus récents pour tester)

| Modèle | AUC | Brier | Exactitude | Modèle trivial |
|---|---|---|---|---|
| Réclamation seule (gravité, défaut, délai alloué), régression logistique | 0.766 | 0.160 | 0.761 | 0.740 |
| Réclamation + employé, régression logistique | 0.809 | 0.149 | 0.775 | 0.740 |
| Réclamation + employé, gradient boosting | 0.798 | 0.151 | 0.779 | 0.740 |

## Calibration (probabilité prédite en 5 groupes égaux, modèle réclamation + employé)

| Groupe | Réclamations | Probabilité prédite | Taux observé |
|---|---|---|---|
| 1 | 537 | 0.44 | 0.41 |
| 2 | 536 | 0.65 | 0.66 |
| 3 | 536 | 0.78 | 0.79 |
| 4 | 536 | 0.88 | 0.88 |
| 5 | 537 | 0.97 | 0.96 |

## L'historique de l'employé ordonne-t-il ses résultats ?

Réclamations regroupées par taux de ponctualité passé de l'employé au moment de l'assignation.

| Groupe | Réclamations | Taux à l'heure observé |
|---|---|---|
| Q1 (plus bas) | 672 | 0.63 |
| Q2 | 670 | 0.71 |
| Q3 | 672 | 0.78 |
| Q4 (plus haut) | 668 | 0.85 |

## Test de récupération (uniquement possible sur données simulées)

Corrélation entre le taux de ponctualité estimé de chaque employé et sa capacité cachée dans la simulation : **0.94** (31 employés). Une valeur nettement positive montre que la chaîne retrouve l'effet qui a été introduit.

## Limites

- Les effets sont modestes : le délai respecté dépend surtout de facteurs que ces données ne contiennent pas.
- Un modèle utile au classement des employés doit améliorer l'AUC grâce aux variables **de l'employé** (ligne « réclamation seule » comparée à « réclamation + employé »).
- Les données réelles de Coficab devront être importées avec l'employé assigné, la date d'assignation et l'échéance.
- Rapport généré le 2026-10-11.

## Choix du poids de lissage (W = 6)

Le taux de ponctualité d'un employé est `(à_l'heure + moyenne_équipe × W) / (clôturés + W)`. W est le nombre de dossiers
« virtuels » au niveau de l'équipe ajoutés à son historique : trop petit, on se fie à 2 ou 3 dossiers ; trop grand, on efface
les vraies différences entre employés. La moyenne d'équipe est celle connue **à la date d'assignation** (75 % tant que moins
de 30 issues sont connues). Comparaison par validation croisée (`python smoothing_sweep.py --claims simulated_claims.csv`) :

| Poids W | AUC (validation croisée) | Écart-type | Brier | AUC découpage temps |
|---|---|---|---|---|
| 0 | 0.789 | 0.020 | 0.153 | 0.809 |
| 1 | 0.789 | 0.020 | 0.152 | 0.809 |
| 2 | 0.790 | 0.020 | 0.152 | 0.810 |
| 4 | 0.790 | 0.020 | 0.152 | 0.809 |
| 6 **(retenu)** | 0.790 | 0.020 | 0.152 | 0.810 |
| 10 | 0.790 | 0.020 | 0.152 | 0.809 |
| 20 | 0.790 | 0.020 | 0.152 | 0.810 |
| 40 | 0.789 | 0.020 | 0.152 | 0.810 |
| 80 | 0.786 | 0.020 | 0.153 | 0.811 |

Meilleure AUC : 0.790. Les écarts plus petits que l'écart-type d'un pli ne sont pas significatifs.

**Lecture.** Entre W = 0 et W = 40, l'AUC varie de 0,001 environ, soit bien moins que l'écart-type (0,020) : le résultat est
**insensible** au poids sur ces données. Cela s'explique : le nombre de dossiers clôturés est lui-même une variable du modèle
(il corrige déjà le manque d'historique), et les employés simulés ont tous un historique long. W = 6 a été gardé comme valeur
usuelle (comparable à une estimation bayésienne avec 6 observations a priori) ; on ne peut pas prétendre qu'il est optimal.
Sur l'historique réel de Coficab, où certains employés ont peu de dossiers, relancer ce script avant de conclure.

