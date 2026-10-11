using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace Coficab.Auth.API.Data;

/// <summary>
/// SQL Server refuses a foreign key that creates a cycle or a second cascade-delete path to the same table
/// (error 1785). The application never deletes rows (everything is archived), so where a cascade would be
/// ambiguous the relationship becomes Restrict. Cascades that are unambiguous stay as configured.
/// Shared by the authentication and the action plan databases.
/// </summary>
public static class SqlServerCascadeGuard
{
    /// <summary>Call at the very end of OnModelCreating, once every relationship is configured.</summary>
    public static void RestrictAmbiguousCascades(ModelBuilder modelBuilder)
    {
        var accepted = new List<(string From, string To)>();

        var foreignKeys = modelBuilder.Model.GetEntityTypes()
            .SelectMany(e => e.GetForeignKeys())
            .Where(fk => fk.DeleteBehavior == DeleteBehavior.Cascade)
            .OrderBy(fk => fk.DeclaringEntityType.Name, StringComparer.Ordinal)
            .ThenBy(fk => string.Join(",", fk.Properties.Select(p => p.Name)), StringComparer.Ordinal)
            .ToList();

        foreach (var fk in foreignKeys)
        {
            var edge = (From: fk.PrincipalEntityType.Name, To: fk.DeclaringEntityType.Name);
            var candidate = accepted.Append(edge).ToList();
            if (IsUnambiguous(candidate)) accepted.Add(edge);
            else fk.DeleteBehavior = DeleteBehavior.Restrict;
        }
    }

    /// <summary>True when the model still holds a cascade cycle or two cascade paths to one table (what SQL Server rejects).</summary>
    public static bool HasAmbiguousCascades(IModel model)
    {
        var edges = model.GetEntityTypes()
            .SelectMany(e => e.GetForeignKeys())
            .Where(fk => fk.DeleteBehavior == DeleteBehavior.Cascade)
            .Select(fk => (From: fk.PrincipalEntityType.Name, To: fk.DeclaringEntityType.Name))
            .ToList();
        return !IsUnambiguous(edges);
    }

    private static bool IsUnambiguous(List<(string From, string To)> edges)
    {
        var next = edges.GroupBy(e => e.From).ToDictionary(g => g.Key, g => g.Select(e => e.To).ToList());

        foreach (var source in next.Keys)
        {
            var paths = new Dictionary<string, int>();
            var onPath = new HashSet<string> { source };
            if (!Walk(source, next, paths, onPath)) return false;
            if (paths.Values.Any(count => count > 1)) return false;
        }
        return true;
    }

    private static bool Walk(string node, Dictionary<string, List<string>> next, Dictionary<string, int> paths, HashSet<string> onPath)
    {
        if (!next.TryGetValue(node, out var targets)) return true;
        foreach (var target in targets)
        {
            if (onPath.Contains(target)) return false; // cycle
            paths[target] = paths.GetValueOrDefault(target) + 1;
            onPath.Add(target);
            var ok = Walk(target, next, paths, onPath);
            onPath.Remove(target);
            if (!ok) return false;
        }
        return true;
    }
}
