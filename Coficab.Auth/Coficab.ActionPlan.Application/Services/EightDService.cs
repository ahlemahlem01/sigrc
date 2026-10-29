using Coficab.ActionPlan.Application.DomainEvents;
using Coficab.ActionPlan.Application.DomainEvents.Events;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Common;
using Coficab.ActionPlan.Core.DTOs.ActionPlan;
using Coficab.ActionPlan.Core.DTOs.Claims;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Services;

public class EightDService : IEightDService
{
    private readonly IApplicationDbContext _db;
    private readonly IActionPlanService _actionPlanService;
    private readonly IQualityReportPdfService _pdfService;
    private readonly INotificationService _notifications;
    private readonly INotificationBroadcaster _realtime;
    private readonly IDomainEventPublisher _events;

    public EightDService(
        IApplicationDbContext db,
        IActionPlanService actionPlanService,
        IQualityReportPdfService pdfService,
        INotificationService notifications,
        INotificationBroadcaster realtime,
        IDomainEventPublisher events)
    {
        _db = db;
        _actionPlanService = actionPlanService;
        _pdfService = pdfService;
        _notifications = notifications;
        _realtime = realtime;
        _events = events;
    }

    public async Task<EightDDossierDto> GetOrCreateAsync(Guid claimId, string userId, CancellationToken ct = default)
    {
        var claim = await _db.Claims.FirstOrDefaultAsync(c => c.Id == claimId, ct)
            ?? throw new KeyNotFoundException("Réclamation introuvable.");

        var dossier = await _db.EightDDossiers.FirstOrDefaultAsync(d => d.ClaimId == claimId, ct);
        if (dossier == null)
        {
            dossier = new EightDDossier
            {
                ClaimId = claimId,
                CreatedBy = userId,
                EffectivenessMethod = "Contrôle sur 3 lots suivants",
                CustomerName = claim.ClientId
            };
            _db.EightDDossiers.Add(dossier);
            await _db.SaveChangesAsync(ct);
        }

        return await MapAndPersistAsync(dossier, claim, ct);
    }

    public async Task<EightDDossierDto?> PeekAsync(Guid claimId, CancellationToken ct = default)
    {
        var claim = await _db.Claims.AsNoTracking().FirstOrDefaultAsync(c => c.Id == claimId, ct);
        if (claim == null)
            return null;

        // Untracked (or not yet created) dossier: MapAsync may adjust its step in memory, nothing is saved.
        var dossier = await _db.EightDDossiers.AsNoTracking().FirstOrDefaultAsync(d => d.ClaimId == claimId, ct)
            ?? new EightDDossier { ClaimId = claimId, CustomerName = claim.ClientId };
        return await MapAsync(dossier, claim, ct);
    }

    public async Task<EightDDossierDto> SaveAsync(Guid claimId, SaveEightDDossierDto dto, string userId, CancellationToken ct = default)
    {
        var mapped = await GetOrCreateAsync(claimId, userId, ct);
        var dossier = await _db.EightDDossiers.FirstAsync(d => d.Id == mapped.Id, ct);

        if (dossier.StatusCode is "PENDING_VALIDATION" or "VALIDATED" or "CLOSED")
            throw new InvalidOperationException("Ce dossier 8D n'est plus modifiable.");

        await EnsureBaselineAsync(dossier, mapped, ct);

        ApplySave(dossier, dto, mapped, userId);
        dossier.UpdatedBy = userId;
        dossier.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        var claim = await _db.Claims.FirstAsync(c => c.Id == claimId, ct);
        var saved = await MapAndPersistAsync(dossier, claim, ct);
        await RecordVersionAsync(dossier, saved, EightDVersionEvents.Saved, userId, null, ct);
        return saved;
    }

