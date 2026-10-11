using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.DTOs.Calendar;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Services;

public class CalendarEventService : ICalendarEventService
{
    private readonly IApplicationDbContext _db;
    private readonly INotificationService _notifications;
    public CalendarEventService(IApplicationDbContext db, INotificationService notifications)
    {
        _db = db;
        _notifications = notifications;
    }

    public async Task<IEnumerable<CalendarEventDto>> GetRangeAsync(
        DateTime from,
        DateTime to,
        string? userId = null,
        bool isAdmin = false,
        string? departmentClaim = null)
    {
        var list = await _db.CalendarEvents.AsQueryable()
            .Where(e => !e.IsArchived && e.StartAt < to && e.EndAt > from)
            .OrderBy(e => e.StartAt)
            .ToListAsync();

        if (isAdmin || string.IsNullOrWhiteSpace(userId))
            return list.Select(Map);

        Guid? departmentId = null;
        var profile = await _db.UserProfiles.AsNoTracking()
            .FirstOrDefaultAsync(p => p.UserId == userId);
        if (profile?.DepartmentId != null)
            departmentId = profile.DepartmentId;

        if (!departmentId.HasValue && !string.IsNullOrWhiteSpace(departmentClaim))
        {
            if (Guid.TryParse(departmentClaim, out var parsed))
            {
                departmentId = parsed;
            }
            else
            {
                var dept = await _db.Departments.AsNoTracking()
                    .FirstOrDefaultAsync(d => !d.IsArchived && d.Name.ToLower() == departmentClaim.Trim().ToLower());
                if (dept != null) departmentId = dept.Id;
            }
        }

        return list.Where(e => IsVisibleTo(e, userId, departmentId)).Select(Map);
    }

    public async Task<CalendarEventDto?> GetByIdAsync(Guid id)
    {
        var e = await _db.CalendarEvents.FirstOrDefaultAsync(x => x.Id == id && !x.IsArchived);
        return e == null ? null : Map(e);
    }

    public async Task<CalendarEventDto> CreateAsync(CreateCalendarEventDto dto, string createdBy)
    {
        Validate(dto.Title, dto.StartAt, dto.EndAt, dto.IsCompanyWide, dto.TargetUserIds, dto.TargetDepartmentIds);
        var importance = NormalizeImportance(dto.Importance);

        var entity = new CalendarEvent
        {
            Id = Guid.NewGuid(),
            Title = dto.Title.Trim(),
            Description = dto.Description?.Trim(),
            StartAt = DateTime.SpecifyKind(dto.StartAt, DateTimeKind.Utc),
            EndAt = DateTime.SpecifyKind(dto.EndAt, DateTimeKind.Utc),
            AllDay = dto.AllDay,
            Color = string.IsNullOrWhiteSpace(dto.Color) ? "#039be5" : dto.Color,
            ActionPlanId = dto.ActionPlanId,
            ClaimId = dto.ClaimId,
            Source = string.IsNullOrWhiteSpace(dto.Source) ? "custom" : dto.Source,
            EventType = string.IsNullOrWhiteSpace(dto.EventType) ? "custom" : dto.EventType.Trim(),
            Importance = importance,
            IsCompanyWide = dto.IsCompanyWide,
            TargetUserIdsJson = SerializeIds(dto.IsCompanyWide ? null : dto.TargetUserIds),
            TargetDepartmentIdsJson = SerializeGuids(dto.IsCompanyWide ? null : dto.TargetDepartmentIds),
            ExternalUid = string.IsNullOrWhiteSpace(dto.ExternalUid)
                ? $"{Guid.NewGuid():N}@coficab-capa"
                : dto.ExternalUid!,
            OwnerId = createdBy,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
        };

        _db.CalendarEvents.Add(entity);
        await _db.SaveChangesAsync();
        try
        {
            await NotifyIfNeededAsync(entity, createdBy);
        }
        catch (Exception)
        {
            // L'événement est déjà enregistré — ne pas faire échouer la création
        }
        return Map(entity);
    }

