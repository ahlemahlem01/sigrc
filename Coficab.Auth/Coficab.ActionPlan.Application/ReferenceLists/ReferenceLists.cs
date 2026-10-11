using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.ReferenceLists;

public record ReferenceItemDto(string Value, string? Label, int SortOrder, bool IsActive, string? MergedInto = null);

/// <param name="DefectTypeSuggestions">What the claim forms suggest: the defect types really used by the claims (merged spellings counted once).</param>
public record ReferenceListsDto(Dictionary<string, List<ReferenceItemDto>> Lists, List<string> DefectTypeSuggestions);

public record GetReferenceListsQuery : IRequest<ReferenceListsDto>;

public class GetReferenceListsQueryHandler : IRequestHandler<GetReferenceListsQuery, ReferenceListsDto>
{
    private readonly IApplicationDbContext _db;

    public GetReferenceListsQueryHandler(IApplicationDbContext db) => _db = db;

    public async Task<ReferenceListsDto> Handle(GetReferenceListsQuery request, CancellationToken ct)
    {
        var rows = await _db.ReferenceItems.AsNoTracking()
            .OrderBy(r => r.SortOrder).ThenBy(r => r.Value)
            .ToListAsync(ct);

        var lists = ReferenceListKeys.All.ToDictionary(
            key => key,
            key => rows.Where(r => r.ListKey == key)
                .Select(r => new ReferenceItemDto(r.Value, r.Label, r.SortOrder, r.IsActive, r.MergedInto)).ToList());
        return new ReferenceListsDto(lists, await DefectTypeSuggestions.BuildAsync(_db, rows.Where(r => r.ListKey == ReferenceListKeys.DefectType).ToList(), ct));
    }
}

/// <summary>Upserts the entries of one list. Entries that are not sent are left untouched; nothing is deleted.</summary>
public record SaveReferenceListCommand(string ListKey, List<ReferenceItemDto> Items, string UpdatedBy) : IRequest<ReferenceListsDto>;

public class SaveReferenceListCommandHandler : IRequestHandler<SaveReferenceListCommand, ReferenceListsDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IMediator _mediator;

    public SaveReferenceListCommandHandler(IApplicationDbContext db, IMediator mediator)
    {
        _db = db;
        _mediator = mediator;
    }

    public async Task<ReferenceListsDto> Handle(SaveReferenceListCommand request, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var existing = await _db.ReferenceItems.Where(r => r.ListKey == request.ListKey).ToListAsync(ct);

        foreach (var input in request.Items)
        {
            var value = Canonical(request.ListKey, input.Value);
            var row = existing.FirstOrDefault(r => string.Equals(r.Value, value, StringComparison.OrdinalIgnoreCase));
            if (row == null)
            {
                row = new ReferenceItem { ListKey = request.ListKey, Value = value };
                _db.ReferenceItems.Add(row);
                existing.Add(row);
            }
            // Defect types are stored as typed on the claims: a separate display label would only mislead.
            row.Label = request.ListKey == ReferenceListKeys.DefectType || string.IsNullOrWhiteSpace(input.Label) ? null : input.Label.Trim();
            row.SortOrder = input.SortOrder;
            // A merged spelling stays inactive; only an explicit unmerge brings it back.
            row.IsActive = string.IsNullOrWhiteSpace(row.MergedInto) && input.IsActive;
            row.UpdatedAt = now;
            row.UpdatedBy = request.UpdatedBy;
        }

        if (request.ListKey == ReferenceListKeys.Severity && !existing.Any(r => r.IsActive))
            throw new ValidationException("Au moins un niveau de gravité doit rester actif.");

        await _db.SaveChangesAsync(ct);
        return await _mediator.Send(new GetReferenceListsQuery(), ct);
    }

    internal static string Canonical(string listKey, string value) =>
        listKey == ReferenceListKeys.Severity ? value.Trim().ToUpperInvariant() : value.Trim();
}

// --- Merge of spellings (aliases) -------------------------------------------------------------------------

public record DefectTypeVariantDto(string Value, int Claims, bool IsActive);

