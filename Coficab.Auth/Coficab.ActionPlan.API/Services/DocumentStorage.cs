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

    private static readonly byte[] Zip = { 0x50, 0x4B, 0x03, 0x04 };                                     // docx, xlsx, pptx, odt, ods
    private static readonly byte[] OleCompound = { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 };     // doc, xls, ppt

    /// <summary>
    /// The first bytes of the file must be those of the format its extension announces (a script renamed to .pdf is refused).
    /// Text and CSV files must contain no binary zero. This does not prove a file is harmless, but it removes the cheapest disguise.
    /// </summary>
    public static async Task<bool> ContentMatchesExtensionAsync(IFormFile file, CancellationToken ct = default)
    {
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var head = new byte[4096];
        int read;
        await using (var stream = file.OpenReadStream())
            read = await stream.ReadAsync(head.AsMemory(0, head.Length), ct);
        if (read == 0) return false;
        bool StartsWith(byte[] signature) => read >= signature.Length && head.AsSpan(0, signature.Length).SequenceEqual(signature);

        return extension switch
        {
            ".pdf" => StartsWith("%PDF"u8.ToArray()),
            ".png" => StartsWith(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }),
            ".jpg" or ".jpeg" => StartsWith(new byte[] { 0xFF, 0xD8, 0xFF }),
            ".gif" => StartsWith("GIF8"u8.ToArray()),
            ".webp" => read >= 12 && StartsWith("RIFF"u8.ToArray()) && head.AsSpan(8, 4).SequenceEqual("WEBP"u8),
            ".docx" or ".xlsx" or ".pptx" or ".odt" or ".ods" => StartsWith(Zip),
            ".doc" or ".xls" or ".ppt" => StartsWith(OleCompound),
            ".txt" or ".csv" => !head.AsSpan(0, read).Contains((byte)0),
            _ => false,
        };
    }

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
