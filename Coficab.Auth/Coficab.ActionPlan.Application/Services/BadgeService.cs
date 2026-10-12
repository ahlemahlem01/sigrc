using AutoMapper;
using Coficab.ActionPlan.Core.DTOs.Employee;
using Coficab.ActionPlan.Application.Badges;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.MlFeatures;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;
namespace Coficab.ActionPlan.Application.Services;
public class BadgeService : IBadgeService
{
    private readonly IApplicationDbContext _context;
    private readonly IMapper _mapper;
    private readonly ITimelineService _timelineService;
    public BadgeService(IApplicationDbContext context, IMapper mapper, ITimelineService timelineService)
    {
        _context = context;
        _mapper = mapper;
        _timelineService = timelineService;
    }
    public async Task<IEnumerable<BadgeDto>> GetUserBadgesAsync(string userId)
    {
        var badges = await _context.Badges
            .Where(b => b.UserId == userId)
            .OrderByDescending(b => b.EarnedAt)
            .ToListAsync();
        var profile = await _context.UserProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.UserId == userId);
        return badges.Select(b => MapBadge(b, profile));
    }
    public async Task<BadgeDto?> AwardBadgeAsync(string userId, AwardBadgeDto dto)
    {
        // One badge per (category, name): tiers and periods have their own names, so an employee can earn several.
        if (await _context.Badges.AnyAsync(b => b.UserId == userId && b.Category == dto.Category && b.Name == dto.Name))
            return null;
        var badge = new Badge
        {
            UserId = userId,
            Name = dto.Name,
            Description = dto.Description,
            Icon = dto.Icon,
            Color = dto.Color,
            Category = dto.Category,
            PlanId = dto.PlanId,
            PlanTitle = dto.PlanTitle
        };
        _context.Badges.Add(badge);
        await _context.SaveChangesAsync();
        await _timelineService.AutoLogBadgeEarnedAsync(userId, badge.Id, badge.Name);
        return MapBadge(badge, null);
    }
    public async Task<IReadOnlyList<BadgeDto>> AwardEarnedAsync(string userId)
    {
        var closed = await _context.Claims.AsNoTracking()
            .Where(c => !c.IsArchived && c.AssignedToId != null && c.IsOnTime != null && c.CompletedAt != null)
            .Select(c => new { c.AssignedToId, c.IsOnTime, c.CompletedAt })
            .ToListAsync();

        var mine = closed
            .Where(c => string.Equals(c.AssignedToId, userId, StringComparison.OrdinalIgnoreCase))
            .Select(c => new ClosedClaim(c.CompletedAt!.Value, c.IsOnTime == true))
            .ToList();
        if (mine.Count == 0) return Array.Empty<BadgeDto>();

        var teamRate = closed.Count == 0 ? 0.75 : (double)closed.Count(c => c.IsOnTime == true) / closed.Count;
        var perEmployee = closed
            .GroupBy(c => c.AssignedToId!, StringComparer.OrdinalIgnoreCase)
            .Select(g => (OnTime: g.Count(c => c.IsOnTime == true), Closed: g.Count()))
            .ToList();
        var cutoff = BadgeRules.ReliabilityCutoff(perEmployee, teamRate);
        var reliable = BadgeRules.IsReliable(mine.Count(c => c.OnTime), mine.Count, teamRate, cutoff);

        var awarded = new List<BadgeDto>();
        foreach (var dto in BadgeRules.Earned(mine, reliable, DateTime.UtcNow))
        {
            var badge = await AwardBadgeAsync(userId, dto);
            if (badge != null) awarded.Add(badge);
        }
        return awarded;
    }

    public async Task<IReadOnlyList<BadgeDto>> AwardEarnedForEveryoneAsync()
    {
        var users = await _context.Claims.AsNoTracking()
            .Where(c => !c.IsArchived && c.AssignedToId != null && c.IsOnTime != null && c.CompletedAt != null)
            .Select(c => c.AssignedToId!)
            .Distinct()
            .ToListAsync();

        var awarded = new List<BadgeDto>();
        foreach (var user in users.Distinct(StringComparer.OrdinalIgnoreCase))
            awarded.AddRange(await AwardEarnedAsync(user));
        return awarded;
    }

    public async Task<bool> HasBadgeAsync(string userId, string badgeCategory)
    {
        return await _context.Badges
            .AnyAsync(b => b.UserId == userId && b.Category == badgeCategory);
    }
    public async Task<IEnumerable<BadgeDto>> GetAllBadgesAsync()
    {
        var badges = await _context.Badges
            .OrderByDescending(b => b.EarnedAt)
            .ToListAsync();
        var profiles = await _context.UserProfiles
            .AsNoTracking()
            .ToDictionaryAsync(p => p.UserId, p => p, StringComparer.OrdinalIgnoreCase);
        return badges.Select(b =>
        {
            profiles.TryGetValue(b.UserId, out var profile);
            return MapBadge(b, profile);
        });
    }
    public async Task<BadgeDto> CreateAsync(CreateBadgeDto dto)
    {
        var badge = new Badge
        {
            Id = Guid.NewGuid(),
            UserId = dto.UserId,
            Name = dto.Name,
            Description = dto.Description ?? string.Empty,
            Icon = dto.Icon ?? string.Empty,
            Color = dto.Color ?? "#3b82f6",
            Category = dto.Category,
            PlanTitle = dto.PlanTitle,
            EarnedAt = DateTime.UtcNow
        };
        _context.Badges.Add(badge);
        await _context.SaveChangesAsync();
        await _timelineService.AutoLogBadgeEarnedAsync(badge.UserId, badge.Id, badge.Name);
        var profile = await _context.UserProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.UserId == badge.UserId);
        return MapBadge(badge, profile);
    }
    public async Task DeleteAsync(Guid id)
    {
        var badge = await _context.Badges.FindAsync(id);
        if (badge != null)
        {
            _context.Badges.Remove(badge);
            await _context.SaveChangesAsync();
        }
    }
    private static BadgeDto MapBadge(Badge badge, UserProfile? profile)
    {
        return new BadgeDto
        {
            Id = badge.Id.ToString(),
            UserId = badge.UserId,
            UserName = profile != null ? ResolveProfileName(profile) : null,
            Name = badge.Name,
            Description = badge.Description,
            Icon = badge.Icon,
            Category = badge.Category,
            TypeLabel = FormatBadgeCategory(badge.Category),
            EarnedAt = badge.EarnedAt.ToString("yyyy-MM-dd"),
            PlanId = badge.PlanId?.ToString(),
            PlanTitle = badge.PlanTitle,
            Color = badge.Color,
        };
    }
    private static string ResolveProfileName(UserProfile profile)
    {
        if (!string.IsNullOrWhiteSpace(profile.Name) && profile.Name.Trim() != "Utilisateur")
            return profile.Name.Trim();
        if (!string.IsNullOrWhiteSpace(profile.Email) && profile.Email.Contains('@'))
            return profile.Email.Split('@')[0].Replace('.', ' ');
        return profile.UserId;
    }
    private static string FormatBadgeCategory(string? category)
    {
        var value = (category ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(value)) return "Général";
        return value.ToLowerInvariant() switch
        {
            "general" => "Général",
            "first_plan" => "Premier plan CAPA",
            "streak" => "Série de réussites",
            "speed" => "Rapidité",
            "perfect_quarter" => "Trimestre parfait",
            "reliable" => "Fiabilité",
            _ => System.Globalization.CultureInfo.CurrentCulture.TextInfo
                .ToTitleCase(
                    value
                        .Replace("performance-", "", StringComparison.OrdinalIgnoreCase)
                        .Replace('_', ' ')
                        .Replace('-', ' ')
                        .Trim()
                        .ToLowerInvariant())
        };
    }
}
