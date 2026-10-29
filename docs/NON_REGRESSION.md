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

## 13. Affichage sur téléphone et petite tablette (reprise)

Constat : barre de menu qui défilait sur le côté, rail d'icônes du menu qui prenait 17 % de la largeur, tableaux qui débordaient, fiche de
réclamation écrasée en une colonne de mots.

| Écran | Avant | Après (vérifié à 375 px) |
|---|---|---|
| Front office (toutes les pages) | rangée de liens à faire défiler | bouton menu + tiroir : sections et pages de la section, bouton « Nouvelle réclamation » ; onglets de page à défilement avec fondu et onglet actif centré |
| Espace employé | rail d'icônes fixe | tiroir comme le back office ; barre du haut : menu, titre, langue, cloche, avatar |
| Back office | barre du haut coupée (cloche, langue, avatar hors écran) | tiroir + barre recomposée ; tableaux qui défilent dans leur cadre |
| Répertoire des réclamations | filtres et boutons coupés, détail en colonne étroite | en-tête empilé, filtres sur une colonne, détail lisible (boutons pleine largeur), page qui défile en entier |
| Historique des réclamations | tableau de 10 colonnes | une carte par réclamation (5 Why, 8D, CAPA, dates, actions) |
| Mes plans d'actions | tableau à défilement latéral | une carte par plan |
| Validations (admin) | titre d'une réclamation sur une ligne par mot | cartes empilées, boutons de 44 px |
| Calendrier | cellules illisibles | points par entrée dans la grille du mois, liste du jour dessous |
| Formulaires | champs de 13 px (zoom au focus sur iPhone) | 16 px, contrôles d'au moins 40 à 44 px |

Mesures : aucun débordement horizontal de la page sur les 17 pages du front office et les 21 du back office testées. Restent volontairement
à défilement latéral dans leur cadre : les tableaux d'administration (journaux, comparaisons, départements) et le bandeau des 8 étapes du 8D.
Tests : Jest 76, typage propre.

## 14. Modèle d'image entraîné sur trois jeux de données

