using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Services;

/// <summary>A person's name always comes with the short code of their department: "[QA] Ahlem Alaya".</summary>
public static class PersonLabel
{
    public static string With(string? code, string name) =>
        string.IsNullOrWhiteSpace(code) || name.StartsWith("[", StringComparison.Ordinal) ? name : $"[{code.Trim()}] {name}";

    /// <summary>The name of a user with the code of their department; the name as it is when the department is unknown.</summary>
    public static async Task<string> ForAsync(IApplicationDbContext db, string? userId, string fallbackName, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(userId)) return fallbackName;
        var row = await (from p in db.UserProfiles.AsNoTracking()
                         join d in db.Departments.IgnoreQueryFilters().AsNoTracking() on p.DepartmentId equals d.Id
                         where p.UserId == userId
                         select new { p.Name, d.Code }).FirstOrDefaultAsync(ct);
        return row == null ? fallbackName : With(row.Code, string.IsNullOrWhiteSpace(row.Name) ? fallbackName : row.Name);
    }
}
