using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.ReferenceLists;

/// <summary>
/// "Only accept the values of the list": an option per list (customers, production lines, shifts). When it is on, a claim
/// can only use a value that is an active entry of the list. An empty list never blocks anything.
/// </summary>
public static class StrictLists
{
    public static readonly string[] Keys = { ReferenceListKeys.Client, ReferenceListKeys.ProductionLine, ReferenceListKeys.Shift };

    private static string SettingKey(string listKey) => "RefStrict:" + listKey;

    public static async Task<Dictionary<string, bool>> LoadAsync(IApplicationDbContext db, CancellationToken ct)
    {
        var saved = await db.OverviewSettings.AsNoTracking()
            .Where(s => s.Key.StartsWith("RefStrict:"))
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        return Keys.ToDictionary(k => k, k => saved.TryGetValue(SettingKey(k), out var v) && v >= 0.5);
    }

    /// <summary>Refuses a value that is not in the list when the list is strict. Called when a claim's value is set or changed.</summary>
    public static async Task EnsureAllowedAsync(IApplicationDbContext db, string listKey, string? value, string fieldLabel, CancellationToken ct)
    {
        var text = (value ?? string.Empty).Trim();
        if (text.Length == 0) return;
        if (!(await LoadAsync(db, ct)).GetValueOrDefault(listKey)) return;

        var allowed = await db.ReferenceItems.AsNoTracking()
            .Where(r => r.ListKey == listKey && r.IsActive && r.MergedInto == null)
            .Select(r => r.Value).ToListAsync(ct);
        if (allowed.Count == 0) return;
        if (allowed.Any(a => string.Equals(a.Trim(), text, StringComparison.OrdinalIgnoreCase))) return;

        throw new ValidationException(
            $"{fieldLabel} « {text} » n'est pas dans la liste de référence. Choisissez une valeur proposée ou demandez à un administrateur de l'ajouter.");
    }

    public static async Task SetAsync(IApplicationDbContext db, string listKey, bool strict, string userId, CancellationToken ct)
    {
        var key = SettingKey(listKey);
        var row = await db.OverviewSettings.FirstOrDefaultAsync(s => s.Key == key, ct);
        if (row == null) db.OverviewSettings.Add(new OverviewSetting { Key = key, Value = strict ? 1 : 0, UpdatedAt = DateTime.UtcNow, UpdatedBy = userId });
        else
        {
            row.Value = strict ? 1 : 0;
            row.UpdatedAt = DateTime.UtcNow;
            row.UpdatedBy = userId;
        }
        await db.SaveChangesAsync(ct);
    }
}

public record SetListStrictCommand(string ListKey, bool Strict, string UpdatedBy) : IRequest<ReferenceListsDto>;

public class SetListStrictCommandHandler : IRequestHandler<SetListStrictCommand, ReferenceListsDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IMediator _mediator;

    public SetListStrictCommandHandler(IApplicationDbContext db, IMediator mediator)
    {
        _db = db;
        _mediator = mediator;
    }

    public async Task<ReferenceListsDto> Handle(SetListStrictCommand request, CancellationToken ct)
    {
        if (!StrictLists.Keys.Contains(request.ListKey))
            throw new ValidationException("Cette option n'existe que pour les clients, les lignes de production et les équipes.");
        await StrictLists.SetAsync(_db, request.ListKey, request.Strict, request.UpdatedBy, ct);
        return await _mediator.Send(new GetReferenceListsQuery(), ct);
    }
}
