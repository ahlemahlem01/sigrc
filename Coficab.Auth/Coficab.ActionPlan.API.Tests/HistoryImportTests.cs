using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using ClosedXML.Excel;
using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

public class HistoryImportParserTests
{
    private static MemoryStream Workbook(Action<IXLWorksheet> claims, Action<IXLWorksheet>? causes = null)
    {
        var wb = new XLWorkbook();
        claims(wb.Worksheets.Add(HistoryImportParser.ClaimsSheet));
        if (causes != null) causes(wb.Worksheets.Add(HistoryImportParser.CausesSheet));
        var ms = new MemoryStream();
        wb.SaveAs(ms);
        ms.Position = 0;
        return ms;
    }

    private static void Header(IXLWorksheet ws, params string[] values)
    {
        for (var i = 0; i < values.Length; i++) ws.Cell(1, i + 1).Value = values[i];
    }

    private static void Row(IXLWorksheet ws, int row, params string[] values)
    {
        for (var i = 0; i < values.Length; i++) ws.Cell(row, i + 1).Value = values[i];
    }

    [Fact]
    public void Parses_ClaimsAndCauses_AndSkipsExampleRows()
    {
        using var file = Workbook(
            ws =>
            {
                Header(ws, HistoryImportParser.ClaimHeaders);
                Row(ws, 2, "EX-1", "Exemple — ignoré", "A", "Connecteur", "Haute", "L0", "d", "2025-01-01", "2025-01-05", "Ligne 1", "Jour", "100", "1");
                Row(ws, 3, "R1", "Sertissage défectueux", "Client A", "Sertissage", "Critique", "LOT-9", "desc", "2025-03-12", "2025-04-02", "Ligne 3", "Nuit", "12 000", "36");
            },
            ws =>
            {
                Header(ws, HistoryImportParser.CauseHeaders);
                Row(ws, 2, "R1", "Machine", "Dérive du réglage", "oui");
                Row(ws, 3, "R1", "Main-d'œuvre", "Formation incomplète", "non");
            });

        var parsed = HistoryImportParser.Parse(file, "h.xlsx");

        Assert.Empty(parsed.Errors);
        var claim = Assert.Single(parsed.Claims);
        Assert.Equal("R1", claim.Reference);
        Assert.Equal("CRITICAL", claim.Severity);
        Assert.Equal(12000, claim.ProducedQuantity);
        Assert.Equal(new DateTime(2025, 4, 2), claim.ClosedDate);
        Assert.Equal(2, parsed.Causes.Count);
        Assert.True(parsed.Causes[0].IsRootCause);
        Assert.False(parsed.Causes[1].IsRootCause);
        Assert.Equal(IshikawaCategory.Manpower, parsed.Causes[1].Category);
    }

    [Fact]
    public void ReportsRowErrors_WithLineNumbers_WithoutStoppingTheRest()
    {
        using var file = Workbook(
            ws =>
            {
                Header(ws, HistoryImportParser.ClaimHeaders);
                Row(ws, 2, "A", "", "", "", "", "", "", "2025-01-01");
                Row(ws, 3, "B", "Bonne ligne", "", "Soudure", "", "", "", "pas une date");
                Row(ws, 4, "C", "Inversée", "", "Soudure", "", "", "", "2025-05-10", "2025-05-01");
                Row(ws, 5, "D", "Valide", "", "Soudure", "", "", "", "2025-05-10");
                Row(ws, 6, "D", "Doublon de référence", "", "Soudure", "", "", "", "2025-05-11");
            },
            ws =>
            {
                Header(ws, HistoryImportParser.CauseHeaders);
                Row(ws, 2, "ZZZ", "Machine", "Orpheline", "non");
                Row(ws, 3, "D", "Inconnue", "Catégorie invalide", "non");
            });

        var parsed = HistoryImportParser.Parse(file, "h.xlsx");

        Assert.Single(parsed.Claims);
        Assert.Equal("D", parsed.Claims[0].Reference);
        Assert.Contains(parsed.Errors, e => e.Sheet == "Reclamations" && e.Line == 2);
        Assert.Contains(parsed.Errors, e => e.Sheet == "Reclamations" && e.Line == 3);
        Assert.Contains(parsed.Errors, e => e.Sheet == "Reclamations" && e.Line == 4);
        Assert.Contains(parsed.Errors, e => e.Sheet == "Reclamations" && e.Line == 6);
        Assert.Contains(parsed.Errors, e => e.Sheet == "Causes" && e.Line == 2);
        Assert.Contains(parsed.Errors, e => e.Sheet == "Causes" && e.Line == 3);
        Assert.Empty(parsed.Causes);
    }

