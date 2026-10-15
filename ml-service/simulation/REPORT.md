# Évaluation du modèle « livré à l'heure »

Source : **données simulées (simulate.py)**. 2621 réclamations clôturées avec échéance connue, taux de livraison à l'heure 73.9%. Modèle trivial (toujours la classe majoritaire) : exactitude 73.9%.

> Ces chiffres concernent des données **simulées** : ils montrent que la chaîne de traitement retrouve des relations connues, pas la performance sur l'historique réel de Coficab. Sur l'historique réel, ré-entraîner puis relire ce rapport.

## Validation croisée (5 plis, 4 répétitions)

| Modèle | AUC | Brier | Exactitude |
|---|---|---|---|
| Réclamation seule (gravité, défaut, délai alloué), régression logistique | 0.761 ± 0.021 | 0.162 | 0.758 |
| Réclamation + employé, régression logistique | 0.791 ± 0.021 | 0.152 | 0.776 |
| Réclamation + employé, gradient boosting | 0.778 ± 0.024 | 0.155 | 0.775 |

L'AUC vaut 0,5 pour le hasard. Le Brier mesure la qualité des probabilités (plus bas = mieux).

## Découpage dans le temps (70 % les plus anciens pour apprendre, 30 % les plus récents pour tester)

| Modèle | AUC | Brier | Exactitude | Modèle trivial |
|---|---|---|---|---|
| Réclamation seule (gravité, défaut, délai alloué), régression logistique | 0.764 | 0.161 | 0.760 | 0.738 |
| Réclamation + employé, régression logistique | 0.809 | 0.152 | 0.766 | 0.738 |
| Réclamation + employé, gradient boosting | 0.798 | 0.152 | 0.771 | 0.738 |

## Calibration (probabilité prédite en 5 groupes égaux, modèle réclamation + employé)

| Groupe | Réclamations | Probabilité prédite | Taux observé |
|---|---|---|---|
| 1 | 525 | 0.44 | 0.40 |
| 2 | 524 | 0.65 | 0.66 |
| 3 | 524 | 0.77 | 0.80 |
| 4 | 524 | 0.87 | 0.88 |
| 5 | 524 | 0.97 | 0.96 |

## L'historique de l'employé ordonne-t-il ses résultats ?

Réclamations regroupées par taux de ponctualité passé de l'employé au moment de l'assignation.

| Groupe | Réclamations | Taux à l'heure observé |
|---|---|---|
| Q1 (plus bas) | 657 | 0.63 |
| Q2 | 654 | 0.71 |
| Q3 | 655 | 0.78 |
| Q4 (plus haut) | 655 | 0.84 |

## Le top 3 du modèle contre le reste (claims du dernier 30 %, équipe de 31)

Pour chaque réclamation, tous les employés sont classés par probabilité prédite telle qu'elle était à l'assignation. On regarde si l'employé qui a réellement traité la réclamation était dans le top 3.

| Employé assigné | Réclamations | Livrées à l'heure |
|---|---|---|
| Dans le top 3 du modèle | 93 | 93.5% |
| Hors du top 3 | 694 | 71.2% |

Écart : **+22.4 points** (intervalle de confiance à 95 % : +16.3 à +28.4). Rang médian de l'employé assigné : 14 sur 31. Part des cas dans le top 3 : 12% (hasard : 10%).

*Observation, pas expérience : les assignations n'ont pas été faites par le modèle. Ce tableau montre que le classement est cohérent avec les résultats, pas ce qui arriverait si le modèle choisissait.*

## Test de récupération (uniquement possible sur données simulées)

Corrélation entre le taux de ponctualité estimé de chaque employé et sa capacité cachée dans la simulation : **0.94** (31 employés). Une valeur nettement positive montre que la chaîne retrouve l'effet qui a été introduit.

## Limites

- Les effets sont modestes : le délai respecté dépend surtout de facteurs que ces données ne contiennent pas.
- Un modèle utile au classement des employés doit améliorer l'AUC grâce aux variables **de l'employé** (ligne « réclamation seule » comparée à « réclamation + employé »).
- Les données réelles de Coficab devront être importées avec l'employé assigné, la date d'assignation et l'échéance.
- Rapport généré le 2026-10-15.

## Choix du poids de lissage (W = 6)

Le taux de ponctualité d'un employé est `(à_l'heure + moyenne_équipe × W) / (clôturés + W)`. W est le nombre de dossiers
« virtuels » au niveau de l'équipe ajoutés à son historique : trop petit, on se fie à 2 ou 3 dossiers ; trop grand, on efface
les vraies différences entre employés. La moyenne d'équipe est celle **mesurée à la date d'assignation** ; les réclamations
assignées avant que 30 issues soient connues sont écartées de l'entraînement (aucune valeur par défaut n'entre dans le
modèle). Les dossiers ouverts depuis plus de 90 jours ne comptent pas dans la charge. Comparaison par validation croisée
(`python smoothing_sweep.py --claims simulated_claims.csv`) :

| Poids W | AUC (validation croisée) | Écart-type | Brier | AUC découpage temps |
|---|---|---|---|---|
| 0 | 0.790 | 0.021 | 0.153 | 0.809 |
| 1 | 0.790 | 0.021 | 0.153 | 0.809 |
| 2 | 0.790 | 0.021 | 0.152 | 0.809 |
| 4 | 0.791 | 0.021 | 0.152 | 0.809 |
| 6 **(retenu)** | 0.791 | 0.021 | 0.152 | 0.809 |
| 10 | 0.791 | 0.021 | 0.152 | 0.809 |
| 20 | 0.791 | 0.021 | 0.152 | 0.810 |
| 40 | 0.790 | 0.022 | 0.152 | 0.810 |
| 80 | 0.787 | 0.022 | 0.153 | 0.810 |

Meilleure AUC : 0.791. Les écarts plus petits que l'écart-type d'un pli ne sont pas significatifs.

**Lecture.** Le résultat varie très peu avec W : les écarts d'AUC sont bien inférieurs à l'écart-type d'un pli. Cela
s'explique : le nombre de dossiers clôturés est lui-même une variable du modèle (il corrige déjà le manque d'historique),
et les employés simulés ont tous un historique long. W = 6 a été gardé comme valeur usuelle (comparable à une estimation
bayésienne avec 6 observations a priori) ; on ne peut pas prétendre qu'il est optimal. Sur l'historique réel de Coficab,
où certains employés ont peu de dossiers, relancer ce script avant de conclure.
