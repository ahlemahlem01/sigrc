using Coficab.ActionPlan.Core.DTOs.Calendar;

namespace Coficab.ActionPlan.Application.Interfaces;

public interface ICalendarEventService
{
    Task<IEnumerable<CalendarEventDto>> GetRangeAsync(
        DateTime from,
        DateTime to,
        string? userId = null,
        bool isAdmin = false,
        string? departmentClaim = null);

    Task<CalendarEventDto?> GetByIdAsync(Guid id);
    Task<CalendarEventDto> CreateAsync(CreateCalendarEventDto dto, string createdBy);
    Task<CalendarEventDto> UpdateAsync(Guid id, UpdateCalendarEventDto dto, string updatedBy);
    Task DeleteAsync(Guid id, string deletedBy);
    Task<IEnumerable<CalendarEventDto>> ImportIcsAsync(string icsContent, string importedBy);
    Task<string> ExportIcsAsync(DateTime from, DateTime to, string? userId = null, bool isAdmin = false, string? departmentClaim = null);
}
