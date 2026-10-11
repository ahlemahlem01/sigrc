using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Coficab.ActionPlan.Application.Services;

public class QualityReportPdfService : IQualityReportPdfService
{
    private readonly IApplicationDbContext _context;

    public QualityReportPdfService(IApplicationDbContext context)
    {
        _context = context;
        QuestPDF.Settings.License = LicenseType.Community;
    }

    private sealed class PriorityCauseRow
    {
        public string? Category { get; set; }
        public string CauseText { get; set; } = string.Empty;
        public string Source { get; set; } = string.Empty;
        public DateTime SelectedAt { get; set; }
    }

    /// <summary>Current priority cause, if any.</summary>
    private Task<PriorityCauseRow?> LoadPriorityCauseAsync(Guid claimId, CancellationToken ct) =>
        _context.PriorityCauses.AsNoTracking()
            .Where(p => p.ClaimId == claimId && p.IsCurrent)
            .Select(p => new PriorityCauseRow { Category = p.Category, CauseText = p.CauseText, Source = p.Source, SelectedAt = p.SelectedAt })
            .FirstOrDefaultAsync(ct);

    private static string SourceLabel(string source) => source switch
    {
        "mining" => "suggestion de l'historique des dossiers",
        "pareto" => "depuis le Pareto",
        "ishikawa" => "reprise de l'Ishikawa",
        _ => "choix de l'analyste",
    };

    private static string CategoryLabel(string category) => category switch
    {
        "Manpower" => "Main-d'œuvre",
        "Machine" => "Machine",
        "Material" => "Matière",
        "Method" => "Méthode",
        "Milieu" => "Milieu",
        "Measurement" => "Mesure",
        _ => category,
    };

