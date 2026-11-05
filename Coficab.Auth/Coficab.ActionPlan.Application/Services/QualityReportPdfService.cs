using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Coficab.ActionPlan.Application.Services;

/// <summary>Every text and figure of the customer 8D report. It is built from the data of the claim, can be edited, and the PDF is drawn from it.</summary>
public sealed class QualityReportModel
{
    public string Company { get; set; } = "COFICAB QUALITY MANAGEMENT";
    public string Title { get; set; } = "Rapport d'Analyse Qualité 8D / 5-Why / Ishikawa";
    public string Reference { get; set; } = string.Empty;
    public string Date { get; set; } = string.Empty;
    public string Intro { get; set; } = "Chaîne d'analyse : causes possibles → cause retenue → 5 Pourquoi → cause racine → plan d'actions.";

    public string IshikawaHeading { get; set; } = "1. Causes possibles — diagramme d'Ishikawa (6M)";
    public List<QualityReportIshikawaRow> Ishikawa { get; set; } = new();

    public string PriorityHeading { get; set; } = "2. Cause prioritaire retenue";
    public QualityReportPriority? Priority { get; set; }

    public string FiveWhyHeading { get; set; } = "3. Analyse des 5 Pourquoi (5-Why) et cause racine";
    public QualityReportFiveWhy? FiveWhy { get; set; }

    public string CapaHeading { get; set; } = "4. Plan d'actions correctives (CAPA)";
    public QualityReportCapa? Capa { get; set; }

    public string ConclusionHeading { get; set; } = "5. Conclusion et remarques";
    /// <summary>Free text added by the person who edits the report; the section is printed only when it is filled in.</summary>
    public string Conclusion { get; set; } = string.Empty;
}

public sealed class QualityReportIshikawaRow
{
    public string Category { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Major { get; set; } = "Non";
}

public sealed class QualityReportPriority
{
    public string Text { get; set; } = string.Empty;
    public string Meta { get; set; } = string.Empty;
}

public sealed class QualityReportFiveWhy
{
    public string Problem { get; set; } = string.Empty;
    public string StatusLine { get; set; } = string.Empty;
    public List<QualityReportWhyRow> Rows { get; set; } = new();
    public string RootCause { get; set; } = string.Empty;
}

public sealed class QualityReportWhyRow
{
    public string Label { get; set; } = string.Empty;
    public string Question { get; set; } = string.Empty;
    public string Answer { get; set; } = string.Empty;
}

public sealed class QualityReportCapa
{
    public string Title { get; set; } = string.Empty;
    public List<QualityReportCapaRow> Rows { get; set; } = new();
}

public sealed class QualityReportCapaRow
{
    public string Action { get; set; } = string.Empty;
    public string Deadline { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
}

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

    public async Task<byte[]> GenerateQualityReportPdfAsync(Guid claimId, CancellationToken cancellationToken = default) =>
        RenderPdf(await BuildReportModelAsync(claimId, cancellationToken));

    /// <summary>The report as the data of the claim give it today (5 Why, Ishikawa, priority cause, CAPA plan).</summary>
    public async Task<QualityReportModel> BuildReportModelAsync(Guid claimId, CancellationToken cancellationToken = default)
    {
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

        var model = new QualityReportModel
        {
            Reference = $"{claimId.ToString().Substring(0, 8)}...",
            Date = DateTime.Now.ToString("dd/MM/yyyy"),
            Ishikawa = ishikawaCauses.Select(c => new QualityReportIshikawaRow
            {
                Category = c.Category.ToString(), Description = c.CauseDescription, Major = c.IsRootCause ? "OUI" : "Non",
            }).ToList(),
        };

        if (priority != null)
        {
            var meta = string.IsNullOrWhiteSpace(priority.Category)
                ? $"Retenue le {priority.SelectedAt:dd/MM/yyyy}"
                : $"Catégorie 6M : {CategoryLabel(priority.Category)} — retenue le {priority.SelectedAt:dd/MM/yyyy}";
            model.Priority = new QualityReportPriority { Text = priority.CauseText, Meta = $"{meta} — {SourceLabel(priority.Source)}" };
        }

        if (fiveWhy != null)
        {
            model.FiveWhy = new QualityReportFiveWhy
            {
                Problem = fiveWhy.ProblemStatement ?? string.Empty,
                StatusLine = $"Statut : {fiveWhy.StatusCode} | Validé par : {fiveWhy.ValidatedBy ?? "En attente"}",
                RootCause = fiveWhy.RootCause ?? string.Empty,
                Rows = fiveWhy.Steps.OrderBy(s => s.BranchType == "DETECTION" ? 1 : 0).ThenBy(s => s.StepNumber)
                    .Select(s => new QualityReportWhyRow
                    {
                        Label = s.BranchType == "DETECTION" ? $"Dét. N°{s.StepNumber}" : $"Occ. N°{s.StepNumber}",
                        Question = s.Question, Answer = s.Answer,
                    }).ToList(),
            };
        }

        if (capaPlan != null)
        {
            model.Capa = new QualityReportCapa
            {
                Title = capaPlan.Title,
                Rows = capaActions.Select(a => new QualityReportCapaRow
                {
                    Action = a.Title,
                    Deadline = a.Deadline?.ToString("dd/MM/yyyy") ?? "—",
                    Status = a.Progress is Core.Enums.ActionProgress.Hundred or Core.Enums.ActionProgress.Validated ? "Terminée" : "En cours",
                }).ToList(),
            };
        }

        return model;
    }

