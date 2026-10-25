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

En mode démonstration, une photo dont le nom contient `copper`, `cuivre` ou `bloom` reçoit `COPPER_BLOOMING` à 58 % (confiance faible :
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

- Les poids sont chargés au démarrage : `CV_MODEL_PATH`, `yolov8n.pt` par défaut (téléchargé par ultralytics).
- Les détections sont traduites en codes défaut par `cv_class_map.json` (classe du détecteur -> `CUT_INSULATION`, `COPPER_BLOOMING`,
  `MARKING_DEFECT`, `SPOOL_DAMAGE`, `COLOR_MISMATCH`). Réponse : `{ "available": true, "defectType": "...", "confidence": 0.85 }`,
  ou `{ "available": false }` quand aucune classe connue n'est détectée.
- **`yolov8n.pt` est un modèle généraliste (objets du quotidien, jeu COCO) : il ne sait pas reconnaître un défaut de câble.** Avec
  ces poids le service répond donc `available: false` (`/health` indique `knowsCableDefects: false`), et il n'invente jamais un défaut. Pour
  de vraies propositions, il faut entraîner YOLOv8 sur des photos étiquetées de câbles endommagés (classes nommées comme dans
  `cv_class_map.json`) et pointer `CV_MODEL_PATH` vers ces poids. Les réclamations marquées `CvCorrectionLogged` servent à constituer ce jeu.
- Branchement de l'API : `ComputerVision:ServiceUrl` (adresse du service, ou son endpoint complet `.../predict`).
  `dotnet run` en local : `appsettings.Development.json` (ignoré par git) avec `http://127.0.0.1:5000/predict`.
  API dans Docker : `CV_SERVICE_URL=http://host.docker.internal:5000` dans `.env` (127.0.0.1 désignerait le conteneur lui-même).
  Mode démonstration éteint : `scripts/demo-cv.ps1 off`.

## Limites à annoncer

- Aucun modèle d'image n'est entraîné sur des défauts de câble : le service local charge YOLOv8 mais, tant qu'il n'est pas affiné sur des photos étiquetées, il ne propose rien (`available: false`).
- Les données de l'application viennent en grande partie d'un jeu de référence généré (voir `ml-service/reference-dataset/`) : la performance réelle du modèle de recommandation est inconnue tant qu'il n'est pas réentraîné sur l'historique réel (`retrain.py`).