    public async Task<byte[]> GenerateQualityReportPdfAsync(Guid claimId, CancellationToken cancellationToken = default)
    {
        // 1. Charger les données (5 Why et Ishikawa)
        var fiveWhy = await _context.FiveWhyAnalyses
            .Include(a => a.Steps)
            .FirstOrDefaultAsync(a => a.ClaimId == claimId && !a.IsArchived, cancellationToken);

        var ishikawaCauses = await _context.IshikawaCauses
            .Where(c => c.ClaimId == claimId && !c.IsArchived)
            .ToListAsync(cancellationToken);

        var priority = await LoadPriorityCauseAsync(claimId, cancellationToken);
        var capaPlan = await _context.ActionPlans.AsNoTracking()
            .Where(p => p.ClaimId == claimId)
            .OrderBy(p => p.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
        var capaActions = capaPlan == null
            ? new List<Core.Entities.PlanAction>()
            : await _context.PlanActions.AsNoTracking()
                .Where(a => a.ActionPlanId == capaPlan.Id)
                .OrderBy(a => a.Order)
                .ToListAsync(cancellationToken);

        // 2. Générer le document PDF
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(2, Unit.Centimetre); // 👈 Corrigé ici (-re)
                page.PageColor(Colors.White);
                page.DefaultTextStyle(x => x.FontSize(10).FontFamily("Arial"));

                // ─── ENTÊTE ─────────────────────────────────────────────────
                page.Header().Row(row =>
                {
                    row.RelativeItem().Column(col =>
                    {
                        col.Item().Text("COFICAB QUALITY MANAGEMENT").Bold().FontSize(16).FontColor(Colors.Blue.Darken3);
                        col.Item().Text("Rapport d'Analyse Qualité 8D / 5-Why / Ishikawa").FontSize(12).Italic();
                    });

                    row.ConstantItem(120).AlignRight().Column(col =>
                    {
                        col.Item().Text($"Réclamation ID:").Bold();
                        col.Item().Text($"{claimId.ToString().Substring(0, 8)}...").FontSize(8);
                        col.Item().Text($"Date: {DateTime.Now:dd/MM/yyyy}");
                    });
                });

                // ─── CONTENU ────────────────────────────────────────────────
                page.Content().PaddingVertical(1, Unit.Centimetre).Column(column => // 👈 Corrigé ici (-re)
                {
                    column.Spacing(15);

                    column.Item().Text("Chaîne d'analyse : causes possibles → cause retenue → 5 Pourquoi → cause racine → plan d'actions.").Italic().FontSize(9).FontColor(Colors.Grey.Darken1);

                    // SECTION 1 : ISHIKAWA DIAGRAM (6M)
                    column.Item().Text("1. Causes possibles — diagramme d'Ishikawa (6M)").Bold().FontSize(14).FontColor(Colors.Blue.Darken2);

                    if (ishikawaCauses.Any())
                    {
                        column.Item().Table(table =>
                        {
                            table.ColumnsDefinition(cols =>
                            {
                                cols.RelativeColumn(1);
                                cols.RelativeColumn(2);
                                cols.ConstantColumn(80);
                            });

                            table.Header(header =>
                            {
                                header.Cell().Background(Colors.Blue.Lighten4).Padding(5).Text("Catégorie 6M").Bold();
                                header.Cell().Background(Colors.Blue.Lighten4).Padding(5).Text("Description de la Cause").Bold();
                                header.Cell().Background(Colors.Blue.Lighten4).Padding(5).Text("Cause Majeure?").Bold();
                            });

                            foreach (var cause in ishikawaCauses)
                            {
                                table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(cause.Category.ToString()).Bold();
                                table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(cause.CauseDescription);
                                table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(cause.IsRootCause ? "OUI" : "Non");
                            }
                        });
                    }
                    else
                    {
                        column.Item().Text("Aucun diagramme d'Ishikawa enregistré.").Italic().FontColor(Colors.Grey.Medium);
                    }

                    // SECTION 2 : PRIORITY CAUSE (chosen between Ishikawa/Pareto and the 5 Why)
                    if (priority != null)
                    {
                        column.Item().Text("2. Cause prioritaire retenue").Bold().FontSize(14).FontColor(Colors.Blue.Darken2);
                        column.Item().Background(Colors.Blue.Lighten5).Padding(8).Border(1).BorderColor(Colors.Blue.Lighten2).Column(c =>
                        {
                            c.Item().Text(priority.CauseText).Bold();
                            var meta = string.IsNullOrWhiteSpace(priority.Category)
                                ? $"Retenue le {priority.SelectedAt:dd/MM/yyyy}"
                                : $"Catégorie 6M : {CategoryLabel(priority.Category)} — retenue le {priority.SelectedAt:dd/MM/yyyy}";
                            c.Item().Text($"{meta} — {SourceLabel(priority.Source)}").FontSize(9).FontColor(Colors.Grey.Darken1);
                        });
                    }

                    // SECTION 3 : 5-WHY ANALYSIS
                    column.Item().Text("3. Analyse des 5 Pourquoi (5-Why) et cause racine").Bold().FontSize(14).FontColor(Colors.Blue.Darken2);

                    if (fiveWhy != null)
                    {
                        column.Item().Background(Colors.Grey.Lighten3).Padding(8).Column(c =>
                        {
                            c.Item().Text($"Problème : {fiveWhy.ProblemStatement}").Bold();
                            c.Item().Text($"Statut : {fiveWhy.StatusCode} | Validé par : {fiveWhy.ValidatedBy ?? "En attente"}");
                        });

                        column.Item().Table(table =>
                        {
                            table.ColumnsDefinition(cols =>
                            {
                                cols.ConstantColumn(40);
                                cols.RelativeColumn(2);
                                cols.RelativeColumn(2);
                            });

                            table.Header(header =>
                            {
                                header.Cell().Background(Colors.Blue.Lighten4).Padding(5).Text("#").Bold();
                                header.Cell().Background(Colors.Blue.Lighten4).Padding(5).Text("Question").Bold();
                                header.Cell().Background(Colors.Blue.Lighten4).Padding(5).Text("Réponse").Bold();
                            });

                            foreach (var step in fiveWhy.Steps.OrderBy(s => s.StepNumber))
                            {
                                table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text($"N°{step.StepNumber}");
                                table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(step.Question);
                                table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(step.Answer);
                            }
                        });

                        if (!string.IsNullOrEmpty(fiveWhy.RootCause))
                        {
                            column.Item().Background(Colors.Red.Lighten5).Padding(8).Border(1).BorderColor(Colors.Red.Lighten2).Column(c =>
                            {
                                c.Item().Text("Cause Racine Identifiée (Root Cause) :").Bold().FontColor(Colors.Red.Darken2);
                                c.Item().Text(fiveWhy.RootCause);
                            });
                        }
                    }
                    else
                    {
                        column.Item().Text("Aucune analyse 5-Why enregistrée pour cette réclamation.").Italic().FontColor(Colors.Grey.Medium);
                    }

                    // SECTION 4 : CORRECTIVE ACTION PLAN (CAPA) created from the 5 Why
                    if (capaPlan != null)
                    {
                        column.Item().Text("4. Plan d'actions correctives (CAPA)").Bold().FontSize(14).FontColor(Colors.Blue.Darken2);
                        column.Item().Text(capaPlan.Title).Bold();
                        if (capaActions.Count > 0)
                        {
                            column.Item().Table(table =>
                            {
                                table.ColumnsDefinition(cols =>
                                {
                                    cols.RelativeColumn(3);
                                    cols.ConstantColumn(90);
                                    cols.ConstantColumn(90);
                                });

                                table.Header(header =>
                                {
                                    header.Cell().Background(Colors.Blue.Lighten4).Padding(5).Text("Action").Bold();
                                    header.Cell().Background(Colors.Blue.Lighten4).Padding(5).Text("Échéance").Bold();
                                    header.Cell().Background(Colors.Blue.Lighten4).Padding(5).Text("Statut").Bold();
                                });

                                foreach (var action in capaActions)
                                {
                                    var done = action.Progress is Core.Enums.ActionProgress.Hundred or Core.Enums.ActionProgress.Validated;
                                    table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(action.Title);
                                    table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(action.Deadline?.ToString("dd/MM/yyyy") ?? "—");
                                    table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(done ? "Terminée" : "En cours");
                                }
                            });
                        }
                    }
                });

                // ─── PIED DE PAGE ───────────────────────────────────────────
                page.Footer().AlignCenter().Text(x =>
                {
                    x.Span("Page ");
                    x.CurrentPageNumber();
                    x.Span(" / ");
                    x.TotalPages();
                });
            });
        });

        return document.GeneratePdf();
    }
}