using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Organizations;

/// <summary>Which levels an organization type has, between the corporate level and the sites.</summary>
public static class OrganizationStructureRules
{
    public static bool HasRegions(OrganizationType type) => type is OrganizationType.CountryRegionalCorporate or OrganizationType.RegionalCorporate;
    public static bool HasCountries(OrganizationType type) => type is OrganizationType.CountryRegionalCorporate or OrganizationType.CountryCorporate;

    /// <summary>A Local organization is one site; every other type may have as many as it needs.</summary>
    public static int? MaxSites(OrganizationType type) => type == OrganizationType.Local ? 1 : null;
}

public record StructureNodeDto(Guid Id, string Name, string Code, Guid? ParentId, int Departments);

public record OrganizationStructureDto(
    Guid OrganizationId,
    OrganizationType Type,
    bool HasRegions,
    bool HasCountries,
    int? MaxSites,
    IReadOnlyList<StructureNodeDto> Regions,
    IReadOnlyList<StructureNodeDto> Countries,
    IReadOnlyList<StructureNodeDto> Sites);

public record StructureInput(string? Name, string? Code, Guid? ParentId);

/// <summary>A refused structure change: a stable code the front end translates, and the number of items in the way.</summary>
public class StructureException : Exception
{
    public string Code { get; }
    public int Count { get; }
    public bool NotFound { get; }
    public StructureException(string code, int count = 0, bool notFound = false) : base(code)
    {
        Code = code;
        Count = count;
        NotFound = notFound;
    }
}

/// <summary>Regions, countries and sites of an organization, kept consistent with the organization type chosen by the superadmin.</summary>
public class OrganizationStructureService
{
    private readonly IApplicationDbContext _context;

    public OrganizationStructureService(IApplicationDbContext context) => _context = context;

    public async Task<OrganizationStructureDto> GetAsync(Guid organizationId, CancellationToken ct)
    {
        var org = await _context.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.Id == organizationId, ct)
            ?? throw new StructureException("organization_not_found", notFound: true);

        var regions = await _context.Regions.AsNoTracking().Where(r => r.OrganizationId == organizationId).OrderBy(r => r.Name).ToListAsync(ct);
        var countries = await _context.Countries.AsNoTracking().Where(c => c.OrganizationId == organizationId).OrderBy(c => c.Name).ToListAsync(ct);
        var sites = await _context.Sites.AsNoTracking().Where(s => s.OrganizationId == organizationId).OrderBy(s => s.Name).ToListAsync(ct);
        var deps = await _context.Departments.AsNoTracking().Where(d => d.OrganizationId == organizationId && !d.IsArchived)
            .Select(d => new { d.SiteId, d.RegionId }).ToListAsync(ct);

