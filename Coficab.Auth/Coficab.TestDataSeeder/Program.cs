using Coficab.ActionPlan.Infrastructure.Data;
using Coficab.Auth.API.Data;
using Coficab.Auth.API.Models;
using Coficab.TestDataSeeder;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = Host.CreateApplicationBuilder(args);

builder.Configuration
    .AddUserSecrets(typeof(TestDataSeedRunner).Assembly, optional: false);

var shared = builder.Configuration.GetConnectionString("DefaultConnection");
var authCs = builder.Configuration.GetConnectionString("AuthDb");
var apCs = builder.Configuration.GetConnectionString("ActionPlanDb");
if (string.IsNullOrWhiteSpace(authCs)) authCs = shared;
if (string.IsNullOrWhiteSpace(apCs)) apCs = shared;
if (string.IsNullOrWhiteSpace(authCs) || string.IsNullOrWhiteSpace(apCs))
    throw new InvalidOperationException(
        "Missing ConnectionStrings:DefaultConnection. Set it with dotnet user-secrets on Coficab.TestDataSeeder.");

builder.Services.AddDataProtection();
builder.Services.AddDbContext<AppDbContext>(opt => opt.UseSqlServer(authCs));
builder.Services.AddDbContext<ActionPlanDbContext>(opt => opt.UseSqlServer(apCs));

builder.Services
    .AddIdentityCore<ApplicationUser>(options =>
    {
        options.Password.RequiredLength = 8;
        options.Password.RequireNonAlphanumeric = false;
        options.User.RequireUniqueEmail = true;
    })
    .AddRoles<IdentityRole>()
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

using var host = builder.Build();

var config = host.Services.GetRequiredService<IConfiguration>();
var argsList = args.Select(a => a.Trim()).ToList();
var mode = argsList.FirstOrDefault(a => a.StartsWith("--mode=", StringComparison.OrdinalIgnoreCase))
    ?[7..]
    ?? config["TestData:Mode"]
    ?? "realistic";
var purge = argsList.Any(a => a.Equals("--purge-testdata", StringComparison.OrdinalIgnoreCase))
    || string.Equals(config["TestData:PurgeTestData"], "true", StringComparison.OrdinalIgnoreCase);

using var scope = host.Services.CreateScope();

try
{
    // Additive upgrade of the existing dataset to the D4 order. No identity work, no purge, inserts only.
    // Simulation by default; add --apply to write.
    if (mode.Equals("d4-upgrade", StringComparison.OrdinalIgnoreCase))
    {
        var apply = argsList.Any(x => x.Equals("--apply", StringComparison.OrdinalIgnoreCase));
        Environment.ExitCode = await new D4UpgradeRunner(
            scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>(), apply).RunAsync(CancellationToken.None);
        return;
    }

    await EnsureIdentityAsync(scope.ServiceProvider);
    int code;
    if (mode.Equals("testdata", StringComparison.OrdinalIgnoreCase)
        || mode.Equals("legacy", StringComparison.OrdinalIgnoreCase))
    {
        var password = config["TestData:EmployeePassword"] ?? "TestEmployee@1234";
        var employeeCount = int.TryParse(config["TestData:EmployeeCount"], out var ec) ? ec : 20;
        var claimCount = int.TryParse(config["TestData:ClaimCount"], out var cc) ? cc : 150;
        var planCount = int.TryParse(config["TestData:ActionPlanCount"], out var pc) ? pc : 100;

        var runner = new TestDataSeedRunner(
            scope.ServiceProvider.GetRequiredService<AppDbContext>(),
            scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>(),
            scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>(),
            scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>(),
            password,
            employeeCount,
            claimCount,
            planCount);
        code = await runner.RunAsync(CancellationToken.None);
    }
    else
    {
        var claimCount = int.TryParse(config["TestData:RealisticClaimCount"], out var cc) ? cc : 1200;
        var planCount = int.TryParse(config["TestData:RealisticPlanCount"], out var pc) ? pc : 180;
        var argClaims = argsList.FirstOrDefault(a => a.StartsWith("--claims=", StringComparison.OrdinalIgnoreCase));
        if (argClaims != null && int.TryParse(argClaims[9..], out var n)) claimCount = n;

        var runner = new RealisticDemoSeedRunner(
            scope.ServiceProvider.GetRequiredService<AppDbContext>(),
            scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>(),
            scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>(),
            claimCount,
            planCount,
            purgeTestData: purge || true); // par défaut on retire les [TESTDATA] visibles
        code = await runner.RunAsync(CancellationToken.None);
    }

    Environment.ExitCode = code;
}
catch (Exception ex)
{
    Console.Error.WriteLine("SEED FAILED");
    Console.Error.WriteLine(ex);
    Environment.ExitCode = 1;
}

static async Task EnsureIdentityAsync(IServiceProvider services)
{
    var roles = services.GetRequiredService<RoleManager<IdentityRole>>();
    foreach (var role in new[] { "superadmin", "admin", "user" })
    {
        if (!await roles.RoleExistsAsync(role))
            await roles.CreateAsync(new IdentityRole(role));
    }

    var users = services.GetRequiredService<UserManager<ApplicationUser>>();
    await EnsureUserAsync(users, "superadmin@coficab.com", "Super Admin Coficab", "SuperAdmin@1234", "superadmin");
    await EnsureUserAsync(users, "admin@coficab.com", "Admin Coficab", "Admin@1234", "admin");
}

static async Task EnsureUserAsync(
    UserManager<ApplicationUser> users,
    string email,
    string fullName,
    string password,
    string role)
{
    var user = await users.FindByEmailAsync(email);
    if (user is null)
    {
        user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            FullName = fullName,
            Department = "IT"
        };
        var created = await users.CreateAsync(user, password);
        if (!created.Succeeded)
            throw new InvalidOperationException(string.Join("; ", created.Errors.Select(e => e.Description)));
    }

    if (!await users.IsInRoleAsync(user, role))
        await users.AddToRoleAsync(user, role);
}
