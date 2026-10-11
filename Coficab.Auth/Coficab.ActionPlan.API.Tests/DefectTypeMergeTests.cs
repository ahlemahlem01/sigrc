using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Application.DTOs.Pareto;
using Coficab.ActionPlan.Application.Kpi;
using Coficab.ActionPlan.Application.ReferenceLists;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Coficab.ActionPlan.Infrastructure.Reads;
using Coficab.ActionPlan.Infrastructure.Services;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Moq;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>Spellings of a defect type are merged with aliases: nothing is rewritten, statistics count them together.</summary>
public class DefectTypeMergeTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;

    public DefectTypeMergeTests(ActionPlanApiFactory factory)
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

    private static ReferenceItem Item(string value, string? mergedInto = null, bool active = true) =>
        new() { ListKey = ReferenceListKeys.DefectType, Value = value, MergedInto = mergedInto, IsActive = active && mergedInto == null };

    [Theory]
    [InlineData("Etiquette manquante", "Étiquette manquante")]
    [InlineData("ÉTIQUETTE   MANQUANTE", "etiquette manquante")]
    [InlineData("Soudure-défectueuse", "soudure defectueuse")]
    public void SpellingsThatDifferByCaseAccentsOrSpacing_ShareTheSameKey(string a, string b) =>
        Assert.Equal(DefectTypeResolver.Key(a), DefectTypeResolver.Key(b));

    [Fact]
    public void Resolver_UsesTheKeptName_ForAliasesAndForFreeTextVariants()
    {
        var resolver = DefectTypeResolver.From(new[]
        {
            Item("Étiquette manquante"),
            Item("Etiquette manquante", mergedInto: "Étiquette manquante"),
            Item("Coupure fil"),
        });

        Assert.Equal("Étiquette manquante", resolver.Resolve("Etiquette manquante"));   // explicit alias
        Assert.Equal("Étiquette manquante", resolver.Resolve("etiquette  MANQUANTE"));  // free text, same words
        Assert.Equal("Coupure fil", resolver.Resolve("coupure fil"));                    // listed name keeps the list spelling
        Assert.Equal("Fuite d'huile", resolver.Resolve("  Fuite d'huile "));            // unknown text stays as typed
    }

    [Fact]
    public async Task Duplicates_AreDetected_Merged_AndCanBeUndone()
    {
        var client = ClientAs("admin");
        await client.PutAsJsonAsync("/api/reference-lists/defect-type", new
        {
            items = new[]
            {
                new { value = "Fuite huile", label = (string?)null, sortOrder = 1, isActive = true },
                new { value = "fuite  huile", label = (string?)null, sortOrder = 2, isActive = true },
            },
        });

        var groups = JsonDocument.Parse(await client.GetStringAsync("/api/reference-lists/defect-type/duplicates")).RootElement;
        Assert.Contains(groups.EnumerateArray(), g => g.GetProperty("key").GetString() == "fuite huile" && g.GetProperty("variants").GetArrayLength() == 2);

        var merged = await client.PostAsJsonAsync("/api/reference-lists/defect-type/merge", new { canonical = "Fuite huile", variants = new[] { "fuite  huile" } });
        Assert.Equal(HttpStatusCode.OK, merged.StatusCode);
        var list = JsonDocument.Parse(await merged.Content.ReadAsStringAsync()).RootElement.GetProperty("lists").GetProperty("defect-type");
        var alias = list.EnumerateArray().Single(e => e.GetProperty("value").GetString() == "fuite  huile");
        Assert.Equal("Fuite huile", alias.GetProperty("mergedInto").GetString());
        Assert.False(alias.GetProperty("isActive").GetBoolean());

        // Nothing deleted, and the group no longer shows as a duplicate.
        var after = JsonDocument.Parse(await client.GetStringAsync("/api/reference-lists/defect-type/duplicates")).RootElement;
        Assert.DoesNotContain(after.EnumerateArray(), g => g.GetProperty("key").GetString() == "fuite huile");

        var undone = await client.PostAsJsonAsync("/api/reference-lists/defect-type/unmerge", new { value = "fuite  huile" });
        Assert.Equal(HttpStatusCode.OK, undone.StatusCode);
        var again = JsonDocument.Parse(await undone.Content.ReadAsStringAsync()).RootElement.GetProperty("lists").GetProperty("defect-type")
            .EnumerateArray().Single(e => e.GetProperty("value").GetString() == "fuite  huile");
        Assert.True(again.GetProperty("isActive").GetBoolean());
    }

    [Fact]
    public async Task OnlyAdmins_CanMerge_AndTheKeptNameCannotItselfBeAnAlias()
    {
        var body = new { canonical = "Nouveau nom", variants = new[] { "nouveau  nom" } };
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").PostAsJsonAsync("/api/reference-lists/defect-type/merge", body)).StatusCode);

        // A kept name that is not listed yet is created on the fly.
        var admin = ClientAs("admin");
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync("/api/reference-lists/defect-type/merge", body)).StatusCode);

        // The alias cannot be used as the kept name of another merge.
        var alias = new { canonical = "nouveau  nom", variants = new[] { "autre" } };
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/reference-lists/defect-type/merge", alias)).StatusCode);
    }

    [Fact]
    public async Task UpdatingAClaim_WithAVariant_StoresTheKeptName_AndLeavesOldClaimsAlone()
    {
        var admin = ClientAs("superadmin");
        await admin.PutAsJsonAsync("/api/reference-lists/defect-type", new
        {
            items = new[] { new { value = "Isolation abîmée", label = (string?)null, sortOrder = 1, isActive = true } },
        });

        Guid oldClaim, newClaim;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            Claim Make(string defect) => new()
            {
                Id = Guid.NewGuid(), Title = "t", DefectType = defect, ClientId = "A", Severity = "HIGH", LotNumber = "L",
                Description = "d", StatusCode = "OUVERTE", DetectionDate = DateTime.UtcNow,
            };
            var a = Make("isolation abimee");
            var b = Make("Autre");
            db.Claims.AddRange(a, b);
            await db.SaveChangesAsync();
            oldClaim = a.Id;
            newClaim = b.Id;
        }

        var response = await admin.PutAsJsonAsync($"/api/QualityAnalysis/claims/{newClaim}", new { id = newClaim, defectType = "ISOLATION ABIMEE" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var check = _factory.Services.CreateScope();
        var context = check.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        Assert.Equal("Isolation abîmée", (await context.Claims.FirstAsync(c => c.Id == newClaim)).DefectType);
        Assert.Equal("isolation abimee", (await context.Claims.FirstAsync(c => c.Id == oldClaim)).DefectType); // original text kept
    }

    [Fact]
    public async Task Pareto_CountsEveryVariantUnderTheKeptName()
    {
        var options = new DbContextOptionsBuilder<ActionPlanDbContext>().UseInMemoryDatabase("merge-pareto-" + Guid.NewGuid()).Options;
        await using var db = new ActionPlanDbContext(options);
        db.ReferenceItems.AddRange(Item("Étiquette manquante"), Item("Etiquette manquante", mergedInto: "Étiquette manquante"));
        foreach (var defect in new[] { "Étiquette manquante", "Etiquette manquante", "etiquette manquante", "Coupure fil" })
            db.Claims.Add(new Claim
            {
                Id = Guid.NewGuid(), Title = "t", DefectType = defect, ClientId = "A", Severity = "HIGH", LotNumber = "L",
                Description = "d", StatusCode = "CLOTUREE", DetectionDate = DateTime.UtcNow,
            });
        await db.SaveChangesAsync();

        var items = await new ParetoService(db).GetParetoAsync(new ParetoRequestDto { Dimension = ParetoDimension.DefectType });

        Assert.Equal(2, items.Count);
        Assert.Equal(3, items.Single(i => i.Category == "Étiquette manquante").Count);

        // A filter on the kept name finds the variants too.
        var byClient = await new ParetoService(db).GetParetoAsync(new ParetoRequestDto { Dimension = ParetoDimension.ClientId, DefectType = "Étiquette manquante" });
        Assert.Equal(3, byClient.Sum(i => i.Count));
    }

    [Fact]
    public async Task KpiTopDefects_CountVariantsTogether()
    {
        using var connection = new SqliteConnection("DataSource=:memory:");
        connection.Open();
        await using var db = new ActionPlanDbContext(new DbContextOptionsBuilder<ActionPlanDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        db.ReferenceItems.AddRange(Item("Étiquette manquante"), Item("Etiquette manquante", mergedInto: "Étiquette manquante"));
        foreach (var defect in new[] { "Étiquette manquante", "Etiquette manquante", "Coupure fil" })
            db.Claims.Add(new Claim
            {
                Id = Guid.NewGuid(), Title = "t", DefectType = defect, ClientId = "A", Severity = "HIGH", LotNumber = "L",
                Description = "d", StatusCode = "OUVERTE", DetectionDate = DateTime.UtcNow,
            });
        await db.SaveChangesAsync();

        var kpis = await new GetClaimKpisQueryHandler(db, new ClaimKpiReader(db)).Handle(new GetClaimKpisQuery(null, 3), default);

        Assert.Equal("Étiquette manquante", kpis.TopDefects.First().DefectType);
        Assert.Equal(2, kpis.TopDefects.First().Claims);
        Assert.Equal(2, kpis.TopDefects.Count);
    }

    private static async Task<(SqliteConnection Connection, ActionPlanDbContext Db)> NewRelationalDb(params string[] defects)
    {
        var connection = new SqliteConnection("DataSource=:memory:");
        connection.Open();
        var db = new ActionPlanDbContext(new DbContextOptionsBuilder<ActionPlanDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        foreach (var defect in defects)
            db.Claims.Add(new Claim
            {
                Id = Guid.NewGuid(), Title = "t", DefectType = defect, ClientId = "A", Severity = "HIGH", LotNumber = "L",
                Description = "d", StatusCode = "OUVERTE", DetectionDate = DateTime.UtcNow,
            });
        await db.SaveChangesAsync();
        return (connection, db);
    }

    [Fact]
    public async Task Suggestions_AreBuiltFromTheClaims_AndSameWordsAreOfferedOnce()
    {
        var (connection, db) = await NewRelationalDb("Coupure fil", "Coupure fil", "Soudure froide", "Etiquette manquante", "Étiquette manquante", "Étiquette manquante");
        using (connection)
        await using (db)
        {
            var lists = await new GetReferenceListsQueryHandler(db).Handle(new GetReferenceListsQuery(), default);

            // Same words offered once (the most used spelling), most used first.
            Assert.Equal(new[] { "Étiquette manquante", "Coupure fil", "Soudure froide" }, lists.DefectTypeSuggestions);
        }
    }

    [Fact]
    public async Task Duplicates_AreFoundInTheClaims_WithoutAnyList_AndMergeCreatesTheKeptName()
    {
        var (connection, db) = await NewRelationalDb("Corrosion", "corrosion", "CORROSION ", "Fuite");
        using (connection)
        await using (db)
        {
            var groups = await new GetDefectTypeDuplicatesQueryHandler(db).Handle(new GetDefectTypeDuplicatesQuery(), default);
            var group = Assert.Single(groups);
            Assert.Equal(new[] { "CORROSION", "Corrosion", "corrosion" }, group.Variants.Select(v => v.Value).OrderBy(v => v, StringComparer.Ordinal).ToArray());

            var mediator = new Moq.Mock<MediatR.IMediator>();
            mediator.Setup(m => m.Send(It.IsAny<GetReferenceListsQuery>(), It.IsAny<CancellationToken>()))
                .Returns<GetReferenceListsQuery, CancellationToken>((q, ct) => new GetReferenceListsQueryHandler(db).Handle(q, ct));
            await new MergeDefectTypesCommandHandler(db, mediator.Object)
                .Handle(new MergeDefectTypesCommand("Corrosion", new List<string> { "corrosion", "CORROSION" }, "u"), default);

            Assert.Empty(await new GetDefectTypeDuplicatesQueryHandler(db).Handle(new GetDefectTypeDuplicatesQuery(), default));
            var items = await db.ReferenceItems.ToListAsync();
            Assert.Contains(items, r => r.Value == "Corrosion" && r.MergedInto == null && r.IsActive);
            // Spellings that only differ by case need no alias row: the kept name is listed, so they resolve to it.
            var resolver = DefectTypeResolver.From(items);
            Assert.Equal("Corrosion", resolver.Resolve("corrosion"));
            Assert.Equal("Corrosion", resolver.Resolve("CORROSION"));
            Assert.Equal(4, await db.Claims.CountAsync()); // no claim touched
        }
    }
}