    [Fact]
    public void Csv_ClaimsOnly_Works_WithSemicolons()
    {
        var csv = "Titre;Type de défaut;Date de détection;Gravité\nSertissage;Sertissage;12/03/2025;Faible\n";
        using var file = new MemoryStream(Encoding.UTF8.GetBytes(csv));

        var parsed = HistoryImportParser.Parse(file, "h.csv");

        Assert.Empty(parsed.Errors);
        var claim = Assert.Single(parsed.Claims);
        Assert.Equal("LOW", claim.Severity);
        Assert.Equal(new DateTime(2025, 3, 12), claim.DetectionDate);
    }

    [Fact]
    public void MissingRequiredColumns_IsReported()
    {
        using var file = Workbook(ws => { Header(ws, "Titre", "Client"); Row(ws, 2, "x", "y"); });
        var parsed = HistoryImportParser.Parse(file, "h.xlsx");
        Assert.Empty(parsed.Claims);
        Assert.Single(parsed.Errors);
    }
}

public class HistoryImportEndpointTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public HistoryImportEndpointTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private static MultipartFormDataContent FileContent(byte[] bytes, string name)
    {
        var form = new MultipartFormDataContent();
        var part = new ByteArrayContent(bytes);
        part.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        form.Add(part, "file", name);
        return form;
    }

    [Fact]
    public async Task Template_IsAnXlsx_ForAdmin_AndForbiddenForEmployees()
    {
        var ok = await ClientAs("admin").GetAsync("/api/history-import/template");
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var bytes = await ok.Content.ReadAsByteArrayAsync();
        using var wb = new XLWorkbook(new MemoryStream(bytes));
        Assert.NotNull(wb.Worksheet(HistoryImportParser.ClaimsSheet));
        Assert.NotNull(wb.Worksheet(HistoryImportParser.CausesSheet));

        var denied = await ClientAs("employee").GetAsync("/api/history-import/template");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
    }

    [Fact]
    public async Task Preview_ReportsDuplicates_AndWritesNothing()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            db.Claims.Add(new Claim
            {
                Id = Guid.NewGuid(), Title = "Sertissage défectueux", LotNumber = "LOT-9", DefectType = "Sertissage",
                Severity = "HIGH", ClientId = "A", Description = "d", StatusCode = "CLOTUREE",
                DetectionDate = new DateTime(2025, 3, 12, 0, 0, 0, DateTimeKind.Utc),
            });
            await db.SaveChangesAsync();
        }

        var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add(HistoryImportParser.ClaimsSheet);
        for (var i = 0; i < HistoryImportParser.ClaimHeaders.Length; i++) ws.Cell(1, i + 1).Value = HistoryImportParser.ClaimHeaders[i];
        ws.Cell(2, 1).Value = "R1"; ws.Cell(2, 2).Value = "Sertissage défectueux"; ws.Cell(2, 4).Value = "Sertissage";
        ws.Cell(2, 6).Value = "LOT-9"; ws.Cell(2, 8).Value = "2025-03-12";
        ws.Cell(3, 1).Value = "R2"; ws.Cell(3, 2).Value = "Autre"; ws.Cell(3, 4).Value = "Soudure"; ws.Cell(3, 8).Value = "2025-04-01";
        var ms = new MemoryStream();
        wb.SaveAs(ms);

        var response = await ClientAs("admin").PostAsync("/api/history-import/preview", FileContent(ms.ToArray(), "h.xlsx"));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, json.RootElement.GetProperty("claims").GetInt32());
        Assert.Equal(1, json.RootElement.GetProperty("duplicates").GetArrayLength());
        Assert.Equal(1, json.RootElement.GetProperty("importable").GetInt32());

        using var scope2 = _factory.Services.CreateScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        Assert.DoesNotContain(db2.Claims, c => c.Title == "Autre");
    }
}
