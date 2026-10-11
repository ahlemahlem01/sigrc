using MediatR;
public class UpdateClaimCommand : IRequest<bool>
{
    public Guid Id { get; set; }
    public string? Title { get; set; }
    public string? ClientId { get; set; }
    public string? DefectType { get; set; }
    public string? LotNumber { get; set; }
    public string? SerialNumber { get; set; }
    public string? Description { get; set; }
    public string? Severity { get; set; }
    public string? StatusCode { get; set; } // Added for 8D workflow status transitions
    public Guid UpdatedById { get; set; }
    // 📌 Quantités pour le calcul du PPM lié au défaut (voir Claim.cs).
    public int? ProducedQuantity { get; set; }
    public int? DefectiveQuantity { get; set; }
}