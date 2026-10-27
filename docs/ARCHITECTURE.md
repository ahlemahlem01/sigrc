# Architecture : du signalement au rapport 8D

Parcours complet d'une réclamation (« Complete Claims Process »).

```
Saisie mobile ─▶ Service d'image ─▶ Retour d'apprentissage ─▶ Recommandation ─▶ Analyse 5 Why / 8D ─▶ Rapport 8D
 (tablette)     (démo ou réel)      (Active Learning)         (qui traite ?)    + plan d'actions      (PDF versionné)
```

| Étape | Ce qui se passe | Où dans le code |
|---|---|---|
| 1. Saisie mobile | L'opérateur déclare la réclamation sur tablette ou téléphone d'atelier. Au dernier pas, il prend le câble en photo (« Prendre une photo », caméra arrière) ou joint un e-mail / PDF. Aucune caméra fixe n'est nécessaire. | `CreateClaimForm.tsx` |
| 2. Service d'image | La photo est envoyée à `POST /api/QualityAnalysis/claims/cv-suggestion`. Trois cas : **réel** (`ComputerVision:ServiceUrl`, service qui répond `{ defectType, confidence }`), **démonstration** (`ComputerVision:Mode=demo`, exemple fixe signalé « Mode démonstration » à l'écran) ou **absent** (`available: false` : aucune carte, saisie manuelle normale). | `QualityAnalysisController`, `CvDemoPrediction` |
| 3. Retour d'apprentissage | La carte propose un code défaut (libellé traduit, confiance). L'opérateur **confirme** en un clic ou **corrige** dans la liste. La réclamation garde le code de l'opérateur, plus la proposition et sa confiance. Le serveur pose le fanion `CvCorrectionLogged` si le code retenu diffère de la proposition ou si la confiance est sous 0,70, et ajoute l'événement `cv_correction_logged` à l'historique. Ces réclamations sont les premières à étiqueter pour réentraîner le modèle d'image. | `CvFeedback`, `CreateClaimCommandHandler` |
| 4. Recommandation | À l'assignation, le modèle de recommandation classe les employés selon la probabilité de livrer à l'heure (ponctualité passée, charge, délai alloué, gravité, type de défaut). Il est **validé** ou **indicatif** selon son évaluation. Le type de défaut utilisé est celui retenu à l'étape 3, fusionné avec ses alias. | `ml-service/` (`recommend_logic.py`, `retrain.py`), `EmployeeRecommendationBanner` |
| 5. Analyse | Le responsable assigné mène l'analyse 5 Why / Ishikawa, puis le plan d'actions (CAPA). Le circuit de validation admin et les délais suivent la règle unique « réclamation terminée » (clôturée, validée ou archivée n'est ni ouverte ni en retard). | `FiveWhyPage`, `ValidationsController`, `PlanDeadlines` |
| 6. Rapport 8D | Le dossier 8D est soumis, validé, versionné et exporté en PDF. | `EightDController`, `QualityReportPdfService` |

## Démonstration sans service d'image

```powershell
powershell -File .\scripts\demo-cv.ps1 on    # propositions d'exemple (recrée seulement l'API des plans)
powershell -File .\scripts\demo-cv.ps1 off   # retour au fonctionnement normal
```

En mode démonstration, une photo dont le nom contient `copper`, `cuivre` ou `bloom` reçoit `COPPER_BROKEN` à 58 % (confiance faible :
avertissement et correction à montrer) ; toute autre photo reçoit `CUT_INSULATION` à 93 %. La carte affiche « Mode démonstration :
proposition d'exemple, pas une analyse réelle de l'image » : à dire tel quel devant le jury.

## Service d'image local (Python / FastAPI / YOLOv8)

`ml-service/app.py` est un microservice FastAPI lancé sur le poste (il n'est pas dans l'image Docker du service de recommandation :
PyTorch est volumineux). Il expose `POST /predict` (image dans le champ `file`, 10 Mo max) et `GET /health`.

```bash
cd ml-service
pip install -r requirements-cv.txt
python -m uvicorn app:app --host 127.0.0.1 --port 5000
```

**Modèle.** `best.pt` est YOLOv8n entraîné (`train.py`) sur trois jeux publics Roboflow (licence CC BY 4.0), téléchargés par `download_dataset.py`
avec `ROBOFLOW_API_KEY` (jamais écrite dans un fichier) et fusionnés par `build_training_set.py` :
1. *cable-defect v3* : 239 photos de câbles isolés (corps étranger, trou, rayure, tache) ;
2. *cable-damage-detection v1* : 2 694 photos de **câbles d'acier torsadés** (brin cassé, brûlure d'arc) ;
3. *cable-defect v2* : 610 photos de fils avec cosse, classes « défaut » (type non précisé) et « bon » (utilisées comme photos sans défaut).
Le jeu 2 est échantillonné et le jeu 1 répété pour que les câbles isolés ne soient pas noyés ; les 143 photos de test ne servent jamais à l'entraînement.
Évaluation (`best_report.json`, 143 photos de test) : mAP@50 = 0,57 ; foreign 0,77, hole 0,46, scratch 0,39, spot 0,19, break 0,65, thunderbolt 0,85, defect 0,68.
Sur les 38 photos de câbles isolés, le code proposé est le bon 30 fois (25 avec le modèle précédent), faux 5 fois (10 avant), rien 3 fois.
C'est un modèle entraîné sur des images publiques, **non validé sur des photos Coficab** : les propositions sont à confirmer par l'opérateur.

