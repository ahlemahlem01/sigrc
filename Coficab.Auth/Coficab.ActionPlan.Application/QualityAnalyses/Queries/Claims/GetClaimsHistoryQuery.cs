using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;

public class GetClaimsHistoryQuery : IRequest<ClaimsHistoryPageDto>
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
    public string? Search { get; set; }
    public string? ClaimStatus { get; set; }
    public string? FiveWhyStatus { get; set; }
    public string? EightDStatus { get; set; }
    public int? EightDStep { get; set; }
    public string? IshikawaStatus { get; set; }
    public string? ClientId { get; set; }
    public string? DefectType { get; set; }
    public string? Severity { get; set; }
    public string? LotNumber { get; set; }
    public string? ProductionLine { get; set; }
    public string? Shift { get; set; }
    public string? CreatedBy { get; set; }
    public DateTime? CreatedFrom { get; set; }
    public DateTime? CreatedTo { get; set; }
    public DateTime? DetectedFrom { get; set; }
    public DateTime? DetectedTo { get; set; }
    public DateTime? UpdatedFrom { get; set; }
    public DateTime? UpdatedTo { get; set; }
    /// <summary>YES | NO | empty</summary>
    public string? HasCapa { get; set; }
    /// <summary>YES | NO | empty</summary>
    public string? HasFiveWhy { get; set; }
    /// <summary>YES | NO | empty</summary>
    public string? HasEightD { get; set; }
    public string? Sort { get; set; } = "updatedAt";
    public string? Dir { get; set; } = "desc";
    public bool IncludeDrafts { get; set; }
    /// <summary>open (claims not closed yet) | closed | empty (all).</summary>
    public string? Scope { get; set; }
    /// <summary>What needs attention: noFiveWhy | eightD | noCapa | capaLate. Counts of the four are always returned in the stats.</summary>
    public string? Focus { get; set; }
    /// <summary>When set, only claims related to this user (assignee / creator / champion / CAPA).</summary>
    public string? RelatedToUserId { get; set; }
    /// <summary>Admin (not superadmin): created, assigned, or same department.</summary>
    public string? ScopeUserId { get; set; }
    /// <summary>"id1,id2": the organizations the superadmin follows (empty: all).</summary>
    public string? OrganizationIds { get; set; }
}

public class ClaimsHistoryRowDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string DefectType { get; set; } = string.Empty;
    public string Severity { get; set; } = string.Empty;
    public string LotNumber { get; set; } = string.Empty;
    public string? SerialNumber { get; set; }
    public string StatusCode { get; set; } = string.Empty;
    public DateTime DetectionDate { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public DateTime? Deadline { get; set; }
    public DateTime? CompletedAt { get; set; }
    public bool? IsOnTime { get; set; }
    public string? CreatedBy { get; set; }
    public string? CreatedById { get; set; }
    public string? ProductionLine { get; set; }
    public string? Shift { get; set; }
    public int? ProducedQuantity { get; set; }
    public int? DefectiveQuantity { get; set; }
    public string? DescriptionPreview { get; set; }

    public Guid? FiveWhyId { get; set; }
    public string? FiveWhyStatus { get; set; }
    public string? ProblemStatement { get; set; }
    public string? RootCauseOccurrence { get; set; }
    public string? RootCauseDetection { get; set; }
    public string? FiveWhyValidatedBy { get; set; }
    public DateTime? FiveWhyValidatedAt { get; set; }
    public DateTime? FiveWhyUpdatedAt { get; set; }

    public Guid? EightDId { get; set; }
    public string? EightDStatus { get; set; }
    public int? EightDStep { get; set; }
    public string? ChampionName { get; set; }
    public bool ContainmentVerified { get; set; }
    public DateTime? EightDSubmittedAt { get; set; }
    public DateTime? EightDValidatedAt { get; set; }
    public DateTime? EightDClosedAt { get; set; }

    public Guid? IshikawaId { get; set; }
    public string? IshikawaStatus { get; set; }

    public Guid? CapaId { get; set; }
    public string? CapaTitle { get; set; }
    public string? CapaStatus { get; set; }
    public int CapaProgress { get; set; }
    public int CapaCount { get; set; }
}

