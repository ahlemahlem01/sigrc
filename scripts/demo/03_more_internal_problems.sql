-- Demo data: more internal (workshop) problems for the QRQC board, spread over the last weeks, in every state.
-- 14 realistic problems of a cable plant x 3 lines each = 42 new internal problems (INT-2026-008 to INT-2026-049).
-- Closed ones get their complete analysis from 02_complete_8d.sql (run it after this script: it also takes the internal claims).
-- Nothing is deleted or changed: only inserts, plus the hierarchical manager of five operators (they had none).
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRAN;
IF (SELECT COUNT(*) FROM actionplan.Claims WHERE IsInternal = 1) >= 40 BEGIN PRINT 'internal problems already added'; ROLLBACK; RETURN; END

DECLARE @now DATETIME2 = SYSUTCDATETIME();

-- the team leader manages more of the workshop people (read-only QRQC view for him)
UPDATE p SET ManagerId = m.UserId, ManagerName = m.Name, ManagerEmail = m.Email
FROM actionplan.UserProfiles p JOIN actionplan.UserProfiles m ON m.Name = 'Mehdi Chaabane'
WHERE p.Name IN ('Hichem Saidi', 'Karim Jebali', 'Ines Gharbi', 'Lina Khelifi', 'Omar Belhaj') AND p.ManagerId IS NULL;

CREATE TABLE #tpl (n INT PRIMARY KEY, title NVARCHAR(200), defect NVARCHAR(60), sev VARCHAR(10), l1 VARCHAR(10), l2 VARCHAR(10), l3 VARCHAR(10), descr NVARCHAR(600), pq INT, dq INT);
INSERT INTO #tpl VALUES
(1,  N'Coupure de la gaine PVC en sortie de filière', 'CUT_INSULATION', 'HIGH', 'EXT-01', 'EXT-02', 'CTL-01', N'Entailles périodiques sur la gaine détectées au contrôle visuel en sortie de filière sur {line}. Usure du poinçon ou impureté suspectée.', 12000, 340),
(2,  N'Oxydation du cuivre sur bobine de fil nu', 'COPPER_OXIDATION', 'MEDIUM', 'WR-04', 'WR-05', 'WR-02', N'Taches d''oxydation sur le fil nu après stockage ({line}). Bobines stockées près de la zone de lavage, taux d''humidité à vérifier.', 3000, 420),
(3,  N'Marquage jet d''encre illisible', 'MARKING_DEFECT', 'MEDIUM', 'CTL-01', 'CUT-01', 'CUT-02', N'Le marquage s''efface au frottement sur {line}. Encre ou température de séchage à contrôler, tout le lot est concerné.', 5000, 1800),
(4,  N'Écart de teinte entre deux bobines du même ordre de fabrication', 'COLOR_NON_CONFORMITY', 'LOW', 'EXT-02', 'EXT-01', 'CTL-01', N'Deux bobines du même ordre de fabrication sur {line} présentent une différence de couleur visible. Masterbatch de deux lots suspecté.', 6000, 250),
(5,  N'Flasque de bobine fissurée à l''enroulage', 'SPOOL_DAMAGED', 'LOW', 'CUT-01', 'CUT-02', 'WR-06', N'Flasques fissurées détectées au chargement du poste d''enroulage ({line}). Lot de tourets à isoler.', 4000, 160),
(6,  N'Épaisseur d''isolant sous la tolérance mini', 'INSULATION_THICKNESS', 'HIGH', 'EXT-01', 'EXT-02', 'CTL-01', N'Épaisseur mesurée sous la tolérance mini sur {line}. Arrêt de la ligne demandé, tri du stock produit depuis le dernier contrôle.', 9000, 1100),
(7,  N'Dérive du diamètre du conducteur en fin de bobine', 'CONDUCTOR_DIAMETER', 'HIGH', 'WR-03', 'WR-01', 'WR-02', N'Le diamètre du conducteur dépasse la tolérance haute sur les derniers mètres de bobine ({line}). Contrôle laser hors tolérance, filière à vérifier.', 8000, 800),
(8,  N'Échec à l''essai d''étincelage en sortie de ligne', 'SPARK_TEST_FAILURE', 'CRITICAL', 'EXT-02', 'EXT-01', 'CTL-01', N'Plusieurs défauts d''isolation détectés à l''essai d''étincelage sur {line}. Produit bloqué, client potentiellement concerné.', 15000, 620),
(9,  N'Corps étranger visible dans l''isolant', 'FOREIGN_MATTER', 'HIGH', 'EXT-01', 'EXT-02', 'CUT-02', N'Particule étrangère visible dans la gaine sur {line}. Filtre de ligne et matière à contrôler.', 7000, 210),
(10, N'Brins de cuivre cassés au toronnage', 'COPPER_BROKEN', 'MEDIUM', 'WR-05', 'WR-06', 'WR-03', N'Brins cassés détectés au toronnage sur {line}. Tension du dévidoir et état des poulies à vérifier.', 5000, 300),
(11, N'Excentricité de l''isolant hors spécification', 'ECCENTRICITY', 'MEDIUM', 'EXT-02', 'EXT-01', 'CTL-01', N'Isolant décentré mesuré au contrôle laser sur {line}. Réglage de la tête d''extrusion à revoir.', 6500, 480),
(12, N'Pas de câblage non conforme', 'LAY_LENGTH', 'LOW', 'WR-06', 'WR-04', 'WR-05', N'Le pas de câblage mesuré est hors tolérance sur {line}. Réglage du vireur à contrôler.', 3500, 140),
(13, N'Cloques dans la gaine après refroidissement', 'INSULATION_BLISTER', 'HIGH', 'EXT-01', 'EXT-02', 'CTL-01', N'Cloques apparues dans la gaine après le bac de refroidissement sur {line}. Humidité de la matière suspectée.', 8500, 700),
(14, N'Rayures sur la gaine au guidage', 'SCRATCH_INSULATION', 'LOW', 'EXT-02', 'CUT-01', 'CUT-02', N'Rayures longitudinales sur la gaine sur {line}. Poulies de guidage à contrôler.', 4500, 380);

