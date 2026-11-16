-- Export of the closed claims for train_delay.py (one row per claim, no personal data, no free text).
-- Example (from the host, with the database container running):
--   docker exec sigrc_sqlserver bash -c '/opt/mssql-tools*/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -d coficab -s"," -W -i /tmp/export_closed_claims.sql -o /tmp/closed_claims.csv'
-- then remove the "(n rows affected)" line and the dashes line under the header.
SET NOCOUNT ON;
SELECT
    ISNULL(DefectType, '')            AS defect,
    ISNULL(Severity, '')              AS severity,
    ISNULL(ClientId, '')              AS client,
    ISNULL(ProductionLine, '')        AS line,
    ISNULL(Shift, '')                 AS shift,
    CAST(IsInternal AS int)           AS internal,
    ISNULL(CAST(ProducedQuantity AS varchar(20)), '')  AS produced,
    ISNULL(CAST(DefectiveQuantity AS varchar(20)), '') AS defective,
    ISNULL(AssignedToId, '')          AS assignee,
    CONVERT(varchar(19), CreatedAt, 126)   AS created,
    CONVERT(varchar(19), CompletedAt, 126) AS completed
FROM actionplan.Claims
WHERE CompletedAt IS NOT NULL;