public class ClaimsHistoryFacetsDto
{
    public List<string> Clients { get; set; } = [];
    public List<string> DefectTypes { get; set; } = [];
    public List<string> Severities { get; set; } = [];
    public List<string> ProductionLines { get; set; } = [];
    public List<string> Shifts { get; set; } = [];
    public List<string> CreatedBy { get; set; } = [];
}

public class ClaimsHistoryStatsDto
{
    public int Total { get; set; }
    public int FiveWhyDraft { get; set; }
    public int FiveWhyPending { get; set; }
    public int FiveWhyValidated { get; set; }
    public int FiveWhyRejected { get; set; }
    public int WithCapa { get; set; }
    public int EightDPending { get; set; }
    /// <summary>Claims of the scope without any 5 Why.</summary>
    public int NoFiveWhy { get; set; }
    /// <summary>Open claims whose 8D is not started, or not validated while the claim deadline has passed.</summary>
    public int EightDToHandle { get; set; }
    /// <summary>Claims in analysis without any CAPA plan.</summary>
    public int InAnalysisNoCapa { get; set; }
    /// <summary>Claims with a CAPA plan that is late (open plan with a deadline or an unfinished action past due).</summary>
    public int CapaLate { get; set; }
}

public class ClaimsHistoryPageDto
{
    public int Total { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public List<ClaimsHistoryRowDto> Items { get; set; } = [];
    public ClaimsHistoryFacetsDto Facets { get; set; } = new();
    public ClaimsHistoryStatsDto Stats { get; set; } = new();
}

public class GetClaimsHistoryQueryHandler : IRequestHandler<GetClaimsHistoryQuery, ClaimsHistoryPageDto>
{
    private readonly IApplicationDbContext _context;

    public GetClaimsHistoryQueryHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<ClaimsHistoryPageDto> Handle(GetClaimsHistoryQuery request, CancellationToken cancellationToken)
    {
        var page = request.Page < 1 ? 1 : request.Page;
        var pageSize = request.PageSize < 1 ? 25 : Math.Min(request.PageSize, 100);

        var claims = _context.Claims.AsNoTracking().Where(c => !c.IsArchived);
        if (!request.IncludeDrafts)
            claims = claims.Where(c => c.StatusCode != "DRAFT");
        if (!string.IsNullOrWhiteSpace(request.ScopeUserId))
            claims = await ClaimVisibility.ApplyAsync(_context, claims, request.ScopeUserId, cancellationToken);
        if (ClaimOrganizations.Parse(request.OrganizationIds) is { } followed)
            claims = await ClaimOrganizations.ApplyAsync(_context, claims, followed, cancellationToken);
        var facetSource = claims;

        if (!string.IsNullOrWhiteSpace(request.RelatedToUserId))
        {
            var userId = request.RelatedToUserId.Trim().ToLower();
            claims = claims.Where(c =>
                (c.AssignedToId != null && c.AssignedToId.ToLower() == userId)
                || (c.CreatedById != null && c.CreatedById.ToLower() == userId));
        }

        var search = request.Search?.Trim();
        if (!string.IsNullOrEmpty(search))
        {
            var term = search.ToLower();
            claims = claims.Where(c =>
                c.Title.ToLower().Contains(term) ||
                c.ClientId.ToLower().Contains(term) ||
                c.LotNumber.ToLower().Contains(term) ||
                c.DefectType.ToLower().Contains(term) ||
                (c.SerialNumber != null && c.SerialNumber.ToLower().Contains(term)) ||
                (c.ProductionLine != null && c.ProductionLine.ToLower().Contains(term)) ||
                (c.CreatedBy != null && c.CreatedBy.ToLower().Contains(term)) ||
                c.Id.ToString().ToLower().Contains(term));
        }

        if (!string.IsNullOrWhiteSpace(request.ClaimStatus))
        {
            var st = request.ClaimStatus.Trim().ToUpper();
            claims = claims.Where(c => c.StatusCode.ToUpper() == st);
        }

        var scope = request.Scope?.Trim().ToLowerInvariant();
        if (scope == "open")
            claims = claims.Where(c => !c.StatusCode.ToUpper().Contains("CLOTUR") && !c.StatusCode.ToUpper().Contains("CLOSED"));
        else if (scope == "closed")
            claims = claims.Where(c => c.StatusCode.ToUpper().Contains("CLOTUR") || c.StatusCode.ToUpper().Contains("CLOSED"));

        if (!string.IsNullOrWhiteSpace(request.ClientId))
            claims = claims.Where(c => c.ClientId == request.ClientId);
        if (!string.IsNullOrWhiteSpace(request.DefectType))
            claims = claims.Where(c => c.DefectType == request.DefectType);
        if (!string.IsNullOrWhiteSpace(request.Severity))
            claims = claims.Where(c => c.Severity == request.Severity);
        if (!string.IsNullOrWhiteSpace(request.LotNumber))
        {
            var lot = request.LotNumber.Trim().ToLower();
            claims = claims.Where(c => c.LotNumber.ToLower().Contains(lot));
        }
        if (!string.IsNullOrWhiteSpace(request.ProductionLine))
            claims = claims.Where(c => c.ProductionLine == request.ProductionLine);
        if (!string.IsNullOrWhiteSpace(request.Shift))
            claims = claims.Where(c => c.Shift == request.Shift);
        if (!string.IsNullOrWhiteSpace(request.CreatedBy))
            claims = claims.Where(c => c.CreatedBy == request.CreatedBy);

        var createdFrom = StartUtc(request.CreatedFrom);
        var createdTo = EndUtc(request.CreatedTo);
        var detectedFrom = StartUtc(request.DetectedFrom);
        var detectedTo = EndUtc(request.DetectedTo);
        var updatedFrom = StartUtc(request.UpdatedFrom);
        var updatedTo = EndUtc(request.UpdatedTo);

        if (createdFrom.HasValue)
            claims = claims.Where(c => c.CreatedAt >= createdFrom.Value);
        if (createdTo.HasValue)
            claims = claims.Where(c => c.CreatedAt < createdTo.Value);
        if (detectedFrom.HasValue)
            claims = claims.Where(c => c.DetectionDate >= detectedFrom.Value);
        if (detectedTo.HasValue)
            claims = claims.Where(c => c.DetectionDate < detectedTo.Value);
        if (updatedFrom.HasValue)
            claims = claims.Where(c => (c.UpdatedAt ?? c.CreatedAt) >= updatedFrom.Value);
        if (updatedTo.HasValue)
            claims = claims.Where(c => (c.UpdatedAt ?? c.CreatedAt) < updatedTo.Value);

        var fiveWhy = _context.FiveWhyAnalyses.AsNoTracking().Where(f => !f.IsArchived);
        var eightD = _context.EightDDossiers.AsNoTracking().Where(d => !d.IsArchived);
        var ishikawa = _context.IshikawaAnalyses.AsNoTracking().Where(i => !i.IsArchived);
        var capas = _context.ActionPlans.AsNoTracking().Where(p => p.ClaimId != null && !p.IsArchived);

        if (!string.IsNullOrWhiteSpace(request.FiveWhyStatus))
        {
            var fwSt = request.FiveWhyStatus.Trim().ToUpper();
            if (fwSt == "NONE")
                claims = claims.Where(c => !fiveWhy.Any(f => f.ClaimId == c.Id));
            else
                claims = claims.Where(c => fiveWhy
                    .Where(f => f.ClaimId == c.Id)
                    .OrderByDescending(f => f.LastModifiedAt ?? f.CreatedAt)
                    .Select(f => f.StatusCode.ToUpper())
                    .FirstOrDefault() == fwSt);
        }

        var hasFiveWhy = request.HasFiveWhy?.Trim().ToUpper();
        if (hasFiveWhy == "YES")
            claims = claims.Where(c => fiveWhy.Any(f => f.ClaimId == c.Id));
        else if (hasFiveWhy == "NO")
            claims = claims.Where(c => !fiveWhy.Any(f => f.ClaimId == c.Id));

        if (!string.IsNullOrWhiteSpace(request.EightDStatus))
        {
            var eSt = request.EightDStatus.Trim().ToUpper();
            if (eSt == "NONE")
                claims = claims.Where(c => !eightD.Any(d => d.ClaimId == c.Id));
            else
                claims = claims.Where(c => eightD.Any(d => d.ClaimId == c.Id && d.StatusCode.ToUpper() == eSt));
        }

        if (request.EightDStep is >= 1 and <= 8)
        {
            var step = request.EightDStep.Value;
            // CurrentStep = première étape incomplète. Dn terminée ⇔ CurrentStep > n (sauf D8).
            if (step >= 8)
            {
                claims = claims.Where(c => eightD.Any(d =>
                    d.ClaimId == c.Id && (
                        d.ClosedAt != null
                        || d.StatusCode.ToUpper() == "PENDING_VALIDATION"
                        || d.StatusCode.ToUpper() == "VALIDATED"
                        || d.StatusCode.ToUpper() == "CLOSED")));
            }
            else
            {
                claims = claims.Where(c => eightD.Any(d => d.ClaimId == c.Id && d.CurrentStep > step));
            }
        }

        var hasEightD = request.HasEightD?.Trim().ToUpper();
        if (hasEightD == "YES")
            claims = claims.Where(c => eightD.Any(d => d.ClaimId == c.Id));
        else if (hasEightD == "NO")
            claims = claims.Where(c => !eightD.Any(d => d.ClaimId == c.Id));

        if (!string.IsNullOrWhiteSpace(request.IshikawaStatus))
        {
            var iSt = request.IshikawaStatus.Trim().ToUpper();
            if (iSt == "NONE")
                claims = claims.Where(c => !ishikawa.Any(i => i.ClaimId == c.Id));
            else
                claims = claims.Where(c => ishikawa.Any(i => i.ClaimId == c.Id && i.StatusCode.ToUpper() == iSt));
        }

        var hasCapa = request.HasCapa?.Trim().ToUpper();
        if (hasCapa == "YES")
            claims = claims.Where(c => capas.Any(p => p.ClaimId == c.Id));
        else if (hasCapa == "NO")
            claims = claims.Where(c => !capas.Any(p => p.ClaimId == c.Id));

        var nowUtc = DateTime.UtcNow;
        var unfocused = claims;
        var finished = new[] { ActionProgress.Hundred, ActionProgress.Validated, ActionProgress.Cancelled };
        var openPlans = new[] { ActionPlanStatus.Created, ActionPlanStatus.Ongoing };
        var latePlans = capas.Where(p => openPlans.Contains(p.Status)
            && ((p.Deadline != null && p.Deadline < nowUtc && !p.PlanActions.Any(a => !a.IsArchived))
                || p.PlanActions.Any(a => !a.IsArchived && !finished.Contains(a.Progress) && a.Deadline != null && a.Deadline < nowUtc)));
        var focus = request.Focus?.Trim().ToLowerInvariant();
        claims = focus switch
        {
            "nofivewhy" => claims.Where(c => !fiveWhy.Any(f => f.ClaimId == c.Id)),
            "eightd" => claims.Where(c => !c.StatusCode.ToUpper().Contains("CLOTUR") && !c.StatusCode.ToUpper().Contains("CLOSED")
                && (!eightD.Any(d => d.ClaimId == c.Id)
                    || (c.Deadline != null && c.Deadline < nowUtc
                        && !eightD.Any(d => d.ClaimId == c.Id && (d.StatusCode.ToUpper() == "VALIDATED" || d.StatusCode.ToUpper() == "CLOSED"))))),
            "nocapa" => claims.Where(c => c.StatusCode.ToUpper().Contains("ANALYS") && !capas.Any(p => p.ClaimId == c.Id)),
            "capalate" => claims.Where(c => latePlans.Any(p => p.ClaimId == c.Id)),
            _ => claims,
        };

        var desc = !string.Equals(request.Dir, "asc", StringComparison.OrdinalIgnoreCase);
        var sort = (request.Sort ?? "updatedAt").Trim().ToLowerInvariant();
        claims = sort switch
        {
            "createdat" => desc ? claims.OrderByDescending(c => c.CreatedAt) : claims.OrderBy(c => c.CreatedAt),
            "detectiondate" => desc ? claims.OrderByDescending(c => c.DetectionDate) : claims.OrderBy(c => c.DetectionDate),
            "title" => desc ? claims.OrderByDescending(c => c.Title) : claims.OrderBy(c => c.Title),
            "clientid" => desc ? claims.OrderByDescending(c => c.ClientId) : claims.OrderBy(c => c.ClientId),
            "severity" => desc ? claims.OrderByDescending(c => c.Severity) : claims.OrderBy(c => c.Severity),
            "lotnumber" => desc ? claims.OrderByDescending(c => c.LotNumber) : claims.OrderBy(c => c.LotNumber),
            "statuscode" => desc ? claims.OrderByDescending(c => c.StatusCode) : claims.OrderBy(c => c.StatusCode),
            _ => desc
                ? claims.OrderByDescending(c => c.UpdatedAt ?? c.CreatedAt)
                : claims.OrderBy(c => c.UpdatedAt ?? c.CreatedAt),
        };

        var total = await claims.CountAsync(cancellationToken);

        var pageClaims = await claims
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(c => new ClaimsHistoryRowDto
            {
                Id = c.Id,
                Title = c.Title,
                ClientId = c.ClientId,
                DefectType = c.DefectType,
                Severity = c.Severity,
                LotNumber = c.LotNumber,
                SerialNumber = c.SerialNumber,
                StatusCode = c.StatusCode,
                DetectionDate = c.DetectionDate,
                CreatedAt = c.CreatedAt,
                UpdatedAt = c.UpdatedAt,
                Deadline = c.Deadline,
                CompletedAt = c.CompletedAt,
                IsOnTime = c.IsOnTime,
                CreatedBy = c.CreatedBy,
                CreatedById = c.CreatedById,
                ProductionLine = c.ProductionLine,
                Shift = c.Shift,
                ProducedQuantity = c.ProducedQuantity,
                DefectiveQuantity = c.DefectiveQuantity,
                DescriptionPreview = c.Description.Length <= 320 ? c.Description : c.Description.Substring(0, 320),
            })
            .ToListAsync(cancellationToken);

        var ids = pageClaims.Select(x => x.Id).ToList();
        if (ids.Count > 0)
        {
            var fwRows = await fiveWhy
                .Where(f => ids.Contains(f.ClaimId))
                .Select(f => new
                {
                    f.Id,
                    f.ClaimId,
                    f.StatusCode,
                    f.ProblemStatement,
                    f.RootCauseOccurrence,
                    f.RootCauseDetection,
                    f.ValidatedBy,
                    f.ValidatedAt,
                    f.LastModifiedAt,
                    f.CreatedAt,
                })
                .ToListAsync(cancellationToken);

            var e8Rows = await eightD
                .Where(d => ids.Contains(d.ClaimId))
                .Select(d => new
                {
                    d.Id,
                    d.ClaimId,
                    d.StatusCode,
                    d.CurrentStep,
                    d.ChampionName,
                    d.ContainmentVerified,
                    d.SubmittedAt,
                    d.ValidatedAt,
                    d.ClosedAt,
                })
                .ToListAsync(cancellationToken);

            var ishRows = await ishikawa
                .Where(i => ids.Contains(i.ClaimId))
                .Select(i => new { i.Id, i.ClaimId, i.StatusCode })
                .ToListAsync(cancellationToken);

            var capaRows = await capas
                .Where(p => ids.Contains(p.ClaimId!.Value))
                .Select(p => new { p.Id, p.ClaimId, p.Title, p.Status, p.Progress, p.CreatedAt })
                .ToListAsync(cancellationToken);

            foreach (var row in pageClaims)
            {
                var fw = fwRows
                    .Where(f => f.ClaimId == row.Id)
                    .OrderByDescending(f => f.LastModifiedAt ?? f.CreatedAt)
                    .FirstOrDefault();
                if (fw != null)
                {
                    row.FiveWhyId = fw.Id;
                    row.FiveWhyStatus = fw.StatusCode;
                    row.ProblemStatement = Clip(fw.ProblemStatement, 240);
                    row.RootCauseOccurrence = Clip(fw.RootCauseOccurrence, 200);
                    row.RootCauseDetection = Clip(fw.RootCauseDetection, 200);
                    row.FiveWhyValidatedBy = fw.ValidatedBy;
                    row.FiveWhyValidatedAt = fw.ValidatedAt;
                    row.FiveWhyUpdatedAt = fw.LastModifiedAt ?? fw.CreatedAt;
                }

                var e8 = e8Rows.FirstOrDefault(d => d.ClaimId == row.Id);
                if (e8 != null)
                {
                    row.EightDId = e8.Id;
                    row.EightDStatus = e8.StatusCode;
                    var closedClaim = row.StatusCode != null && (
                        row.StatusCode.Equals("CLOTUREE", StringComparison.OrdinalIgnoreCase)
                        || row.StatusCode.Equals("CLOSED", StringComparison.OrdinalIgnoreCase)
                        || row.StatusCode.Equals("CLOTURE", StringComparison.OrdinalIgnoreCase)
                        || row.StatusCode.Equals("CLOTURÉE", StringComparison.OrdinalIgnoreCase));
                    var closedEightD = string.Equals(e8.StatusCode, "CLOSED", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(e8.StatusCode, "VALIDATED", StringComparison.OrdinalIgnoreCase);
                    row.EightDStep = (closedClaim || closedEightD) ? 8 : e8.CurrentStep;
                    if (closedClaim && !closedEightD && string.Equals(e8.StatusCode, "IN_PROGRESS", StringComparison.OrdinalIgnoreCase))
                        row.EightDStatus = "CLOSED";
                    row.ChampionName = e8.ChampionName;
                    row.ContainmentVerified = e8.ContainmentVerified;
                    row.EightDSubmittedAt = e8.SubmittedAt;
                    row.EightDValidatedAt = e8.ValidatedAt;
                    row.EightDClosedAt = e8.ClosedAt ?? (closedClaim || closedEightD ? e8.ValidatedAt : null);
                }

                var ish = ishRows.FirstOrDefault(i => i.ClaimId == row.Id);
                if (ish != null)
                {
                    row.IshikawaId = ish.Id;
                    row.IshikawaStatus = ish.StatusCode;
                }

                var claimCapas = capaRows
                    .Where(p => p.ClaimId == row.Id)
                    .OrderByDescending(p => p.CreatedAt)
                    .ToList();
                row.CapaCount = claimCapas.Count;
                var capa = claimCapas.FirstOrDefault();
                if (capa != null)
                {
                    row.CapaId = capa.Id;
                    row.CapaTitle = capa.Title;
                    row.CapaStatus = capa.Status.ToString();
                    row.CapaProgress = capa.Progress;
                }
            }
        }

        var stats = new ClaimsHistoryStatsDto { Total = total };
        stats.NoFiveWhy = await unfocused.CountAsync(c => !fiveWhy.Any(f => f.ClaimId == c.Id), cancellationToken);
        stats.EightDToHandle = await unfocused.CountAsync(c => !c.StatusCode.ToUpper().Contains("CLOTUR") && !c.StatusCode.ToUpper().Contains("CLOSED")
            && (!eightD.Any(d => d.ClaimId == c.Id)
                || (c.Deadline != null && c.Deadline < nowUtc
                    && !eightD.Any(d => d.ClaimId == c.Id && (d.StatusCode.ToUpper() == "VALIDATED" || d.StatusCode.ToUpper() == "CLOSED")))), cancellationToken);
        stats.InAnalysisNoCapa = await unfocused.CountAsync(c => c.StatusCode.ToUpper().Contains("ANALYS") && !capas.Any(p => p.ClaimId == c.Id), cancellationToken);
        stats.CapaLate = await unfocused.CountAsync(c => latePlans.Any(p => p.ClaimId == c.Id), cancellationToken);
        if (total > 0)
        {
            var filteredIds = claims.Select(c => c.Id);
            stats.FiveWhyDraft = await fiveWhy.CountAsync(
                f => filteredIds.Contains(f.ClaimId) && f.StatusCode.ToUpper() == "DRAFT", cancellationToken);
            stats.FiveWhyPending = await fiveWhy.CountAsync(
                f => filteredIds.Contains(f.ClaimId) && f.StatusCode.ToUpper() == "PENDING_VALIDATION", cancellationToken);
            stats.FiveWhyValidated = await fiveWhy.CountAsync(
                f => filteredIds.Contains(f.ClaimId) && f.StatusCode.ToUpper() == "VALIDATED", cancellationToken);
            stats.FiveWhyRejected = await fiveWhy.CountAsync(
                f => filteredIds.Contains(f.ClaimId) &&
                     (f.StatusCode.ToUpper() == "REJECTED" || f.StatusCode.ToUpper().Contains("REJET")),
                cancellationToken);
            stats.WithCapa = await claims.CountAsync(c => capas.Any(p => p.ClaimId == c.Id), cancellationToken);
            stats.EightDPending = await eightD.CountAsync(
                d => filteredIds.Contains(d.ClaimId) && d.StatusCode.ToUpper() == "PENDING_VALIDATION", cancellationToken);
        }

        var facets = new ClaimsHistoryFacetsDto
        {
            Clients = await facetSource.Where(c => c.ClientId != "").Select(c => c.ClientId).Distinct().OrderBy(x => x).Take(300).ToListAsync(cancellationToken),
            DefectTypes = await facetSource.Where(c => c.DefectType != "").Select(c => c.DefectType).Distinct().OrderBy(x => x).Take(200).ToListAsync(cancellationToken),
            Severities = await facetSource.Where(c => c.Severity != "").Select(c => c.Severity).Distinct().OrderBy(x => x).Take(50).ToListAsync(cancellationToken),
            ProductionLines = await facetSource.Where(c => c.ProductionLine != null && c.ProductionLine != "").Select(c => c.ProductionLine!).Distinct().OrderBy(x => x).Take(200).ToListAsync(cancellationToken),
            Shifts = await facetSource.Where(c => c.Shift != null && c.Shift != "").Select(c => c.Shift!).Distinct().OrderBy(x => x).Take(50).ToListAsync(cancellationToken),
            CreatedBy = await facetSource.Where(c => c.CreatedBy != null && c.CreatedBy != "").Select(c => c.CreatedBy!).Distinct().OrderBy(x => x).Take(200).ToListAsync(cancellationToken),
        };

        var profiles = await _context.UserProfiles.AsNoTracking().Include(p => p.Department).ToListAsync(cancellationToken);
        var departments = await _context.Departments.AsNoTracking().ToListAsync(cancellationToken);
        var aliases = await ClaimVisibility.AliasesAsync(_context, cancellationToken);
        foreach (var row in pageClaims)
        {
            row.CreatedBy = ClaimVisibility.PersonName(profiles, row.CreatedById, row.CreatedBy, aliases);
            row.ProductionLine = ClaimVisibility.PlaceName(departments, row.ProductionLine);
        }
        facets.ProductionLines = facets.ProductionLines
            .Select(line => ClaimVisibility.PlaceName(departments, line) ?? line)
            .Distinct()
            .OrderBy(line => line)
            .ToList();
        facets.CreatedBy = facets.CreatedBy
            .Select(name => ClaimVisibility.LooksLikeId(name) ? ClaimVisibility.PersonName(profiles, name, name) : name)
            .Distinct()
            .OrderBy(name => name)
            .ToList();

        return new ClaimsHistoryPageDto
        {
            Total = total,
            Page = page,
            PageSize = pageSize,
            Items = pageClaims,
            Facets = facets,
            Stats = stats,
        };
    }

    private static string? Clip(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }

    private static DateTime? StartUtc(DateTime? value)
    {
        if (!value.HasValue) return null;
        var v = value.Value;
        if (v.Kind == DateTimeKind.Unspecified)
            v = DateTime.SpecifyKind(v.Date, DateTimeKind.Utc);
        else if (v.Kind == DateTimeKind.Local)
            v = v.ToUniversalTime();
        return v;
    }

    private static DateTime? EndUtc(DateTime? value)
    {
        var start = StartUtc(value);
        return start?.AddDays(1);
    }
}
