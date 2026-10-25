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
