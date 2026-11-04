using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>The QRQC board reads the claims: internal problems by line with their level, a stricter closure, a SAP QM export.</summary>
public class QrqcBoardTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;

    public QrqcBoardTests(ActionPlanApiFactory factory)
    {
        _factory = factory;
        _factory.SeedAsync(_ => Task.CompletedTask).GetAwaiter().GetResult();
    }

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private async Task<Guid> AddClaim(string line, bool internalProblem, string severity = "MEDIUM", int minutesAgo = 10, string status = "OUVERTE")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var id = Guid.NewGuid();
        db.Claims.Add(new Claim
        {
            Id = id, Title = $"Problème {line}", DefectType = "Coupure fil", ClientId = "ACME", Severity = severity, LotNumber = "L-" + id.ToString()[..4],
            Description = "x", StatusCode = status, DetectionDate = DateTime.UtcNow.AddMinutes(-minutesAgo), ProductionLine = line,
            IsInternal = internalProblem, CreatedById = TestAuthHandler.TestUserId.ToString(), Reference = "QR-" + id.ToString()[..5],
        });
        await db.SaveChangesAsync();
        return id;
    }

    private HttpClient ClientAs(string role, string userId)
    {
        var client = ClientAs(role);
        client.DefaultRequestHeaders.Add(TestAuthHandler.UserIdHeader, userId);
        return client;
    }

    private async Task<Guid> AddAssignedClaim(string line, string assigneeId, string assigneeName)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var id = Guid.NewGuid();
        db.Claims.Add(new Claim
        {
            Id = id, Title = $"Problème {line}", DefectType = "Coupure fil", ClientId = "ACME", Severity = "MEDIUM", LotNumber = "L-" + id.ToString()[..4],
            Description = "x", StatusCode = "ASSIGNED", DetectionDate = DateTime.UtcNow.AddMinutes(-90), ProductionLine = line, IsInternal = true,
            AssignedToId = assigneeId, AssignedToName = assigneeName, Reference = "QM-" + id.ToString()[..5],
        });
        await db.SaveChangesAsync();
        return id;
    }

    private async Task<(string manager, string worker, string stranger)> AddPeople()
    {
        var manager = Guid.NewGuid().ToString(); var worker = Guid.NewGuid().ToString(); var stranger = Guid.NewGuid().ToString();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        db.UserProfiles.AddRange(
            new UserProfile { Id = Guid.NewGuid(), UserId = manager, Name = "Chef Test", Email = "chef@t.com", Role = "user", Poste = "Chef d equipe", Equipe = "A" },
            new UserProfile { Id = Guid.NewGuid(), UserId = worker, Name = "Operateur Test", Email = "op@t.com", Role = "user", Poste = "Operateur", Equipe = "A", ManagerId = manager, ManagerName = "Chef Test" },
            new UserProfile { Id = Guid.NewGuid(), UserId = stranger, Name = "Autre Test", Email = "autre@t.com", Role = "user", Poste = "Operateur", Equipe = "B" });
        await db.SaveChangesAsync();
        return (manager, worker, stranger);
    }

    [Fact]
    public async Task AManager_SeesOnlyTheProblemsOfThePeopleHeManages_AndCannotExport()
    {
        var (manager, worker, stranger) = await AddPeople();
        var line = "MG-" + Guid.NewGuid().ToString("N")[..4];
        var theirs = await AddAssignedClaim(line, worker, "Operateur Test");
        var others = await AddAssignedClaim(line, stranger, "Autre Test");

        var board = await Json(await ClientAs("user", manager).GetAsync("/api/qrqc/board"));
        var problems = board.GetProperty("problems").EnumerateArray().ToList();
        Assert.Contains(problems, p => p.GetProperty("claimId").GetGuid() == theirs);
        Assert.DoesNotContain(problems, p => p.GetProperty("claimId").GetGuid() == others);
        Assert.Equal("Chef Test", problems.First(p => p.GetProperty("claimId").GetGuid() == theirs).GetProperty("managerName").GetString());

        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user", manager).GetAsync("/api/qrqc/export")).StatusCode);
        var access = await Json(await ClientAs("user", manager).GetAsync("/api/qrqc/access"));
        Assert.True(access.GetProperty("canOpen").GetBoolean());
        Assert.True(access.GetProperty("isManager").GetBoolean());
    }

    [Fact]
    public async Task AnEmployeeWithoutAnyone_ToManage_CannotOpenTheBoard()
    {
        var (_, worker, _) = await AddPeople();
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user", worker).GetAsync("/api/qrqc/board")).StatusCode);
        var access = await Json(await ClientAs("user", worker).GetAsync("/api/qrqc/access"));
        Assert.False(access.GetProperty("canOpen").GetBoolean());
    }

    [Fact]
    public async Task TheAdministrator_NamesTheManager_WhoIsRefusedWhenItIsTheSamePersonOrACycle()
    {
        var (manager, worker, _) = await AddPeople();
        var admin = ClientAs("admin");

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/employees/profiles/{worker}/manager", new { managerUserId = worker })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/employees/profiles/{manager}/manager", new { managerUserId = worker })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/admin/employees/profiles/{worker}/manager", new { managerUserId = (string?)null })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").PutAsJsonAsync($"/api/admin/employees/profiles/{worker}/manager", new { managerUserId = manager })).StatusCode);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    [Fact]
    public async Task TheBoard_ShowsTheInternalProblemsByLine_WithTheirLevel()
    {
        var line = "TST-" + Guid.NewGuid().ToString("N")[..4];
        var slow = await AddClaim(line, true, minutesAgo: 300);          // over 240 min → level 3
        var fresh = await AddClaim(line, true, minutesAgo: 5);
        var customer = await AddClaim(line, false, minutesAgo: 400);      // a customer claim: not on the workshop board

        var board = await Json(await ClientAs("superadmin").GetAsync("/api/qrqc/board"));
        var problems = board.GetProperty("problems").EnumerateArray().Where(p => p.GetProperty("line").GetString() == line).ToList();
        Assert.Equal(2, problems.Count);
        Assert.Equal(3, problems.First(p => p.GetProperty("claimId").GetGuid() == slow).GetProperty("level").GetInt32());
        Assert.Equal(1, problems.First(p => p.GetProperty("claimId").GetGuid() == fresh).GetProperty("level").GetInt32());
        Assert.DoesNotContain(problems, p => p.GetProperty("claimId").GetGuid() == customer);

        var lineState = board.GetProperty("lines").EnumerateArray().First(l => l.GetProperty("line").GetString() == line);
        Assert.Equal("red", lineState.GetProperty("state").GetString());

        // the same data with the customer claims too
        var all = await Json(await ClientAs("superadmin").GetAsync("/api/qrqc/board?scope=all"));
        Assert.Contains(all.GetProperty("problems").EnumerateArray(), p => p.GetProperty("claimId").GetGuid() == customer);
    }

    [Fact]
    public async Task AnInternalProblem_IsNotClosedWithoutARootCauseAndACorrectiveAction()
    {
        var id = await AddClaim("TST-GATE", true, status: "PENDING_VALIDATION");
        var admin = ClientAs("superadmin");

        var refused = await admin.PutAsJsonAsync($"/api/QualityAnalysis/claims/{id}", new { statusCode = "CLOTUREE" });
        Assert.NotEqual(HttpStatusCode.OK, refused.StatusCode);
        Assert.Contains("cause racine", await refused.Content.ReadAsStringAsync());

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            db.FiveWhyAnalyses.Add(new FiveWhyAnalysis { Id = Guid.NewGuid(), ClaimId = id, ProblemStatement = "x", RootCause = "Filière sans alarme de dérive", StatusCode = "VALIDATED" });
            var planId = Guid.NewGuid();
            db.ActionPlans.Add(new Coficab.ActionPlan.Core.Entities.ActionPlan { Id = planId, Title = "Plan correctif", ClaimId = id, Type = ActionPlanType.PAC });
            db.PlanActions.Add(new PlanAction { Id = Guid.NewGuid(), ActionPlanId = planId, Title = "Ajouter une alarme", Order = 1 });
            await db.SaveChangesAsync();
        }

        var allowed = await admin.PutAsJsonAsync($"/api/QualityAnalysis/claims/{id}", new { statusCode = "CLOTUREE" });
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
    }

    [Fact]
    public async Task ACustomerClaim_IsClosedAsBefore()
    {
        var id = await AddClaim("TST-CUST", false, status: "PENDING_VALIDATION");
        var response = await ClientAs("superadmin").PutAsJsonAsync($"/api/QualityAnalysis/claims/{id}", new { statusCode = "CLOTUREE" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task TheExport_IsASapQmCsvWithOneLinePerProblem()
    {
        var line = "TST-" + Guid.NewGuid().ToString("N")[..4];
        await AddClaim(line, true, severity: "CRITICAL");

        var response = await ClientAs("superadmin").GetAsync("/api/qrqc/export");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var csv = System.Text.Encoding.UTF8.GetString(await response.Content.ReadAsByteArrayAsync()).TrimStart('﻿');
        var lines = csv.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        Assert.StartsWith("QMART;QMNUM;QMTXT;QMDAT;ARBPL;CHARG;PRIOK;", lines[0]);
        var mine = lines.First(l => l.Contains(";" + line + ";"));
        Assert.StartsWith("Q3;", mine);
        Assert.Contains(";1;", mine);                 // CRITICAL → SAP priority 1
        Assert.Contains(";OSNO;", mine);
    }

    [Fact]
    public async Task TheClaimsHistory_TellsWhichClaimsAreInternal_AndCanFilterOnIt()
    {
        var tag = "Orig" + Guid.NewGuid().ToString("N")[..6];
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            foreach (var internalProblem in new[] { true, false })
                db.Claims.Add(new Claim
                {
                    Id = Guid.NewGuid(), Title = $"{tag} {(internalProblem ? "interne" : "client")}", DefectType = "Coupure fil", ClientId = "ACME", Severity = "LOW",
                    LotNumber = "L1", Description = "x", StatusCode = "OUVERTE", DetectionDate = DateTime.UtcNow, IsInternal = internalProblem,
                    CreatedById = TestAuthHandler.TestUserId.ToString(),
                });
            await db.SaveChangesAsync();
        }

        var admin = ClientAs("superadmin");
        var both = await Json(await admin.GetAsync($"/api/QualityAnalysis/claims/history?search={tag}&pageSize=10"));
        var rows = both.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(2, rows.Count);
        Assert.Contains(rows, r => r.GetProperty("isInternal").GetBoolean());

        var onlyInternal = await Json(await admin.GetAsync($"/api/QualityAnalysis/claims/history?search={tag}&internal=YES"));
        Assert.Single(onlyInternal.GetProperty("items").EnumerateArray());
        var onlyCustomer = await Json(await admin.GetAsync($"/api/QualityAnalysis/claims/history?search={tag}&internal=NO"));
        Assert.False(onlyCustomer.GetProperty("items")[0].GetProperty("isInternal").GetBoolean());
    }

    [Fact]
    public async Task OnlyAdministrators_SeeTheBoard()
    {
        var response = await ClientAs("employee").GetAsync("/api/qrqc/board");
        Assert.True(response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized);
    }
}
