-- Demo data: a realistic validation queue. The dossiers and 5 Why analyses awaiting validation had been waiting for more than a year
-- (they were submitted when their claim was detected). The oldest are now validated by an administrator who did not work on them
-- (four eyes); about one in six stays pending, submitted during the last ten days.
-- Nothing is deleted. Take a backup first.
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRAN;

DECLARE @now DATETIME2 = SYSUTCDATETIME();

SELECT ROW_NUMBER() OVER (ORDER BY p.Name) rk, p.UserId, p.Name INTO #admins
FROM actionplan.UserProfiles p
WHERE p.UserId IN ('ab5b7216-1916-4cb3-b5a5-5f9aab719465','16a59637-32f2-4039-a6c5-6728a36b542c','3784aa7e-3955-4b78-8ece-8923ce7fc6f4','a659b899-ac6d-4e90-91ca-06973806b4f5','d6b7cfa1-422a-4e34-8c2a-a97e4a85feef');

-- 8D dossiers
SELECT d.Id DossierId, c.Id ClaimId, ABS(CHECKSUM(d.Id)) h, d.SubmittedAt, c.Deadline, c.CompletedAt, d.ChampionId, c.AssignedToId, c.CreatedById, d.SubmittedById
INTO #p
FROM actionplan.EightDDossiers d JOIN actionplan.Claims c ON c.Id = d.ClaimId
WHERE d.IsArchived = 0 AND d.StatusCode = 'PENDING_VALIDATION' AND c.IsArchived = 0;

-- the ones that stay pending were submitted recently
UPDATE d SET d.SubmittedAt = DATEADD(HOUR, -(6 + p.h % 230), @now), d.UpdatedAt = DATEADD(HOUR, -(6 + p.h % 230), @now)
FROM actionplan.EightDDossiers d JOIN #p p ON p.DossierId = d.Id WHERE p.h % 100 < 16;
UPDATE c SET c.UpdatedAt = d.SubmittedAt
FROM actionplan.Claims c JOIN actionplan.EightDDossiers d ON d.ClaimId = c.Id JOIN #p p ON p.DossierId = d.Id WHERE p.h % 100 < 16;
DECLARE @kept INT = (SELECT COUNT(*) FROM #p WHERE h % 100 < 16);
PRINT CONCAT('dossiers kept pending: ', @kept);

-- the others were validated a few days after their submission
SELECT p.*, v.UserId validId,
  CASE WHEN DATEADD(DAY, 1 + p.h % 4, ISNULL(p.SubmittedAt, @now)) < DATEADD(DAY, -1, @now) THEN DATEADD(DAY, 1 + p.h % 4, ISNULL(p.SubmittedAt, @now)) ELSE DATEADD(DAY, -1, @now) END validAt
INTO #q
FROM #p p
OUTER APPLY (SELECT TOP 1 a.UserId FROM #admins a
             WHERE a.UserId NOT IN (ISNULL(p.ChampionId, ''), ISNULL(p.AssignedToId, ''), ISNULL(p.CreatedById, ''), ISNULL(p.SubmittedById, ''))
             ORDER BY (a.rk - 1 - p.h % 5 + 5) % 5) v
WHERE p.h % 100 >= 16 AND v.UserId IS NOT NULL;

UPDATE d SET d.StatusCode = 'CLOSED', d.ValidatedAt = q.validAt, d.ValidatedById = q.validId, d.ClosedAt = q.validAt, d.ClosedById = q.validId,
  d.ValidationComment = N'Cause racine confirmée, actions efficaces sur 3 lots. Dossier validé.', d.UpdatedAt = q.validAt, d.UpdatedBy = q.validId
FROM actionplan.EightDDossiers d JOIN #q q ON q.DossierId = d.Id;
PRINT CONCAT('dossiers validated: ', @@ROWCOUNT);

UPDATE c SET c.StatusCode = 'CLOTUREE', c.CompletedAt = ISNULL(c.CompletedAt, q.validAt),
  c.IsOnTime = CASE WHEN c.Deadline IS NULL OR ISNULL(c.CompletedAt, q.validAt) <= c.Deadline THEN 1 ELSE 0 END, c.UpdatedAt = q.validAt
FROM actionplan.Claims c JOIN #q q ON q.ClaimId = c.Id;

INSERT INTO actionplan.ClaimEvents (Id, ClaimId, ActionType, ActorId, Detail, CreatedAt)
SELECT NEWID(), q.ClaimId, 'claim_updated', q.validId, N'8D validé et dossier clôturé', q.validAt FROM #q q;

-- 5 Why analyses
SELECT a.Id, ABS(CHECKSUM(a.Id)) h, a.ClaimId INTO #w FROM actionplan.FiveWhyAnalyses a WHERE a.IsArchived = 0 AND a.StatusCode = 'PENDING_VALIDATION';
UPDATE a SET a.LastModifiedAt = DATEADD(HOUR, -(2 + w.h % 190), @now)
FROM actionplan.FiveWhyAnalyses a JOIN #w w ON w.Id = a.Id WHERE w.h % 100 < 20;
UPDATE a SET a.StatusCode = 'VALIDATED', a.IsValidated = 1, a.ValidatedBy = ad.Name,
  a.ValidatedAt = DATEADD(DAY, 1 + w.h % 3, ISNULL(a.LastModifiedAt, a.CreatedAt)), a.LastModifiedAt = DATEADD(DAY, 1 + w.h % 3, ISNULL(a.LastModifiedAt, a.CreatedAt))
FROM actionplan.FiveWhyAnalyses a JOIN #w w ON w.Id = a.Id
JOIN #admins ad ON ad.rk = (w.h % 5) + 1
WHERE w.h % 100 >= 20 AND DATEADD(DAY, 1 + w.h % 3, ISNULL(a.LastModifiedAt, a.CreatedAt)) < @now;
PRINT CONCAT('5 Why validated: ', @@ROWCOUNT);

COMMIT;

SELECT 'pending 8D' k, COUNT(*) n, MAX(DATEDIFF(DAY, SubmittedAt, SYSUTCDATETIME())) maxDaysWaiting FROM actionplan.EightDDossiers WHERE IsArchived = 0 AND StatusCode = 'PENDING_VALIDATION'
UNION ALL SELECT 'pending 5 Why', COUNT(*), MAX(DATEDIFF(DAY, ISNULL(LastModifiedAt, CreatedAt), SYSUTCDATETIME())) FROM actionplan.FiveWhyAnalyses WHERE IsArchived = 0 AND StatusCode = 'PENDING_VALIDATION';
DROP TABLE #admins, #p, #q, #w;
