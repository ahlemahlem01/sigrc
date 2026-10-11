namespace Coficab.Auth.API.Models;

public class UserPreference
{
    public string UserId { get; set; } = string.Empty;
    public string Theme { get; set; } = "light";
    public string ExportFormat { get; set; } = "csv";
    public string ImportFormat { get; set; } = "csv";
}
