-- Demo data: complete most of the 8D analyses (D1 to D8, 5 Why, Ishikawa, corrective plan).
-- Nothing is deleted. Dossiers that are still in progress are completed; critical and high claims closed without any 8D in the last
-- 12 months get a complete closed 8D. A share of the recent in-progress dossiers is left in progress on purpose.
-- Four eyes: the validator of a closed dossier is an administrator who is neither the champion nor the author of the claim.
-- Take a backup first. Re-running is safe: only IN_PROGRESS dossiers and claims without a dossier are touched.
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRAN;

DECLARE @now DATETIME2 = SYSUTCDATETIME();
DECLARE @org UNIQUEIDENTIFIER = 'B6369E61-9037-4CD0-AF9B-FCC87AAD357B';
DECLARE @qualite UNIQUEIDENTIFIER = 'C3BF185E-2221-BF4A-9B12-3210786B3537';

-- ── templates by family of defect ────────────────────────────────────────────────────────────────
CREATE TABLE #fam (fam CHAR(3) PRIMARY KEY, w3 NVARCHAR(300), w4 NVARCHAR(300), w5 NVARCHAR(300), d2 NVARCHAR(300), d3 NVARCHAR(300),
  ik_man NVARCHAR(300), ik_met NVARCHAR(300), ik_mac NVARCHAR(300), ik_mat NVARCHAR(300), ik_mil NVARCHAR(300), ik_mea NVARCHAR(300), ik_root NVARCHAR(20),
  prev_desc NVARCHAR(400), prev_scope NVARCHAR(300), ca1 NVARCHAR(300), ca2 NVARCHAR(300));
INSERT INTO #fam VALUES
('ISO', N'La filière et le guide fil présentaient une usure non détectée au changement de série.', N'Le remplacement des outillages est fait à la panne et non selon un intervalle défini.', N'Pas de fréquence de contrôle des outillages d''extrusion dans la gamme de maintenance.',
  N'Le contrôle visuel en bout de ligne ne couvre pas la totalité de la longueur produite.', N'Le plan de contrôle ne prévoit pas de contrôle d''aspect en continu sur la gaine.',
  N'Opérateur non formé à reconnaître les premières marques d''usure.', N'Gamme de changement de série sans point de contrôle de la filière.', N'Filière et guide fil usés au-delà de la limite.', N'Lot de compound PVC avec particules dures.', N'Poussière à proximité de la tête d''extrusion.', N'Pas de contrôle d''aspect en continu.', N'Machine',
  N'Intervalle de remplacement des filières et guides ajouté à la gamme de maintenance et au standard de poste.', N'Toutes les lignes d''extrusion (EXT-01, EXT-02).',
  N'Remplacer la filière et le guide fil, vérifier la rugosité de surface.', N'Ajouter le contrôle des outillages d''extrusion au plan de maintenance préventive.'),
('COP', N'Le conducteur a subi une contrainte (tension ou frottement) hors de la plage prévue.', N'Le réglage de tension n''était pas verrouillé après le dernier changement de bobine.', N'Aucune vérification de la tension au démarrage de série dans la gamme.',
  N'Le contrôle dimensionnel ne détecte pas les brins fragilisés.', N'L''autocontrôle opérateur ne comprend pas d''examen visuel du cuivre.',
  N'Réglage de tension modifié sans validation.', N'Pas de check-list de démarrage de série.', N'Frein de dévidoir déréglé, tension irrégulière.', N'Cuivre exposé à l''humidité en stockage.', N'Atmosphère de recuit non protectrice.', N'Pas de contrôle visuel du cuivre en sortie de recuit.', N'Machine',
  N'Check-list de démarrage de série avec tension verrouillée et contrôle visuel du cuivre en sortie de recuit.', N'Toutes les lignes de tréfilage (WR-01 à WR-06).',
  N'Régler et verrouiller la tension du dévidoir, contrôler l''atmosphère du four.', N'Intégrer la vérification de tension à la check-list de démarrage.'),
('MRK', N'L''encre ou le dispositif de marquage n''était pas dans sa fenêtre de réglage.', N'Le contrôle de lisibilité n''est fait qu''au démarrage et non en cours de série.', N'La fréquence du contrôle de marquage n''est pas définie dans le plan de contrôle.',
  N'La lisibilité n''est pas vérifiée après vieillissement ou frottement.', N'Le plan de contrôle ne prévoit pas d''essai de résistance au frottement.',
  N'Consignes de marquage non appliquées au changement de poste.', N'Plan de contrôle sans fréquence de vérification du marquage.', N'Marqueur jet d''encre encrassé, viscosité hors plage.', N'Encre non conforme à la spécification du câble.', N'Température de l''atelier trop basse près du marqueur.', N'Pas d''essai de frottement en production.', N'Method',
  N'Fréquence de contrôle du marquage (toutes les 2 heures) et essai de frottement ajoutés au plan de contrôle.', N'Lignes de marquage et de conditionnement.',
  N'Nettoyer le marqueur, régler la viscosité de l''encre, remplacer l''encre non conforme.', N'Mettre à jour le plan de contrôle : lisibilité toutes les 2 heures.'),
