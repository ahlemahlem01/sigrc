using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.Services;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Core.Interfaces;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>A request for validation reaches the people who can give it: the administrators of the department, the holders of a function
/// carrying the right, the superadmins; not the administrators of the other departments.</summary>
public class ValidatorNotificationTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly ActionPlanDbContext _db;
    private readonly Mock<IUserRepository> _users = new();
    private readonly NotificationService _service;
    private readonly Guid _quality = Guid.NewGuid(), _production = Guid.NewGuid();

    public ValidatorNotificationTests()
    {
        _connection.Open();
        _db = new ActionPlanDbContext(new DbContextOptionsBuilder<ActionPlanDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();
        _users.Setup(u => u.GetUserIdsByRoleAsync("admin")).ReturnsAsync(new[] { "adminQ1", "adminQ2", "adminP" });
        _users.Setup(u => u.GetUserIdsByRoleAsync("superadmin")).ReturnsAsync(new[] { "super" });
        _users.Setup(u => u.GetUserIdsByRoleAsync("ADMIN_QUALITY")).ReturnsAsync(Array.Empty<string>());
        _service = new NotificationService(_db, Mock.Of<INotificationBroadcaster>(), _users.Object);
    }

    public void Dispose() { _db.Dispose(); _connection.Dispose(); }

    private async Task<Guid> Seed()
    {
        var org = new Organization { Name = "Org" };
        _db.Organizations.Add(org);
        _db.Departments.AddRange(
            new Department { Id = _quality, Name = "Qualité", Code = "QA", OrganizationId = org.Id },
            new Department { Id = _production, Name = "Production", Code = "PR", OrganizationId = org.Id });
        UserProfile P(string id, Guid dept) => new() { Id = Guid.NewGuid(), UserId = id, Name = id, Email = id + "@t.com", Role = "user", Poste = "x", Equipe = "x", DepartmentId = dept };
        _db.UserProfiles.AddRange(P("adminQ1", _quality), P("adminQ2", _quality), P("adminP", _production), P("super", _quality),
            P("responsable", _quality), P("responsableProd", _production), P("employee", _quality));

        var qualityFn = new Function { FunctionCode = "RESP-QUAL", Description = "Responsable qualité", DepartmentId = _quality, Permissions = "8d:validate" };
        var prodFn = new Function { FunctionCode = "RESP-PROD", Description = "Responsable production", DepartmentId = _production, Permissions = "8d:validate" };
        var plainFn = new Function { FunctionCode = "OP", Description = "Opérateur", DepartmentId = _quality, Permissions = null };
        _db.Functions.AddRange(qualityFn, prodFn, plainFn);
        _db.UserFunctions.AddRange(
            new UserFunction { UserId = "responsable", FunctionId = qualityFn.Id, Status = FunctionStatus.ByInterim },
            new UserFunction { UserId = "responsableProd", FunctionId = prodFn.Id, Status = FunctionStatus.Active },
            new UserFunction { UserId = "employee", FunctionId = plainFn.Id, Status = FunctionStatus.Active });

        var claim = new Claim { Title = "Isolation", CreatedById = "employee", AssignedToId = "employee", StatusCode = "PENDING_VALIDATION" };
        _db.Claims.Add(claim);
        await _db.SaveChangesAsync();
        return claim.Id;
    }

    private async Task<List<string>> Recipients(string type) =>
        await _db.Notifications.Where(n => n.Type == type).Select(n => n.RecipientId).OrderBy(x => x).ToListAsync();

    [Fact]
    public async Task AValidationRequest_ReachesTheDepartmentAdmins_TheFunctionHolders_AndTheSuperadmin_Only()
    {
        var claim = await Seed();

        await _service.NotifyValidatorsAsync("eight_d_pending_validation", "t", "m", "8d:validate", claimId: claim, excludeUserId: "employee");

        Assert.Equal(new[] { "adminQ1", "adminQ2", "responsable", "super" }, await Recipients("eight_d_pending_validation"));
    }

    [Fact]
    public async Task TheSubmitter_IsNotNotified_AndANotActiveHolder_IsNot()
    {
        var claim = await Seed();
        var holding = await _db.UserFunctions.FirstAsync(uf => uf.UserId == "responsable");
        holding.Status = FunctionStatus.NotActive;
        await _db.SaveChangesAsync();

        await _service.NotifyValidatorsAsync("five_why_pending_validation", "t", "m", "8d:validate", claimId: claim, excludeUserId: "adminQ1");

        Assert.Equal(new[] { "adminQ2", "super" }, await Recipients("five_why_pending_validation"));
    }

    [Fact]
    public async Task WithoutADepartment_EveryAdministratorIsTold_ASafetyNet()
    {
        await Seed();

        await _service.NotifyValidatorsAsync("plan_ready_for_validation", "t", "m", null);

        Assert.Equal(new[] { "adminP", "adminQ1", "adminQ2", "super" }, await Recipients("plan_ready_for_validation"));
    }

    [Fact]
    public async Task ADepartmentGiven_ScopesAPlanRequest()
    {
        await Seed();

        await _service.NotifyValidatorsAsync("plan_ready_for_validation", "t", "m", null, departmentId: _production);

        Assert.Equal(new[] { "adminP", "super" }, await Recipients("plan_ready_for_validation"));
    }
}
