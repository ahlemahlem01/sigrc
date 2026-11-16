# Modèle d'apprentissage automatique du délai de résolution

## Ce que c'est
Pour chaque nouvelle réclamation, l'application affiche un délai estimé (P50 et P80, en jours) et suggère une date limite (création + P80).

- **Méthode de base (toujours disponible)** : centiles empiriques des réclamations closes semblables (même défaut et même gravité, au moins 5 cas ; sinon même gravité ; sinon tous les dossiers). C'est de la statistique descriptive, pas de l'apprentissage automatique.
- **Modèle ML (ajouté)** : régression par quantiles (gradient boosting, scikit-learn) qui prédit le P50 et le P80 à partir des informations connues à la création : défaut, gravité, client, ligne, équipe, interne ou client, quantités produite et défectueuse, mois, et la personne en charge si elle est déjà connue.

Le modèle **ne remplace pas** les centiles. Il n'est utilisé que s'il a passé un garde-fou ; sinon, ou si le service ML est indisponible, l'application garde les centiles. L'écran indique la méthode utilisée (« modèle d'apprentissage automatique validé, entraîné sur N dossiers clos » ou « basé sur N dossiers similaires »).

## Comment il est validé
Découpage dans le temps : entraînement sur les 80 % de dossiers clos les plus anciens, test sur les 20 % les plus récents, que le modèle n'a jamais vus (10 032 dossiers d'entraînement, 2 508 de test). Comparaison avec les centiles calculés sur les mêmes données d'entraînement. Mesure : perte « pinball » (la mesure standard d'un quantile ; plus petit est mieux) et couverture réelle du P80 (doit être proche de 80 %).

Garde-fou, fixé avant de regarder les chiffres. Toutes les conditions doivent être vraies, dans les deux situations (personne en charge connue / pas encore connue) :
1. le P80 bat les centiles, avec un intervalle de confiance à 95 % (bootstrap, 500 tirages) entièrement au-dessus de zéro ;
2. le P50 bat aussi les centiles ;
3. le P80 couvre entre 74 % et 86 % des dossiers non vus.

## Résultats (dossiers de test non vus)
| | Centiles | Modèle, personne en charge connue | Modèle, personne en charge inconnue |
|---|---|---|---|
| Perte P50 | 2,820 | 2,689 (−4,7 %) | 2,763 (−2,0 %) |
| Perte P80 | 2,445 | 2,316 (−5,2 %) | 2,400 (−1,8 %) |
| Couverture du P80 | 78,4 % | 80,1 % | 80,0 % |
| Intervalle à 95 % du gain P80 | n/a | [0,075 ; 0,189] | [0,001 ; 0,088] |

Verdict : **modèle validé**, mais avec un **gain modeste**. Quand la personne en charge n'est pas encore connue (cas fréquent à la création), le gain est de l'ordre de 2 % et la borne basse de l'intervalle est à peine au-dessus de zéro : le garde-fou est franchi de justesse. Le gain le plus net vient de la connaissance de la personne en charge.

## À dire honnêtement
- Environ 85 % des dossiers historiques sont des données de référence (fictives mais réalistes). Ces chiffres montrent que la méthode fonctionne et que le garde-fou fait son travail ; ils ne sont **pas** une performance réelle chez Coficab.
- L'avantage du modèle sur les centiles est petit. Les centiles restent plus simples à expliquer (« basé sur 27 dossiers similaires »). Le modèle est un complément mesuré, pas une rupture.
- Le modèle ne voit que les dossiers déjà clos.

## Fichiers
- `ml-service/delay_logic.py` : préparation, centiles de référence, entraînement, garde-fou, prédiction.
- `ml-service/train_delay.py` : entraîne à partir d'un export CSV ; écrit `artifacts/delay_model.joblib` et `artifacts/delay_report.json` (les anciens fichiers sont gardés en `*.previous.*`).
- `ml-service/export_closed_claims.sql` : l'export des dossiers clos (sans données personnelles ni texte libre).
- `ml-service/api.py` : `POST /estimate-delay` (répond seulement si le modèle est validé) et `GET /delay-model` (rapport de validation).
- `Coficab.Auth/.../Services/DelayModel.cs` et `API/Services/MlDelayModelClient.cs` : choix de la méthode et appel au service ML, avec repli automatique sur les centiles (délai maximal 3 s).
- Tests : `ml-service/tests/test_delay.py`, `ClaimEstimateSelectionTests.cs`, `DelayModelIntegrationTests.cs`.
- Désactiver le modèle sans le supprimer : `DelayModel__Enabled=false` (variable d'environnement de l'API ActionPlan).

## Ré-entraîner
```
# 1. exporter les dossiers clos (voir l'en-tête de export_closed_claims.sql)
# 2. entraîner
cd ml-service
python train_delay.py closed_claims.csv
# 3. relire artifacts/delay_report.json : "validated" doit être true pour que le modèle soit utilisé
```