('COL', N'La couleur du lot de matière ne correspondait pas à la référence du câble.', N'Le contrôle de couleur à réception se limite à l''étiquette du fournisseur.', N'Pas de comparaison colorimétrique à la réception du compound.',
  N'Le contrôle en ligne se fait à l''œil, sans référence étalon.', N'Aucun étalon de couleur disponible sur la ligne.',
  N'Changement de couleur sans vérification de purge.', N'Procédure de changement de couleur incomplète.', N'Purge de l''extrudeuse insuffisante au changement de couleur.', N'Lot de masterbatch hors tolérance de teinte.', N'Éclairage de poste de contrôle non normalisé.', N'Pas d''étalon de couleur sur la ligne.', N'Material',
  N'Contrôle colorimétrique à réception du compound et étalons de couleur à chaque ligne.', N'Réception matières et lignes d''extrusion.',
  N'Isoler le lot de matière, purger complètement la ligne avant reprise.', N'Mettre en place l''étalon de couleur et le contrôle à réception.'),
('DIM', N'Une dérive lente du procédé a fait sortir la cote de sa tolérance en cours de série.', N'Le contrôle dimensionnel est périodique et ne détecte pas les dérives lentes.', N'Pas de carte de contrôle ni d''alarme de dérive sur la cote.',
  N'La fréquence de mesure ne permet pas de voir une dérive progressive.', N'Le plan de contrôle ne prévoit pas de suivi statistique de la cote.',
  N'Réglage de ligne corrigé manuellement sans consigne.', N'Plan de contrôle sans carte de contrôle sur la cote.', N'Appareil de mesure en ligne dérivé, non étalonné à temps.', N'Variation d''une bobine à l''autre du diamètre du fil.', N'Température ambiante variable sur le poste.', N'Calibre et laser non étalonnés à l''échéance.', N'Measurement',
  N'Carte de contrôle avec alarme de dérive et étalonnage planifié des instruments de mesure.', N'Toutes les lignes avec mesure en continu.',
  N'Réétalonner l''instrument de mesure et recentrer le procédé.', N'Mettre en place la carte de contrôle et l''alarme de dérive sur la cote.'),
('ELE', N'L''isolant présentait une porosité ou une adhérence insuffisante sur une partie de la longueur.', N'Les paramètres de refroidissement et de température de matière n''étaient pas stabilisés.', N'Pas de fenêtre de réglage validée pour le refroidissement.',
  N'L''essai d''étincelage est fait à une tension insuffisante pour ce produit.', N'La tension d''essai n''est pas définie par référence produit.',
  N'Réglage de refroidissement modifié sans enregistrement.', N'Fenêtre de procédé non documentée pour cette référence.', N'Bac de refroidissement : débit insuffisant.', N'Compound humide, cause de bulles.', N'Hygrométrie élevée dans le magasin matière.', N'Tension d''essai d''étincelage non adaptée.', N'Method',
  N'Fenêtre de procédé documentée par référence et tension d''essai définie dans le plan de contrôle.', N'Lignes d''extrusion et poste d''essai électrique.',
  N'Sécher la matière, régler le refroidissement et vérifier la tension d''essai.', N'Documenter la fenêtre de procédé et la tension d''essai par référence.'),
('PKG', N'La manutention ou le calage du touret ne protégeait pas le produit pendant le transport interne.', N'Le mode opératoire de conditionnement n''impose pas de calage ni de protection des flasques.', N'Pas de spécification d''emballage validée pour cette référence.',
  N'Le contrôle avant expédition ne comprend pas d''examen du touret.', N'La check-list d''expédition ne couvre pas l''état des flasques.',
  N'Manutention des tourets sans l''outillage prévu.', N'Mode opératoire de conditionnement incomplet.', N'Poste d''enroulage : flasques mal serrées.', N'Tourets de lot fournisseur plus fragiles.', N'Allées étroites, chocs lors du transport.', N'Pas de contrôle de l''état des flasques à l''expédition.', N'Method',
  N'Spécification d''emballage et calage par référence, contrôle des flasques ajouté à la check-list d''expédition.', N'Conditionnement et expédition.',
  N'Remplacer les tourets endommagés, revoir le calage du chargement.', N'Mettre à jour la spécification d''emballage et la check-list d''expédition.'),
