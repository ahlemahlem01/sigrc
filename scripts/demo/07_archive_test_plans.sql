SET NOCOUNT ON; SET XACT_ABORT ON;
-- Demo data: three plans left by manual tests are archived (never deleted).
UPDATE actionplan.ActionPlans SET IsArchived = 1, ArchivedAt = SYSUTCDATETIME(), ArchivedBy = 'demo-cleanup'
WHERE IsArchived = 0 AND Reference IN ('PAC-2026-0191', 'PAC-2026-0192', 'PAP-2026-0029');
PRINT CONCAT('test plans archived: ', @@ROWCOUNT);
