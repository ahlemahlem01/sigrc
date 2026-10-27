# Rapport de non-régression

Ce document garde la trace des contrôles faits avant de pousser les évolutions qui touchent aux données de référence et à la
création de réclamations. Il est complété à chaque évolution.

## 1. Listes de référence : codes défaut d'inspection et sites clients (cabliers)

Ajout idempotent (au démarrage de l'API) de 5 codes défaut avec libellé français et de 9 sites clients ; affichage du libellé
partout (`defectLabel`) sans modifier les valeurs stockées par les réclamations.

| Contrôle | Résultat |
|---|---|
| Instantané de la base avant / après | identique, hors listes de référence |
| Empreintes des réponses API (13 écrans) | 12 identiques ; l'écart restant vient des nouvelles entrées de référence |
| Tests automatisés | verts |

## 2. Retour d'apprentissage pour la vision par ordinateur (active learning)

Une réclamation enregistre le code proposé par le modèle d'image, sa confiance, et un fanion `CvCorrectionLogged` quand le code
retenu par l'opérateur diffère de la proposition ou que la confiance est sous le seuil (0,70).

| Contrôle | Résultat |
|---|---|
| Migration `AddClaimCvFeedback` | additive : 3 colonnes (2 nullables, 1 booléen à `false`), aucune donnée réécrite |
| Réclamations en base après migration | 4 325 avant et après, 0 fanion, 0 proposition |
| Tableau de bord (90 jours) | 609 ouvertes, 25 en retard : inchangé |
| Suggestions de défauts | aucun terme « test » ; les réclamations archivées restent incluses (test automatisé) |
| Création sans photo | inchangée : pas de proposition, pas de fanion (test automatisé) |
| Modèle d'image | non branché : `POST /api/QualityAnalysis/claims/cv-suggestion` répond `{ "available": false }` tant que `ComputerVision:ServiceUrl` est vide |
| Tests automatisés | 62 (application) + 187 (API) verts ; typage du frontend propre |

## 3. Capture de la photo sur tablette / téléphone d'atelier

La solution de vision est pensée pour un usage **mobile / tablette en atelier** : l'opérateur photographie le câble endommagé avec
l'appareil qu'il a en main. Elle ne dépend d'aucune caméra fixe ni d'une installation sur la ligne.

| Contrôle | Résultat |
|---|---|
| Champ « Source / preuve » | accepte `image/*` en plus des e-mails et PDF ; limite de 10 Mo conservée |
| Bouton « Prendre une photo » | `accept="image/*"` + `capture="environment"` : ouvre l'appareil photo arrière ; affiché sur écran tactile seulement, le champ fichier reste pour les e-mails et PDF |
| Carte de proposition | inchangée (code, libellé i18n, confiance, « Confirmer ce code », « Corriger… ») |
| Charge envoyée à la création | code proposé + confiance (`CvPredictedDefectType`, `CvConfidence`) ; le fanion `CvCorrectionLogged` est calculé par le serveur (non falsifiable par le client) ; test automatisé de la charge |
| Service d'image absent (`available: false`) ou en erreur | aucune carte, saisie manuelle normale, rien ne bloque l'envoi |
| Photo retirée ou remplacée avant la réponse | la réponse tardive est ignorée |
| Tests automatisés | tests Jest (charge, libellés) verts ; typage du frontend propre |

## 4. Mode démonstration du service d'image et libellés de référence

| Contrôle | Résultat |
|---|---|
| Mode démonstration | `ComputerVision:Mode=demo` : proposition d'exemple (`CUT_INSULATION` 93 % ou, si le nom du fichier contient « copper / cuivre / bloom », `COPPER_BLOOMING` 58 %), signalée « Mode démonstration » sur la carte et `demo: true` dans la réponse ; vérifié en direct sur l'API et sur le formulaire |
| Mode désactivé (par défaut) | réponse `{ available: false }`, aucune carte |
| Description des réclamations du jeu de référence | 2 906 descriptions « (donnees simulees) » renommées « (donnees de reference) » (script de restauration local) ; plus aucune valeur « simul » en base |
| Intégrité | 0 action orpheline, 0 réclamation sans type de défaut, 4 325 réclamations avant et après |
| Tests automatisés | .NET 66 + 187, Jest 75, pytest 24 : verts ; typage propre |

## 5. Service d'image local (YOLOv8 / FastAPI)

| Contrôle | Résultat |
|---|---|
| Service `ml-service/app.py` | démarre, charge `yolov8n.pt`, `GET /health` : `knowsCableDefects: false` |
| `POST /predict` (image valide) | `{ "available": false }` : le modèle généraliste ne reconnaît aucun défaut de câble |
| `POST /predict` (fichier non image) | 400 |
| Chaîne API .NET -> service | appel reçu par le service (200) depuis l'API (Docker, `host.docker.internal:5000`) ; le formulaire reste en saisie manuelle |
| Correspondance détections -> codes | 5 tests pytest (jamais de défaut inventé pour un objet du quotidien) |
| Tests automatisés | .NET 66 + 187, Jest 75, pytest 29 : verts ; typage propre |

## 6. Jeu de référence régénéré avec des défauts de câble

Le lot « REFERENCE-DATASET » est remplacé par une nouvelle version : 88 % de défauts de câble (`CUT_INSULATION`, `COPPER_BLOOMING`,
`MARKING_DEFECT`, `COLOR_MISMATCH`, `SPOOL_DAMAGE`, stockés comme codes) sur des lignes de découpe, extrusion, tréfilage et contrôle, 12 % de
défauts d'atelier d'assemblage (soudure, connecteur, sertissage, étiquette, emballage) sur les lignes ASM, avec les 9 sites clients cabliers.

| Contrôle | Résultat |
|---|---|
| Nouveau lot | 2 871 réclamations clôturées (2 520 câble, 351 usine) ; ancien lot (2 906) **archivé, pas supprimé** : restaurable depuis l'application |
| Réclamations ouvertes / en retard | 609 / 25 : inchangées (le lot ne contient que du clôturé) |
| Chiffres du tableau de bord (90 jours) | à l'heure 76,6 % -> 69 %, clôturées 277 -> 294, PPM 9 461 -> 9 197 : écart attendu, les données clôturées ont changé |
| Libellés | les 5 codes s'affichent avec leur libellé partout (aucun code brut sur la vue d'ensemble) |
| Réentraînement | `retrain.py --check` : prêt (au moins 308 lignes par nouveau code) ; **modèle non réentraîné** |
| Rapport d'évaluation (`REPORT.md`) | régénéré : AUC 0,78 (réclamation + employé) contre 0,76 (réclamation seule) |
| Réclamations « vivantes » (1 419, dont 609 ouvertes) | **inchangées** : elles restent des défauts d'atelier ; voir le bilan |