('ASM', N'Le paramètre de sertissage ou de soudure était hors de sa fenêtre pendant la série.', N'Aucune vérification de la hauteur de sertissage ou de la température de soudure au démarrage.', N'Pas d''essai d''arrachement planifié en début et en cours de série.',
  N'Le contrôle visuel final ne détecte pas un sertissage ou une soudure partiellement défectueux.', N'L''essai d''arrachement n''est pas dans le plan de contrôle de cette référence.',
  N'Opérateur non habilité sur ce poste de sertissage.', N'Pas d''essai d''arrachement en début de série.', N'Outil de sertissage usé, hauteur hors tolérance.', N'Lot de terminaux avec épaisseur de plaquage variable.', N'Poste soumis à des vibrations voisines.', N'Pas de jauge de hauteur de sertissage au poste.', N'Machine',
  N'Essai d''arrachement en début et en cours de série et habilitation des opérateurs au poste.', N'Postes de sertissage et de soudure (ASM-01 à ASM-03).',
  N'Remplacer l''outil de sertissage, vérifier la hauteur et refaire l''essai d''arrachement.', N'Ajouter l''essai d''arrachement au plan de contrôle et habiliter les opérateurs.'),
('CTM', N'Un corps étranger est entré dans le circuit de matière ou sur la ligne.', N'Le filtre de la ligne n''était pas remplacé selon la fréquence prévue.', N'Pas de plan de nettoyage et de remplacement des filtres.',
  N'Le contrôle d''aspect ne détecte pas les contaminations de faible taille.', N'Aucun détecteur de contamination en ligne.',
  N'Consignes de propreté non appliquées au changement de série.', N'Plan de nettoyage absent pour cette ligne.', N'Filtre saturé laissant passer des particules.', N'Matière contaminée à la réception.', N'Poussières de l''atelier proches de la matière ouverte.', N'Pas de contrôle visuel renforcé à l''entrée de ligne.', N'Method',
  N'Plan de nettoyage et de remplacement des filtres avec traçabilité, couvercles sur les matières ouvertes.', N'Lignes d''extrusion et stockage matière.',
  N'Nettoyer la ligne, remplacer le filtre et isoler la matière suspecte.', N'Mettre en place le plan de nettoyage et le suivi des filtres.'),
('GEN', N'Le paramètre associé au procédé était hors de sa fenêtre pendant la série.', N'La vérification de ce paramètre n''est pas prévue au démarrage de série.', N'Pas de fenêtre de réglage documentée pour cette référence.',
  N'Le contrôle en fin de ligne ne couvre pas ce mode de défaillance.', N'Le plan de contrôle ne contient pas ce point de contrôle.',
  N'Consigne de poste non appliquée.', N'Gamme sans point de contrôle pour ce paramètre.', N'Réglage machine hors de la fenêtre validée.', N'Matière hors spécification.', N'Conditions d''atelier variables.', N'Point de contrôle manquant dans le plan.', N'Method',
  N'Point de contrôle ajouté au plan de contrôle et au standard de poste.', N'Lignes concernées.',
  N'Rétablir le réglage conforme et vérifier trois lots consécutifs.', N'Documenter la fenêtre de procédé dans le standard de poste.');