-- people: who reports, who is in charge
SELECT ROW_NUMBER() OVER (ORDER BY p.Name) rk, p.UserId, p.Name INTO #crew
FROM actionplan.UserProfiles p JOIN actionplan.Departments d ON d.Id = p.DepartmentId
WHERE p.Status = 'active' AND p.Role = 'user' AND d.Name IN ('Production', 'Maintenance')
  AND p.Name NOT IN ('ahleem', 'ali labiedh', 'zaineb lajnef');
DECLARE @crew INT = (SELECT COUNT(*) FROM #crew);
DECLARE @first INT = ISNULL((SELECT MAX(CAST(RIGHT(Reference, 3) AS INT)) FROM actionplan.Claims WHERE Reference LIKE 'INT-2026-___'), 7);

SELECT ROW_NUMBER() OVER (ORDER BY t.n, v.v) + @first seq, t.*, v.v,
  ABS(CHECKSUM(t.n, v.v, 'int')) h
INTO #new
FROM #tpl t CROSS JOIN (VALUES (1), (2), (3)) v(v);

-- state and age
SELECT x.*,
  CASE WHEN x.h % 100 < 22 THEN 'OUVERTE' WHEN x.h % 100 < 47 THEN 'ASSIGNED' WHEN x.h % 100 < 67 THEN 'EN_ANALYSE' ELSE 'CLOTUREE' END st
INTO #new2 FROM #new x;

SELECT x.*,
  CASE x.st WHEN 'OUVERTE' THEN 5 + x.h % 295             -- minutes since detection
            WHEN 'ASSIGNED' THEN 40 + x.h % 1400
            WHEN 'EN_ANALYSE' THEN 1500 + x.h % 2600       -- 1 to 3 days: stays in progress
            ELSE 7000 + x.h % 36000 END mins,
  CASE x.v WHEN 1 THEN x.l1 WHEN 2 THEN x.l2 ELSE x.l3 END line,
  CASE x.h % 3 WHEN 0 THEN N'Équipe A' WHEN 1 THEN N'Équipe B' ELSE N'Nuit' END shift,
  r.UserId reporterId, r.Name reporterName,
  a.UserId assigneeId, a.Name assigneeName
INTO #new3 FROM #new2 x
JOIN #crew r ON r.rk = (x.h % @crew) + 1
JOIN #crew a ON a.rk = CASE WHEN ((x.h / 7) % @crew) + 1 = (x.h % @crew) + 1 THEN ((x.h / 7 + 1) % @crew) + 1 ELSE ((x.h / 7) % @crew) + 1 END;

INSERT INTO actionplan.Claims (Id, Reference, Title, ClientId, DefectType, Severity, LotNumber, Description, StatusCode, DetectionDate, ProductionLine, Shift, IsInternal, IsArchived,
  CreatedAt, CreatedById, CreatedBy, CvCorrectionLogged, ProducedQuantity, DefectiveQuantity, AssignedToId, AssignedToName, AssignedAt, CompletedAt, IsOnTime, UpdatedAt)
SELECT NEWID(), 'INT-2026-' + RIGHT('000' + CAST(x.seq AS VARCHAR(3)), 3), x.title, 'COFICAB-INTERNE', x.defect, x.sev,
  'LOT-2026-' + RIGHT('0000' + CAST(300 + x.h % 700 AS VARCHAR(4)), 4) + '-' + CHAR(65 + x.h % 8),
  REPLACE(x.descr, '{line}', x.line), x.st, DATEADD(MINUTE, -x.mins, @now), x.line, x.shift, 1, 0,
  DATEADD(MINUTE, -x.mins, @now), x.reporterId, x.reporterName, 0, x.pq, x.dq,
  CASE WHEN x.st <> 'OUVERTE' THEN x.assigneeId END, CASE WHEN x.st <> 'OUVERTE' THEN x.assigneeName END,
  CASE WHEN x.st <> 'OUVERTE' THEN DATEADD(MINUTE, -x.mins + 30, @now) END,
  CASE WHEN x.st = 'CLOTUREE' THEN DATEADD(MINUTE, -x.mins + 1440 + (x.h % 3) * 720, @now) END,
  CASE WHEN x.st = 'CLOTUREE' THEN 1 END,
  DATEADD(MINUTE, -x.mins + 30, @now)
FROM #new3 x
WHERE NOT EXISTS (SELECT 1 FROM actionplan.Claims c WHERE c.Reference = 'INT-2026-' + RIGHT('000' + CAST(x.seq AS VARCHAR(3)), 3));
DECLARE @added INT = @@ROWCOUNT;
PRINT CONCAT('internal problems added: ', @added);

-- problems under analysis get a dossier started (team formed, first containment actions done), to be completed by the quality engineer
INSERT INTO actionplan.EightDDossiers (Id, ClaimId, CurrentStep, StatusCode, ChampionId, ChampionName, TeamMembers, TeamFormedAt, ContainmentDescription, ContainmentOwner,
  ContainmentImplementedAt, ContainmentVerified, EffectivenessValidated, PreventiveStandardized, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, IsArchived)
SELECT NEWID(), c.Id, 4, 'IN_PROGRESS', c.AssignedToId, c.AssignedToName,
  N'Pilote : ' + c.AssignedToName + CHAR(10) + N'Production : chef de ligne ' + c.ProductionLine + CHAR(10) + N'Méthodes : technicien process' + CHAR(10) + N'Qualité : ingénieur qualité',
  DATEADD(HOUR, 2, c.DetectionDate),
  N'{"v":1,"actions":[{"id":"' + LOWER(LEFT(REPLACE(CAST(NEWID() AS VARCHAR(40)), '-', ''), 12)) + N'","kind":"QUARANTINE","title":"Quarantaine du lot / stock / WIP","owner":"' + REPLACE(c.AssignedToName, '"', '') + N'","location":"Magasin / ligne","qtyChecked":null,"qtyNok":null,"status":"DONE","required":true},'
  + N'{"id":"' + LOWER(LEFT(REPLACE(CAST(NEWID() AS VARCHAR(40)), '-', ''), 12)) + N'","kind":"SORT_100","title":"Tri 100 % des pièces à risque","owner":"' + REPLACE(c.AssignedToName, '"', '') + N'","location":"Ligne / stock","qtyChecked":' + CAST(c.ProducedQuantity / 4 AS NVARCHAR(10)) + N',"qtyNok":' + CAST(c.DefectiveQuantity / 5 AS NVARCHAR(10)) + N',"status":"IN_PROGRESS","required":true}],"fieldOriginals":{}}',
  c.AssignedToName, DATEADD(HOUR, 6, c.DetectionDate), 0, 0, 0, DATEADD(HOUR, 2, c.DetectionDate), c.AssignedToId, c.UpdatedAt, c.AssignedToId, 0
FROM actionplan.Claims c
WHERE c.IsInternal = 1 AND c.StatusCode = 'EN_ANALYSE' AND c.IsArchived = 0 AND c.AssignedToId IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM actionplan.EightDDossiers d WHERE d.ClaimId = c.Id);
PRINT CONCAT('analyses started: ', @@ROWCOUNT);

COMMIT;

SELECT StatusCode, COUNT(*) n FROM actionplan.Claims WHERE IsInternal = 1 AND IsArchived = 0 GROUP BY StatusCode ORDER BY n DESC;
DROP TABLE #tpl, #crew, #new, #new2, #new3;