Ajout des jeux *cable-damage-detection v1* (câbles d'acier) et *cable-defect v2* (fils avec cosse) à *cable-defect v3*.

| Contrôle | Résultat |
|---|---|
| Jeu fusionné | 770 photos d'entraînement, 131 de validation, 143 de test jamais utilisées pour entraîner ; 7 classes ; 104 photos sans défaut |
| mAP@50 sur les 143 photos de test | 0,57 (foreign 0,77, hole 0,46, scratch 0,39, spot 0,19, break 0,65, thunderbolt 0,85, defect 0,68) |
| Photos de câbles isolés (38, jeu 1) : code proposé juste / faux / rien | 30 / 5 / 3 (avant : 25 / 10 / 3) ; la classe `scratch` perd en précision de boîte (0,56 -> 0,39) mais pas en code proposé |
| Photo de faisceau usé (essai de l'utilisateur) | avant : « corps étranger » à 41 % (faux) ; maintenant : aucune proposition |
| Classes d'acier alignées sur les réclamations | `break` -> `COPPER_BROKEN`, `thunderbolt` -> `COPPER_OXIDATION` (approximation), contexte de ligne WR renvoyé |
| Défaut vu mais non nommé | le service répond `anomalyDetected`, l'API le relaie, le formulaire affiche un message sans bouton ; vérifié à l'écran |
| Tests automatisés | .NET 66 + 187, Jest 76, pytest 38 : verts ; typage propre |
| Limites | jeux publics, dont un d'acier : non validé sur des photos Coficab ; `spot` reste faible (0,19) |

## 15. Retour visuel de l'analyse d'image et photos successives

Constat : sur une photo où le modèle ne reconnaît rien (faisceau usé, photo sans défaut connu), le formulaire n'affichait rien : l'opérateur ne savait
pas si l'analyse avait eu lieu.

| Cas | Ce que l'opérateur voit |
|---|---|
| Analyse en cours | « Analyse de la photo en cours… » |
| Code proposé | carte de proposition (code, confiance, lignes, Confirmer / Corriger) |
| Aucun défaut connu reconnu (ou photo sans défaut) | « Aucun défaut connu n'est reconnu sur cette photo (ou elle ne montre pas de défaut) : choisissez le code vous-même. » |
| Défaut vu mais non nommé | message d'information avec la confiance |
| Service d'image arrêté ou en erreur | « L'analyse d'image est indisponible pour le moment : choisissez le code vous-même. » |
| Service d'image non configuré | rien (fonction désactivée) |
| Plusieurs photos de suite | bouton « Remplacer la photo » sur la fiche de la pièce jointe : chaque nouvelle photo relance l'analyse et remplace la précédente (une seule pièce jointe est enregistrée par réclamation) |

L'API ajoute un champ `reason` (`noDefect`, `anomaly`, `unavailable`, `notConfigured`, `noImage`). Vérifié à l'écran avec trois photos de suite (faisceau usé :
aucun défaut reconnu ; rayure : 75 % ; brins brûlés : 87 %). Tests : .NET 66 + 187, Jest 76, typage propre.

## 16. Boucle de réentraînement contrôlé du modèle d'image

| Contrôle | Résultat |
|---|---|
| Points d'accès API `cv-corrections` (liste) et `.../{id}/photo` | n'exposent que les photos corrigées ou peu sûres, d'une réclamation non archivée ; 401 sans clé ni jeton admin (vérifié en direct : sans clé 401, mauvaise clé refusée) ; 2 tests d'intégration |
| Export (`export_corrections.py`) | étiquette = code retenu par l'opérateur ; rectangle du modèle seulement s'il retrouve ce défaut, sinon photo à annoter ; codes non visibles écartés avec la raison ; 20 % en holdout ; sur l'API réelle : 0 correction pour l'instant, sortie vide sans erreur |
| `POST /reload` | testé : échange du modèle et des classes, un modèle qui ne se charge pas ne remplace pas le courant, jeton exigé s'il est défini ; vérifié sur le service en marche (`loadedAt` change, prédictions continuent) |
| Décision de déploiement | testée : accepte un candidat meilleur sans classe qui s'effondre ; rejette l'égalité, la baisse, ou une classe perdue ; gain minimal respecté |
| Déploiement | testé : remplacement + sauvegarde + rechargement ; retour automatique à l'ancien modèle si le service ne charge pas le nouveau ; service arrêté = poids remplacés avec avertissement ; vérifié en réel avec des poids identiques (service rechargé, poids inchangés) |
| Essai complet à blanc (32 photos simulées, 1 passe) | export, fusion, ajustement, mesure des deux modèles, décision : candidat meilleur sur les 38 photos de référence **mais rejeté** parce que la classe « defect » passait de 0,68 à 0,53 ; `best.pt` inchangé, rejet écrit dans `logs/retrain_history.log` |
| Tests automatisés | .NET 66 + 189, pytest 57, Jest 76 : verts |
| Limite | pas de validation par l'ingénieur qualité avant l'entraînement ; la mesure de référence (38 photos) est petite |

## 17. Recherche de cas similaires par l'image

| Contrôle | Résultat |
|---|---|
| Qualité de la recherche (38 photos de test, jamais dans l'index) | le premier cas similaire porte le bon code 28 fois sur 38, un des 4 le porte 32 fois sur 38 |
| Photos réelles de l'utilisateur (faisceau usé, fil vert tacheté) | ressemblance de 40 à 44 % seulement : l'interface le dit (« exemples indicatifs ») au lieu de laisser croire à un vrai rapprochement |
| Service d'image (`app.py`) | `similar_cases` seulement si confiance < 0,70 ou rien de reconnu ; absent si le modèle est sûr ; sans index, réponse identique à avant ; `/health` indique l'index ; `/reload` re-calcule les vecteurs si les poids changent |
| Relais .NET | 3 tests : proposition peu sûre, rien reconnu, réponse sûre (liste vide) ; noms du contrat conservés (`id_reclamation`, `photo_url`, `code_defaut`, `libelle_defaut`, `score_similarite`) |
| Photos des réclamations pour l'index | `GET api/ml-features/claim-photos` : clé du jeu de données ou jeton admin, 401 sinon |
| Formulaire | clic sur un cas : code repris, gravité reprise seulement pour une réclamation passée, jamais lot/client/dates ; test Jest (3 cas) |
| Limites | peu de réclamations ont une photo : l'index repose surtout sur des exemples publics étiquetés (badge « Exemple de référence ») ; aucune validation sur des photos Coficab |
| Tests automatisés | .NET 66 + 192, pytest 68, Jest 79 : verts ; vérifié en direct dans le navigateur (photo → 4 cas → clic → code repris) |
| Photo et analyse d'image | placées à l'étape 1 « Informations générales » (avant le titre) pour que la proposition aide à remplir le type de défaut ; bogue trouvé en test et corrigé : après un calcul d'empreinte, la prédiction suivante du service échouait (test de régression ajouté) |

## 18. Validation avant réentraînement, nouveau code « brins brûlés », service d'image dans Docker

| Contrôle | Résultat |
|---|---|
| Validation par l'ingénieur qualité | une photo corrigée ou peu sûre n'entraîne le modèle qu'après décision : `PUT api/ml-features/cv-corrections/{id}/validation` (admin seulement : un employé reçoit 401/403, la clé du jeu de données ne suffit pas). `VALIDATED` retient le code de l'ingénieur (celui de l'opérateur par défaut), `REJECTED` écarte la photo. La décision, l'auteur et la date sont enregistrés (migration `AddClaimCvValidation`, 4 colonnes) |
| Export d'entraînement | `GET cv-corrections` ne renvoie que les photos validées par défaut (`status=pending`, `rejected`, `all` pour le reste) ; `export_corrections.py` demande explicitement `status=validated`. Tant que rien n'est validé, le réentraînement n'a rien à apprendre |
| Page d'administration | Paramètres > Validation des photos (`/admin/settings/cv-review`) : onglets À valider / Validées / Écartées, photo, code de l'opérateur, proposition du modèle, choix du code, boutons Valider / Écarter ; fr / en / it. Vérifiée en direct (file vide : aucune photo corrigée en base) ; le circuit complet est couvert par 2 tests d'intégration |
| Nouveau code `COPPER_BURNT` | « Brins brûlés / fondus (arc électrique) » : la classe `thunderbolt` ne tombe plus sous « Oxydation du cuivre ». Le catalogue passe à **26 types (21 codes de câble, 5 d'atelier)** ; les **2 889 réclamations et leur répartition ne changent pas** : le code a 0 réclamation (aucune donnée inventée). Catalogue, liste de référence, traductions fr/en/it, aide `defectLabel`, scénarios 5 Pourquoi, correspondance de classe : mêmes codes, vérifié par les tests de garde. Visible dans la liste de défauts du formulaire |
| Service d'image dans Docker | `sigrc_cv` démarre avec `docker compose`, `/health` et `/predict` répondent, `best.pt` et `index/` montés, l'API l'appelle à `http://cv-service:5000`. Vérifié en direct : photo analysée depuis le formulaire, galerie de cas similaires |
| Photos des réclamations dans l'index | `POST /index/refresh` testé en direct : 88 exemples de référence + 1 photo de réclamation = 89 éléments ; les photos de réclamations sont remplacées, les exemples gardés ; test pytest (jeton, API non configurée = 502) |
| Bogue corrigé | après le calcul d'une empreinte, la prédiction suivante du service échouait (état du prédicteur) ; test de régression avec le vrai modèle |
| Tests automatisés | .NET 66 + 194, pytest 70, Jest 79 : verts |
| Limites | aucune photo réelle d'atelier n'est validée à ce jour : l'index reste à 88 exemples publics + 1 photo ; `COPPER_BURNT` n'a aucune réclamation, donc aucune photo d'atelier pour l'apprendre ; les défauts non visibles sur une photo (dimensions, résistance, essai d'étincelage) restent à saisir à la main |

| Aperçu « Impact Pareto · mining live » | bloqué sur « Analyse de l'historique usine… » : la portée de l'historique renvoyait à SQL Server la liste de milliers d'identifiants de lots importés archivés (`NOT IN` sur un paramètre texte), au-delà du délai de la commande. Remplacée par une sous-requête `NOT EXISTS` (`HistoryScope`) : réponse en 0,7 s, mêmes résultats (tests d'historique verts) ; les codes de défaut sont affichés avec leur libellé |

## 19. Cahier des charges des plans d'action : domaine, KPI, workflow à six étapes

Détail dans `docs/CAHIER_DES_CHARGES_PLANS_ACTION.md`.

| Contrôle | Résultat |
|---|---|
| Domaine d'un plan | migration `AddActionPlanDomain` (219 plans existants = Qualité, vérifié en base) ; 7 domaines dans les listes de référence ; domaine hors liste refusé (400) ; changement tracé dans l'historique ; 5 tests d'intégration |
| Filtre par domaine | `GET /api/ActionPlan?domain=` (admin : son périmètre ; employé : ses plans seulement), `capa-indicators?domain=` ; vu en direct : liste admin, pilotage (93 plans ouverts, 0 pour HSE) |
| Actions critiques ouvertes | actions non terminées, priorité Haute, plans ouverts ; 3 tests (archivées, terminées et plans clôturés exclus) ; en direct : 1 action, 0,4 % des actions ouvertes |
| Taux d'efficacité | contrôle D6 du 8D (lots contrôlés, validé, 0 défaut) sur les plans clôturés ; « — » sans plan évalué ; filtré par domaine ; en direct : 100 % (83 évalués : propriété du jeu de démonstration) |
| Workflow à six étapes | lu sur le plan, aucun statut ajouté, 8D inchangé ; 4 tests unitaires + 1 d'intégration ; bandeau sur la page du plan et sur le pilotage |
| Police | Inter conservée, justification dans le cahier de conformité, repli Calibri puis Arial |
| Tests automatisés | .NET 70 + 208, Jest 84, pytest 70 : verts |
| Limites | import CSV : domaine Qualité ; efficacité = plans liés à une réclamation avec contrôle de lot ; les six étapes ne sont pas encore des statuts |

| Création d'un plan depuis la page admin | trouvé en test en direct : la page n'envoyait pas l'organisation (erreur SQL 547, plan non créé). Corrigé côté serveur (l'organisation du département est reprise) + test ; plan « TEST DOMAINE » créé avec succès en HSE, étape Détection, visible dans le pilotage filtré sur HSE |
| Parcours côté employé (vérifié en direct, compte Ahlem Alaya) | « Mes plans d'action » : 48 plans, badge de domaine, filtre Domaine (HSE 0, Qualité 48) ; détail d'un plan : domaine et bandeau des six étapes (même règle que le serveur, test Jest) ; une sous-action passée à 25 % fait passer le plan de Planification à Exécution (avancement 8 %), remise à 0 % il revient à Planification. Trouvé et corrigé : ces deux éléments manquaient sur la page employé. Non testé : étapes Vérification/Clôture en direct (elles auraient modifié des données réelles), soumission pour validation |
| Parcours employé complet (vérifié en direct) | plan HSE créé par l'employé avec 2 actions ; étapes 3 Planification, 4 Exécution, 5 Vérification (encadré « n'attend pas le contrôle d'efficacité »), statut « En attente de validation » posé automatiquement. Trois défauts existants trouvés et corrigés : (1) **les preuves ne pouvaient pas être jointes** : la route `POST api/planaction/{id}/documents` n'existait pas (404) alors que l'interface l'appelait ; ajout du dépôt, de la liste et du téléchargement (accès réservé à ceux qui peuvent travailler sur le plan, 10 Mo, PDF/image/Office/texte) et du compteur de preuves par action ; (2) un plan créé avec ses actions les recevait en double ; (3) la rubrique Département du détail employé affichait « — » car l'API ne renvoyait pas ce champ. Non testé en direct : validation et clôture par un administrateur (étape 6) |
| Historique et preuves visibles (vérifié en direct côté employé) | sous chaque sous-action : liste des preuves (nom, auteur, date, aperçu des images, téléchargement) ; ajout d'une preuve inscrit dans l'historique de l'action et du plan ; section « Historique du plan » (événements du plan et de ses sous-actions : avancement, preuve, validation, rejet) avec les noms et non les identifiants ; mêmes composants sur la page admin du plan (non vérifié en direct : compte employé connecté, couvert par test). Défauts existants trouvés et corrigés : le bouton « History » d'une sous-action échouait (route `assignment-history` absente, et l'historique renvoyait l'entité brute avec référence circulaire, erreur 500, puis des « NaN % » pour les enums) |

## 20. Commentaires sur les plans d'action, avec notifications

| Contrôle | Résultat |
|---|---|
| Section « Commentaires » | sous le bloc « Details » de la page d'un plan côté employé ; mêmes composants sur la page admin du plan (back-office) et sur la page admin du front-office. Aucune trace d'une ancienne section n'existait dans le code ni dans git (seules des notifications de démonstration `capa_comment` d'août étaient en base) : elle a donc été construite, table `ActionPlanComments` (migration `AddActionPlanComments`) |
| Fonctions | envoi (Ctrl+Entrée), modification par l'auteur (mention « modifié »), suppression par l'auteur ou un admin (**archivage**, rien n'est effacé, confirmation), 1 à 2 000 caractères, rôle Admin affiché, heure relative, rafraîchissement automatique toutes les 20 s, apparition dans l'historique du plan |
| Droits | lecture et écriture : admin, ou personne à qui le plan est assigné ou qui y travaille ; un étranger reçoit 404 ; plan archivé : commentaire refusé |
| Notifications | à chaque commentaire, les autres personnes concernées (responsable, propriétaire, créateur, assignés des actions, celui qui a assigné, anciens commentateurs) reçoivent une notification instantanée avec le lien adapté à leur rôle ; l'auteur n'est jamais notifié ; si aucun admin n'est concerné (plan ouvert par l'employé) les administrateurs sont prévenus ; une panne de notification ne fait pas perdre le commentaire. 6 tests d'intégration ; vérifié en direct (5 administrateurs notifiés, lien vers la page admin du plan) |
| **Défaut trouvé et corrigé** | dans le déploiement Docker, la recherche des administrateurs n'avait aucune connexion vers la base d'authentification : **aucune notification destinée aux admins** (plan à valider, alertes, 8D...) n'était délivrée. Corrigé en utilisant la connexion par défaut (mêmes base et tables) |
| Limites | pas de mentions @ ni de pièces jointes dans les commentaires ; vue admin vérifiée par tests, pas à l'écran (session employé) |

## 21. Connexion et mot de passe oublié : six correctifs

| Point | Avant | Maintenant |
|---|---|---|
| 1. Rafraîchissement de session | un compte verrouillé, ou une session ouverte avant une réinitialisation de mot de passe, pouvait toujours rafraîchir son jeton | le rafraîchissement vérifie le verrouillage et l'empreinte du « security stamp » (portée par les jetons, hachée) : refus `invalid_grant` / `account_locked`. Les sessions ouvertes avant ce correctif doivent se reconnecter une fois |
| 2. Énumération des comptes | durée différente et erreur 500 si le serveur d'e-mail tombait (seulement pour un compte existant) ; `reset` répondait autrement pour un e-mail inconnu | `forgot` : même réponse vide, durée minimale identique (250 ms), envoi en arrière-plan dont l'échec n'apparaît pas ; `reset` : même réponse pour e-mail inconnu, jeton faux, expiré ou déjà utilisé (`invalid_link`) ; seules les règles de mot de passe sont expliquées, à qui détient un jeton valide |
| 3. Limitation de débit | aucune | par adresse : `forgot` 10 / 15 min, `reset` 20 / 15 min, `/connect/token` 60 / min (429 + `Retry-After`, réglable `RateLimiting:*`) ; 3 e-mails de réinitialisation par compte et par heure. Vérifié en direct : 429 à la 61ᵉ tentative. Un compte verrouillé par un tiers se débloque par « mot de passe oublié » |
| 4. Durée du lien | l'e-mail annonçait 1 h, Identity gardait 24 h | 60 minutes réelles (`Auth:PasswordResetLifetimeMinutes`), annoncées dans l'e-mail |
| 5. Lien | l'adresse n'était pas encodée (un « + » cassait le lien), celle saisie était utilisée | adresse du compte et jeton encodés ; suivi du lien testé de bout en bout |
| 6. Après la réinitialisation | rien | compteur d'échecs remis à zéro, verrouillage levé, anciennes sessions fermées, e-mail « mot de passe modifié », traces d'audit `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET` et `LOGIN_FAILED` ; la page de réinitialisation affiche les règles de mot de passe au lieu de « lien invalide » |
| Tests | aucun test sur l'authentification | nouveau projet `Coficab.Auth.API.Tests` : 15 tests d'intégration (rafraîchissement, verrouillage, audit, énumération, durée minimale, limites, quota d'e-mails, lien, règles, usage unique, déverrouillage) ; .NET 70 + 214 + 15, Jest 84, pytest 70 |
| **Défauts trouvés en route** | | (a) le modèle de la base d'authentification contient une table `ActionPlan` héritée : l'ajout de la colonne `Domain` sur l'entité partagée rendait le démarrage de l'API Auth impossible (« pending model changes », jamais prête) à la prochaine reconstruction ; migration `AddActionPlanDomain` ajoutée côté Auth. (b) **le serveur d'e-mail n'est pas configuré** dans ce déploiement : aucun e-mail (mot de passe oublié, verrouillage, bienvenue) ne partait. Variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_NAME` ajoutées à `docker-compose.yml` |
| Limites | flux « mot de passe » (ROPC) et jeton dans le stockage du navigateur : le code d'autorisation avec PKCE serait le bon choix (chantier plus gros) ; derrière le réseau Docker tous les visiteurs partagent une adresse, d'où des limites larges |


## 22. Cloudflare Turnstile sur la connexion et le mot de passe oublié

| Contrôle | Résultat |
|---|---|
| Principe | widget Cloudflare Turnstile sur la page de connexion et sur « mot de passe oublié », vérifié côté serveur (`siteverify`) avant tout examen du compte : un robot n'apprend rien et ne verrouille rien. S'ajoute au verrouillage (5 échecs) et aux limites de débit. **Désactivé tant que `TURNSTILE_SECRET_KEY` est vide** : rien ne change sans clés |
| Activation | dans `.env` : `TURNSTILE_SITE_KEY` (publique) et `TURNSTILE_SECRET_KEY` (secrète), créées sur dash.cloudflare.com > Turnstile (domaines : localhost et votre domaine) ; `docker compose up -d auth-api`. La page apprend l'activation par `GET /api/public/turnstile` (jamais la clé secrète), sans reconstruire le frontend |
| Cloudflare injoignable | par défaut la vérification **échoue** (un robot ne passe pas parce que le service est tombé) ; `TURNSTILE_FAIL_OPEN=true` laisse entrer quand Cloudflare ne répond pas (site sans Internet). La page affiche un message clair si le widget ne peut pas se charger |
| Portée | connexion par mot de passe et demande de lien ; **pas** le rafraîchissement de session (il ne porte pas de mot de passe) ni la page de réinitialisation (déjà protégée par un jeton à usage unique). Une vérification refusée est tracée (`CAPTCHA_FAILED`) et ne compte pas comme tentative échouée |
| Tests | 8 tests .NET (clé publique seule exposée, désactivé = comme avant, contenu de la requête à Cloudflare, jeton absent ou trop long, Cloudflare en panne avec ou sans FailOpen, connexion et mot de passe oublié refusés sans jeton, rafraîchissement sans jeton) + 3 tests Jest ; vérifié en direct avec les **clés de test publiques de Cloudflare** : sans jeton `captcha_failed`, avec le jeton factice la connexion arrive au contrôle du mot de passe, widget affiché et validé sur les deux pages. Remis en position désactivée ensuite |
| Limites | je n'ai pas de vraies clés : à créer par vous ; le jeton Turnstile apparaît dans les journaux d'OpenIddict (usage unique, sans danger ; le mot de passe y est masqué) ; il faut Internet côté navigateur et serveur pour joindre Cloudflare |


## 23. Analyse Pareto manuelle (en plus de la configuration guidée)

| Point | Détail |
|---|---|
| Bascule | « Configuration guidée / Analyse manuelle » en haut de la page Pareto. La configuration guidée reste inchangée et reste le mode par défaut |
| Choix manuels | axe (type de défaut, ligne, client, équipe, gravité), filtres sur les autres axes, période (historique, 6/12/24 mois, dates précises), mesure (fréquence / impact) |
| Règles | le filtre de l'axe analysé est ignoré ; une période à l'envers est remise dans l'ordre ; le dernier jour compte en entier ; « Reprendre le contexte de cette réclamation » pré-remplit, « Tout réinitialiser » vide |
| API | `ParetoRequestDto` gagne `Shift` et `Severity` (gravité insensible à la casse) ; les autres champs sont inchangés |
| Tests | .NET `ManualAnalysis_ChoosesTheAxis_AndNarrowsByShiftSeverityClientLineAndDates` ; Jest `manualPareto.test.ts` (4) ; vérifié en direct : filtre équipe « Nuit » → « classé par type de défaut · 841 réclamations · Équipe = Nuit » |
