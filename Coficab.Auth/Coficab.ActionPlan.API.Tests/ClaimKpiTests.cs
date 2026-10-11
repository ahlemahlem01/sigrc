using Coficab.ActionPlan.Application.Kpi;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Coficab.ActionPlan.Infrastructure.Reads;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>The Dapper KPI read model, run against a real relational engine (SQLite in memory).</summary>
public class ClaimKpiTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly ActionPlanDbContext _db;

    public ClaimKpiTests()
    {
        _connection.Open();
        _db = new ActionPlanDbContext(new DbContextOptionsBuilder<ActionPlanDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private static Claim NewClaim(string client, string defect, DateTime detected, DateTime? completed, int? produced, int? defective, bool archived = false) => new()
    {
        Id = Guid.NewGuid(), Title = "t", DefectType = defect, ClientId = client, Severity = "HIGH", LotNumber = "L", Description = "d",
        StatusCode = completed == null ? "EN_ANALYSE" : "CLOTUREE", DetectionDate = detected, CompletedAt = completed,
        ProducedQuantity = produced, DefectiveQuantity = defective, IsArchived = archived,
    };

    private async Task<ClaimKpisDto> Run(string? scopeUserId = null, params Claim[] claims)
    {
        _db.Claims.AddRange(claims);
        await _db.SaveChangesAsync();
        return await new GetClaimKpisQueryHandler(_db, new ClaimKpiReader(_db)).Handle(new GetClaimKpisQuery(scopeUserId, 6), default);
    }

    [Fact]
    public async Task Computes_PerMonth_Ppm_TopDefects_AndAverageTreatment()
    {
        var now = DateTime.UtcNow;
        var d1 = new DateTime(now.Year, now.Month, 5, 0, 0, 0, DateTimeKind.Utc);
        var kpis = await Run(null,
            NewClaim("ACME", "Soudure", d1, d1.AddDays(10), 100_000, 50),
            NewClaim("ACME", "Soudure", d1, null, 100_000, 150),
            NewClaim("BETA", "Rayure", d1, d1.AddDays(20), null, null),
            NewClaim("ACME", "Soudure", d1, d1.AddDays(1), 1, 1, archived: true));

        Assert.Equal(3, kpis.TotalClaims);
        var thisMonth = kpis.ClaimsPerMonth.Last();
        Assert.Equal(d1.ToString("yyyy-MM"), thisMonth.Month);
        Assert.Equal(3, thisMonth.Opened);
        Assert.Equal(2, thisMonth.Closed);
        Assert.Equal(15.0, kpis.AverageTreatmentDays);

        var acme = kpis.PpmByClient.Single(c => c.ClientId == "ACME");
        Assert.Equal(1000, acme.Ppm); // 200 defective / 200 000 produced
        Assert.Null(kpis.PpmByClient.Single(c => c.ClientId == "BETA").Ppm);
        Assert.Equal("Soudure", kpis.TopDefects.First().DefectType);
        Assert.Equal(2, kpis.TopDefects.First().Claims);
    }

    [Fact]
    public async Task OldClaims_AreOutsideThePeriod_AndAnEmptyScopeReturnsNothing()
    {
        var old = DateTime.UtcNow.AddYears(-3);
        var kpis = await Run(null, NewClaim("ACME", "Soudure", old, old.AddDays(2), 10, 1));
        Assert.Equal(0, kpis.TotalClaims);
        Assert.Null(kpis.AverageTreatmentDays);

        var scoped = await new GetClaimKpisQueryHandler(_db, new ClaimKpiReader(_db)).Handle(new GetClaimKpisQuery("nobody", 6), default);
        Assert.Equal(0, scoped.TotalClaims);
    }
}
