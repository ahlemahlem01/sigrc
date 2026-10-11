using AutoMapper;
using Coficab.ActionPlan.Core.DTOs.Employee;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Services;

public class TimelineService : ITimelineService
{
    private readonly IApplicationDbContext _context;
    private readonly IMapper _mapper;

    public TimelineService(IApplicationDbContext context, IMapper mapper)
    {
        _context = context;
        _mapper = mapper;
    }

    public async Task<IEnumerable<TimelineEventDto>> GetUserTimelineAsync(string userId, int count = 20)
    {
        var events = await _context.TimelineEvents
            .Where(e => e.UserId == userId)
            .OrderByDescending(e => e.Timestamp)
            .Take(count)
            .ToListAsync();
        return _mapper.Map<IEnumerable<TimelineEventDto>>(events);
    }

    // ← nouveau : une seule requête SQL pour tous les employés
    public async Task<IEnumerable<TimelineEventDto>> GetAllTimelineAsync(int count = 50)
    {
        var events = await _context.TimelineEvents
            .OrderByDescending(e => e.Timestamp)
            .Take(count)
            .ToListAsync();
        return _mapper.Map<IEnumerable<TimelineEventDto>>(events);
    }

    public async Task<TimelineEventDto> AddEventAsync(string userId, CreateTimelineEventDto dto)
    {
        var evt = new TimelineEvent
        {
            UserId = userId,
            Type = dto.Type,
            Title = dto.Title,
            Description = dto.Description ?? string.Empty,
            PlanId = dto.PlanId,
            PlanTitle = dto.PlanTitle,
            BadgeId = dto.BadgeId,
            ActorName = dto.ActorName,
            Timestamp = DateTime.UtcNow
        };
        _context.TimelineEvents.Add(evt);
        await _context.SaveChangesAsync();
        return _mapper.Map<TimelineEventDto>(evt);
    }

    public async Task AutoLogPlanCompletedAsync(string userId, Guid planId, string planTitle)
    {
        await AddEventAsync(userId, new CreateTimelineEventDto
        {
            Type = "completion",
            Title = "Plan complété",
            Description = planTitle,
            PlanId = planId,
            PlanTitle = planTitle
        });
    }

    public async Task AutoLogPlanAssignedAsync(string userId, Guid planId, string planTitle)
    {
        await AddEventAsync(userId, new CreateTimelineEventDto
        {
            Type = "assignment",
            Title = "Nouveau plan assigné",
            Description = planTitle,
            PlanId = planId,
            PlanTitle = planTitle
        });
    }

    public async Task AutoLogBadgeEarnedAsync(string userId, Guid badgeId, string badgeName)
    {
        await AddEventAsync(userId, new CreateTimelineEventDto
        {
            Type = "badge",
            Title = "Badge débloqué",
            Description = badgeName,
            BadgeId = badgeId
        });
    }

    public async Task<TimelineEventDto> CreateAsync(CreateTimelineEventDto dto)
    {
        var evt = new TimelineEvent
        {
            Id = Guid.NewGuid(),
            UserId = dto.UserId,
            Type = dto.Type,
            Title = dto.Title,
            Description = dto.Description ?? string.Empty,
            PlanTitle = dto.PlanTitle,
            PlanId = dto.PlanId,
            BadgeId = dto.BadgeId,
            ActorName = dto.ActorName,
            Timestamp = DateTime.UtcNow
        };
        _context.TimelineEvents.Add(evt);
        await _context.SaveChangesAsync();
        return _mapper.Map<TimelineEventDto>(evt);
    }

    public async Task DeleteAsync(Guid id)
    {
        var evt = await _context.TimelineEvents.FindAsync(id);
        if (evt != null)
        {
            _context.TimelineEvents.Remove(evt);
            await _context.SaveChangesAsync();
        }
    }
}