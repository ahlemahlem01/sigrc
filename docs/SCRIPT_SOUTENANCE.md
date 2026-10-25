# Script de démonstration et réponses aux questions du jury

Document de préparation. Les chiffres viennent de `ml-service/reference-dataset/REPORT.md` et des fichiers
`ml-service/artifacts/` (voir « Ce qu'il faut dire sur les données » avant tout).

## 0. Ce qu'il faut dire sur les données (à dire soi-même, avant qu'on le demande)

- Environ **85 % des réclamations d'entraînement proviennent du jeu de référence** (`ml-service/reference-dataset/`), avec des relations choisies
  par nous (capacité cachée des employés, charge, difficulté du défaut). Le reste vient de données de test de l'application.
- Les résultats montrent donc que **la méthode et la chaîne de traitement fonctionnent**, pas la performance réelle chez
  Coficab. Le jeu de référence est chargé comme un lot d'import « REFERENCE-DATASET », archivable.
- La seule étape qui transformerait ces résultats en preuve : ré-entraîner sur l'historique réel (`python retrain.py`).

Une phrase prête : « Les données proviennent du jeu de référence pour valider la méthode de bout en bout ; le modèle se ré-entraîne en une
commande sur l'historique réel dès qu'il est importé. »

## 1. Déroulé de la démonstration (≈ 10 minutes)

| # | Écran | Ce qu'on montre | Phrase clé |
|---|---|---|---|
| 1 | Connexion, tableau de bord | Accès par rôle, application unique pour réclamations, plans CAPA, alertes | « Une seule application pour la qualité, du signalement à l'action corrective. » |
| 2 | Création d'une réclamation | Défaut, gravité, ligne ; **délai estimé** (P50 – P80 jours) et échéance suggérée | « Le délai est estimé sur l'historique des réclamations semblables, pas deviné. » |
| 3 | Assignation : bandeau **recommandation (top 3)** | Trois employés, probabilité de clôture à temps, raison (« 91 % à l'heure sur 118 dossiers · 31 en cours »), badge **Modèle validé / Indicatif** | « Le modèle classe les employés du département par probabilité de clôturer à temps. » |
| 4 | Analyse Pareto d'une réclamation | Classement 80/20, axe recommandé et écart à la répartition habituelle | « Axe suggéré par un test statistique, pas par une opinion. » |
| 5 | Panneau d'aide à l'analyse (data mining) | Règles d'association, causes racines fréquentes, cas similaires, tendance | « Chaque résultat indique s'il a assez d'historique ; sinon l'outil se remet en mode manuel. » |
| 6 | Recherche sémantique | Une requête en langage naturel retrouve des réclamations proches | « Les textes sont convertis en vecteurs, la recherche se fait par similarité. » |
| 7 | Fiche employé, badges | Rapidité (Bronze, Argent, Or), séries, trimestre parfait, fiabilité | « Les niveaux suivent la distribution de l'équipe, ils restent sélectifs. » |
| 8 | Architecture (schémas) | Local et cloud, couches du backend, séquence d'authentification | « Même code en local (Docker Compose) et sur la VM Azure (Caddy, HTTPS). » |

À avoir ouvert avant de commencer : la pile Docker lancée (`docker compose up -d`), une session déjà connectée
(le jeton est en mémoire, un rechargement de page déconnecte), `ml-service/reference-dataset/REPORT.md` dans un onglet.

## 2. Le modèle de recommandation en 6 phrases

1. **Question posée** : « si on confie cette réclamation à cet employé, sera-t-elle clôturée à temps ? »
2. **Six informations** : taux de ponctualité lissé de l'employé, nombre de dossiers clôturés (fiabilité du taux),
   dossiers ouverts (charge), type de défaut, gravité, jours alloués.
3. **Aucune fuite** : tout est calculé avec ce qui était connu à la date d'assignation (dossier lui-même et futur exclus,
   moyenne d'équipe datée).
4. **Algorithme** : régression logistique, comparée à un gradient boosting ; la plus simple gagne.
5. **Évaluation** : validation croisée répétée, découpage dans le temps, comparaison avec un modèle sans information sur
   l'employé, calibration.
6. **Garde-fou** : le modèle n'est « validé » que s'il bat le hasard **et** si l'information sur l'employé apporte quelque
   chose ; sinon l'écran affiche « Indicatif ».

## 3. Les chiffres à citer

Validation croisée (modèle enregistré, 3 109 réclamations) :

| Mesure | Valeur |
|---|---|
| AUC, réclamation + employé | **0,738** (hasard : 0,5) |
| AUC, réclamation seule | 0,713 |
| Apport de l'information sur l'employé | **+0,025** |
| AUC, découpage dans le temps | 0,734 |
| Exactitude / modèle « toujours à l'heure » | 0,753 / 0,741 |

Comparaison la plus parlante (rapport d'évaluation, 30 % de réclamations les plus récentes, équipe de 22) :

| Employé assigné | Livrées à l'heure |
|---|---|
| Dans le top 3 du modèle | **85,4 %** |
| Hors du top 3 | 68,4 % |

Écart +17,0 points, intervalle de confiance à 95 % de +10,3 à +23,7. **Observation, pas expérience** : les assignations
n'ont pas été faites par le modèle ; le classement est cohérent avec les résultats.

À ne pas dire : « le modèle prédit à 75 % ». L'exactitude (0,753) est quasi identique au modèle trivial (0,741) ; le bon
indicateur est l'AUC et le classement, parce que la recommandation sert à **classer**, pas à répondre par oui ou non.

## 4. Questions probables et réponses honnêtes

**Pourquoi un poids de lissage de 6 ?**
Valeur usuelle (6 dossiers « virtuels » au niveau de l'équipe ajoutés à chaque employé). Comparé de 0 à 80 : l'AUC varie
de l'ordre de 0,001 pour des poids de 0 à 40, très en dessous de l'écart-type (0,02). Le résultat est donc insensible à ce
choix ; nous ne prétendons pas qu'il est optimal. Tableau dans `REPORT.md`.

**D'où vient la moyenne d'équipe, et pourquoi pas une valeur fixe ?**
Elle est mesurée sur les réclamations déjà clôturées à la date d'assignation. Les premières réclamations (moins de 30 issues
connues) sont écartées de l'entraînement : aucune valeur par défaut n'entre dans le modèle. Seul un système presque vide
utilise 75 % à l'affichage, et tous les candidats partagent alors la même valeur (le classement ne change pas).

**Pourquoi 90 jours pour les dossiers ouverts ?**
C'est une règle de fonctionnement, pas une valeur optimisée : un dossier ouvert depuis plus de 90 jours est considéré comme
oublié ou de test, pas comme charge actuelle. À réviser sur données réelles.

**Les données sont-elles réelles ?**
Non, en grande partie (voir section 0). Réponse directe, puis : « le jeu de référence sert à valider la chaîne et à montrer que
le modèle retrouve les effets introduits (corrélation de 0,94 entre le taux estimé et la capacité cachée) ».

**Pourquoi la régression logistique et pas un réseau de neurones ?**
Peu de variables, effets modestes, quelques milliers de lignes : un modèle complexe ne gagne rien (le gradient boosting fait
un peu moins bien : 0,733 contre 0,738). La régression logistique est aussi explicable, ce qui compte pour justifier un
classement de personnes.

**Pourquoi l'exactitude est-elle proche du modèle trivial ?**
Environ 74 % des réclamations sont à l'heure, donc répondre toujours « à l'heure » est déjà exact 74 % du temps. L'objectif
n'est pas de prédire oui/non mais de **classer** les employés : d'où l'AUC et la comparaison top 3 contre le reste.

**Le modèle tient-il compte des compétences, des congés, de la complexité réelle du dossier ?**
Non. Il n'utilise que l'historique de ponctualité, la charge, le type de défaut, la gravité et le délai alloué.

**Y a-t-il de l'apprentissage par renforcement, ou de l'IA générative ?**
Pas de renforcement : il faudrait mesurer l'effet des décisions, ce qui exige un déploiement réel. L'IA générative (Gemini)
est utilisée pour les vecteurs de la recherche sémantique ; les autres analyses sont des statistiques classiques.

**Quelles techniques pour le Pareto, le data mining, le délai estimé ?**
- Pareto : classement 80/20 pondéré par l'impact (quantité défectueuse × gravité) ; axe suggéré par un khi-deux (V de
  Cramér).
- Règles d'association : test exact de Fisher avec correction de Benjamini–Hochberg (seuils de confiance 0,5 et de lift 1,5).
- Tendance : test de Poisson unilatéral, 3 derniers mois contre les 9 précédents.
- Causes et cas similaires : TF-IDF et similarité cosinus.
- Délai estimé : **percentiles empiriques P50 et P80** sur des réclamations semblables, avec repli (type + gravité, puis
  gravité, puis global). Limite connue : les dossiers encore ouverts ne sont pas pris en compte.

**Comment les badges sont-ils attribués ?**
Règles déterministes sur les réclamations clôturées : paliers de rapidité, séries de clôtures à l'heure, trimestres parfaits,
et badge de fiabilité pour les 25 % de l'équipe au meilleur taux lissé. Les niveaux de volume suivent la médiane et les
percentiles de l'équipe (avec des planchers). L'effet des badges sur le comportement n'a pas été mesuré.

## 5. Limites à reconnaître spontanément

- Données majoritairement de référence ; performance réelle inconnue.
- L'apport de l'information sur l'employé est modeste (+0,025 d'AUC).
- Le classement est validé par observation, pas par expérience (le modèle n'a jamais choisi).
- Pas de prise en compte des congés, compétences techniques, complexité réelle.
- Délai estimé : mesuré depuis la création, ignore les dossiers encore ouverts, noms de défauts fusionnés non résolus.
- Les paliers de badges sont fixés par règle ; leur effet n'est pas évalué.

## 6. Pistes (à présenter comme perspectives, pas comme acquis)

1. Importer l'historique réel (assigné, date d'assignation, échéance) et ré-entraîner : `python ml-service/retrain.py`.
2. Mesurer le modèle en conditions réelles : comparer les clôtures à l'heure avec et sans suivi de la recommandation.
3. Estimateur de délai qui tient compte des dossiers ouverts (Kaplan–Meier) et mesuré depuis l'assignation.
4. Bandit contextuel pour les recommandations, une fois un déploiement réel en place.