        return new OrganizationStructureDto(
            organizationId,
            org.Type,
            OrganizationStructureRules.HasRegions(org.Type),
            OrganizationStructureRules.HasCountries(org.Type),
            OrganizationStructureRules.MaxSites(org.Type),
            regions.Select(r => new StructureNodeDto(r.Id, r.Name, r.Code, null, deps.Count(d => d.RegionId == r.Id))).ToList(),
            countries.Select(c => new StructureNodeDto(c.Id, c.Name, c.Code, c.RegionId, 0)).ToList(),
            sites.Select(s => new StructureNodeDto(s.Id, s.Name, s.Code, s.CountryId, deps.Count(d => d.SiteId == s.Id))).ToList());
    }

    /// <summary>What an organization already holds that its new type would not allow. Empty when the change is fine.</summary>
    public async Task<IReadOnlyList<(string Code, int Count)>> ConflictsForTypeAsync(Guid organizationId, OrganizationType newType, CancellationToken ct)
    {
        var conflicts = new List<(string, int)>();
        var regions = await _context.Regions.CountAsync(r => r.OrganizationId == organizationId, ct);
        var countries = await _context.Countries.Where(c => c.OrganizationId == organizationId).Select(c => c.RegionId).ToListAsync(ct);
        var sites = await _context.Sites.Where(s => s.OrganizationId == organizationId).Select(s => s.CountryId).ToListAsync(ct);

        if (!OrganizationStructureRules.HasRegions(newType) && regions > 0) conflicts.Add(("regions_not_allowed", regions));
        if (!OrganizationStructureRules.HasCountries(newType) && countries.Count > 0) conflicts.Add(("countries_not_allowed", countries.Count));
        if (OrganizationStructureRules.HasCountries(newType))
        {
            var needRegion = OrganizationStructureRules.HasRegions(newType);
            var wrong = countries.Count(r => needRegion ? r == null : r != null);
            if (wrong > 0) conflicts.Add((needRegion ? "countries_without_region" : "countries_with_region", wrong));
            var orphanSites = sites.Count(c => c == null);
            if (orphanSites > 0) conflicts.Add(("sites_without_country", orphanSites));
        }
        else
        {
            var withCountry = sites.Count(c => c != null);
            if (withCountry > 0) conflicts.Add(("sites_with_country", withCountry));
        }
        if (OrganizationStructureRules.MaxSites(newType) is { } max && sites.Count > max) conflicts.Add(("too_many_sites", sites.Count));
        return conflicts;
    }

    public async Task<StructureNodeDto> CreateAsync(Guid organizationId, string level, StructureInput input, string by, CancellationToken ct)
    {
        var org = await _context.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.Id == organizationId, ct)
            ?? throw new StructureException("organization_not_found", notFound: true);
        var (name, code) = Clean(input);

        switch (level)
        {
            case "regions":
                if (!OrganizationStructureRules.HasRegions(org.Type)) throw new StructureException("regions_not_allowed");
                await EnsureUniqueCode(_context.Regions.Where(r => r.OrganizationId == organizationId).Select(r => new CodeRow(r.Id, r.Code)), code, null, ct);
                var region = new Region { Name = name, Code = code, OrganizationId = organizationId, CreatedBy = by };
                _context.Regions.Add(region);
                await _context.SaveChangesAsync(ct);
                return new StructureNodeDto(region.Id, region.Name, region.Code, null, 0);

            case "countries":
                if (!OrganizationStructureRules.HasCountries(org.Type)) throw new StructureException("countries_not_allowed");
                await CheckCountryParent(organizationId, org.Type, input.ParentId, ct);
                await EnsureUniqueCode(_context.Countries.Where(c => c.OrganizationId == organizationId).Select(c => new CodeRow(c.Id, c.Code)), code, null, ct);
                var country = new Country { Name = name, Code = code, OrganizationId = organizationId, RegionId = input.ParentId, CreatedBy = by };
                _context.Countries.Add(country);
                await _context.SaveChangesAsync(ct);
                return new StructureNodeDto(country.Id, country.Name, country.Code, country.RegionId, 0);

            case "sites":
                await CheckSiteParent(organizationId, org.Type, input.ParentId, ct);
                if (OrganizationStructureRules.MaxSites(org.Type) is { } max
                    && await _context.Sites.CountAsync(s => s.OrganizationId == organizationId, ct) >= max)
                    throw new StructureException("too_many_sites", max);
                await EnsureUniqueCode(_context.Sites.Where(s => s.OrganizationId == organizationId).Select(s => new CodeRow(s.Id, s.Code)), code, null, ct);
                var site = new Site { Name = name, Code = code, OrganizationId = organizationId, CountryId = input.ParentId, CreatedBy = by };
                _context.Sites.Add(site);
                await _context.SaveChangesAsync(ct);
                return new StructureNodeDto(site.Id, site.Name, site.Code, site.CountryId, 0);

            default:
                throw new StructureException("unknown_level", notFound: true);
        }
    }

    public async Task<StructureNodeDto> UpdateAsync(Guid organizationId, string level, Guid id, StructureInput input, string by, CancellationToken ct)
    {
        var org = await _context.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.Id == organizationId, ct)
            ?? throw new StructureException("organization_not_found", notFound: true);
        var (name, code) = Clean(input);

        switch (level)
        {
            case "regions":
                var region = await _context.Regions.FirstOrDefaultAsync(r => r.Id == id && r.OrganizationId == organizationId, ct)
                    ?? throw new StructureException("node_not_found", notFound: true);
                await EnsureUniqueCode(_context.Regions.Where(r => r.OrganizationId == organizationId).Select(r => new CodeRow(r.Id, r.Code)), code, id, ct);
                region.Name = name; region.Code = code; region.UpdatedAt = DateTime.UtcNow; region.UpdatedBy = by;
                await _context.SaveChangesAsync(ct);
                return new StructureNodeDto(region.Id, region.Name, region.Code, null, 0);

            case "countries":
                var country = await _context.Countries.FirstOrDefaultAsync(c => c.Id == id && c.OrganizationId == organizationId, ct)
                    ?? throw new StructureException("node_not_found", notFound: true);
                await CheckCountryParent(organizationId, org.Type, input.ParentId, ct);
                await EnsureUniqueCode(_context.Countries.Where(c => c.OrganizationId == organizationId).Select(c => new CodeRow(c.Id, c.Code)), code, id, ct);
                country.Name = name; country.Code = code; country.RegionId = input.ParentId; country.UpdatedAt = DateTime.UtcNow; country.UpdatedBy = by;
                await _context.SaveChangesAsync(ct);
                return new StructureNodeDto(country.Id, country.Name, country.Code, country.RegionId, 0);

            case "sites":
                var site = await _context.Sites.FirstOrDefaultAsync(s => s.Id == id && s.OrganizationId == organizationId, ct)
                    ?? throw new StructureException("node_not_found", notFound: true);
                await CheckSiteParent(organizationId, org.Type, input.ParentId, ct);
                await EnsureUniqueCode(_context.Sites.Where(s => s.OrganizationId == organizationId).Select(s => new CodeRow(s.Id, s.Code)), code, id, ct);
                site.Name = name; site.Code = code; site.CountryId = input.ParentId; site.UpdatedAt = DateTime.UtcNow; site.UpdatedBy = by;
                await _context.SaveChangesAsync(ct);
                return new StructureNodeDto(site.Id, site.Name, site.Code, site.CountryId, 0);

            default:
                throw new StructureException("unknown_level", notFound: true);
        }
    }

    /// <summary>Archives a node (never deletes). Refused while something active still hangs under it.</summary>
    public async Task ArchiveAsync(Guid organizationId, string level, Guid id, string by, CancellationToken ct)
    {
        switch (level)
        {
            case "regions":
                var region = await _context.Regions.FirstOrDefaultAsync(r => r.Id == id && r.OrganizationId == organizationId, ct)
                    ?? throw new StructureException("node_not_found", notFound: true);
                var countries = await _context.Countries.CountAsync(c => c.RegionId == id, ct);
                var regionDeps = await _context.Departments.CountAsync(d => d.RegionId == id && !d.IsArchived, ct);
                if (countries + regionDeps > 0) throw new StructureException("node_in_use", countries + regionDeps);
                Mark(region, by);
                break;
            case "countries":
                var country = await _context.Countries.FirstOrDefaultAsync(c => c.Id == id && c.OrganizationId == organizationId, ct)
                    ?? throw new StructureException("node_not_found", notFound: true);
                var sites = await _context.Sites.CountAsync(s => s.CountryId == id, ct);
                if (sites > 0) throw new StructureException("node_in_use", sites);
                Mark(country, by);
                break;
            case "sites":
                var site = await _context.Sites.FirstOrDefaultAsync(s => s.Id == id && s.OrganizationId == organizationId, ct)
                    ?? throw new StructureException("node_not_found", notFound: true);
                var deps = await _context.Departments.CountAsync(d => d.SiteId == id && !d.IsArchived, ct);
                if (deps > 0) throw new StructureException("node_in_use", deps);
                Mark(site, by);
                break;
            default:
                throw new StructureException("unknown_level", notFound: true);
        }
        await _context.SaveChangesAsync(ct);
    }

    private static void Mark(Core.Common.BaseEntity e, string by)
    {
        e.IsArchived = true;
        e.ArchivedAt = DateTime.UtcNow;
        e.ArchivedBy = by;
    }

    private static (string Name, string Code) Clean(StructureInput input)
    {
        var name = (input.Name ?? string.Empty).Trim();
        var code = (input.Code ?? string.Empty).Trim().ToUpperInvariant();
        if (name.Length == 0 || name.Length > 200) throw new StructureException("name_invalid");
        if (code.Length == 0 || code.Length > 10) throw new StructureException("code_invalid");
        return (name, code);
    }

    private sealed record CodeRow(Guid Id, string Code);

    private static async Task EnsureUniqueCode(IQueryable<CodeRow> rows, string code, Guid? except, CancellationToken ct)
    {
        foreach (var r in await rows.ToListAsync(ct))
            if (r.Id != except && string.Equals(r.Code, code, StringComparison.OrdinalIgnoreCase))
                throw new StructureException("code_taken");
    }

    private async Task CheckCountryParent(Guid organizationId, OrganizationType type, Guid? regionId, CancellationToken ct)
    {
        if (OrganizationStructureRules.HasRegions(type))
        {
            if (regionId == null) throw new StructureException("region_required");
            if (!await _context.Regions.AnyAsync(r => r.Id == regionId && r.OrganizationId == organizationId, ct))
                throw new StructureException("parent_not_found");
        }
        else if (regionId != null) throw new StructureException("region_not_allowed");
    }

    private async Task CheckSiteParent(Guid organizationId, OrganizationType type, Guid? countryId, CancellationToken ct)
    {
        if (OrganizationStructureRules.HasCountries(type))
        {
            if (countryId == null) throw new StructureException("country_required");
            if (!await _context.Countries.AnyAsync(c => c.Id == countryId && c.OrganizationId == organizationId, ct))
                throw new StructureException("parent_not_found");
        }
        else if (countryId != null) throw new StructureException("country_not_allowed");
    }
}
