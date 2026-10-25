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