## 7. Diversité des défauts de câble

Le jeu de référence ne répétait que 5 codes de câble. La liste de référence passe à **20 codes de câble** (15 ajoutés par l'initialiseur
idempotent, libellés fr / en / it) ; aucun défaut ne dépasse environ 9 % des réclamations du lot.

| Contrôle | Résultat |
|---|---|
| Nouveau lot | 2 889 réclamations clôturées, 25 types de défaut (20 codes de câble, 5 défauts d'atelier : 11 %) ; le lot précédent (2 871) est archivé, comme le premier (2 906) : tous restaurables |
| Réclamations ouvertes / en retard | 609 / 25 : inchangées |
| Libellés | aucun code brut sur la vue d'ensemble ; les 20 codes traduits (fr, en, it) |
| Service d'image | `cv_class_map.json` reconnaît les 20 classes ; test de correspondance mis à jour |
| Tests automatisés | .NET 66 + 187, pytest 29 : verts ; typage du frontend propre |

## 8. Catalogue unique des défauts, modèle d'image entraîné

| Contrôle | Résultat |
|---|---|
| Lot de référence (catalogue 25 types) | 2 889 réclamations, répartition **exacte** (261, 233, 233, 206, 173, 168, 145, puis 18 types entre 48 et 130), 318 d'atelier (11,0 %) ; vérifié par test et par le script de génération |
| Cohérence ligne / processus | épaisseur d'isolant -> EXT seulement ; diamètre du conducteur -> WR seulement ; longueur sur touret -> CUT et CTL ; testé |
| Redondances | 4 codes renommés (anciens noms = alias), 6 orthographes de même sens fusionnées par alias (Soudure, Sertissage, isolation, Marquage, Marquage illisible, Couleur incorrecte) ; aucune réclamation réécrite ; suggestions : 42 -> 32 (20 codes + 12 libellés d'atelier) |
| Liste de référence, traductions, `defectLabel.ts`, catalogue | mêmes 20 codes, vérifié par 6 tests pytest |
| Anciens lots | trois lots archivés (restaurables) ; réclamations ouvertes 609 inchangées |
| Modèle d'image (`best.pt`) | mAP@50 0,44 sur 38 images de test (foreign 0,74, scratch 0,56, hole 0,27, spot 0,20) ; propose un code sur 35 des 38 images ; non validé sur des photos Coficab |
| Boucle d'apprentissage et `QualityAnalysisController` | tests inchangés et verts (fanion `CvCorrectionLogged`, proposition, relais des lignes) |
| Tests automatisés | .NET 66 + 187, Jest 76, pytest 36 : verts ; typage propre |

## 9. Adaptation aux téléphones et tablettes

| Contrôle | Résultat |
|---|---|
| Débordement horizontal à 375 px | aucun sur 17 pages du front office et 20 du back office |
| Barre du haut du back office | la cloche, la langue et l'avatar sortaient de l'écran : barre recomposée sous 768 px (burger, titre, organisation, cloche, langue, avatar) |
| Menu du back office | tiroir ouvert par le burger sous 768 px (le survol n'existe pas au tactile), fond assombri, fermeture au changement de page ; vérifié à l'écran |
| Formulaire de réclamation | un champ par ligne sous 640 px, texte à 16 px (pas de zoom à la saisie), contrôles d'au moins 44 px au tactile ; vérifié à l'écran |
| Répertoire des réclamations | liste et détail empilés sous 1000 px au lieu d'être écrasés côte à côte ; vérifié à 768 px |

## 10. Réclamations vivantes réécrites avec des défauts de câble

Les 1 224 réclamations vivantes (celles qui ont une analyse, des plans et des notifications) portaient des défauts d'atelier
(soudure, sertissage…). `ml-service/reference-dataset/retheme_live_claims.py` leur donne un défaut de câble du catalogue et réécrit ce qui
en dépend. Les textes viennent de `cable_narratives.json` (2 scénarios, 3 à 5 causes et une action corrective par défaut).

| Contrôle | Résultat |
|---|---|
| Portée | 1 089 réclamations réécrites ; 134 gardent leur défaut d'atelier (lignes ASM, environ 11 %) ; 1 protégée (plan écrit à la main) ; 9 protégées (réponses 5 Why écrites par une personne) ; l'historique importé (180) n'est pas touché |
| Ce qui est réécrit | défaut, ligne (cohérente avec le processus), site client (9 sites cabliers), titre, description, 5 Why (étapes 1 et 5), causes Ishikawa, cause prioritaire, titre et actions des plans CAPA, et les copies de ces titres (notifications, badges, chronologie, historique) |
| Ce qui ne change pas | statut, dates, échéances, quantités, gravité, responsables, avancement, identifiants : 0 écart contrôlé sur 12 974 réclamations ; ouvertes 616 (609 hors brouillons), en retard 31, somme des quantités produites identique |
| Cohérence ligne / processus | épaisseur d'isolant -> EXT (71 réclamations) ; diamètre du conducteur -> WR (54) ; longueur sur touret -> CUT / CTL (26) |
| Mots d'atelier restants | 0 dans les titres, descriptions, causes et actions des réclamations réécrites |
| Vue d'ensemble (365 jours) | défauts les plus fréquents : cuivre cassé 170, coupure de gaine 167, rayures 159, marquage 129, couleur 127 ; lignes EXT-02, EXT-01, CTL-01 |
| Sauvegarde | tables d'origine dans le schéma `bak20261027` de la base ; `scripts/restore-retheme-20261027.sql` (local) les remet |
| Limites | les alertes d'anomalie existantes (8) et les rapports enregistrés gardent leur texte d'origine ; `Coficab.ReferenceDataLoader` (mode réaliste) génère encore des défauts d'atelier : le contenu de câble est dans `cable_narratives.json` |
| Tests automatisés | pytest 37 (dont la couverture des 20 défauts par les textes) ; données vérifiées par requêtes avant / après |

## 11. Réentraînement du modèle de recommandation

Réentraîné après la régénération des données (`retrain.py`, jeu d'entraînement `api/ml-features/training-dataset`). Il connaît maintenant les
20 codes de câble ; la vérification `retrain.py --check` indiquait au moins 53 lignes par code.

| Mesure | Avant | Après |
|---|---|---|
| Lignes d'entraînement | 3 109 | 3 103 |
| Modèle gardé | régression logistique | gradient boosting (0,743 contre 0,741 pour la régression logistique : écart dans le bruit) |
| AUC réclamation + employé (validation croisée) | 0,738 | **0,743** ± 0,025 |
| AUC réclamation seule | 0,713 | 0,719 |
| Apport de l'employé | +0,025 | **+0,024** |
| AUC, découpage dans le temps | 0,734 | 0,769 |
| Statut | validé | **validé** (bat le hasard et le modèle sans variables employé) |

Le conteneur `sigrc_ml` est reconstruit et recréé avec les nouveaux artefacts ; `/recommend` répond avec un code de câble (`CUT_INSULATION`) et
classe correctement deux candidats de ponctualité différente. L'étiquette enregistrée reste « reference dataset modelled on the production process ».
Chiffres de `docs/SCRIPT_SOUTENANCE.md` mis à jour. Tests : pytest 37.

## 12. Alertes d'anomalie réécrites avec des défauts de câble

Les neuf alertes d'anomalie existantes (workflow de validation déjà parcouru : en attente, validée, rejetée, archivée) portaient des défauts
d'atelier. `ml-service/reference-dataset/retheme_alerts.py` leur donne un défaut de câble et la ligne de son processus.

| Contrôle | Résultat |
|---|---|
| Ce qui change | défaut, ligne, description (sans le préfixe « TEST » ni « Bureau RH »), analyse proposée (problème, cause probable, conséquences), événement « détectée » de l'historique, notifications qui citent l'alerte, 2 commentaires, 2 comptes rendus et 2 pièces jointes écrits par le jeu de données |
| Ce qui ne change pas | statut, z-score, volumes, moyenne, dates, validations, rejets, archivages, destinataires, et tout ce qu'une personne a saisi (commentaires et comptes rendus de test) |
| Correspondance | diamètre du conducteur / WR-04 (en attente) ; oxydation du cuivre / WR-06 (2 alertes) ; brins de cuivre cassés / WR-06 ; rayures sur la gaine / EXT-02 ; essai d'étincelage / EXT-01 ; coupure de gaine / CUT-01 ; épaisseur d'isolant / EXT-02 ; « Étiquette manquante / ASM-01 » reste une alerte d'atelier |
| Vérification | plus aucun « Bureau RH », « Soudure froide », « Connecteur desserré », « Gaine fissurée » ni « Sertissage incomplet » dans les alertes, l'historique et les notifications ; la file d'alertes affiche « Conductor diameter out of tolerance — WR-04 » |
| Détection automatique | non relancée : elle compare la semaine en cours aux quatre précédentes, et il n'y a plus de réclamations de la semaine (dernières créations : septembre), donc aucune anomalie réelle ne serait détectée |
| Sauvegarde | tables d'origine dans le schéma `bak20261027b` ; `scripts/restore-retheme-alerts-20261027.sql` (local) les remet |
