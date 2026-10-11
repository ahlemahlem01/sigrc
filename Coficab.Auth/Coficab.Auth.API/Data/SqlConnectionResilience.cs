using Microsoft.Data.SqlClient;

namespace Coficab.Auth.API.Data;

/// <summary>
/// Gives every SQL Server connection string patient defaults, so a database that is still starting
/// (container boot, serverless wake-up of about a minute) is waited for instead of failing the request.
/// Values already present in the configured string always win.
/// </summary>
public static class SqlConnectionResilience
{
    public static string WithDefaults(string? connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString)) return connectionString ?? string.Empty;
        var b = new SqlConnectionStringBuilder(connectionString);
        if (!b.ContainsKey("Connect Timeout")) b.ConnectTimeout = 60;
        if (!b.ContainsKey("Connect Retry Count")) b.ConnectRetryCount = 6;
        if (!b.ContainsKey("Connect Retry Interval")) b.ConnectRetryInterval = 10;
        return b.ConnectionString;
    }
}