    public async Task<EightDDossierDto> SubmitAsync(Guid claimId, string userId, CancellationToken ct = default)
    {
        var dto = await GetOrCreateAsync(claimId, userId, ct);
        if (!dto.CanSubmit)
            throw new InvalidOperationException("Le dossier 8D n'est pas complet (D1–D8, CAPA et preuves).");

        var dossier = await _db.EightDDossiers.FirstAsync(d => d.Id == dto.Id, ct);
        var claim = await _db.Claims.FirstAsync(c => c.Id == claimId, ct);
        await EnsureBaselineAsync(dossier, dto, ct);

        dossier.StatusCode = "PENDING_VALIDATION";
        dossier.SubmittedAt = DateTime.UtcNow;
        dossier.SubmittedById = userId;
        dossier.UpdatedBy = userId;
        dossier.UpdatedAt = DateTime.UtcNow;
        dossier.CurrentStep = 8;

        claim.StatusCode = "PENDING_VALIDATION";
        claim.UpdatedById = userId;
        claim.UpdatedAt = DateTime.UtcNow;

        await GenerateAndStorePdfAsync(dossier, claimId, ct);
        await _db.SaveChangesAsync(ct);

        await _notifications.NotifyAdminsAsync(
            "eight_d_pending_validation",
            "Dossier 8D à valider",
            $"Le dossier 8D « {claim.Title} » a été soumis pour validation finale.",
            actionPlanId: dto.CapaPlanId,
            claimId: claimId,
            linkPath: "/pages/front/quality-analyses/admin?tab=dossier");

        var submitted = await MapAndPersistAsync(dossier, claim, ct);
        await RecordVersionAsync(dossier, submitted, EightDVersionEvents.Submitted, userId, null, ct);
        return submitted;
    }

