using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Workflow;

public sealed record WorkflowDecision(bool Allowed, string? Message, IReadOnlyList<string> AllowedTargets);

/// <summary>Decides whether a user-driven status change is allowed by the configured claim workflow.</summary>
public interface IClaimWorkflow
{
    Task<WorkflowDecision> CheckAsync(string? from, string to, IEnumerable<string> roles, CancellationToken ct = default);
}

/// <summary>
/// Reads the configured transitions (table WorkflowTransitions) instead of hard-coded rules.
/// Lenient on purpose where the configuration says nothing: an empty configuration, or a status the workflow
/// does not know (legacy values such as VALIDATED), never blocks work. A superadmin is never refused for lack
/// of role (so the workflow can always be repaired), only when a transition is switched off.
/// </summary>
public class ClaimWorkflow : IClaimWorkflow
{
    private readonly IApplicationDbContext _db;

    public ClaimWorkflow(IApplicationDbContext db) => _db = db;

    public static string Normalize(string? status)
    {
        var s = (status ?? string.Empty).Trim().ToUpperInvariant();
        return s switch
        {
            "OPEN" => "OUVERTE",
            "CLOSED" or "CLOTURE" or "CLOTURÉE" => "CLOTUREE",
            "IN_ANALYSIS" => "EN_ANALYSE",
            "ASSIGNEE" or "ASSIGNÉE" => "ASSIGNED",
            _ => s,
        };
    }

    public async Task<WorkflowDecision> CheckAsync(string? from, string to, IEnumerable<string> roles, CancellationToken ct = default)
    {
        var source = Normalize(from);
        var target = Normalize(to);
        if (source == target) return Allowed();

        var statuses = await _db.WorkflowStatuses.AsNoTracking()
            .Where(s => s.WorkflowKey == WorkflowKeys.Claim && s.IsActive)
            .Select(s => new { s.Code, s.Label })
            .ToListAsync(ct);
        var transitions = await _db.WorkflowTransitions.AsNoTracking()
            .Where(t => t.WorkflowKey == WorkflowKeys.Claim && t.IsActive)
            .ToListAsync(ct);

        if (transitions.Count == 0) return Allowed();
        var known = statuses.Select(s => s.Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!known.Contains(source) || !known.Contains(target)) return Allowed();

        var roleSet = roles.Select(r => (r ?? string.Empty).Trim().ToLowerInvariant()).Where(r => r.Length > 0).ToHashSet();
        if (roleSet.Count == 0) roleSet.Add("user");
        var isSuper = roleSet.Contains("superadmin");

        bool RoleOk(WorkflowTransition t) =>
            isSuper || t.AllowedRoles.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Any(r => roleSet.Contains(r.ToLowerInvariant()));

        var fromHere = transitions.Where(t => string.Equals(t.FromCode, source, StringComparison.OrdinalIgnoreCase)).ToList();
        var targets = fromHere.Where(RoleOk).Select(t => t.ToCode).ToList();
        string Label(string code) => statuses.FirstOrDefault(s => string.Equals(s.Code, code, StringComparison.OrdinalIgnoreCase))?.Label ?? code;

        var move = fromHere.FirstOrDefault(t => string.Equals(t.ToCode, target, StringComparison.OrdinalIgnoreCase));
        if (move == null)
            return new WorkflowDecision(false, $"Le workflow n'autorise pas le passage de « {Label(source)} » à « {Label(target)} ».", targets);
        if (!RoleOk(move))
            return new WorkflowDecision(false, $"Votre rôle ne permet pas de passer de « {Label(source)} » à « {Label(target)} ».", targets);
        return new WorkflowDecision(true, null, targets);

        WorkflowDecision Allowed() => new(true, null, Array.Empty<string>());
    }
}

// ─── Configuration (superadmin) ──────────────────────────────────────────────

public record WorkflowStatusInput(string Code, string Label, int SortOrder, bool IsFinal, bool IsActive);

public record WorkflowTransitionInput(string From, string To, List<string> Roles, bool IsActive);

public record WorkflowConfigDto(
    List<WorkflowStatusInput> Statuses,
    List<WorkflowTransitionInput> Transitions);

public record GetClaimWorkflowQuery : IRequest<WorkflowConfigDto>;

/// <summary>Upserts statuses and transitions. Rows are never deleted: switching one off sets IsActive to false.</summary>
public record SaveClaimWorkflowCommand(
    List<WorkflowStatusInput> Statuses,
    List<WorkflowTransitionInput> Transitions,
    string UpdatedBy) : IRequest<WorkflowConfigDto>;

public class GetClaimWorkflowQueryHandler : IRequestHandler<GetClaimWorkflowQuery, WorkflowConfigDto>
{
    private readonly IApplicationDbContext _db;

    public GetClaimWorkflowQueryHandler(IApplicationDbContext db) => _db = db;

    public async Task<WorkflowConfigDto> Handle(GetClaimWorkflowQuery request, CancellationToken ct)
    {
        var statuses = await _db.WorkflowStatuses.AsNoTracking()
            .Where(s => s.WorkflowKey == WorkflowKeys.Claim)
            .OrderBy(s => s.SortOrder).ThenBy(s => s.Code)
            .ToListAsync(ct);
        var transitions = await _db.WorkflowTransitions.AsNoTracking()
            .Where(t => t.WorkflowKey == WorkflowKeys.Claim)
            .OrderBy(t => t.FromCode).ThenBy(t => t.ToCode)
            .ToListAsync(ct);

        return new WorkflowConfigDto(
            statuses.Select(s => new WorkflowStatusInput(s.Code, s.Label, s.SortOrder, s.IsFinal, s.IsActive)).ToList(),
            transitions.Select(t => new WorkflowTransitionInput(
                t.FromCode, t.ToCode,
                t.AllowedRoles.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList(),
                t.IsActive)).ToList());
    }
}