public record DefectTypeDuplicateGroupDto(string Key, List<DefectTypeVariantDto> Variants);

/// <summary>Spellings of the list that only differ by case, accents or spacing, with how many claims use each.</summary>
public record GetDefectTypeDuplicatesQuery : IRequest<List<DefectTypeDuplicateGroupDto>>;

public class GetDefectTypeDuplicatesQueryHandler : IRequestHandler<GetDefectTypeDuplicatesQuery, List<DefectTypeDuplicateGroupDto>>
{
    private readonly IApplicationDbContext _db;

    public GetDefectTypeDuplicatesQueryHandler(IApplicationDbContext db) => _db = db;

    public async Task<List<DefectTypeDuplicateGroupDto>> Handle(GetDefectTypeDuplicatesQuery request, CancellationToken ct)
    {
        var items = await _db.ReferenceItems.AsNoTracking().Where(r => r.ListKey == ReferenceListKeys.DefectType).ToListAsync(ct);
        var resolver = DefectTypeResolver.From(items);
        var usage = await DefectTypeSuggestions.UsageAsync(_db, ct);

        // Spellings that still count on their own: used by a claim or listed, and not already merged into another one.
        var spellings = usage.Keys
            .Concat(items.Where(i => string.IsNullOrWhiteSpace(i.MergedInto)).Select(i => i.Value.Trim()))
            .Where(s => s.Length > 0 && s.Length <= 100)
            .Distinct(StringComparer.Ordinal)
            .Where(s => string.Equals(resolver.Resolve(s), s, StringComparison.Ordinal))
            .ToList();

        return spellings
            .GroupBy(DefectTypeResolver.Key)
            .Where(g => g.Key.Length > 0 && g.Count() > 1)
            .Select(g => new DefectTypeDuplicateGroupDto(
                g.Key,
                g.Select(s => new DefectTypeVariantDto(s, usage.GetValueOrDefault(s), true))
                    .OrderByDescending(v => v.Claims).ThenBy(v => v.Value, StringComparer.Ordinal).ToList()))
            .OrderBy(g => g.Key)
            .ToList();
    }
}

/// <summary>The defect types the forms suggest, computed from the claims instead of a hand-kept list.</summary>
public static class DefectTypeSuggestions
{
    /// <summary>Each spelling used by a claim (archived ones included) with how many claims use it.</summary>
    public static async Task<Dictionary<string, int>> UsageAsync(IApplicationDbContext db, CancellationToken ct)
    {
        var rows = await db.Claims.IgnoreQueryFilters().AsNoTracking()
            .GroupBy(c => c.DefectType).Select(g => new { Value = g.Key, Count = g.Count() }).ToListAsync(ct);
        var usage = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            var value = (row.Value ?? string.Empty).Trim();
            if (value.Length == 0) continue;
            usage[value] = usage.GetValueOrDefault(value) + row.Count;
        }
        return usage;
    }

    public static async Task<List<string>> BuildAsync(IApplicationDbContext db, List<ReferenceItem> items, CancellationToken ct)
    {
        var resolver = DefectTypeResolver.From(items);
        var usage = await UsageAsync(db, ct);

        // Count under the kept name (merged spellings add up); a listed active name is always offered.
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var (spelling, count) in usage)
        {
            var resolved = resolver.Resolve(spelling);
            counts[resolved] = counts.GetValueOrDefault(resolved) + count;
        }
        foreach (var item in items.Where(i => i.IsActive && string.IsNullOrWhiteSpace(i.MergedInto)))
            counts.TryAdd(item.Value.Trim(), 0);

        var listed = items.Where(i => i.IsActive && string.IsNullOrWhiteSpace(i.MergedInto))
            .Select(i => i.Value.Trim()).ToHashSet(StringComparer.Ordinal);

        // Spellings that are the same words are offered once: the listed one, else the most used one.
        return counts
            .Where(kv => kv.Key.Length > 0 && kv.Key.Length <= 100)
            .GroupBy(kv => DefectTypeResolver.Key(kv.Key))
            .Select(g => (
                Name: g.OrderByDescending(kv => listed.Contains(kv.Key)).ThenByDescending(kv => kv.Value).ThenBy(kv => kv.Key, StringComparer.Ordinal).First().Key,
                Total: g.Sum(kv => kv.Value)))
            .OrderByDescending(x => x.Total).ThenBy(x => x.Name, StringComparer.Ordinal)
            .Select(x => x.Name)
            .Take(300)
            .ToList();
    }
}

