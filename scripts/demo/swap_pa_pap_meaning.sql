-- Specification: PA = improvement, PAC = corrective, PAP = preventive. Moves the plans created when PA meant preventive (and PAP improvement). Run ONCE on data created before this change.
SET QUOTED_IDENTIFIER ON;
BEGIN TRAN;
UPDATE actionplan.ActionPlans
SET Type = CASE Type WHEN 1 THEN 3 WHEN 3 THEN 1 ELSE Type END,
    Reference = CASE WHEN Reference LIKE 'PAP-%' THEN 'PA-' + SUBSTRING(Reference, 5, 100)
                     WHEN Reference LIKE 'PA-%' THEN 'PAP-' + SUBSTRING(Reference, 4, 100) ELSE Reference END
WHERE Type IN (1,3);
SELECT Type, COUNT(*) n, MIN(Reference) minref, MAX(Reference) maxref FROM actionplan.ActionPlans GROUP BY Type;
COMMIT;
