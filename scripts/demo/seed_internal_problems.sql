SET QUOTED_IDENTIFIER ON;
DECLARE @admin NVARCHAR(100)='ab5b7216-1916-4cb3-b5a5-5f9aab719465';
DECLARE @now DATETIME2=SYSUTCDATETIME();
INSERT INTO actionplan.Claims (Id,Reference,Title,ClientId,DefectType,Severity,LotNumber,Description,StatusCode,DetectionDate,ProductionLine,Shift,IsInternal,IsArchived,CreatedAt,CreatedById,CreatedBy,CvCorrectionLogged,ProducedQuantity,DefectiveQuantity,AssignedToId,AssignedToName,CompletedAt)
SELECT NEWID(),v.ref,v.title,'COFICAB-INTERNE',v.defect,v.sev,v.lot,v.descr,v.st,DATEADD(MINUTE,-v.mins,@now),v.line,v.shift,1,0,DATEADD(MINUTE,-v.mins,@now),@admin,@admin,0,v.pq,v.dq,
 CASE WHEN v.st IN ('ASSIGNED','EN_ANALYSE','CLOTUREE') THEN @admin END, CASE WHEN v.st IN ('ASSIGNED','EN_ANALYSE','CLOTUREE') THEN 'Super Admin Coficab' END,
 CASE WHEN v.st='CLOTUREE' THEN DATEADD(MINUTE,-v.mins+600,@now) END
FROM (VALUES
 ('INT-2026-001','Coupure de la gaine PVC en sortie d''extrudeuse','CUT_INSULATION','HIGH','LOT-2026-0412-A','Entailles périodiques sur la gaine PVC détectées au contrôle visuel en sortie de filière, environ tous les 40 cm. Suspicion d''usure du poinçon ou d''une impureté dans la matière.','ASSIGNED',305,'EXT-01','Équipe A',12000,340),
 ('INT-2026-002','Dérive du diamètre conducteur en fin de bobine','CONDUCTOR_DIAMETER','HIGH','LOT-2026-0412-B','Le diamètre du conducteur dépasse la tolérance haute (+0,03 mm) sur les 800 derniers mètres. Contrôle laser hors tolérance, étirage à vérifier.','ASSIGNED',150,'WR-03','Équipe A',8000,800),
 ('INT-2026-003','Marquage illisible sur câble FLRY-B 0,5 mm²','MARKING_DEFECT','MEDIUM','LOT-2026-0411-C','Le marquage jet d''encre s''efface au frottement. Encre ou température de séchage à contrôler, tout le lot est concerné.','OUVERTE',45,'CTL-01','Équipe A',5000,5000),
 ('INT-2026-004','Oxydation du cuivre sur bobine de fil nu','COPPER_BLOOMING','MEDIUM','LOT-2026-0410-D','Taches d''oxydation sur le fil nu après stockage. Bobines stockées près de la zone de lavage, taux d''humidité à vérifier.','OUVERTE',20,'WR-04','Équipe A',3000,420),
 ('INT-2026-005','Écart de couleur de l''isolant entre deux bobines','COLOR_MISMATCH','LOW','LOT-2026-0411-E','Le jaune-vert de deux bobines du même ordre de fabrication présente une différence visible. Masterbatch de deux lots différents suspecté.','ASSIGNED',600,'EXT-02','Nuit',6000,250),
 ('INT-2026-006','Flasque de bobine déformée à l''enroulage','SPOOL_DAMAGE','LOW','LOT-2026-0409-F','Flasques fissurées détectées au chargement du poste d''enroulage, risque de câble écrasé en transport.','OUVERTE',95,'CUT-01','Équipe B',2000,60),
 ('INT-2026-007','Épaisseur d''isolant sous la tolérance mini','INSULATION_THICKNESS','HIGH','LOT-2026-0408-G','Épaisseur mesurée à 0,22 mm pour 0,25 mm mini. Arrêt de la ligne, contrôle de centrage de la tête d''extrusion.','CLOTUREE',1500,'EXT-01','Équipe B',9000,900)
) AS v(ref,title,defect,sev,lot,descr,st,mins,line,shift,pq,dq)
WHERE NOT EXISTS (SELECT 1 FROM actionplan.Claims c WHERE c.Reference=v.ref);
SELECT Reference,StatusCode,ProductionLine,IsInternal FROM actionplan.Claims WHERE IsInternal=1;

-- Hierarchical manager: the team leader Mehdi Chaabane manages two extrusion operators, and the EXT-01 problem is assigned to one of them.
-- He stays a simple employee (role user): the only extra right is reading the QRQC problems of the people he manages.
UPDATE p SET ManagerId = m.UserId, ManagerName = m.Name, ManagerEmail = m.Email
FROM actionplan.UserProfiles p JOIN actionplan.UserProfiles m ON m.Name = 'Mehdi Chaabane'
WHERE p.Name IN ('Rania Bouazizi', 'Sami Hammami') AND p.ManagerId IS NULL;
UPDATE c SET AssignedToId = p.UserId, AssignedToName = p.Name
FROM actionplan.Claims c JOIN actionplan.UserProfiles p ON p.Name = 'Rania Bouazizi'
WHERE c.Reference = 'INT-2026-001';