/// <summary>Records the variants as aliases of the kept spelling. Claims keep their original text; nothing is deleted.</summary>
public record MergeDefectTypesCommand(string Canonical, List<string> Variants, string UpdatedBy) : IRequest<ReferenceListsDto>;

public class MergeDefectTypesCommandHandler : IRequestHandler<MergeDefectTypesCommand, ReferenceListsDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IMediator _mediator;

    public MergeDefectTypesCommandHandler(IApplicationDbContext db, IMediator mediator)
    {
        _db = db;
        _mediator = mediator;
    }

    public async Task<ReferenceListsDto> Handle(MergeDefectTypesCommand request, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var items = await _db.ReferenceItems.Where(r => r.ListKey == ReferenceListKeys.DefectType).ToListAsync(ct);

        var canonical = items.FirstOrDefault(i => string.Equals(i.Value, request.Canonical.Trim(), StringComparison.OrdinalIgnoreCase));
        if (canonical != null && !string.IsNullOrWhiteSpace(canonical.MergedInto))
            throw new ValidationException("Le nom conservé ne doit pas être lui-même une orthographe fusionnée.");
        if (canonical == null)
        {
            // The kept name becomes a listed name, so later variants typed by hand resolve to it.
            canonical = new ReferenceItem { ListKey = ReferenceListKeys.DefectType, Value = request.Canonical.Trim(), SortOrder = items.Count + 1, UpdatedAt = now, UpdatedBy = request.UpdatedBy };
            _db.ReferenceItems.Add(canonical);
            items.Add(canonical);
        }

        foreach (var variantText in request.Variants.Select(v => v.Trim()).Where(v => v.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (string.Equals(variantText, canonical.Value, StringComparison.OrdinalIgnoreCase)) continue;

            var variant = items.FirstOrDefault(i => string.Equals(i.Value, variantText, StringComparison.OrdinalIgnoreCase));
            if (variant == null)
            {
                variant = new ReferenceItem { ListKey = ReferenceListKeys.DefectType, Value = variantText, SortOrder = items.Count + 1 };
                _db.ReferenceItems.Add(variant);
                items.Add(variant);
            }

            // Anything that was merged into this variant now points at the kept name directly.
            foreach (var other in items.Where(i => string.Equals(i.MergedInto, variant.Value, StringComparison.OrdinalIgnoreCase)))
                other.MergedInto = canonical.Value;

            variant.MergedInto = canonical.Value;
            variant.IsActive = false;
            variant.UpdatedAt = now;
            variant.UpdatedBy = request.UpdatedBy;
        }

        await _db.SaveChangesAsync(ct);
        return await _mediator.Send(new GetReferenceListsQuery(), ct);
    }
}

/// <summary>Undoes a merge: the spelling is a normal, active type again.</summary>
public record UnmergeDefectTypeCommand(string Value, string UpdatedBy) : IRequest<ReferenceListsDto>;

public class UnmergeDefectTypeCommandHandler : IRequestHandler<UnmergeDefectTypeCommand, ReferenceListsDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IMediator _mediator;

    public UnmergeDefectTypeCommandHandler(IApplicationDbContext db, IMediator mediator)
    {
        _db = db;
        _mediator = mediator;
    }

    public async Task<ReferenceListsDto> Handle(UnmergeDefectTypeCommand request, CancellationToken ct)
    {
        var item = await _db.ReferenceItems.FirstOrDefaultAsync(
            r => r.ListKey == ReferenceListKeys.DefectType && r.Value == request.Value.Trim(), ct);
        if (item == null || string.IsNullOrWhiteSpace(item.MergedInto))
            throw new ValidationException("Ce type de défaut n'est pas fusionné.");

        item.MergedInto = null;
        item.IsActive = true;
        item.UpdatedAt = DateTime.UtcNow;
        item.UpdatedBy = request.UpdatedBy;
        await _db.SaveChangesAsync(ct);
        return await _mediator.Send(new GetReferenceListsQuery(), ct);
    }
}