    public async Task<EightDDossierDto> ValidateAsync(Guid claimId, ValidateEightDDossierDto dto, string userId, CancellationToken ct = default)
    {
        var current = await GetOrCreateAsync(claimId, userId, ct);
        var dossier = await _db.EightDDossiers.FirstAsync(d => d.Id == current.Id, ct);
        var claim = await _db.Claims.FirstAsync(c => c.Id == claimId, ct);

        if (!string.Equals(dossier.StatusCode, "PENDING_VALIDATION", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Ce dossier n'est pas en attente de validation.");

        await EnsureBaselineAsync(dossier, current, ct);

        dossier.ValidatedAt = DateTime.UtcNow;
        dossier.ValidatedById = userId;
        dossier.ValidationComment = dto.Comment;
        dossier.UpdatedBy = userId;
        dossier.UpdatedAt = DateTime.UtcNow;

        var claimJustClosed = false;

        if (dto.IsApproved)
        {
            dossier.StatusCode = "CLOSED";
            dossier.ClosedAt = DateTime.UtcNow;
            dossier.ClosedById = userId;
            dossier.CurrentStep = 8;

            var previousStatus = claim.StatusCode;
            claim.StatusCode = "CLOTUREE";
            CompletionTracking.ApplyClaimCompletion(claim, previousStatus);
            claimJustClosed = !CompletionTracking.IsClosedClaimStatus(previousStatus);

            await GenerateAndStorePdfAsync(dossier, claimId, ct);
        }
        else
        {
            dossier.StatusCode = "REJECTED";
            dossier.EffectivenessValidated = false;
            claim.StatusCode = "EN_ANALYSE";
        }

        claim.UpdatedById = userId;
        claim.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        if (claimJustClosed)
        {
            try
            {
                await _events.PublishAsync(new ClaimClosedEvent(
                    claim.Id,
                    claim.DefectType,
                    claim.ProductionLine,
                    claim.Severity,
                    claim.AssignedToId,
                    claim.CreatedById,
                    claim.CompletedAt,
                    claim.IsOnTime,
                    userId,
                    DateTime.UtcNow), ct);
            }
            catch { /* domain events best-effort */ }
        }

        var recipient = dossier.SubmittedById ?? dossier.CreatedBy ?? claim.CreatedById;
        if (!string.IsNullOrWhiteSpace(recipient))
        {
            await _notifications.NotifyAsync(
                recipient,
                dto.IsApproved ? "eight_d_validated" : "eight_d_rejected",
                dto.IsApproved ? "Dossier 8D clôturé" : "Dossier 8D refusé",
                dto.IsApproved
                    ? $"Le dossier 8D « {claim.Title} » a été validé. Le PDF client est disponible."
                    : $"Le dossier 8D « {claim.Title} » a été renvoyé : {dto.Comment ?? "compléter les étapes manquantes"}.",
                actionPlanId: current.CapaPlanId,
                claimId: claimId,
                linkPath: $"/pages/front/quality-analyses/8d/{claimId}");
        }

        var recipients = new List<string>();
        if (!string.IsNullOrWhiteSpace(recipient)) recipients.Add(recipient);
        if (!string.IsNullOrWhiteSpace(claim.AssignedToId)) recipients.Add(claim.AssignedToId);
        if (!string.IsNullOrWhiteSpace(claim.CreatedById)) recipients.Add(claim.CreatedById);
        try
        {
            await _realtime.SendDossierStatusChangedAsync(
                new DossierRealtimeEvent("eight_d", claimId, current.CapaPlanId, dossier.StatusCode, claim.Title, claim.AssignedToId),
                recipients,
                includeAdmins: true);
        }
        catch
        {
            // Realtime is best-effort.
        }

        var validated = await MapAndPersistAsync(dossier, claim, ct);
        await RecordVersionAsync(dossier, validated, dto.IsApproved ? EightDVersionEvents.Approved : EightDVersionEvents.Rejected, userId, dto.Comment, ct);
        return validated;
    }

    public async Task<IReadOnlyList<EightDDossierDto>> GetPendingAsync(CancellationToken ct = default)
    {
        var dossiers = await _db.EightDDossiers
            .Where(d => d.StatusCode == "PENDING_VALIDATION")
            .OrderBy(d => d.SubmittedAt)
            .ToListAsync(ct);

        var result = new List<EightDDossierDto>();
        foreach (var dossier in dossiers)
        {
            var claim = await _db.Claims.FirstOrDefaultAsync(c => c.Id == dossier.ClaimId, ct);
            if (claim == null) continue;
            result.Add(await MapAsync(dossier, claim, ct));
        }
        return result;
    }

    public async Task<byte[]> GetOrGenerateCustomerPdfAsync(Guid claimId, string userId, CancellationToken ct = default)
    {
        var dto = await GetOrCreateAsync(claimId, userId, ct);
        var dossier = await _db.EightDDossiers.FirstAsync(d => d.Id == dto.Id, ct);
        if (dossier.CustomerPdfData is { Length: > 0 })
            return dossier.CustomerPdfData;

        await GenerateAndStorePdfAsync(dossier, claimId, ct);
        await _db.SaveChangesAsync(ct);
        return dossier.CustomerPdfData ?? Array.Empty<byte>();
    }

    public async Task<byte[]> RegenerateCustomerPdfAsync(Guid claimId, string userId, CancellationToken ct = default)
    {
        var dto = await GetOrCreateAsync(claimId, userId, ct);
        var dossier = await _db.EightDDossiers.FirstAsync(d => d.Id == dto.Id, ct);
        await GenerateAndStorePdfAsync(dossier, claimId, ct);
        await _db.SaveChangesAsync(ct);
        return dossier.CustomerPdfData ?? Array.Empty<byte>();
    }

    private async Task GenerateAndStorePdfAsync(EightDDossier dossier, Guid claimId, CancellationToken ct)
    {
        var pdf = await _pdfService.GenerateQualityReportPdfAsync(claimId, ct);
        dossier.CustomerPdfData = pdf;
        dossier.CustomerPdfGeneratedAt = DateTime.UtcNow;
    }

    private static void ApplySave(EightDDossier dossier, SaveEightDDossierDto dto, EightDDossierDto gates, string userId)
    {
        var parsed = EightDContainmentPlan.Parse(dossier.ContainmentDescription);
        var originals = EightDContainmentPlan.CaptureOriginals(parsed.FieldOriginals, new Dictionary<string, string?>
        {
            ["championName"] = FirstNonEmpty(dto.ChampionName, dossier.ChampionName),
            ["teamMembers"] = FirstNonEmpty(dto.TeamMembers, dossier.TeamMembers),
            ["containmentOwner"] = FirstNonEmpty(dto.ContainmentOwner, dossier.ContainmentOwner),
            ["containmentNotes"] = FirstNonEmpty(dto.ContainmentNotes, parsed.Notes),
            ["effectivenessMethod"] = FirstNonEmpty(dto.EffectivenessMethod, dossier.EffectivenessMethod),
            ["lotsChecked"] = dto.LotsChecked?.ToString() ?? dossier.LotsChecked?.ToString(),
            ["defectsFound"] = dto.DefectsFound?.ToString() ?? dossier.DefectsFound?.ToString(),
            ["effectivenessNotes"] = FirstNonEmpty(dto.EffectivenessNotes, dossier.EffectivenessNotes),
            ["preventiveDescription"] = FirstNonEmpty(dto.PreventiveDescription, dossier.PreventiveDescription),
            ["preventiveScope"] = FirstNonEmpty(dto.PreventiveScope, dossier.PreventiveScope),
            ["congratulationsNote"] = FirstNonEmpty(dto.CongratulationsNote, dossier.CongratulationsNote),
            ["customerName"] = FirstNonEmpty(dto.CustomerName, dossier.CustomerName)
        });

        if (dto.ChampionId != null) dossier.ChampionId = dto.ChampionId;
        if (dto.ChampionName != null) dossier.ChampionName = dto.ChampionName;
        if (dto.TeamMembers != null) dossier.TeamMembers = dto.TeamMembers;
        if (!string.IsNullOrWhiteSpace(dossier.ChampionName) || !string.IsNullOrWhiteSpace(dossier.TeamMembers))
            dossier.TeamFormedAt ??= DateTime.UtcNow;

        var d1Ok = !string.IsNullOrWhiteSpace(dossier.ChampionName) || !string.IsNullOrWhiteSpace(dossier.TeamMembers);
        var d2Ok = d1Ok
                   && !string.IsNullOrWhiteSpace(gates.ClaimTitle)
                   && !string.IsNullOrWhiteSpace(gates.Description);

        if (d1Ok && d2Ok)
        {
            if (dto.ContainmentActions != null || dto.ContainmentNotes != null)
            {
                dossier.ContainmentDescription = EightDContainmentPlan.Serialize(
                    dto.ContainmentActions ?? parsed.Actions,
                    dto.ContainmentNotes ?? parsed.Notes,
                    originals,
                    parsed.Actions);
                var after = EightDContainmentPlan.Parse(dossier.ContainmentDescription);
                if (after.Actions.Any(a =>
                        string.Equals(a.Status, "DONE", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(a.Status, "DOING", StringComparison.OrdinalIgnoreCase)))
                    dossier.ContainmentImplementedAt ??= DateTime.UtcNow;
            }
            else if (dto.ContainmentDescription != null)
            {
                dossier.ContainmentDescription = dto.ContainmentDescription;
            }

            if (dto.ContainmentOwner != null) dossier.ContainmentOwner = dto.ContainmentOwner;
            if (dto.ContainmentImplementedAt.HasValue) dossier.ContainmentImplementedAt = dto.ContainmentImplementedAt;
            if (dto.ContainmentVerified.HasValue) dossier.ContainmentVerified = dto.ContainmentVerified.Value;
        }
        else if (originals.Count > 0)
        {
            dossier.ContainmentDescription = EightDContainmentPlan.Serialize(
                parsed.Actions, parsed.Notes, originals, parsed.Actions);
        }

        var d3Ok = EightDContainmentPlan.IsComplete(
            EightDContainmentPlan.Parse(dossier.ContainmentDescription).Actions,
            dossier.ContainmentOwner,
            dossier.ContainmentVerified);
        var d4Ok = gates.Steps.FirstOrDefault(s => s.Step == 4)?.Complete == true;
        var d5Ok = gates.CapaPlanValidated;

        if (d5Ok)
        {
            if (dto.EffectivenessMethod != null) dossier.EffectivenessMethod = dto.EffectivenessMethod;
            if (dto.LotsChecked.HasValue) dossier.LotsChecked = dto.LotsChecked;
            if (dto.DefectsFound.HasValue) dossier.DefectsFound = dto.DefectsFound;
            if (dto.EffectivenessNotes != null) dossier.EffectivenessNotes = dto.EffectivenessNotes;
            if (dto.EffectivenessValidated.HasValue)
            {
                dossier.EffectivenessValidated = dto.EffectivenessValidated.Value;
                dossier.EffectivenessValidatedAt = dto.EffectivenessValidated.Value ? DateTime.UtcNow : null;
            }
        }

        var d6Ok = dossier.EffectivenessValidated
                   && (dossier.LotsChecked ?? 0) > 0
                   && (dossier.DefectsFound ?? 0) == 0;
        if (d6Ok)
        {
            if (dto.PreventiveDescription != null) dossier.PreventiveDescription = dto.PreventiveDescription;
            if (dto.PreventiveScope != null) dossier.PreventiveScope = dto.PreventiveScope;
            if (dto.PreventiveStandardized.HasValue)
            {
                dossier.PreventiveStandardized = dto.PreventiveStandardized.Value;
                if (dto.PreventiveStandardized.Value)
                    dossier.PreventiveCompletedAt = DateTime.UtcNow;
            }
        }

        var d7Ok = !string.IsNullOrWhiteSpace(dossier.PreventiveDescription) && dossier.PreventiveStandardized;
        if (d7Ok)
        {
            if (dto.CongratulationsNote != null) dossier.CongratulationsNote = dto.CongratulationsNote;
            if (dto.CustomerName != null) dossier.CustomerName = dto.CustomerName;
            // D8 note only — clôture réelle via Submit + Validate admin.
        }

        _ = (d3Ok, d4Ok);
    }

    // ─── Version history ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Appends a snapshot of the dossier. A "saved" version is only written when something changed; submission and validation
    /// always leave a version. The first version of a dossier is its state before the change (baseline).
    /// </summary>
    private async Task RecordVersionAsync(EightDDossier dossier, EightDDossierDto state, string eventType, string? userId, string? comment, CancellationToken ct)
    {
        var snapshot = EightDVersioning.From(state);
        var last = await _db.EightDVersions.AsNoTracking()
            .Where(v => v.DossierId == dossier.Id)
            .OrderByDescending(v => v.VersionNumber)
            .FirstOrDefaultAsync(ct);

        var previous = last == null ? null : EightDVersioning.Deserialize(last.SnapshotJson);
        var changes = EightDVersioning.Diff(previous, snapshot);
        var always = eventType != EightDVersionEvents.Saved;
        if (!always && last != null && changes.Count == 0) return;

        _db.EightDVersions.Add(new EightDVersion
        {
            DossierId = dossier.Id,
            ClaimId = dossier.ClaimId,
            VersionNumber = (last?.VersionNumber ?? 0) + 1,
            EventType = eventType,
            SavedAt = DateTime.UtcNow,
            SavedById = userId,
            StatusCode = snapshot.StatusCode,
            CurrentStep = snapshot.CurrentStep,
            ChangedFields = string.Join(',', changes.Select(c => c.Field)),
            Comment = string.IsNullOrWhiteSpace(comment) ? null : comment.Trim(),
            SnapshotJson = EightDVersioning.Serialize(snapshot),
        });
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>Records the state before a change as version 1 when the dossier has no history yet.</summary>
    private async Task EnsureBaselineAsync(EightDDossier dossier, EightDDossierDto state, CancellationToken ct)
    {
        if (await _db.EightDVersions.AnyAsync(v => v.DossierId == dossier.Id, ct)) return;
        await RecordVersionAsync(dossier, state, EightDVersionEvents.Baseline, dossier.UpdatedBy ?? dossier.CreatedBy, null, ct);
    }

    public async Task<IReadOnlyList<EightDVersionSummaryDto>> GetVersionsAsync(Guid claimId, CancellationToken ct = default)
    {
        var dossier = await _db.EightDDossiers.FirstOrDefaultAsync(d => d.ClaimId == claimId, ct);
        if (dossier == null) return Array.Empty<EightDVersionSummaryDto>();

        if (!await _db.EightDVersions.AnyAsync(v => v.DossierId == dossier.Id, ct))
        {
            // Dossier created before versioning existed: its current state becomes version 1.
            var claim = await _db.Claims.IgnoreQueryFilters().FirstOrDefaultAsync(c => c.Id == claimId, ct);
            if (claim != null)
            {
                var state = await MapAsync(dossier, claim, ct);
                _db.EightDVersions.Add(new EightDVersion
                {
                    DossierId = dossier.Id, ClaimId = claimId, VersionNumber = 1, EventType = EightDVersionEvents.Baseline,
                    SavedAt = dossier.UpdatedAt ?? dossier.CreatedAt, SavedById = dossier.UpdatedBy ?? dossier.CreatedBy,
                    StatusCode = state.StatusCode, CurrentStep = state.CurrentStep,
                    ChangedFields = string.Join(',', EightDVersioning.Diff(null, EightDVersioning.From(state)).Select(c => c.Field)),
                    SnapshotJson = EightDVersioning.Serialize(EightDVersioning.From(state)),
                });
                await _db.SaveChangesAsync(ct);
            }
        }

        var versions = await _db.EightDVersions.AsNoTracking()
            .Where(v => v.DossierId == dossier.Id)
            .OrderByDescending(v => v.VersionNumber)
            .ToListAsync(ct);
        var names = await NamesAsync(versions.Select(v => v.SavedById), ct);
        var latest = versions.Count == 0 ? 0 : versions[0].VersionNumber;
        return versions.Select(v => ToSummary(v, names, latest)).ToList();
    }

    public async Task<EightDVersionDetailDto?> GetVersionAsync(Guid claimId, int version, CancellationToken ct = default)
    {
        var versions = await GetVersionsAsync(claimId, ct);
        var summary = versions.FirstOrDefault(v => v.Version == version);
        if (summary == null) return null;

        var dossierId = await _db.EightDDossiers.Where(d => d.ClaimId == claimId).Select(d => d.Id).FirstAsync(ct);
        var rows = await _db.EightDVersions.AsNoTracking()
            .Where(v => v.DossierId == dossierId && v.VersionNumber <= version && v.VersionNumber >= version - 1)
            .ToListAsync(ct);
        var current = rows.First(v => v.VersionNumber == version);
        var before = rows.FirstOrDefault(v => v.VersionNumber == version - 1);

        return new EightDVersionDetailDto
        {
            Version = summary.Version, EventType = summary.EventType, SavedAt = summary.SavedAt, SavedById = summary.SavedById,
            SavedByName = summary.SavedByName, StatusCode = summary.StatusCode, CurrentStep = summary.CurrentStep,
            ChangedFields = summary.ChangedFields, Comment = summary.Comment, IsCurrent = summary.IsCurrent,
            Changes = EightDVersioning.Diff(
                before == null ? null : EightDVersioning.Deserialize(before.SnapshotJson),
                EightDVersioning.Deserialize(current.SnapshotJson)),
        };
    }

    private static EightDVersionSummaryDto ToSummary(EightDVersion v, Dictionary<string, string> names, int latest) => new()
    {
        Version = v.VersionNumber,
        EventType = v.EventType,
        SavedAt = v.SavedAt,
        SavedById = v.SavedById,
        SavedByName = v.SavedById != null && names.TryGetValue(v.SavedById, out var name) ? name : null,
        StatusCode = v.StatusCode,
        CurrentStep = v.CurrentStep,
        ChangedFields = v.ChangedFields.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList(),
        Comment = v.Comment,
        IsCurrent = v.VersionNumber == latest,
    };

    private async Task<Dictionary<string, string>> NamesAsync(IEnumerable<string?> userIds, CancellationToken ct)
    {
        var ids = userIds.Where(i => !string.IsNullOrWhiteSpace(i)).Select(i => i!).Distinct().ToList();
        if (ids.Count == 0) return new Dictionary<string, string>();
        var profiles = await _db.UserProfiles.AsNoTracking().Where(p => ids.Contains(p.UserId)).ToListAsync(ct);
        return profiles
            .Where(p => !string.IsNullOrWhiteSpace(p.Name))
            .GroupBy(p => p.UserId)
            .ToDictionary(g => g.Key, g => g.First().Name!);
    }

    private static string? FirstNonEmpty(params string?[] values)
        => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));

    private async Task<EightDDossierDto> MapAndPersistAsync(EightDDossier dossier, Claim claim, CancellationToken ct)
    {
        var previousStep = dossier.CurrentStep;
        var previousStatus = dossier.StatusCode;
        var dto = await MapAsync(dossier, claim, ct);
        if (dossier.CurrentStep != previousStep || !string.Equals(dossier.StatusCode, previousStatus, StringComparison.Ordinal))
            await _db.SaveChangesAsync(ct);
        return dto;
    }

    private async Task<EightDDossierDto> MapAsync(EightDDossier dossier, Claim claim, CancellationToken ct)
    {
        var fiveWhy = await _db.FiveWhyAnalyses
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.ClaimId == claim.Id, ct);
        var ishikawaCount = await _db.IshikawaCauses.CountAsync(c => c.ClaimId == claim.Id, ct);
        var plans = (await _actionPlanService.GetByClaimIdAsync(claim.Id)).ToList();
        var plan = plans.FirstOrDefault();

        var capaActions = new List<EightDCapaActionSummaryDto>();
        if (plan != null)
        {
            var actions = await _db.PlanActions
                .Include(a => a.Documents)
                .Where(a => a.ActionPlanId == plan.Id)
                .OrderBy(a => a.Order)
                .ToListAsync(ct);

            capaActions = actions.Select(a =>
            {
                var proofs = a.Documents?.Count(d => !d.IsArchived) ?? 0;
                var done = a.Progress is ActionProgress.Hundred or ActionProgress.Validated;
                return new EightDCapaActionSummaryDto
                {
                    Id = a.Id,
                    Title = a.Title,
                    Progress = (int)a.Progress,
                    AssignedToId = a.AssignedToId,
                    Deadline = a.Deadline,
                    ProofCount = proofs,
                    Done = done
                };
            }).ToList();
        }

        var fiveWhyOk = fiveWhy != null
            && !string.IsNullOrWhiteSpace(fiveWhy.RootCauseOccurrence)
            && !string.IsNullOrWhiteSpace(fiveWhy.RootCauseDetection);
        var ishikawaOk = ishikawaCount > 0;
        var d4Validated = string.Equals(fiveWhy?.StatusCode, "VALIDATED", StringComparison.OrdinalIgnoreCase)
                          || (fiveWhy?.IsValidated ?? false);
        var d4Ok = fiveWhyOk && ishikawaOk && d4Validated;
        var d5Created = plan != null;
        var d5Done = d5Created && capaActions.Count > 0 && capaActions.All(a => a.Done);
        var d5Proofs = d5Created && capaActions.Count > 0 && capaActions.All(a => a.ProofCount > 0);
        var d5Validated = d5Created && plan!.Status == ActionPlanStatus.Closed;
        var d5Ok = d5Created && d5Done && d5Proofs && d5Validated;

        var parsedPlan = EightDContainmentPlan.Parse(dossier.ContainmentDescription);
        var containmentActions = parsedPlan.Actions;
        var containmentNotes = parsedPlan.Notes;
        var d1Ok = !string.IsNullOrWhiteSpace(dossier.ChampionName) || !string.IsNullOrWhiteSpace(dossier.TeamMembers);
        var d2Ok = d1Ok && !string.IsNullOrWhiteSpace(claim.Title) && !string.IsNullOrWhiteSpace(claim.Description);
        var d3Ok = containmentActions.Count > 0
            ? EightDContainmentPlan.IsComplete(containmentActions, dossier.ContainmentOwner, dossier.ContainmentVerified)
            : !string.IsNullOrWhiteSpace(dossier.ContainmentDescription) && dossier.ContainmentVerified
              && !dossier.ContainmentDescription.TrimStart().StartsWith('{');
        var d6Ok = dossier.EffectivenessValidated
                   && (dossier.LotsChecked ?? 0) > 0
                   && (dossier.DefectsFound ?? 0) == 0;
        var d7Ok = !string.IsNullOrWhiteSpace(dossier.PreventiveDescription) && dossier.PreventiveStandardized;
        var d8Ok = !string.IsNullOrWhiteSpace(dossier.CongratulationsNote);

        var u1 = true;
        var u2 = d1Ok;
        var u3 = d1Ok && d2Ok;
        var u4 = d1Ok && d2Ok && d3Ok;
        var u5 = u4 && d4Ok;
        var u6 = u5 && d5Ok;
        var u7 = u6 && d6Ok;
        var u8 = u7 && d7Ok;

        var steps = new List<EightDStepGateDto>
        {
            Gate(1, "D1", "Équipe", d1Ok, u1, d1Ok ? null : "Nommez le pilote et l'équipe avant de continuer."),
            Gate(2, "D2", "Problème", d2Ok, u2, u2 ? null : "Terminez D1 (équipe) pour ouvrir le constat."),
            Gate(3, "D3", "Confinement", d3Ok, u3, u3 ? (d3Ok ? null : "Pilotez les actions immédiates puis vérifiez.") : "Terminez D1 et D2 pour dégeler le confinement."),
            Gate(4, "D4", "Cause racine", d4Ok, u4,
                !u4 ? "Le confinement (D3) doit être terminé avant la recherche de cause."
                : !fiveWhyOk || !ishikawaOk ? "Compléter 5 Why (2 branches) et Ishikawa."
                : !d4Validated ? "En attente de validation admin du 5 Why (D4)."
                : null),
            Gate(5, "D5", "CAPA", d5Ok, u5,
                !u5 ? "Valider d'abord le 5 Why (D4)."
                : !d5Created ? "Créer le plan CAPA depuis le 5 Why."
                : !d5Done ? "Terminer toutes les sous-actions CAPA."
                : !d5Proofs ? "Joindre une preuve à chaque sous-action CAPA."
                : !d5Validated ? "En attente de validation admin du plan CAPA (D5)."
                : null),
            Gate(6, "D6", "Efficacité", d6Ok, u6,
                !u6 ? "Le D6 s'ouvre après validation admin du plan CAPA (D5)."
                : d6Ok ? null
                : "Contrôler les lots suivants (0 défaut) puis valider l'efficacité."),
            Gate(7, "D7", "Préventif", d7Ok, u7, !u7 ? "Terminez D6 (0 défaut) avant le préventif." : d7Ok ? null : "Étendre le plan de contrôle / standardiser."),
            Gate(8, "D8", "Clôture", d8Ok, u8, !u8 ? "Terminez D7 avant la clôture." : d8Ok ? null : "Note de clôture + générer le PDF client."),
        };

        var current = steps.FirstOrDefault(s => !s.Complete)?.Step ?? 8;
        var closedEightD = dossier.StatusCode is "CLOSED" or "VALIDATED";
        var closedClaim = CompletionTracking.IsClosedClaimStatus(claim.StatusCode);
        var claimStatus = (claim.StatusCode ?? string.Empty).Trim().ToUpperInvariant();
        // Claim VALIDATED / PENDING_VALIDATION must unlock the rail even if the
        // 8D dossier StatusCode lagged behind (e.g. still IN_PROGRESS).
        var claimPastGates = closedClaim
            || claimStatus is "VALIDATED" or "PENDING_VALIDATION";
        if (closedEightD || claimPastGates)
        {
            current = 8;
            steps = steps.Select(s => Gate(s.Step, s.Code, s.Label, true, true, null)).ToList();
            if (closedClaim && !closedEightD && dossier.StatusCode is "IN_PROGRESS" or "PENDING_VALIDATION" or "REJECTED")
            {
                dossier.StatusCode = "CLOSED";
                dossier.ClosedAt ??= claim.CompletedAt ?? DateTime.UtcNow;
            }
            else if (claimStatus == "VALIDATED" && dossier.StatusCode is "IN_PROGRESS" or "REJECTED")
            {
                dossier.StatusCode = "VALIDATED";
            }
            else if (claimStatus == "PENDING_VALIDATION" && dossier.StatusCode == "IN_PROGRESS")
            {
                dossier.StatusCode = "PENDING_VALIDATION";
            }
        }
        dossier.CurrentStep = current;

        var locked = dossier.StatusCode is "PENDING_VALIDATION" or "VALIDATED" or "CLOSED";
        var canSubmit = steps.All(s => s.Complete) && !locked && dossier.StatusCode != "PENDING_VALIDATION";

        return new EightDDossierDto
        {
            Id = dossier.Id,
            ClaimId = claim.Id,
            ClaimTitle = claim.Title,
            ClaimStatus = claim.StatusCode ?? string.Empty,
            ClientId = claim.ClientId,
            DefectType = claim.DefectType,
            LotNumber = claim.LotNumber,
            Description = claim.Description,
            ProducedQuantity = claim.ProducedQuantity,
            DefectiveQuantity = claim.DefectiveQuantity,
            CurrentStep = current,
            StatusCode = dossier.StatusCode,
            ChampionId = dossier.ChampionId,
            ChampionName = dossier.ChampionName,
            TeamMembers = dossier.TeamMembers,
            TeamFormedAt = dossier.TeamFormedAt,
            ContainmentDescription = dossier.ContainmentDescription,
            ContainmentOwner = dossier.ContainmentOwner,
            ContainmentImplementedAt = dossier.ContainmentImplementedAt,
            ContainmentVerified = dossier.ContainmentVerified,
            ContainmentNotes = containmentNotes,
            ContainmentActions = containmentActions,
            FieldOriginals = parsedPlan.FieldOriginals,
            EffectivenessMethod = dossier.EffectivenessMethod,
            LotsChecked = dossier.LotsChecked,
            DefectsFound = dossier.DefectsFound,
            EffectivenessNotes = dossier.EffectivenessNotes,
            EffectivenessValidated = dossier.EffectivenessValidated,
            EffectivenessValidatedAt = dossier.EffectivenessValidatedAt,
            PreventiveDescription = dossier.PreventiveDescription,
            PreventiveScope = dossier.PreventiveScope,
            PreventiveStandardized = dossier.PreventiveStandardized,
            PreventiveCompletedAt = dossier.PreventiveCompletedAt,
            CongratulationsNote = dossier.CongratulationsNote,
            CustomerName = dossier.CustomerName,
            ClosedAt = dossier.ClosedAt,
            ClosedById = dossier.ClosedById,
            CustomerPdfGeneratedAt = dossier.CustomerPdfGeneratedAt,
            HasCustomerPdf = dossier.CustomerPdfData is { Length: > 0 },
            SubmittedAt = dossier.SubmittedAt,
            SubmittedById = dossier.SubmittedById,
            ValidatedAt = dossier.ValidatedAt,
            ValidatedById = dossier.ValidatedById,
            ValidationComment = dossier.ValidationComment,
            FiveWhyComplete = fiveWhyOk,
            IshikawaComplete = ishikawaOk,
            CapaPlanId = plan?.Id,
            CapaPlanTitle = plan?.Title,
            CapaActionsDone = d5Done,
            CapaProofsComplete = d5Proofs,
            CapaPlanValidated = d5Validated,
            CanSubmit = canSubmit,
            CanValidate = dossier.StatusCode == "PENDING_VALIDATION",
            Steps = steps,
            CapaActions = capaActions
        };
    }

    private static EightDStepGateDto Gate(int step, string code, string label, bool complete, bool unlocked, string? hint)
        => new()
        {
            Step = step,
            Code = code,
            Label = label,
            Complete = complete,
            Unlocked = unlocked,
            Hint = hint
        };
}
