using Coficab.ActionPlan.Infrastructure.Data;
using Coficab.Auth.API.Data;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>The data models must be creatable on SQL Server: no cascade cycle, no second cascade path to a table (error 1785).</summary>
public class SqlServerModelTests
{
    private const string AnyConnection = "Server=localhost,1433;Database=model;User Id=sa;Password=not-used;TrustServerCertificate=True";

    [Fact]
    public void ActionPlanModel_HasNoAmbiguousCascadePaths()
    {
        using var db = new ActionPlanDbContext(new DbContextOptionsBuilder<ActionPlanDbContext>().UseSqlServer(AnyConnection).Options);
        Assert.False(SqlServerCascadeGuard.HasAmbiguousCascades(db.Model));
    }

    [Fact]
    public void AuthModel_HasNoAmbiguousCascadePaths()
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(AnyConnection).UseOpenIddict().Options);
        Assert.False(SqlServerCascadeGuard.HasAmbiguousCascades(db.Model));
    }
}
