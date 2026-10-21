using System.Data;
using System.Data.Common;
using System.Text.Json;
using Coficab.ActionPlan.Application.Kpi;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Dapper;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Infrastructure.Reads;

/// <summary>
/// Everything that differs between database engines in the read models lives here (and only here).
/// Queries themselves stay SQL-standard: GROUP BY, SUM, COUNT, COALESCE, double-quoted identifiers.
/// </summary>
public interface ISqlDialect
{
    /// <summary>Expression giving the "yyyy-MM" bucket of a timestamp column.</summary>
    string MonthKey(string quotedColumn);

    /// <summary>Quoted table name, with its schema when the engine has schemas.</summary>
    string Table(string? schema, string table);

    /// <summary>
    /// Condition "the id column is one of the ids in this JSON array parameter". A JSON array is one parameter however long
    /// it is (an IN list sends one parameter per id and SQL Server refuses more than 2100).
    /// </summary>
    string IdsIn(string quotedColumn, string jsonParameter);
}

public abstract class SqlDialectBase
{
    public virtual string Table(string? schema, string table) => schema == null ? $"\"{table}\"" : $"\"{schema}\".\"{table}\"";
}

public sealed class SqlServerDialect : SqlDialectBase, ISqlDialect
{
    public string MonthKey(string quotedColumn) => $"FORMAT({quotedColumn}, 'yyyy-MM')";

    public string IdsIn(string quotedColumn, string jsonParameter) => $"{quotedColumn} IN (SELECT CAST(value AS uniqueidentifier) FROM OPENJSON({jsonParameter}))";
}

public sealed class SqliteDialect : SqlDialectBase, ISqlDialect
{
    public override string Table(string? schema, string table) => $"\"{table}\"";

    public string MonthKey(string quotedColumn) => $"strftime('%Y-%m', {quotedColumn})";

    public string IdsIn(string quotedColumn, string jsonParameter) => $"UPPER({quotedColumn}) IN (SELECT UPPER(value) FROM json_each({jsonParameter}))";
}

/// <summary>Dapper read model for the claims KPIs: one round trip, aggregates computed by the database.</summary>
public sealed class ClaimKpiReader : IClaimKpiReader
{
    private readonly ActionPlanDbContext _db;

    public ClaimKpiReader(ActionPlanDbContext db) => _db = db;

    internal static ISqlDialect DialectFor(string? providerName)
    {
        if (providerName != null && providerName.Contains("SqlServer", StringComparison.OrdinalIgnoreCase)) return new SqlServerDialect();
        if (providerName != null && providerName.Contains("Sqlite", StringComparison.OrdinalIgnoreCase)) return new SqliteDialect();
        throw new NotSupportedException($"KPI read model: unsupported database provider '{providerName}'.");
    }

