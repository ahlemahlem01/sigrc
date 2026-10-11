using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;

public record GetClaimsQuery(
    string? Status = null,
    string? AssignedToId = null,
    string? CreatedById = null,
    bool? HasAssignee = null,
    /// <summary>When set, returns claims assigned to OR created by this user (OR, not AND).</summary>
    string? RelatedToUserId = null,
    /// <summary>With AssignedToId: exclude claims also created by that same user (admin-assigned only).</summary>
    bool ExcludeSelfCreated = false,
    /// <summary>Admin (not superadmin): restrict to created, assigned, or same department.</summary>
    string? ScopeUserId = null
) : IRequest<List<Claim>>;

public class GetClaimsQueryHandler : IRequestHandler<GetClaimsQuery, List<Claim>>
{
    private readonly IApplicationDbContext _context;

    public GetClaimsQueryHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<Claim>> Handle(GetClaimsQuery request, CancellationToken cancellationToken)
    {
        var query = await BuildAsync(_context, request, cancellationToken);
        var list = await query
            .OrderByDescending(c => c.CreatedAt)
            .ThenBy(c => c.Id)
            .ToListAsync(cancellationToken);
        await ClaimVisibility.FillAsync(_context, list, cancellationToken);
        return list;
    }

    /// <summary>The filtered, unordered query: shared by the full list and the paged list.</summary>
    internal static async Task<IQueryable<Claim>> BuildAsync(IApplicationDbContext context, GetClaimsQuery request, CancellationToken cancellationToken)
    {
        var query = context.Claims.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(request.ScopeUserId))
            query = await ClaimVisibility.ApplyAsync(context, query, request.ScopeUserId, cancellationToken);

        if (!string.IsNullOrWhiteSpace(request.RelatedToUserId))
        {
            var userId = request.RelatedToUserId.Trim().ToLower();
            // Liste employé : uniquement créateur OU assigné (pas champion/CAPA — évite les « non assignés » parasites).
            query = query.Where(c =>
                (c.AssignedToId != null && c.AssignedToId.ToLower() == userId)
                || (c.CreatedById != null && c.CreatedById.ToLower() == userId));
        }
        else
        {
            if (!string.IsNullOrWhiteSpace(request.AssignedToId))
            {
                var assignee = request.AssignedToId.Trim();
                query = query.Where(c =>
                    c.AssignedToId != null
                    && c.AssignedToId.ToLower() == assignee.ToLower());

                if (request.ExcludeSelfCreated)
                {
                    var aid = assignee.ToLower();
                    query = query.Where(c =>
                        c.CreatedById == null
                        || c.CreatedById.ToLower() != aid);
                }
            }

            if (!string.IsNullOrWhiteSpace(request.CreatedById))
            {
                var creator = request.CreatedById.Trim();
                query = query.Where(c =>
                    c.CreatedById != null
                    && c.CreatedById.ToLower() == creator.ToLower());
            }
        }

        if (request.HasAssignee == true)
        {
            query = query.Where(c =>
                c.AssignedToId != null && c.AssignedToId != "");
        }
        else if (request.HasAssignee == false)
        {
            query = query.Where(c =>
                c.AssignedToId == null || c.AssignedToId == "");
        }

        if (!string.IsNullOrWhiteSpace(request.Status)
            && !string.Equals(request.Status, "all", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(c => c.StatusCode.ToUpper() == request.Status.ToUpper());
        }
        else if (string.IsNullOrWhiteSpace(request.AssignedToId)
                 && string.IsNullOrWhiteSpace(request.CreatedById)
                 && string.IsNullOrWhiteSpace(request.RelatedToUserId))
        {
            // Default list: exclude raw drafts (unless filtering by assignee/creator/related)
            query = query.Where(c => c.StatusCode != "DRAFT");
        }

        return query;
    }
}

public record ClaimsPage(List<Claim> Items, int Total, int Page, int PageSize);

/// <summary>One page of the same list (stable order: newest first, then id). Never more than <see cref="MaxPageSize"/> rows.</summary>
public record GetClaimsPageQuery(GetClaimsQuery Filter, int Page = 1, int PageSize = GetClaimsPageQuery.DefaultPageSize) : IRequest<ClaimsPage>
{
    public const int DefaultPageSize = 200;
    public const int MaxPageSize = 500;
}

public class GetClaimsPageQueryHandler : IRequestHandler<GetClaimsPageQuery, ClaimsPage>
{
    private readonly IApplicationDbContext _context;

    public GetClaimsPageQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<ClaimsPage> Handle(GetClaimsPageQuery request, CancellationToken cancellationToken)
    {
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, GetClaimsPageQuery.MaxPageSize);

        var query = await GetClaimsQueryHandler.BuildAsync(_context, request.Filter, cancellationToken);
        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(c => c.CreatedAt)
            .ThenBy(c => c.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);
        await ClaimVisibility.FillAsync(_context, items, cancellationToken);
        return new ClaimsPage(items, total, page, pageSize);
    }
}