public class SaveClaimWorkflowCommandHandler : IRequestHandler<SaveClaimWorkflowCommand, WorkflowConfigDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IMediator _mediator;

    public SaveClaimWorkflowCommandHandler(IApplicationDbContext db, IMediator mediator)
    {
        _db = db;
        _mediator = mediator;
    }

    public async Task<WorkflowConfigDto> Handle(SaveClaimWorkflowCommand request, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var existingStatuses = await _db.WorkflowStatuses.Where(s => s.WorkflowKey == WorkflowKeys.Claim).ToListAsync(ct);
        var existingTransitions = await _db.WorkflowTransitions.Where(t => t.WorkflowKey == WorkflowKeys.Claim).ToListAsync(ct);

        foreach (var input in request.Statuses)
        {
            var code = ClaimWorkflow.Normalize(input.Code);
            var row = existingStatuses.FirstOrDefault(s => string.Equals(s.Code, code, StringComparison.OrdinalIgnoreCase));
            if (row == null)
            {
                row = new WorkflowStatus { WorkflowKey = WorkflowKeys.Claim, Code = code };
                _db.WorkflowStatuses.Add(row);
                existingStatuses.Add(row);
            }
            row.Label = input.Label.Trim();
            row.SortOrder = input.SortOrder;
            row.IsFinal = input.IsFinal;
            row.IsActive = input.IsActive;
            row.UpdatedAt = now;
            row.UpdatedBy = request.UpdatedBy;
        }

        foreach (var input in request.Transitions)
        {
            var from = ClaimWorkflow.Normalize(input.From);
            var to = ClaimWorkflow.Normalize(input.To);
            var row = existingTransitions.FirstOrDefault(t =>
                string.Equals(t.FromCode, from, StringComparison.OrdinalIgnoreCase) && string.Equals(t.ToCode, to, StringComparison.OrdinalIgnoreCase));
            if (row == null)
            {
                row = new WorkflowTransition { WorkflowKey = WorkflowKeys.Claim, FromCode = from, ToCode = to };
                _db.WorkflowTransitions.Add(row);
                existingTransitions.Add(row);
            }
            row.AllowedRoles = string.Join(',', input.Roles.Select(r => r.Trim().ToLowerInvariant()).Distinct());
            row.IsActive = input.IsActive;
            row.UpdatedAt = now;
            row.UpdatedBy = request.UpdatedBy;
        }

        // Every transition must connect two known statuses (existing or added in this request).
        var codes = existingStatuses.Select(s => s.Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var unknown = existingTransitions
            .Where(t => !codes.Contains(t.FromCode) || !codes.Contains(t.ToCode))
            .Select(t => $"{t.FromCode} → {t.ToCode}").ToList();
        if (unknown.Count > 0)
            throw new ValidationException($"Statut inconnu dans la transition : {string.Join(", ", unknown)}.");

        await _db.SaveChangesAsync(ct);
        return await _mediator.Send(new GetClaimWorkflowQuery(), ct);
    }
}

public class SaveClaimWorkflowCommandValidator : AbstractValidator<SaveClaimWorkflowCommand>
{
    private static readonly System.Text.RegularExpressions.Regex CodePattern = new("^[A-Z][A-Z0-9_]{1,39}$");

    public SaveClaimWorkflowCommandValidator()
    {
        RuleFor(x => x.UpdatedBy).NotEmpty();
        RuleFor(x => x.Statuses).NotNull();
        RuleFor(x => x.Transitions).NotNull();

        RuleForEach(x => x.Statuses).ChildRules(s =>
        {
            s.RuleFor(i => ClaimWorkflow.Normalize(i.Code))
                .Matches(CodePattern).WithMessage("Le code d'un statut est en majuscules (lettres, chiffres, _), 2 à 40 caractères.");
            s.RuleFor(i => i.Label)
                .NotEmpty().WithMessage("Le libellé d'un statut est obligatoire.")
                .MaximumLength(100).WithMessage("Le libellé d'un statut ne doit pas dépasser 100 caractères.");
        });

        RuleForEach(x => x.Transitions).ChildRules(t =>
        {
            t.RuleFor(i => i.From).NotEmpty().WithMessage("Le statut de départ est obligatoire.");
            t.RuleFor(i => i.To).NotEmpty().WithMessage("Le statut d'arrivée est obligatoire.");
            t.RuleFor(i => i)
                .Must(i => ClaimWorkflow.Normalize(i.From) != ClaimWorkflow.Normalize(i.To))
                .WithMessage("Une transition doit relier deux statuts différents.");
            t.RuleFor(i => i.Roles)
                .Must(r => r != null && r.All(x => WorkflowRoles.All.Contains((x ?? string.Empty).Trim().ToLowerInvariant())))
                .WithMessage("Les rôles autorisés sont : user, admin, superadmin.");
            t.RuleFor(i => i)
                .Must(i => !i.IsActive || (i.Roles != null && i.Roles.Count > 0))
                .WithMessage("Une transition active doit autoriser au moins un rôle.");
        });
    }
}