**Correspondance (`cv_class_map.json`).** `foreign` -> `FOREIGN_MATTER`, `hole` -> `CUT_INSULATION`, `scratch` -> `SCRATCH_INSULATION`,
`spot` -> `COLOR_NON_CONFORMITY`, `break` -> `COPPER_BROKEN` (brin cassé), `thunderbolt` -> `COPPER_OXIDATION` (brins brûlés par un arc : code le plus
proche, approximatif). La classe `defect` n'a aucun code : le service répond `{ "available": false, "anomalyDetected": true }` et le formulaire
invite l'opérateur à choisir le code lui-même. Les autres codes (dimensions, résistance, étincelage, atelier…) ne se voient pas sur ce type de photo :
saisie manuelle.

**Réponse.** `{ "available": true, "defectType": "<code exact>", "confidence": 0.85, "lineFamilies": ["EXT"], "lines": ["EXT-01", "EXT-02"] }`
ou `{ "available": false }`. Le code métier et le contexte de ligne (familles EXT, WR, CUT, CTL) viennent du catalogue ; l'API les relaie et
la carte de proposition du formulaire affiche les lignes habituelles. Sans `best.pt`, le service retombe sur `yolov8n.pt` (généraliste), qui ne propose rien.

**Branchement de l'API.** `ComputerVision:ServiceUrl` (adresse du service ou endpoint complet `.../predict`).
`dotnet run` en local : `appsettings.Development.json` (ignoré par git). API dans Docker : `CV_SERVICE_URL=http://host.docker.internal:5000`
dans `.env`. Mode démonstration éteint : `scripts/demo-cv.ps1 off`.

## Catalogue des défauts (source unique)

`ml-service/defect_catalog.json` fixe les 25 types (20 défauts de câble stockés comme codes, 5 défauts d'atelier), le nombre exact de
réclamations du jeu de référence (2 889 dont 318 d'atelier, 11 %), les libellés fr / en / it et les familles de lignes où chaque défaut
se rencontre. `generate.py`, `to_sql.py` et `cv_mapping.py` le lisent ; des tests vérifient que la liste de référence de l'application
(`ProductionReferenceData.cs`), les traductions et `defectLabel.ts` portent exactement les mêmes codes.
Quatre codes ont été renommés (`COPPER_BLOOMING` -> `COPPER_BROKEN`, `SURFACE_SCRATCH` -> `SCRATCH_INSULATION`, `COLOR_MISMATCH` ->
`COLOR_NON_CONFORMITY`, `SPOOL_DAMAGE` -> `SPOOL_DAMAGED`) : les anciens noms deviennent des alias, rien n'est réécrit.

## Limites à annoncer

- Le modèle d'image n'a vu que 160 images publiques de 4 types de défaut : il est faible sur les trous et les taches, et inconnu sur des photos Coficab.
- Les données de l'application viennent en grande partie d'un jeu de référence généré (voir `ml-service/reference-dataset/`) : la performance réelle du modèle de recommandation est inconnue tant qu'il n'est pas réentraîné sur l'historique réel (`retrain.py`).