    public async Task<CalendarEventDto> UpdateAsync(Guid id, UpdateCalendarEventDto dto, string updatedBy)
    {
        Validate(dto.Title, dto.StartAt, dto.EndAt, dto.IsCompanyWide, dto.TargetUserIds, dto.TargetDepartmentIds);

        var entity = await _db.CalendarEvents.FirstOrDefaultAsync(x => x.Id == id && !x.IsArchived)
            ?? throw new KeyNotFoundException("Événement introuvable.");

        var importance = NormalizeImportance(dto.Importance);
        entity.Title = dto.Title.Trim();
        entity.Description = dto.Description?.Trim();
        entity.StartAt = DateTime.SpecifyKind(dto.StartAt, DateTimeKind.Utc);
        entity.EndAt = DateTime.SpecifyKind(dto.EndAt, DateTimeKind.Utc);
        entity.AllDay = dto.AllDay;
        entity.Color = string.IsNullOrWhiteSpace(dto.Color) ? "#039be5" : dto.Color;
        entity.ActionPlanId = dto.ActionPlanId;
        entity.ClaimId = dto.ClaimId;
        entity.EventType = string.IsNullOrWhiteSpace(dto.EventType) ? "custom" : dto.EventType.Trim();
        entity.Importance = importance;
        entity.IsCompanyWide = dto.IsCompanyWide;
        entity.TargetUserIdsJson = SerializeIds(dto.IsCompanyWide ? null : dto.TargetUserIds);
        entity.TargetDepartmentIdsJson = SerializeGuids(dto.IsCompanyWide ? null : dto.TargetDepartmentIds);
        entity.UpdatedBy = updatedBy;
        entity.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        try
        {
            await NotifyIfNeededAsync(entity, updatedBy);
        }
        catch (Exception)
        {
            // Mise à jour OK même si la notif échoue
        }
        return Map(entity);
    }

