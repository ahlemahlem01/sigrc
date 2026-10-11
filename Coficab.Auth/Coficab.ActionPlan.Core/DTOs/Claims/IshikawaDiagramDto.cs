namespace Coficab.ActionPlan.Core.DTOs.Claims;

// IshikawaCauseDto is now inherited from IshikawaDetailsDto.cs

public class IshikawaDiagramDto
{
    public Guid Id { get; set; }
    public string ProblemStatement { get; set; } = string.Empty;
    public List<IshikawaCategoryDto> Categories { get; set; } = new();
}