-- Demo data clean-up (nothing is deleted: test claims are archived, statuses are aligned).
-- Run after taking a backup:  BACKUP DATABASE coficab TO DISK='/var/opt/mssql/backup/coficab_before_demo_enrichment.bak' WITH INIT
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRAN;

-- 1. The six claims left by the CI test runs are archived.
UPDATE actionplan.Claims SET IsArchived = 1, UpdatedAt = SYSUTCDATETIME()
WHERE Reference IN ('REC-2026-1595','REC-2026-1596','REC-2026-1597','REC-2026-1598','REC-2026-1599','REC-2026-1600') AND IsArchived = 0;
PRINT CONCAT('test claims archived: ', @@ROWCOUNT);

-- 2. One spelling of the severity (some rows were written as High / Critical).
UPDATE actionplan.Claims SET Severity = UPPER(Severity) WHERE Severity COLLATE Latin1_General_BIN <> UPPER(Severity) COLLATE Latin1_General_BIN;
PRINT CONCAT('severity normalised: ', @@ROWCOUNT);

-- 3. A claim and its 8D dossier tell the same story.
--    - a dossier still IN_PROGRESS means the claim is under analysis (EN_ANALYSE), unless the claim is already
--      validated / closed: then the dossier is the one that was left behind and is completed by 02_complete_8d.sql.
UPDATE c SET c.StatusCode = 'EN_ANALYSE', c.UpdatedAt = SYSUTCDATETIME()
FROM actionplan.Claims c JOIN actionplan.EightDDossiers d ON d.ClaimId = c.Id
WHERE c.IsArchived = 0 AND d.IsArchived = 0 AND d.StatusCode = 'IN_PROGRESS'
  AND c.StatusCode IN ('ASSIGNED', 'OUVERTE', 'DRAFT', 'REJECTED', 'PENDING_VALIDATION');
PRINT CONCAT('claims moved to EN_ANALYSE: ', @@ROWCOUNT);

-- 4. A title that lost its first letter.
UPDATE actionplan.ActionPlans SET Title = REPLACE(Title, N'CAPA — solation', N'CAPA — Isolation') WHERE Title LIKE N'CAPA — solation%';
PRINT CONCAT('plan titles repaired: ', @@ROWCOUNT);

COMMIT;