    public async Task DeleteAsync(Guid id, string deletedBy)
    {
        var entity = await _db.CalendarEvents.FirstOrDefaultAsync(x => x.Id == id && !x.IsArchived)
            ?? throw new KeyNotFoundException("Événement introuvable.");
        entity.IsArchived = true;
        entity.ArchivedAt = DateTime.UtcNow;
        entity.ArchivedBy = deletedBy;
        entity.UpdatedBy = deletedBy;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    public async Task<IEnumerable<CalendarEventDto>> ImportIcsAsync(string icsContent, string importedBy)
    {
        var parsed = ParseIcs(icsContent);
        var results = new List<CalendarEventDto>();

        foreach (var item in parsed)
        {
            var existing = await _db.CalendarEvents
                .FirstOrDefaultAsync(e => e.ExternalUid == item.ExternalUid && !e.IsArchived);

            if (existing != null)
            {
                existing.Title = item.Title;
                existing.Description = item.Description;
                existing.StartAt = item.StartAt;
                existing.EndAt = item.EndAt;
                existing.AllDay = item.AllDay;
                existing.Source = "imported";
                existing.UpdatedBy = importedBy;
                existing.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
                results.Add(Map(existing));
            }
            else
            {
                var created = await CreateAsync(new CreateCalendarEventDto
                {
                    Title = item.Title,
                    Description = item.Description,
                    StartAt = item.StartAt,
                    EndAt = item.EndAt,
                    AllDay = item.AllDay,
                    ExternalUid = item.ExternalUid,
                    Source = "imported",
                    EventType = "custom",
                    Importance = "normal",
                    IsCompanyWide = true,
                    Color = "#0b8043",
                }, importedBy);
                results.Add(created);
            }
        }

        return results;
    }

    public async Task<string> ExportIcsAsync(DateTime from, DateTime to, string? userId = null, bool isAdmin = false, string? departmentClaim = null)
    {
        var events = (await GetRangeAsync(from, to, userId, isAdmin, departmentClaim)).ToList();
        var sb = new StringBuilder();
        sb.AppendLine("BEGIN:VCALENDAR");
        sb.AppendLine("VERSION:2.0");
        sb.AppendLine("PRODID:-//Coficab//CAPA Calendar//FR");
        sb.AppendLine("CALSCALE:GREGORIAN");
        sb.AppendLine("METHOD:PUBLISH");
        sb.AppendLine("X-WR-CALNAME:Coficab");

        foreach (var e in events)
        {
            sb.AppendLine("BEGIN:VEVENT");
            sb.AppendLine($"UID:{Escape(e.ExternalUid)}");
            sb.AppendLine($"DTSTAMP:{FormatUtc(DateTime.UtcNow)}");
            if (e.AllDay)
            {
                sb.AppendLine($"DTSTART;VALUE=DATE:{e.StartAt:yyyyMMdd}");
                sb.AppendLine($"DTEND;VALUE=DATE:{e.EndAt:yyyyMMdd}");
            }
            else
            {
                sb.AppendLine($"DTSTART:{FormatUtc(e.StartAt)}");
                sb.AppendLine($"DTEND:{FormatUtc(e.EndAt)}");
            }
            sb.AppendLine($"SUMMARY:{Escape(e.Title)}");
            if (!string.IsNullOrWhiteSpace(e.Description))
                sb.AppendLine($"DESCRIPTION:{Escape(e.Description)}");
            sb.AppendLine("END:VEVENT");
        }

        sb.AppendLine("END:VCALENDAR");
        return sb.ToString();
    }

    private static bool IsVisibleTo(CalendarEvent e, string userId, Guid? departmentId)
    {
        if (e.IsCompanyWide) return true;
        if (string.Equals(e.OwnerId, userId, StringComparison.Ordinal)) return true;

        var userIds = DeserializeIds(e.TargetUserIdsJson);
        if (userIds.Any(id => string.Equals(id, userId, StringComparison.OrdinalIgnoreCase)))
            return true;

        if (departmentId.HasValue)
        {
            var deptIds = DeserializeGuids(e.TargetDepartmentIdsJson);
            if (deptIds.Contains(departmentId.Value))
                return true;
        }

        return false;
    }

    private static void Validate(
        string title,
        DateTime startAt,
        DateTime endAt,
        bool isCompanyWide,
        List<string>? targetUserIds,
        List<Guid>? targetDepartmentIds)
    {
        if (string.IsNullOrWhiteSpace(title))
            throw new InvalidOperationException("Le titre est requis.");
        if (endAt < startAt)
            throw new InvalidOperationException("La fin doit être après le début.");

        if (!isCompanyWide)
        {
            var hasUsers = targetUserIds != null && targetUserIds.Any(x => !string.IsNullOrWhiteSpace(x));
            var hasDepts = targetDepartmentIds != null && targetDepartmentIds.Count > 0;
            if (!hasUsers && !hasDepts)
                throw new InvalidOperationException("Choisissez au moins une personne ou un département, ou cochez « Toute l'entreprise ».");
        }
    }

    private static string NormalizeImportance(string? importance)
    {
        var v = (importance ?? "normal").Trim().ToLowerInvariant();
        return v switch
        {
            "urgent" or "haute" or "high" => "urgent",
            "important" or "moyenne" or "medium" => "important",
            _ => "normal",
        };
    }

    private async Task NotifyIfNeededAsync(CalendarEvent entity, string actorId)
    {
        if (entity.Importance is not ("urgent" or "important"))
            return;

        var recipients = await ResolveRecipientIdsAsync(entity);
        recipients.RemoveWhere(id => string.Equals(id, actorId, StringComparison.OrdinalIgnoreCase));
        if (recipients.Count == 0) return;

        var isUrgent = entity.Importance == "urgent";
        var type = isUrgent ? "calendar_urgent" : "calendar_important";
        var prefix = isUrgent ? "Urgent" : "Important";
        var when = entity.AllDay
            ? entity.StartAt.ToString("dd/MM/yyyy")
            : entity.StartAt.ToLocalTime().ToString("dd/MM/yyyy HH:mm");
        var title = $"{prefix} · {entity.Title}";
        var message = string.IsNullOrWhiteSpace(entity.Description)
            ? $"Événement le {when}"
            : $"{entity.Description}\nLe {when}";

        foreach (var recipientId in recipients)
        {
            try
            {
                await _notifications.NotifyAsync(recipientId, type, title, message);
            }
            catch
            {
                // Ne pas faire échouer la création si une notif échoue
            }
        }
    }

    private async Task<HashSet<string>> ResolveRecipientIdsAsync(CalendarEvent entity)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (entity.IsCompanyWide)
        {
            var all = await _db.UserProfiles.AsNoTracking()
                .Where(p => p.Status != "inactive")
                .Select(p => p.UserId)
                .ToListAsync();
            foreach (var id in all.Where(x => !string.IsNullOrWhiteSpace(x)))
                set.Add(id);
            return set;
        }

        foreach (var id in DeserializeIds(entity.TargetUserIdsJson))
            set.Add(id);

        var deptIds = DeserializeGuids(entity.TargetDepartmentIdsJson);
        if (deptIds.Count > 0)
        {
            var fromDepts = await _db.UserProfiles.AsNoTracking()
                .Where(p => p.DepartmentId != null && deptIds.Contains(p.DepartmentId.Value))
                .Select(p => p.UserId)
                .ToListAsync();
            foreach (var id in fromDepts.Where(x => !string.IsNullOrWhiteSpace(x)))
                set.Add(id);
        }

        return set;
    }

    private static CalendarEventDto Map(CalendarEvent e) => new()
    {
        Id = e.Id,
        Title = e.Title,
        Description = e.Description,
        StartAt = e.StartAt,
        EndAt = e.EndAt,
        AllDay = e.AllDay,
        Source = e.Source,
        EventType = e.EventType,
        Importance = string.IsNullOrWhiteSpace(e.Importance) ? "normal" : e.Importance,
        Color = e.Color,
        ActionPlanId = e.ActionPlanId,
        ClaimId = e.ClaimId,
        ExternalUid = e.ExternalUid,
        OwnerId = e.OwnerId,
        IsCompanyWide = e.IsCompanyWide,
        TargetUserIds = DeserializeIds(e.TargetUserIdsJson),
        TargetDepartmentIds = DeserializeGuids(e.TargetDepartmentIdsJson),
        CreatedAt = e.CreatedAt,
    };

