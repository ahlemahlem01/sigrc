-- Demo data: the 42 added internal problems are reported by the quality staff (controllers, engineers), so that the Quality administrator sees them in the claims list and in the analysis pages (the department scope looks at the creator and the person in charge). Run after 03.
SET NOCOUNT ON; SET QUOTED_IDENTIFIER ON; SET XACT_ABORT ON;
BEGIN TRAN;
SELECT ROW_NUMBER() OVER (ORDER BY p.Name) rk, p.UserId, p.Name INTO #q
FROM actionplan.UserProfiles p
WHERE p.Role='user' AND p.Status='active' AND p.DepartmentId='C3BF185E-2221-BF4A-9B12-3210786B3537'
  AND p.Name IN ('Amine Ben Youssef','Sarra Mansouri','Youssef Trabelsi','Nour El Houda','Anis Kadri','Meriem Zouari');
DECLARE @n INT=(SELECT COUNT(*) FROM #q);
UPDATE c SET c.CreatedById=q.UserId, c.CreatedBy=q.Name
FROM actionplan.Claims c JOIN #q q ON q.rk=(ABS(CHECKSUM(c.Id))%@n)+1
WHERE c.IsInternal=1 AND c.Reference BETWEEN 'INT-2026-008' AND 'INT-2026-049';
PRINT CONCAT('creators set: ',@@ROWCOUNT);
COMMIT;
SELECT COUNT(*) visibleViaCreator FROM actionplan.Claims c WHERE c.IsInternal=1 AND c.CreatedById IN (SELECT UserId FROM actionplan.UserProfiles WHERE DepartmentId='C3BF185E-2221-BF4A-9B12-3210786B3537');
