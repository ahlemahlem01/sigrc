SET NOCOUNT ON; SET XACT_ABORT ON;
-- Demo data: plans waiting for validation are dated like the dossier they belong to (submitted recently), not like the claim (months ago).
BEGIN TRAN;
UPDATE p SET p.UpdatedAt = d.SubmittedAt
FROM actionplan.ActionPlans p JOIN actionplan.EightDDossiers d ON d.ClaimId = p.ClaimId
WHERE p.IsArchived = 0 AND p.Progress = 100 AND p.Status IN (1, 2) AND d.StatusCode = 'PENDING_VALIDATION' AND d.SubmittedAt IS NOT NULL;
PRINT CONCAT('plans redated: ', @@ROWCOUNT);
UPDATE p SET p.UpdatedAt = DATEADD(HOUR, -(24 + ABS(CHECKSUM(p.Id)) % 120), SYSUTCDATETIME())
FROM actionplan.ActionPlans p
WHERE p.IsArchived = 0 AND p.Progress = 100 AND p.Status IN (1, 2) AND DATEDIFF(DAY, ISNULL(p.UpdatedAt, p.CreatedAt), SYSUTCDATETIME()) > 30;
PRINT CONCAT('others redated: ', @@ROWCOUNT);
COMMIT;
SELECT MAX(DATEDIFF(DAY, ISNULL(UpdatedAt, CreatedAt), SYSUTCDATETIME())) maxAgeDays FROM actionplan.ActionPlans WHERE IsArchived = 0 AND Progress = 100 AND Status IN (1, 2);