    private static string? SerializeIds(IEnumerable<string>? ids)
    {
        var list = ids?.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        return list == null || list.Count == 0 ? null : JsonSerializer.Serialize(list);
    }

    private static string? SerializeGuids(IEnumerable<Guid>? ids)
    {
        var list = ids?.Distinct().ToList();
        return list == null || list.Count == 0 ? null : JsonSerializer.Serialize(list);
    }

    private static List<string> DeserializeIds(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new List<string>();
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>(); }
        catch { return new List<string>(); }
    }

    private static List<Guid> DeserializeGuids(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new List<Guid>();
        try { return JsonSerializer.Deserialize<List<Guid>>(json) ?? new List<Guid>(); }
        catch { return new List<Guid>(); }
    }

    private static string FormatUtc(DateTime dt)
    {
        var u = dt.Kind == DateTimeKind.Utc ? dt : dt.ToUniversalTime();
        return u.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
    }

    private static string Escape(string value) =>
        value.Replace("\\", "\\\\").Replace(";", "\\;").Replace(",", "\\,").Replace("\n", "\\n");

    private static List<CreateCalendarEventDto> ParseIcs(string ics)
    {
        var result = new List<CreateCalendarEventDto>();
        if (string.IsNullOrWhiteSpace(ics)) return result;

        var blocks = Regex.Split(ics.Replace("\r\n", "\n"), "BEGIN:VEVENT");
        foreach (var block in blocks.Skip(1))
        {
            var body = block.Split("END:VEVENT")[0];
            var uid = GetProp(body, "UID") ?? $"{Guid.NewGuid():N}@imported";
            var summary = Unescape(GetProp(body, "SUMMARY") ?? "Événement importé");
            var desc = Unescape(GetProp(body, "DESCRIPTION"));
            var (start, allDayStart) = ParseDate(GetProp(body, "DTSTART"));
            var (end, allDayEnd) = ParseDate(GetProp(body, "DTEND"));
            if (start == null) continue;
            var allDay = allDayStart || allDayEnd;
            var endAt = end ?? start.Value.AddHours(1);
            if (allDay && end == null) endAt = start.Value.AddDays(1);

            result.Add(new CreateCalendarEventDto
            {
                Title = summary,
                Description = desc,
                StartAt = DateTime.SpecifyKind(start.Value, DateTimeKind.Utc),
                EndAt = DateTime.SpecifyKind(endAt, DateTimeKind.Utc),
                AllDay = allDay,
                ExternalUid = uid,
                Source = "imported",
                EventType = "custom",
                Importance = "normal",
                IsCompanyWide = true,
            });
        }
        return result;
    }

    private static string? GetProp(string body, string name)
    {
        var lines = body.Split('\n');
        for (var i = 0; i < lines.Length; i++)
        {
            var line = lines[i].TrimEnd();
            while (i + 1 < lines.Length && (lines[i + 1].StartsWith(" ") || lines[i + 1].StartsWith("\t")))
            {
                i++;
                line += lines[i].TrimStart();
            }
            if (line.StartsWith(name + ":", StringComparison.OrdinalIgnoreCase) ||
                line.StartsWith(name + ";", StringComparison.OrdinalIgnoreCase))
            {
                var idx = line.IndexOf(':');
                return idx >= 0 ? line[(idx + 1)..].Trim() : null;
            }
        }
        return null;
    }

    private static string Unescape(string? value)
    {
        if (string.IsNullOrEmpty(value)) return value ?? string.Empty;
        return value.Replace("\\n", "\n").Replace("\\,", ",").Replace("\\;", ";").Replace("\\\\", "\\");
    }

    private static (DateTime? dt, bool allDay) ParseDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return (null, false);
        raw = raw.Trim();
        if (Regex.IsMatch(raw, @"^\d{8}$"))
        {
            if (DateTime.TryParseExact(raw, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var d))
                return (DateTime.SpecifyKind(d, DateTimeKind.Utc), true);
        }
        raw = raw.TrimEnd('Z');
        if (DateTime.TryParseExact(raw, "yyyyMMdd'T'HHmmss", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dt))
            return (DateTime.SpecifyKind(dt, DateTimeKind.Utc), false);
        if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var fallback))
            return (DateTime.SpecifyKind(fallback.ToUniversalTime(), DateTimeKind.Utc), false);
        return (null, false);
    }
}
