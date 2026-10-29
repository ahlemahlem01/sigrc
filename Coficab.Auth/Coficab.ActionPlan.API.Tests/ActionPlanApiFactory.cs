using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.Services;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Interfaces;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Moq;

namespace Coficab.ActionPlan.API.Tests;

public sealed class ActionPlanApiFactory : WebApplicationFactory<Program>
{
    public const string DatasetApiKey = "test-dataset-key";

    private readonly string _dbName = $"ActionPlanTests_{Guid.NewGuid():N}";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Database:Provider"] = "InMemory",
                ["Database:Name"] = _dbName,
                ["MlFeatures:DatasetApiKey"] = DatasetApiKey,
            });
        });

        builder.ConfigureTestServices(services =>
        {
            foreach (var d in services.Where(d => d.ServiceType == typeof(IHostedService)).ToList())
                services.Remove(d);

            services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = TestAuthHandler.SchemeName;
                    options.DefaultChallengeScheme = TestAuthHandler.SchemeName;
                })
                .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(
                    TestAuthHandler.SchemeName, _ => { });

            services.PostConfigureAll<AuthenticationOptions>(options =>
            {
                options.DefaultAuthenticateScheme = TestAuthHandler.SchemeName;
                options.DefaultChallengeScheme = TestAuthHandler.SchemeName;
                options.DefaultScheme = TestAuthHandler.SchemeName;
            });

            var semantic = new Mock<ISemanticSearchService>();
            semantic
                .Setup(s => s.UpsertClaimAsync(It.IsAny<Claim>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);
            semantic
                .Setup(s => s.UpsertActionPlanAsync(It.IsAny<Core.Entities.ActionPlan>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);
            services.RemoveAll<ISemanticSearchService>();
            services.AddSingleton(semantic.Object);

            var notify = Notifier;
            notify
                .Setup(n => n.NotifyAsync(
                    It.IsAny<string>(),
                    It.IsAny<string>(),
                    It.IsAny<string>(),
                    It.IsAny<string>(),
                    It.IsAny<Guid?>(),
                    It.IsAny<string?>(),
                    It.IsAny<Guid?>()))
                .Returns(Task.CompletedTask);
            services.RemoveAll<INotificationService>();
            services.AddSingleton(notify.Object);

            var realtime = new Mock<INotificationBroadcaster>();
            realtime
                .Setup(r => r.SendDossierStatusChangedAsync(
                    It.IsAny<DossierRealtimeEvent>(),
                    It.IsAny<IEnumerable<string>>(),
                    It.IsAny<bool>()))
                .Returns(Task.CompletedTask);
            services.RemoveAll<INotificationBroadcaster>();
            services.AddSingleton(realtime.Object);

            var users = new Mock<IUserService>();
            users.Setup(u => u.UserExistsAsync(It.IsAny<Guid>())).ReturnsAsync(true);
            users.Setup(u => u.UserExistsAsync(It.IsAny<string>())).ReturnsAsync(true);
            services.RemoveAll<IUserService>();
            services.AddSingleton(users.Object);

            var userRepo = new Mock<IUserRepository>();
            userRepo.Setup(u => u.ExistsAsync(It.IsAny<Guid>())).ReturnsAsync(true);
            userRepo.Setup(u => u.ExistsAsync(It.IsAny<string>())).ReturnsAsync(true);
            services.RemoveAll<IUserRepository>();
            services.AddSingleton(userRepo.Object);

            var timeline = new Mock<ITimelineService>();
            timeline
                .Setup(t => t.AutoLogPlanAssignedAsync(It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>()))
                .Returns(Task.CompletedTask);
            services.RemoveAll<ITimelineService>();
            services.AddSingleton(timeline.Object);
        });
    }

    /// <summary>The notification service of the tests: what was asked to be sent can be checked with Verify.</summary>
    public Mock<INotificationService> Notifier { get; } = new();

    public async Task SeedAsync(Func<ActionPlanDbContext, Task> seed)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        await db.Database.EnsureCreatedAsync();
        await seed(db);
        await db.SaveChangesAsync();
    }
}
