namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// Where employee documents live on disk. New files go to App_Data/documents, which is not
/// served by UseStaticFiles, so they are only reachable through the authorized download endpoint.
/// Older files under wwwroot/uploads keep working.
/// </summary>
public static class DocumentStorage
{
    private const string PrivatePrefix = "App_Data/documents/";
    private const string LegacyPrefix = "/uploads/";

    /// <summary>Office, PDF, image and text formats. Anything else (html, svg, scripts…) is refused.</summary>
    public static readonly IReadOnlySet<string> AllowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp",
        ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
        ".txt", ".csv", ".odt", ".ods",
    };

    public static bool IsAllowed(string fileName) => AllowedExtensions.Contains(Path.GetExtension(fileName));

    /// <summary>Saves the upload and returns the path to store on the Document row.</summary>
    public static async Task<string> SaveAsync(IWebHostEnvironment env, IFormFile file, string userId, CancellationToken ct = default)
    {
        var folder = Path.Combine(env.ContentRootPath, "App_Data", "documents");
        Directory.CreateDirectory(folder);

        // Only the GUID-ish user id and a timestamp go into the name; the original name stays in the database.
        var safeUser = new string(userId.Where(char.IsLetterOrDigit).ToArray());
        var fileName = $"doc_{safeUser}_{DateTime.UtcNow.Ticks}{Path.GetExtension(file.FileName).ToLowerInvariant()}";

        await using var stream = new FileStream(Path.Combine(folder, fileName), FileMode.CreateNew);
        await file.CopyToAsync(stream, ct);
        return PrivatePrefix + fileName;
    }

    /// <summary>Physical path for a stored path, or null when it points outside the document folders.</summary>
    public static string? Resolve(IWebHostEnvironment env, string? storedPath)
    {
        if (string.IsNullOrWhiteSpace(storedPath))
            return null;

        string root, relative;
        if (storedPath.StartsWith(PrivatePrefix, StringComparison.OrdinalIgnoreCase))
        {
            root = Path.Combine(env.ContentRootPath, "App_Data", "documents");
            relative = storedPath[PrivatePrefix.Length..];
        }
        else if (storedPath.StartsWith(LegacyPrefix, StringComparison.OrdinalIgnoreCase))
        {
            root = Path.Combine(env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot"), "uploads");
            relative = storedPath[LegacyPrefix.Length..];
        }
        else
        {
            return null;
        }

        var fullRoot = Path.GetFullPath(root) + Path.DirectorySeparatorChar;
        var full = Path.GetFullPath(Path.Combine(fullRoot, relative.Replace('/', Path.DirectorySeparatorChar)));
        return full.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase) ? full : null;
    }
}