public class MergeDefectTypesCommandValidator : AbstractValidator<MergeDefectTypesCommand>
{
    public MergeDefectTypesCommandValidator()
    {
        RuleFor(x => x.UpdatedBy).NotEmpty();
        RuleFor(x => x.Canonical).NotEmpty().MaximumLength(100).WithMessage("Le nom conservé est obligatoire (100 caractères maximum).");
        RuleFor(x => x.Variants).NotEmpty().WithMessage("Indiquez au moins une orthographe à fusionner.");
        RuleForEach(x => x.Variants).NotEmpty().MaximumLength(100).WithMessage("Une orthographe ne doit pas dépasser 100 caractères.");
    }
}

/// <summary>Adds (never replaces) the defect types already used by the claims, so the list starts from real vocabulary.</summary>
public record ImportExistingDefectTypesCommand(string UpdatedBy) : IRequest<ReferenceListsDto>;

public class ImportExistingDefectTypesCommandHandler : IRequestHandler<ImportExistingDefectTypesCommand, ReferenceListsDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IMediator _mediator;

    public ImportExistingDefectTypesCommandHandler(IApplicationDbContext db, IMediator mediator)
    {
        _db = db;
        _mediator = mediator;
    }

    public async Task<ReferenceListsDto> Handle(ImportExistingDefectTypesCommand request, CancellationToken ct)
    {
        // Archived claims count too: they are part of the history.
        var used = await _db.Claims.IgnoreQueryFilters().AsNoTracking()
            .Select(c => c.DefectType).Distinct().ToListAsync(ct);
        var known = (await _db.ReferenceItems.Where(r => r.ListKey == ReferenceListKeys.DefectType)
            .Select(r => r.Value).ToListAsync(ct)).ToHashSet(StringComparer.OrdinalIgnoreCase);

        var order = known.Count;
        var now = DateTime.UtcNow;
        foreach (var value in used.Select(u => (u ?? string.Empty).Trim()).Where(u => u.Length > 0 && u.Length <= 100)
                     .Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(u => u))
        {
            if (!known.Add(value)) continue;
            _db.ReferenceItems.Add(new ReferenceItem
            {
                ListKey = ReferenceListKeys.DefectType, Value = value, SortOrder = ++order,
                IsActive = true, UpdatedAt = now, UpdatedBy = request.UpdatedBy,
            });
        }

        await _db.SaveChangesAsync(ct);
        return await _mediator.Send(new GetReferenceListsQuery(), ct);
    }
}

public class SaveReferenceListCommandValidator : AbstractValidator<SaveReferenceListCommand>
{
    public SaveReferenceListCommandValidator()
    {
        RuleFor(x => x.UpdatedBy).NotEmpty();
        RuleFor(x => x.ListKey)
            .Must(k => ReferenceListKeys.All.Contains(k))
            .WithMessage("Liste inconnue : types de défaut (defect-type) ou gravité (severity).");
        RuleFor(x => x.Items).NotNull();

        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.Value)
                .NotEmpty().WithMessage("La valeur d'un élément est obligatoire.")
                .MaximumLength(100).WithMessage("La valeur d'un élément ne doit pas dépasser 100 caractères.");
            item.RuleFor(i => i.Label)
                .MaximumLength(100).WithMessage("Le libellé d'un élément ne doit pas dépasser 100 caractères.");
        });

        // Severity levels are fixed: scoring and the ML model rely on exactly these four values.
        RuleForEach(x => x.Items)
            .Must(i => ReferenceListKeys.SeverityLevels.Contains((i.Value ?? string.Empty).Trim().ToUpperInvariant()))
            .WithMessage("Les niveaux de gravité sont fixes : LOW, MEDIUM, HIGH, CRITICAL (seuls le libellé, l'ordre et l'activation changent).")
            .When(x => x.ListKey == ReferenceListKeys.Severity);
    }
}