-- ── people ───────────────────────────────────────────────────────────────────────────────────────
SELECT ROW_NUMBER() OVER (ORDER BY p.Name) rk, p.UserId, p.Name INTO #admins
FROM actionplan.UserProfiles p
WHERE p.UserId IN ('ab5b7216-1916-4cb3-b5a5-5f9aab719465','16a59637-32f2-4039-a6c5-6728a36b542c','3784aa7e-3955-4b78-8ece-8923ce7fc6f4','a659b899-ac6d-4e90-91ca-06973806b4f5','d6b7cfa1-422a-4e34-8c2a-a97e4a85feef');
SELECT ROW_NUMBER() OVER (ORDER BY p.Name) rk, p.UserId, p.Name INTO #staff
FROM actionplan.UserProfiles p
WHERE p.Role = 'user' AND p.Status = 'active' AND p.DepartmentId = @qualite
  AND p.UserId NOT IN (SELECT UserId FROM #admins);
DECLARE @staffCount INT = (SELECT COUNT(*) FROM #staff);
IF @staffCount = 0 BEGIN RAISERROR('no staff to act as champions', 16, 1); ROLLBACK; RETURN; END

-- ── the pool: dossiers to complete + critical claims closed without a dossier ───────────────────
SELECT c.Id ClaimId, d.Id DossierId, CAST(0 AS BIT) IsNew, c.Reference, c.DefectType, c.ProductionLine, c.LotNumber, c.ClientId, c.Severity,
       c.DetectionDate, c.CreatedAt claimCreated, c.CompletedAt, c.Deadline, c.StatusCode claimStatus, c.AssignedToId, c.AssignedToName, c.CreatedById, c.Description,
       ABS(CHECKSUM(c.Id)) h
INTO #pool
FROM actionplan.Claims c JOIN actionplan.EightDDossiers d ON d.ClaimId = c.Id
WHERE c.IsArchived = 0 AND d.IsArchived = 0 AND d.StatusCode = 'IN_PROGRESS'
  AND c.DetectionDate <= DATEADD(DAY, -4, @now)
  AND (c.StatusCode IN ('VALIDATED', 'CLOTUREE') OR ABS(CHECKSUM(c.Id)) % 100 < 85);
INSERT INTO #pool
SELECT c.Id, NEWID(), 1, c.Reference, c.DefectType, c.ProductionLine, c.LotNumber, c.ClientId, c.Severity,
       c.DetectionDate, c.CreatedAt, c.CompletedAt, c.Deadline, c.StatusCode, c.AssignedToId, c.AssignedToName, c.CreatedById, c.Description, ABS(CHECKSUM(c.Id))
FROM actionplan.Claims c
WHERE c.IsArchived = 0 AND c.StatusCode = 'CLOTUREE' AND (c.Severity IN ('CRITICAL', 'HIGH') OR c.IsInternal = 1)
  AND c.DetectionDate >= DATEADD(DAY, -365, @now) AND (c.DetectionDate <= DATEADD(DAY, -4, @now) OR c.IsInternal = 1)
  AND NOT EXISTS (SELECT 1 FROM actionplan.EightDDossiers d WHERE d.ClaimId = c.Id);
DECLARE @poolN INT = (SELECT COUNT(*) FROM #pool), @poolNew INT = (SELECT COUNT(*) FROM #pool WHERE IsNew = 1);
PRINT CONCAT('pool: ', @poolN, ' (new dossiers: ', @poolNew, ')');

-- ── who does what, and when ──────────────────────────────────────────────────────────────────────
SELECT p.*,
  CASE WHEN p.claimStatus IN ('VALIDATED', 'CLOTUREE') OR p.IsNew = 1 OR p.h % 100 < 55 THEN 'CLOSED' ELSE 'PENDING_VALIDATION' END outcome,
  COALESCE(p.AssignedToId, s.UserId) champId, COALESCE(NULLIF(p.AssignedToName, ''), s.Name) champName,
  CASE WHEN f.fam IS NULL THEN 'GEN' ELSE f.fam END fam
INTO #pool2
FROM #pool p
LEFT JOIN #staff s ON s.rk = (p.h % @staffCount) + 1
CROSS APPLY (SELECT CASE
  WHEN p.DefectType IN ('CUT_INSULATION','SCRATCH_INSULATION','SURFACE_SCRATCH',N'Isolation endommagée') THEN 'ISO'
  WHEN p.DefectType IN ('COPPER_BROKEN','COPPER_BLOOMING','COPPER_OXIDATION','Coupure fil','STRAND_COUNT') THEN 'COP'
  WHEN p.DefectType IN ('MARKING_DEFECT',N'Marquage illisible','Marquage',N'Étiquette manquante',N'Etiquette manquante') THEN 'MRK'
  WHEN p.DefectType IN ('COLOR_MISMATCH','COLOR_NON_CONFORMITY','Couleur incorrecte') THEN 'COL'
  WHEN p.DefectType IN ('CONDUCTOR_DIAMETER','OUTER_DIAMETER','ECCENTRICITY','INSULATION_THICKNESS','LAY_LENGTH','Dimension hors tolérance',N'Longueur câble incorrecte','SPOOL_LENGTH') THEN 'DIM'
  WHEN p.DefectType IN ('SPARK_TEST_FAILURE','CONDUCTOR_RESISTANCE','ADHESION_FAILURE','INSULATION_BLISTER') THEN 'ELE'
  WHEN p.DefectType IN ('SPOOL_DAMAGED','SPOOL_DAMAGE','CABLE_CRUSHED',N'Non-conformité emballage') THEN 'PKG'
  WHEN p.DefectType IN (N'Soudure défectueuse','Soudure',N'Manque de sertissage',N'Connecteur desserré',N'Polarité inversée',N'Débordement étain') THEN 'ASM'
  WHEN p.DefectType IN ('FOREIGN_MATTER','Contamination surface') THEN 'CTM'
  END fam) f;

SELECT q.*, v.UserId validId, v.Name validName,
  ISNULL(ri.Label, q.DefectType) defLabel,
  CASE WHEN q.outcome = 'CLOSED'
       THEN CASE WHEN q.CompletedAt IS NOT NULL AND q.CompletedAt > q.DetectionDate THEN q.CompletedAt
                 WHEN DATEADD(DAY, 8 + q.h % 20, q.DetectionDate) < DATEADD(DAY, -1, @now) THEN DATEADD(DAY, 8 + q.h % 20, q.DetectionDate)
                 ELSE DATEADD(DAY, -1, @now) END
       ELSE NULL END closeAt,
  CASE WHEN DATEADD(DAY, 5 + q.h % 10, q.DetectionDate) < DATEADD(DAY, -1, @now) THEN DATEADD(DAY, 5 + q.h % 10, q.DetectionDate) ELSE DATEADD(DAY, -1, @now) END submitAt
INTO #pool3
FROM #pool2 q
OUTER APPLY (SELECT TOP 1 a.UserId, a.Name FROM #admins a
             WHERE a.UserId NOT IN (ISNULL(q.champId, ''), ISNULL(q.CreatedById, ''), ISNULL(q.AssignedToId, ''))
             ORDER BY (a.rk - 1 - q.h % 5 + 5) % 5) v
LEFT JOIN actionplan.ReferenceItems ri ON ri.ListKey = 'defect-type' AND ri.Value = q.DefectType;

-- containment: the four standard actions, the 100 % sort counts taken from the series
DECLARE @t TABLE (ClaimId UNIQUEIDENTIFIER, json NVARCHAR(MAX));
INSERT INTO @t
SELECT p.ClaimId,
  N'{"v":1,"actions":['
  + N'{"id":"' + LOWER(LEFT(REPLACE(CAST(NEWID() AS VARCHAR(40)), '-', ''), 12)) + N'","kind":"STOP_SHIP","title":"Bloquer les expéditions","owner":"' + REPLACE(p.champName, '"', '') + N'","location":"usine","qtyChecked":null,"qtyNok":null,"status":"DONE","required":true},'
  + N'{"id":"' + LOWER(LEFT(REPLACE(CAST(NEWID() AS VARCHAR(40)), '-', ''), 12)) + N'","kind":"QUARANTINE","title":"Quarantaine du lot / stock / WIP","owner":"' + REPLACE(p.champName, '"', '') + N'","location":"Magasin / ligne","qtyChecked":null,"qtyNok":null,"status":"DONE","required":true},'
  + N'{"id":"' + LOWER(LEFT(REPLACE(CAST(NEWID() AS VARCHAR(40)), '-', ''), 12)) + N'","kind":"SORT_100","title":"Tri 100 % des pièces à risque","owner":"' + REPLACE(p.champName, '"', '') + N'","location":"Ligne / stock","qtyChecked":' + CAST(800 + p.h % 4200 AS NVARCHAR(10)) + N',"qtyNok":' + CAST(p.h % 60 AS NVARCHAR(10)) + N',"status":"DONE","required":true},'
  + N'{"id":"' + LOWER(LEFT(REPLACE(CAST(NEWID() AS VARCHAR(40)), '-', ''), 12)) + N'","kind":"INFORM_CUSTOMER","title":"Informer le client","owner":"' + REPLACE(p.champName, '"', '') + N'","location":"Qualité client","qtyChecked":null,"qtyNok":null,"status":"DONE","required":true}'
  + N'],"fieldOriginals":{}}'
FROM #pool3 p;

-- ── 1. the 8D dossiers ───────────────────────────────────────────────────────────────────────────
SELECT p.DossierId, p.ClaimId, p.IsNew, p.outcome,
  p.champId, p.champName, p.validId, p.validName, p.closeAt, p.submitAt,
  N'Pilote : ' + p.champName + CHAR(10) + N'Production : chef de ligne ' + ISNULL(p.ProductionLine, N'ligne') + CHAR(10) + N'Méthodes : technicien process' + CHAR(10) + N'Qualité : ingénieur qualité' team,
  DATEADD(HOUR, 6, p.DetectionDate) formedAt,
  t.json containment,
  f.prev_desc, f.prev_scope, p.ClientId, p.DetectionDate, p.h
INTO #d
FROM #pool3 p JOIN #fam f ON f.fam = p.fam JOIN @t t ON t.ClaimId = p.ClaimId;

UPDATE d SET
  d.CurrentStep = 8, d.StatusCode = x.outcome, d.ChampionId = x.champId, d.ChampionName = x.champName,
  d.TeamMembers = x.team, d.TeamFormedAt = x.formedAt,
  d.ContainmentDescription = x.containment, d.ContainmentOwner = x.champName, d.ContainmentImplementedAt = DATEADD(DAY, 1, x.DetectionDate), d.ContainmentVerified = 1,
  d.EffectivenessMethod = N'Contrôle de 3 lots consécutifs après correction', d.LotsChecked = 3, d.DefectsFound = 0,
  d.EffectivenessNotes = N'Aucun défaut du même mode retrouvé sur les lots suivants.', d.EffectivenessValidated = 1, d.EffectivenessValidatedAt = DATEADD(HOUR, -6, x.submitAt),
  d.PreventiveDescription = x.prev_desc, d.PreventiveScope = x.prev_scope, d.PreventiveStandardized = 1, d.PreventiveCompletedAt = DATEADD(HOUR, -3, x.submitAt),
  d.CongratulationsNote = N'Merci à l''équipe pour la clôture dans les délais.', d.CustomerName = x.ClientId,
  d.SubmittedAt = x.submitAt, d.SubmittedById = x.champId,
  d.ValidatedAt = CASE WHEN x.outcome = 'CLOSED' THEN x.closeAt END, d.ValidatedById = CASE WHEN x.outcome = 'CLOSED' THEN x.validId END,
  d.ValidationComment = CASE WHEN x.outcome = 'CLOSED' THEN N'Cause racine confirmée, actions efficaces sur 3 lots. Dossier validé.' END,
  d.ClosedAt = CASE WHEN x.outcome = 'CLOSED' THEN x.closeAt END, d.ClosedById = CASE WHEN x.outcome = 'CLOSED' THEN x.validId END,
  d.UpdatedAt = ISNULL(x.closeAt, x.submitAt), d.UpdatedBy = CASE WHEN x.outcome = 'CLOSED' THEN x.validId ELSE x.champId END
FROM actionplan.EightDDossiers d JOIN #d x ON x.DossierId = d.Id AND x.IsNew = 0;
PRINT CONCAT('dossiers completed: ', @@ROWCOUNT);

INSERT INTO actionplan.EightDDossiers (Id, ClaimId, CurrentStep, StatusCode, ChampionId, ChampionName, TeamMembers, TeamFormedAt, ContainmentDescription, ContainmentOwner,
  ContainmentImplementedAt, ContainmentVerified, EffectivenessMethod, LotsChecked, DefectsFound, EffectivenessNotes, EffectivenessValidated, EffectivenessValidatedAt,
  PreventiveDescription, PreventiveScope, PreventiveStandardized, PreventiveCompletedAt, CongratulationsNote, CustomerName, ClosedAt, ClosedById, SubmittedAt, SubmittedById,
  ValidatedAt, ValidatedById, ValidationComment, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, IsArchived)
SELECT x.DossierId, x.ClaimId, 8, x.outcome, x.champId, x.champName, x.team, x.formedAt, x.containment, x.champName,
  DATEADD(DAY, 1, x.DetectionDate), 1, N'Contrôle de 3 lots consécutifs après correction', 3, 0, N'Aucun défaut du même mode retrouvé sur les lots suivants.', 1, DATEADD(HOUR, -6, x.submitAt),
  x.prev_desc, x.prev_scope, 1, DATEADD(HOUR, -3, x.submitAt), N'Merci à l''équipe pour la clôture dans les délais.', x.ClientId, x.closeAt, x.validId, x.submitAt, x.champId,
  x.closeAt, x.validId, N'Cause racine confirmée, actions efficaces sur 3 lots. Dossier validé.', x.formedAt, x.champId, x.closeAt, x.validId, 0
FROM #d x WHERE x.IsNew = 1;
PRINT CONCAT('dossiers created: ', @@ROWCOUNT);

-- ── 2. the claims follow their dossier ───────────────────────────────────────────────────────────
UPDATE c SET
  c.StatusCode = CASE WHEN x.outcome = 'CLOSED' THEN 'CLOTUREE' ELSE 'PENDING_VALIDATION' END,
  c.AssignedToId = ISNULL(c.AssignedToId, x.champId), c.AssignedToName = ISNULL(NULLIF(c.AssignedToName, ''), x.champName), c.AssignedAt = ISNULL(c.AssignedAt, DATEADD(HOUR, 4, c.DetectionDate)),
  c.CompletedAt = CASE WHEN x.outcome = 'CLOSED' THEN ISNULL(c.CompletedAt, x.closeAt) ELSE c.CompletedAt END,
  c.IsOnTime = CASE WHEN x.outcome = 'CLOSED' THEN CASE WHEN c.Deadline IS NULL OR ISNULL(c.CompletedAt, x.closeAt) <= c.Deadline THEN 1 ELSE 0 END ELSE c.IsOnTime END,
  c.UpdatedAt = ISNULL(x.closeAt, x.submitAt)
FROM actionplan.Claims c JOIN #d x ON x.ClaimId = c.Id;
PRINT CONCAT('claims updated: ', @@ROWCOUNT);

-- ── 3. 5 Why: root causes (occurrence and detection) and the chain of whys ───────────────────────
INSERT INTO actionplan.FiveWhyAnalyses (Id, ClaimId, ProblemStatement, StatusCode, IsValidated, CreatedAt, CreatedBy, IsArchived)
SELECT NEWID(), p.ClaimId, LEFT(ISNULL(NULLIF(p.Description, ''), p.defLabel), 500), 'DRAFT', 0, DATEADD(DAY, 1, p.DetectionDate), ISNULL(p.champName, 'system'), 0
FROM #pool3 p WHERE NOT EXISTS (SELECT 1 FROM actionplan.FiveWhyAnalyses a WHERE a.ClaimId = p.ClaimId AND a.IsArchived = 0);

UPDATE a SET
  a.RootCause = f.w5, a.RootCauseOccurrence = f.w5, a.RootCauseDetection = f.d3,
  a.StatusCode = 'VALIDATED', a.IsValidated = 1,
  a.ValidatedBy = ISNULL(p.validName, p.champName), a.ValidatedAt = DATEADD(HOUR, -8, p.submitAt),
  a.LastModifiedAt = DATEADD(HOUR, -8, p.submitAt), a.LastModifiedBy = p.champName
FROM actionplan.FiveWhyAnalyses a JOIN #pool3 p ON p.ClaimId = a.ClaimId JOIN #fam f ON f.fam = p.fam
WHERE a.IsArchived = 0 AND ISNULL(a.RootCause, '') = '' AND ISNULL(a.RootCauseOccurrence, '') = '';
PRINT CONCAT('5 Why validated: ', @@ROWCOUNT);

INSERT INTO actionplan.FiveWhySteps (Id, AnalysisId, StepNumber, Question, Answer, IsArchived, BranchType)
SELECT NEWID(), a.Id, s.n, s.q, s.ans, 0, s.branch
FROM actionplan.FiveWhyAnalyses a JOIN #pool3 p ON p.ClaimId = a.ClaimId JOIN #fam f ON f.fam = p.fam
CROSS APPLY (VALUES
  (1, N'Pourquoi le défaut est-il apparu ?', N'« ' + p.defLabel + N' » est apparu sur ' + ISNULL(p.ProductionLine, N'la ligne') + N' au poste concerné.', 'OCCURRENCE'),
  (2, N'Pourquoi ?', N'Le paramètre ou le réglage associé était hors de sa fenêtre pendant la série.', 'OCCURRENCE'),
  (3, N'Pourquoi ?', f.w3, 'OCCURRENCE'),
  (4, N'Pourquoi ?', f.w4, 'OCCURRENCE'),
  (5, N'Pourquoi ?', f.w5, 'OCCURRENCE'),
  (1, N'Pourquoi le contrôle ne l''a-t-il pas vu ?', N'Le contrôle en cours de fabrication n''a pas détecté le défaut.', 'DETECTION'),
  (2, N'Pourquoi ?', f.d2, 'DETECTION'),
  (3, N'Pourquoi ?', f.d3, 'DETECTION')) s(n, q, ans, branch)
WHERE a.IsArchived = 0 AND NOT EXISTS (SELECT 1 FROM actionplan.FiveWhySteps x WHERE x.AnalysisId = a.Id);
PRINT CONCAT('5 Why steps added: ', @@ROWCOUNT);

-- ── 4. Ishikawa: one cause per family of causes, the confirmed root cause flagged ────────────────
INSERT INTO actionplan.IshikawaAnalyses (Id, ClaimId, ProblemStatement, StatusCode, IsValidated, IsArchived, CreatedAt, CreatedBy, Categories, ValidatedBy, ValidatedAt)
SELECT NEWID(), p.ClaimId, LEFT(ISNULL(NULLIF(p.Description, ''), p.defLabel), 500), 'VALIDATED', 1, 0, DATEADD(DAY, 2, p.DetectionDate), ISNULL(p.champName, 'system'), N'[]',
       ISNULL(p.validName, p.champName), DATEADD(HOUR, -8, p.submitAt)
FROM #pool3 p WHERE NOT EXISTS (SELECT 1 FROM actionplan.IshikawaAnalyses i WHERE i.ClaimId = p.ClaimId AND i.IsArchived = 0);

INSERT INTO actionplan.IshikawaCauses (Id, ClaimId, Category, CauseDescription, IsRootCause, CreatedAt, CreatedBy, IsArchived)
SELECT NEWID(), p.ClaimId, c.cat, c.descr, CASE WHEN c.cat = f.ik_root THEN 1 ELSE 0 END, DATEADD(DAY, 2, p.DetectionDate), ISNULL(p.champName, 'system'), 0
FROM #pool3 p JOIN #fam f ON f.fam = p.fam
CROSS APPLY (VALUES ('Manpower', f.ik_man), ('Method', f.ik_met), ('Machine', f.ik_mac), ('Material', f.ik_mat), ('Milieu', f.ik_mil), ('Measurement', f.ik_mea)) c(cat, descr)
WHERE NOT EXISTS (SELECT 1 FROM actionplan.IshikawaCauses x WHERE x.ClaimId = p.ClaimId AND x.IsArchived = 0);
PRINT CONCAT('Ishikawa causes added: ', @@ROWCOUNT);

-- ── 5. corrective plan (PAC) with its two actions, for claims that have none ─────────────────────
DECLARE @nextRef INT = (SELECT MAX(CAST(SUBSTRING(Reference, 10, 10) AS INT)) FROM actionplan.ActionPlans WHERE Reference LIKE 'PAC-2026-%');
SELECT NEWID() PlanId, ROW_NUMBER() OVER (ORDER BY p.DetectionDate, p.ClaimId) + @nextRef seq, p.*, f.ca1, f.ca2
INTO #plans
FROM #pool3 p JOIN #fam f ON f.fam = p.fam
WHERE NOT EXISTS (SELECT 1 FROM actionplan.ActionPlans a WHERE a.ClaimId = p.ClaimId AND a.Type = 2 AND a.IsArchived = 0);

INSERT INTO actionplan.ActionPlans (Id, Title, Description, Type, Status, OwnerId, OrganizationId, DepartmentId, AssignedToId, Deadline, ClaimId, CompletedAt, IsOnTime, Progress,
  CreatedAt, CreatedBy, IsArchived, Reference, Domain)
SELECT x.PlanId, LEFT(N'CAPA — ' + x.defLabel + N' (' + ISNULL(x.ProductionLine, N'—') + N')', 250),
  N'Plan correctif lié à la réclamation ' + x.Reference + N' : ' + x.ca1,
  2, CASE WHEN x.outcome = 'CLOSED' THEN 3 ELSE 2 END, x.champId, @org, ISNULL(pr.DepartmentId, @qualite), x.champId,
  CASE WHEN x.outcome = 'CLOSED' THEN DATEADD(DAY, 7, ISNULL(x.closeAt, x.submitAt)) ELSE DATEADD(DAY, 10, @now) END,
  x.ClaimId, CASE WHEN x.outcome = 'CLOSED' THEN x.closeAt END, CASE WHEN x.outcome = 'CLOSED' THEN 1 END,
  CASE WHEN x.outcome = 'CLOSED' THEN 100 ELSE 100 END,
  DATEADD(DAY, 3, x.DetectionDate), x.champId, 0, 'PAC-2026-' + RIGHT('0000' + CAST(x.seq AS VARCHAR(6)), 4), 'QUALITY'
FROM #plans x LEFT JOIN actionplan.UserProfiles pr ON pr.UserId = x.champId;
PRINT CONCAT('PAC plans created: ', @@ROWCOUNT);

INSERT INTO actionplan.PlanActions (Id, Title, Description, Progress, Deadline, Priority, AssignedToId, ActionPlanId, [Order], CreatedAt, CreatedBy, IsArchived)
SELECT NEWID(), a.title, NULL, 100, DATEADD(DAY, a.ord * 4, DATEADD(DAY, 3, x.DetectionDate)), 1, x.champId, x.PlanId, a.ord, DATEADD(DAY, 3, x.DetectionDate), x.champId, 0
FROM #plans x CROSS APPLY (VALUES (1, x.ca1), (2, x.ca2)) a(ord, title);
PRINT CONCAT('plan actions created: ', @@ROWCOUNT);

-- ── audit trail ──────────────────────────────────────────────────────────────────────────────────
INSERT INTO actionplan.ClaimEvents (Id, ClaimId, ActionType, ActorId, Detail, CreatedAt)
SELECT NEWID(), x.ClaimId, 'fivewhy_validated', ISNULL(x.validId, x.champId), NULL, DATEADD(HOUR, -8, x.submitAt) FROM #d x;
INSERT INTO actionplan.ClaimEvents (Id, ClaimId, ActionType, ActorId, Detail, CreatedAt)
SELECT NEWID(), x.ClaimId, 'claim_updated', x.validId, N'8D validé et dossier clôturé', x.closeAt FROM #d x WHERE x.outcome = 'CLOSED' AND x.validId IS NOT NULL;

-- four eyes, whatever the origin of the row: the validator is never the champion, the person in charge, the author or the submitter
UPDATE d SET d.ValidatedById = v.UserId, d.ClosedById = CASE WHEN d.ClosedById = d.ValidatedById THEN v.UserId ELSE d.ClosedById END
FROM actionplan.EightDDossiers d JOIN actionplan.Claims c ON c.Id = d.ClaimId
CROSS APPLY (SELECT TOP 1 a.UserId FROM #admins a WHERE a.UserId NOT IN (ISNULL(d.ChampionId, ''), ISNULL(c.AssignedToId, ''), ISNULL(c.CreatedById, ''), ISNULL(d.SubmittedById, '')) ORDER BY a.rk) v
WHERE d.IsArchived = 0 AND d.ValidatedById IS NOT NULL
  AND d.ValidatedById IN (ISNULL(d.ChampionId, ''), ISNULL(c.AssignedToId, ''), ISNULL(c.CreatedById, ''), ISNULL(d.SubmittedById, ''));
PRINT CONCAT('four-eyes repairs: ', @@ROWCOUNT);

COMMIT;

SELECT outcome, IsNew, COUNT(*) n FROM #d GROUP BY outcome, IsNew;
SELECT d.StatusCode, COUNT(*) n FROM actionplan.EightDDossiers d WHERE d.IsArchived = 0 GROUP BY d.StatusCode;
DROP TABLE #fam, #admins, #staff, #pool, #pool2, #pool3, #d, #plans;