    /// <summary>Draws the PDF from a report model, edited or not.</summary>
    public byte[] RenderPdf(QualityReportModel model)
    {
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(2, Unit.Centimetre);
                page.PageColor(Colors.White);
                page.DefaultTextStyle(x => x.FontSize(10).FontFamily("Arial"));

                // ─── ENTÊTE ─────────────────────────────────────────────────
                page.Header().Row(row =>
                {
                    row.RelativeItem().Column(col =>
                    {
                        col.Item().Text(model.Company).Bold().FontSize(16).FontColor(Colors.Blue.Darken3);
                        col.Item().Text(model.Title).FontSize(12).Italic();
                    });

                    row.ConstantItem(120).AlignRight().Column(col =>
                    {
                        col.Item().Text("Réclamation ID:").Bold();
                        col.Item().Text(model.Reference).FontSize(8);
                        col.Item().Text($"Date: {model.Date}");
                    });
                });

                // ─── CONTENU ────────────────────────────────────────────────
                page.Content().PaddingVertical(1, Unit.Centimetre).Column(column =>
                {
                    column.Spacing(15);

                    if (!string.IsNullOrWhiteSpace(model.Intro))
                        column.Item().Text(model.Intro).Italic().FontSize(9).FontColor(Colors.Grey.Darken1);

                    // SECTION 1 : ISHIKAWA DIAGRAM (6M)
                    column.Item().Text(model.IshikawaHeading).Bold().FontSize(14).FontColor(Colors.Blue.Darken2);

                    if (model.Ishikawa.Count > 0)
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

                            foreach (var cause in model.Ishikawa)
                            {
                                table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(cause.Category).Bold();
                                table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(cause.Description);
                                table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(cause.Major);
                            }
                        });
                    }
                    else
                    {
                        column.Item().Text("Aucun diagramme d'Ishikawa enregistré.").Italic().FontColor(Colors.Grey.Medium);
                    }

                    // SECTION 2 : PRIORITY CAUSE (chosen between Ishikawa/Pareto and the 5 Why)
                    if (model.Priority != null)
                    {
                        column.Item().Text(model.PriorityHeading).Bold().FontSize(14).FontColor(Colors.Blue.Darken2);
                        column.Item().Background(Colors.Blue.Lighten5).Padding(8).Border(1).BorderColor(Colors.Blue.Lighten2).Column(c =>
                        {
                            c.Item().Text(model.Priority.Text).Bold();
                            c.Item().Text(model.Priority.Meta).FontSize(9).FontColor(Colors.Grey.Darken1);
                        });
                    }

                    // SECTION 3 : 5-WHY ANALYSIS
                    column.Item().Text(model.FiveWhyHeading).Bold().FontSize(14).FontColor(Colors.Blue.Darken2);

                    if (model.FiveWhy != null)
                    {
                        column.Item().Background(Colors.Grey.Lighten3).Padding(8).Column(c =>
                        {
                            c.Item().Text($"Problème : {model.FiveWhy.Problem}").Bold();
                            c.Item().Text(model.FiveWhy.StatusLine);
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

                            foreach (var step in model.FiveWhy.Rows)
                            {
                                table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(step.Label);
                                table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(step.Question);
                                table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(step.Answer);
                            }
                        });

                        if (!string.IsNullOrEmpty(model.FiveWhy.RootCause))
                        {
                            column.Item().Background(Colors.Red.Lighten5).Padding(8).Border(1).BorderColor(Colors.Red.Lighten2).Column(c =>
                            {
                                c.Item().Text("Cause Racine Identifiée (Root Cause) :").Bold().FontColor(Colors.Red.Darken2);
                                c.Item().Text(model.FiveWhy.RootCause);
                            });
                        }
                    }
                    else
                    {
                        column.Item().Text("Aucune analyse 5-Why enregistrée pour cette réclamation.").Italic().FontColor(Colors.Grey.Medium);
                    }

                    // SECTION 4 : CORRECTIVE ACTION PLAN (CAPA) created from the 5 Why
                    if (model.Capa != null)
                    {
                        column.Item().Text(model.CapaHeading).Bold().FontSize(14).FontColor(Colors.Blue.Darken2);
                        column.Item().Text(model.Capa.Title).Bold();
                        if (model.Capa.Rows.Count > 0)
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

                                foreach (var action in model.Capa.Rows)
                                {
                                    table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(action.Action);
                                    table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(action.Deadline);
                                    table.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(action.Status);
                                }
                            });
                        }
                    }

                    // SECTION 5 : free conclusion, only when someone wrote one
                    if (!string.IsNullOrWhiteSpace(model.Conclusion))
                    {
                        column.Item().Text(model.ConclusionHeading).Bold().FontSize(14).FontColor(Colors.Blue.Darken2);
                        column.Item().Text(model.Conclusion);
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
