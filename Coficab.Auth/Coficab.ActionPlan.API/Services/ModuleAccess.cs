using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// The modules the contract activates (specification: "this setting allows to activate the module according to the contract type").
/// The superadmin, who is the supplier, switches them. A module without a row is active: nothing is lost by default.
/// </summary>
public static class ModuleAccess
{
    public const string Qrqc = "qrqc";
    public const string Pilotage = "pilotage";
    public const string Assistant = "assistant";

    public static readonly IReadOnlyList<(string Code, string Name)> Catalog = new[]
    {
        (Qrqc, "Panneau QRQC"),
        (Pilotage, "Pilotage"),
        (Assistant, "Assistant qualité (IA)"),
    };

    /// <summary>Creates the rows of the modules that have none yet (all active).</summary>
    public static async Task EnsureAsync(ActionPlanDbContext db, CancellationToken ct = default)
    {
        var existing = await db.Modules.IgnoreQueryFilters().Select(m => m.Code).ToListAsync(ct);
        var added = false;
        foreach (var (code, name) in Catalog.Where(c => !existing.Contains(c.Code, StringComparer.OrdinalIgnoreCase)))
        {
            db.Modules.Add(new Module { Code = code, Name = name, IsActive = true });
            added = true;
        }
        if (added) await db.SaveChangesAsync(ct);
    }

    public static async Task<bool> IsEnabledAsync(ActionPlanDbContext db, string code, CancellationToken ct = default)
    {
        var row = await db.Modules.AsNoTracking().FirstOrDefaultAsync(m => m.Code == code, ct);
        return row == null || row.IsActive;
    }
}
