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

**Modèle.** `best.pt` est YOLOv8n affiné (`train.py`) sur le jeu public Roboflow *cable-defect v3* (licence CC BY 4.0, 239 images, téléchargé
par `download_dataset.py` avec `ROBOFLOW_API_KEY`, jamais écrite dans un fichier). Quatre classes visuelles : `foreign`, `hole`, `scratch`, `spot`.
Évaluation sur 38 images de test jamais vues (`best_report.json`) : mAP@50 = 0,44 (foreign 0,74, scratch 0,56, hole 0,27, spot 0,20).
C'est un premier modèle sur des images publiques, **non validé sur des photos Coficab** : les propositions sont à confirmer par l'opérateur.

**Correspondance (`cv_class_map.json`).** `foreign` -> `FOREIGN_MATTER`, `hole` -> `CUT_INSULATION`, `scratch` -> `SCRATCH_INSULATION`,
`spot` -> `COLOR_NON_CONFORMITY` (choix de rapprochement à valider par la qualité). Les 21 autres codes (dimensions, résistance, étincelage,
atelier…) ne se voient pas sur une photo de ce type : ils restent en saisie manuelle. Un détecteur dont les classes portent les noms des codes
n'a besoin d'aucune entrée dans le fichier.

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
