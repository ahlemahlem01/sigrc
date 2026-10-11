using System.Text.Json;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.Services;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>The search path must stay cheap: no embedding work for missing vectors, query vectors cached.</summary>
public class SemanticSearchSpeedTests
{
    private static Claim NewClaim(string title) => new()
    {
        Id = Guid.NewGuid(), Title = title, Description = title, DefectType = "x", ClientId = "A", Severity = "LOW",
        LotNumber = "L", StatusCode = "OUVERTE", DetectionDate = DateTime.UtcNow,
    };

    [Fact]
    public async Task Search_RanksByVector_EmbedsTheQueryOnce_AndNeverBackfills()
    {
        var options = new DbContextOptionsBuilder<ActionPlanDbContext>().UseInMemoryDatabase("sem-" + Guid.NewGuid()).Options;
        using var db = new ActionPlanDbContext(options);

        var near = NewClaim("isolation abrasée");
        var far = NewClaim("étiquette manquante");
        var withoutVector = NewClaim("claim sans vecteur"); // would have triggered embedding calls before
        db.Claims.AddRange(near, far, withoutVector);
        var stamp = new DateTime(2031, 3, 3, 12, 0, 0, DateTimeKind.Utc); // unique: the vector index is cached across instances
        db.SemanticEmbeddings.Add(new SemanticEmbedding { EntityType = SemanticEntityTypes.Claim, EntityId = near.Id, EmbeddingJson = JsonSerializer.Serialize(new[] { 0.9f, 0.1f, 0f }), UpdatedAt = stamp });
        db.SemanticEmbeddings.Add(new SemanticEmbedding { EntityType = SemanticEntityTypes.Claim, EntityId = far.Id, EmbeddingJson = JsonSerializer.Serialize(new[] { 0f, 0.2f, 0.9f }), UpdatedAt = stamp });
        await db.SaveChangesAsync();

        var gemini = new Mock<IGeminiService>();
        gemini.Setup(g => g.EmbedAsync(It.IsAny<string>(), true, It.IsAny<CancellationToken>())).ReturnsAsync(new[] { 1f, 0f, 0f });
        var service = new SemanticSearchService(db, gemini.Object, new ConfigurationBuilder().Build(), NullLogger<SemanticSearchService>.Instance);

        var first = await service.SearchAsync("défaut isolation câble sem-test-1", 10, adminScope: true);
        var again = await service.SearchAsync("défaut isolation câble sem-test-1", 10, adminScope: true);

        Assert.Equal(near.Id, first.Claims[0].EntityId);
        Assert.Equal(first.Claims.Select(c => c.EntityId), again.Claims.Select(c => c.EntityId));
        // one embedding call in total: the query (cached the second time); nothing for the claim without a vector
        gemini.Verify(g => g.EmbedAsync(It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Once);
    }
}
