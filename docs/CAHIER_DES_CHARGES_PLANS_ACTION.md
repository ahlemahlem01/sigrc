# Conformité au cahier des charges « Gestion de Plan d'Actions » (TS)

Document de référence : *TS Gestion Plan Action Industrie* (système paramétrable et multisecteurs, usine de câbles). Ce tableau dit, exigence par exigence, ce que l'application fait aujourd'hui et où le voir.

## 1. Exigences fonctionnelles et structure (sections 4 et 5)

| Exigence | Réalisation |
|---|---|
| Création d'actions paramétrables | Plans de type PA / PAC / PAP, actions détaillées avec priorité, échéance et ordre ; listes de référence et workflow configurables par l'administrateur |
| Affectation des responsabilités | Responsable du plan et de chaque action, historique des réassignations, recommandation d'un employé |
| Suivi des délais et statuts | Échéance, avancement en %, retard calculé, statuts Créé / En cours / Clôturé / Archivé |
| Gestion documentaire (preuves) | Documents attachés à chaque action, contrôle des preuves avant validation |
| Validation et clôture | Validation des actions, rejet motivé, clôture, contrôle d'efficacité (D6 du 8D) |
| Identification, description, analyse des causes, actions, suivi | Plan + 5 Pourquoi / Ishikawa des réclamations + actions + historique |

## 2. Périmètre multisecteurs (section 2) : **ajouté**

Chaque plan a un **domaine** : Qualité, Production, Maintenance, HSE, Logistique, Ressources humaines, Amélioration continue.

- **Liste de référence `domain`** : les sept domaines sont fournis ; un administrateur peut en ajouter, changer l'ordre ou en désactiver (Paramètres > Listes de référence > Domaines). Les plans existants gardent leur domaine ; un domaine hors liste est refusé (400).
- **Données** : colonne `ActionPlans.Domain` (migration `AddActionPlanDomain`), « Qualité » pour les 219 plans existants (tous nés de réclamations).
- **Formulaires** : choix du domaine à la création (back-office et front-office), changement tracé dans l'historique du plan.
- **Listes et filtres** : filtre « Domaine » dans la liste des plans (admin), dans le front-office, dans « Mes plans d'action » (employé), dans le suivi et dans les deux onglets du pilotage.
- **Droits** : l'administrateur voit tous les plans de son périmètre, l'employé uniquement les plans qui lui sont assignés ; le domaine restreint ces listes, il ne les élargit jamais (`GET /api/ActionPlan?domain=`).
- **Tableaux de bord** : tous les chiffres du pilotage suivent le domaine choisi (`GET /api/dashboard/capa-indicators?domain=`), et un tableau « Par domaine » compare les domaines du périmètre.

## 3. Indicateurs (section 7)

| Indicateur du cahier | Où | Définition |
|---|---|---|
| Taux d'actions en retard | Pilotage, Suivi | plans et actions ouverts dont l'échéance est dépassée |
| Délai moyen de clôture | Pilotage | durée moyenne création → clôture des plans clôturés sur la période |
| **Actions critiques ouvertes** (ajouté) | Pilotage, Suivi | actions **non terminées** des plans ouverts dont la priorité est **Haute** (niveau 1, le plus élevé d'une action détaillée) ; le nombre, la part des actions ouvertes et le nombre d'actions déjà en retard |
| **Taux d'efficacité** (ajouté) | Pilotage, Suivi | parmi les plans **clôturés sur la période** dont le dossier 8D contient un contrôle d'efficacité (**D6 : au moins un lot contrôlé**), part de ceux où le contrôle est **validé sans défaut trouvé** (même règle que l'étape D6 du 8D) ; comparé à la période précédente |

Précisions sur le taux d'efficacité : un plan sans réclamation, ou dont le dossier 8D n'a pas de contrôle de lot, n'est pas jugé (il n'entre ni au numérateur ni au dénominateur) ; sans plan évalué, le chiffre est « — » et non un faux zéro. Le jeu de référence ayant été généré avec des contrôles tous concluants, il affiche aujourd'hui 100 % (83 plans évalués) : c'est une propriété des données de démonstration, pas un résultat de l'usine.

## 4. Workflow général en six étapes (section 6) : **préparé**

Détection → Analyse → Planification → Exécution → Vérification → Clôture.

L'étape est **lue** sur le plan, jamais stockée (`PlanWorkflow`) : aucun statut n'est ajouté, la validation et le workflow 8D des réclamations ne changent pas.

| Étape | Règle |
|---|---|
| 1 Détection | plan ouvert, pas encore de responsable |
| 2 Analyse | responsable désigné, aucune action détaillée (recherche des causes) |
| 3 Planification | actions définies, aucune commencée |
| 4 Exécution | au moins une action commencée |
| 5 Vérification | toutes les actions terminées (faites, validées ou annulées), plan encore ouvert |
| 6 Clôture | plan clôturé ou archivé |

Visible : bandeau des six étapes sur la page d'un plan, et « Où en sont les plans dans le workflow » sur le pilotage (plans ouverts par étape, plans clôturés sur la période pour l'étape 6). Évolution possible plus tard : transformer ces étapes en vrais statuts sans migration de données, puisque la règle de lecture est déjà définie.

## 5. Exigences techniques (section 8)

Application web, base SQL Server centralisée, droits par rôle et permissions, historique et journal d'audit des modifications : en place (voir `docs/ARCHITECTURE.md`).

## 6. Charte graphique (section 9) : écart assumé

Bleu industriel et gris clair, icônes simples, tableaux structurés et aérés : appliqués. **La police est Inter**, et non Calibri / Arial (simple recommandation du cahier). Choix UI/UX justifié :

- **Rendu identique partout** : Calibri n'existe que sur Windows / Office ; sur macOS, Linux, tablettes et téléphones, il serait remplacé par une autre police et la mise en page changerait. Inter est chargée une fois et s'affiche de la même façon sur tous les postes.
- **Lisibilité des chiffres** : Inter dispose de chiffres à chasse fixe (alignement des colonnes de KPI, de dates et de pourcentages), ce que les tableaux de bord utilisent.
- **Trois langues** : fr / en / it avec accents et apostrophes, couverts nativement.
- **Licence libre** (SIL OFL) : aucune licence à acquérir.
- **Conformité de repli** : si Inter ne se charge pas, la pile de polices retombe sur Calibri puis Arial, c'est-à-dire sur les polices recommandées par le cahier.

## 7. Limites

- Le domaine d'un plan créé par import CSV est « Qualité » (colonne non prévue dans le fichier modèle).
- Le taux d'efficacité repose sur le contrôle D6 du 8D : un plan sans réclamation liée n'est pas évalué.
- Les six étapes sont une lecture, pas un statut : on ne peut pas encore « mettre un plan en Vérification » à la main.