    public async Task<ClaimKpiRaw> ReadAsync(DateTime from, IReadOnlyCollection<Guid>? scopeClaimIds, CancellationToken ct)
    {
        if (scopeClaimIds is { Count: 0 })
            return new ClaimKpiRaw(new(), new(), new(), new(), new(), new());

        var dialect = DialectFor(_db.Database.ProviderName);
        var entity = _db.Model.FindEntityType(typeof(Claim))!;
        var table = dialect.Table(entity.GetSchema(), entity.GetTableName()!);

        // Active claims of the period, optionally limited to the ids the caller may see.
        var scope = scopeClaimIds == null ? string.Empty : $" AND {dialect.IdsIn("\"Id\"", "@ids")}";
        var opened = dialect.MonthKey("\"DetectionDate\"");
        var closed = dialect.MonthKey("\"CompletedAt\"");

        var sql = $@"
            SELECT {opened} AS ""Month"", COUNT(*) AS ""Count"" FROM {table}
              WHERE ""IsArchived"" = @no AND ""DetectionDate"" >= @from{scope} GROUP BY {opened};
            SELECT {closed} AS ""Month"", COUNT(*) AS ""Count"" FROM {table}
              WHERE ""IsArchived"" = @no AND ""CompletedAt"" IS NOT NULL AND ""CompletedAt"" >= @from{scope} GROUP BY {closed};
            SELECT ""ClientId"", COUNT(*) AS ""Claims"", SUM(COALESCE(""DefectiveQuantity"", 0)) AS ""DefectiveQuantity"",
                   SUM(COALESCE(""ProducedQuantity"", 0)) AS ""ProducedQuantity""
              FROM {table} WHERE ""IsArchived"" = @no AND ""DetectionDate"" >= @from{scope} GROUP BY ""ClientId"";
            SELECT ""DefectType"", COUNT(*) AS ""Claims"", SUM(COALESCE(""DefectiveQuantity"", 0)) AS ""DefectiveQuantity""
              FROM {table} WHERE ""IsArchived"" = @no AND ""DetectionDate"" >= @from{scope} GROUP BY ""DefectType"";
            SELECT ""StatusCode"" AS ""Status"", COUNT(*) AS ""Claims""
              FROM {table} WHERE ""IsArchived"" = @no AND ""DetectionDate"" >= @from{scope} GROUP BY ""StatusCode"";
            SELECT ""DetectionDate"" AS ""Detection"", ""CompletedAt"" AS ""Completed"" FROM {table}
              WHERE ""IsArchived"" = @no AND ""CompletedAt"" IS NOT NULL AND ""CompletedAt"" >= @from{scope};";

        DbConnection connection = _db.Database.GetDbConnection();
        var wasClosed = connection.State != ConnectionState.Open;
        if (wasClosed) await connection.OpenAsync(ct);
        try
        {
            var parameters = new DynamicParameters();
            parameters.Add("no", false);
            parameters.Add("from", from);
            if (scopeClaimIds != null) parameters.Add("ids", JsonSerializer.Serialize(scopeClaimIds), DbType.String, size: -1);

            using var grid = await connection.QueryMultipleAsync(new CommandDefinition(sql, parameters, cancellationToken: ct));
            var openedRows = (await grid.ReadAsync<MonthRow>()).Select(r => new MonthCount(r.Month, r.Count)).ToList();
            var closedRows = (await grid.ReadAsync<MonthRow>()).Select(r => new MonthCount(r.Month, r.Count)).ToList();
            var clients = (await grid.ReadAsync<ClientRow>())
                .Select(r => new ClientPpmDto(r.ClientId, r.Claims, r.DefectiveQuantity, r.ProducedQuantity, null)).ToList();
            var defects = (await grid.ReadAsync<DefectRow>())
                .Select(r => new DefectCountDto(r.DefectType, r.Claims, r.DefectiveQuantity)).ToList();
            var statuses = (await grid.ReadAsync<StatusRow>()).Select(r => new StatusCountDto(r.Status, r.Claims)).ToList();
            var dates = (await grid.ReadAsync<DateRow>()).Select(r => new ClosedDates(r.Detection, r.Completed)).ToList();
            return new ClaimKpiRaw(openedRows, closedRows, clients, defects, statuses, dates);
        }
        finally
        {
            if (wasClosed) await connection.CloseAsync();
        }
    }

    private sealed class MonthRow { public string Month { get; set; } = string.Empty; public int Count { get; set; } }
    private sealed class ClientRow { public string ClientId { get; set; } = string.Empty; public int Claims { get; set; } public long DefectiveQuantity { get; set; } public long ProducedQuantity { get; set; } }
    private sealed class DefectRow { public string DefectType { get; set; } = string.Empty; public int Claims { get; set; } public long DefectiveQuantity { get; set; } }
    private sealed class StatusRow { public string Status { get; set; } = string.Empty; public int Claims { get; set; } }
    private sealed class DateRow { public DateTime Detection { get; set; } public DateTime Completed { get; set; } }
}
