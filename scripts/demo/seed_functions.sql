SET QUOTED_IDENTIFIER ON;
-- Demo functions for Coficab Tunisia (idempotent). The rights of a function apply to whoever holds it (active or by interim).
DECLARE @org UNIQUEIDENTIFIER = (SELECT TOP 1 Id FROM actionplan.Organizations WHERE Name = 'Coficab Tunisia');
DECLARE @qual UNIQUEIDENTIFIER = (SELECT TOP 1 Id FROM actionplan.Departments WHERE OrganizationId = @org AND Code = 'QA' ORDER BY CreatedAt);
DECLARE @prod UNIQUEIDENTIFIER = (SELECT TOP 1 Id FROM actionplan.Departments WHERE OrganizationId = @org AND Code = 'PROD' ORDER BY CreatedAt);

INSERT INTO actionplan.Functions (Id, FunctionCode, Description, HierarchicalLink, FunctionalLink, Permissions, DepartmentId, CreatedAt, IsArchived)
SELECT NEWID(), v.code, v.descr, v.hier, v.func, v.perms, v.dept, SYSUTCDATETIME(), 0
FROM (VALUES
  ('DIR-QUAL',  'Directeur qualité',     NULL,        NULL,        '8d:validate,analysis:validate_fivewhy,capa:extend_deadline,capa:reassign', @qual),
  ('RESP-QUAL', 'Responsable qualité',   'DIR-QUAL',  'DIR-QUAL',  '8d:validate,analysis:validate_fivewhy,capa:extend_deadline',              @qual),
  ('ING-QUAL',  'Ingénieur qualité',     'RESP-QUAL', 'RESP-QUAL', NULL,                                                                       @qual),
  ('CHEF-EQ',   'Chef d''équipe production', 'RESP-PROD', 'RESP-QUAL', 'capa:extend_deadline',                                              @prod),
  ('RESP-PROD', 'Responsable production', NULL,       'RESP-QUAL', NULL,                                                                       @prod),
  ('OP-EXT',    'Opérateur extrusion',   'CHEF-EQ',   NULL,        NULL,                                                                       @prod)
) AS v(code, descr, hier, func, perms, dept)
WHERE v.dept IS NOT NULL AND NOT EXISTS (SELECT 1 FROM actionplan.Functions f WHERE f.DepartmentId = v.dept AND f.FunctionCode = v.code);

-- Holders: the team leader and the quality engineer of the demo data.
INSERT INTO actionplan.UserFunctions (Id, UserId, FunctionId, Status, HireDate, CreatedAt, IsArchived)
SELECT NEWID(), p.UserId, f.Id, v.status, SYSUTCDATETIME(), SYSUTCDATETIME(), 0
FROM (VALUES ('Mehdi Chaabane', 'CHEF-EQ', 1), ('Rania Bouazizi', 'OP-EXT', 1), ('Sarra Mansouri', 'ING-QUAL', 1), ('Salma Ayari', 'RESP-QUAL', 3)) AS v(name, code, status)
JOIN actionplan.UserProfiles p ON p.Name = v.name
JOIN actionplan.Functions f ON f.FunctionCode = v.code
WHERE NOT EXISTS (SELECT 1 FROM actionplan.UserFunctions uf WHERE uf.UserId = p.UserId AND uf.FunctionId = f.Id);

SELECT f.FunctionCode, d.Name dept, (SELECT COUNT(*) FROM actionplan.UserFunctions uf WHERE uf.FunctionId = f.Id) holders FROM actionplan.Functions f JOIN actionplan.Departments d ON d.Id = f.DepartmentId ORDER BY f.FunctionCode;
