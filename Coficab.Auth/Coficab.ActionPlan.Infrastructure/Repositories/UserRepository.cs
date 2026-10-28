using Coficab.ActionPlan.Core.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Data.SqlClient;
using System.Net.Http.Headers;
using System.Text.Json;
namespace Coficab.ActionPlan.Infrastructure.Repositories;
public class UserRepository : IUserRepository
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    public UserRepository(IHttpClientFactory httpClientFactory, IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
    }
    public async Task<bool> ExistsAsync(Guid userId)
        => await ExistsAsync(userId.ToString());
    public Task<bool> ExistsAsync(string userId)
        => Task.FromResult(!string.IsNullOrEmpty(userId));
    public async Task<IEnumerable<string>> GetUserIdsByRoleAsync(string role)
    {
        var fromApi = await TryGetUserIdsFromAuthApiAsync(role);
        if (fromApi.Count > 0) return fromApi;
        return await GetUserIdsFromAuthDbAsync(role);
    }

    private async Task<List<string>> TryGetUserIdsFromAuthApiAsync(string role)
    {
        var authApiUrl = _configuration["AuthApi:BaseUrl"] ?? "https://localhost:7102";
        var client = _httpClientFactory.CreateClient();
        try
        {
            var response = await client.GetAsync($"{authApiUrl}/api/admin/users");
            if (!response.IsSuccessStatusCode)
                return new List<string>();
            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            var userIds = new List<string>();
            var root = doc.RootElement;
            var users = root.ValueKind == JsonValueKind.Array
                ? root
                : root.TryGetProperty("data", out var dataEl) ? dataEl : root;
            foreach (var user in users.EnumerateArray())
            {
                if (user.TryGetProperty("role", out var roleEl))
                {
                    bool matches = roleEl.ValueKind == JsonValueKind.Array
                        ? roleEl.EnumerateArray().Any(r => string.Equals(r.GetString(), role, StringComparison.OrdinalIgnoreCase))
                        : string.Equals(roleEl.GetString(), role, StringComparison.OrdinalIgnoreCase);
                    if (matches && user.TryGetProperty("id", out var idEl))
                        userIds.Add(idEl.GetString() ?? string.Empty);
                }
            }
            return userIds.Where(id => !string.IsNullOrEmpty(id)).ToList();
        }
        catch
        {
            return new List<string>();
        }
    }

    private async Task<List<string>> GetUserIdsFromAuthDbAsync(string role)
    {
        // The authentication tables (schema app_auth) live in the same database as the plans unless AuthDb says otherwise: without this
        // fallback nobody was found as an administrator and no administrator notification was ever delivered.
        var cs = _configuration.GetConnectionString("AuthDb")
            ?? _configuration["AuthApi:ConnectionString"]
            ?? _configuration.GetConnectionString("DefaultConnection");
        if (!string.IsNullOrWhiteSpace(cs)) cs = Coficab.Auth.API.Data.SqlConnectionResilience.WithDefaults(cs);
        if (string.IsNullOrWhiteSpace(cs) || string.IsNullOrWhiteSpace(role))
            return new List<string>();

        try
        {
            await using var conn = new SqlConnection(cs);
            await conn.OpenAsync();
            await using var cmd = new SqlCommand(
                """
                SELECT u.Id
                FROM app_auth.AspNetUsers u
                JOIN app_auth.AspNetUserRoles ur ON ur.UserId = u.Id
                JOIN app_auth.AspNetRoles r ON r.Id = ur.RoleId
                WHERE LOWER(r.Name) = LOWER(@role)
                """,
                conn);
            cmd.Parameters.AddWithValue("role", role.Trim());
            var ids = new List<string>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                if (!reader.IsDBNull(0))
                {
                    var id = reader.GetString(0);
                    if (!string.IsNullOrWhiteSpace(id))
                        ids.Add(id);
                }
            }
            return ids;
        }
        catch
        {
            return new List<string>();
        }
    }

    public async Task<string?> GetUserNameByIdAsync(string userId)
    {
        if (string.IsNullOrEmpty(userId)) return null;
        var authApiUrl = _configuration["AuthApi:BaseUrl"] ?? "https://localhost:7102";
        var client = _httpClientFactory.CreateClient();
        try
        {
            var response = await client.GetAsync($"{authApiUrl}/api/admin/users");
            if (!response.IsSuccessStatusCode) return null;
            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var users = root.ValueKind == JsonValueKind.Array
                ? root
                : root.TryGetProperty("data", out var dataEl) ? dataEl : root;
            foreach (var user in users.EnumerateArray())
            {
                if (user.TryGetProperty("id", out var idEl) &&
                    string.Equals(idEl.GetString(), userId, StringComparison.OrdinalIgnoreCase))
                {
                    if (user.TryGetProperty("fullName", out var fn) && !string.IsNullOrEmpty(fn.GetString()))
                        return fn.GetString();
                    if (user.TryGetProperty("FullName", out var fnPascal) && !string.IsNullOrEmpty(fnPascal.GetString()))
                        return fnPascal.GetString();
                    var first = user.TryGetProperty("firstName", out var f) ? f.GetString()
                        : user.TryGetProperty("FirstName", out var fPascal) ? fPascal.GetString() : null;
                    var last = user.TryGetProperty("lastName", out var l) ? l.GetString()
                        : user.TryGetProperty("LastName", out var lPascal) ? lPascal.GetString() : null;
                    if (!string.IsNullOrEmpty(first) || !string.IsNullOrEmpty(last))
                        return $"{first} {last}".Trim();
                    if (user.TryGetProperty("email", out var em) && !string.IsNullOrEmpty(em.GetString()))
                        return em.GetString();
                    if (user.TryGetProperty("Email", out var emPascal) && !string.IsNullOrEmpty(emPascal.GetString()))
                        return emPascal.GetString();
                    return userId;
                }
            }
            return null;
        }
        catch
        {
            return null;
        }
    }
}