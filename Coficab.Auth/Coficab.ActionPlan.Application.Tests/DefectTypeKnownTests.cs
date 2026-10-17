using Coficab.ActionPlan.Application.ReferenceLists;
using Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Application.Tests;

public class DefectTypeKnownTests
{
    [Fact]
    public void OnlyListedDefectNames_AreKnown_AndAnEmptyListAcceptsEverything()
    {
        var resolver = DefectTypeResolver.From(new[]
        {
            new ReferenceItem { ListKey = ReferenceListKeys.DefectType, Value = "Soudure défectueuse", IsActive = true },
        });

        Assert.True(resolver.IsKnown(resolver.Resolve("soudure défectueuse")));   // same name, other case
        Assert.False(resolver.IsKnown(resolver.Resolve("Soudure")));              // a shorter free-text spelling is not a listed defect
        Assert.False(resolver.IsKnown(""));
        Assert.True(DefectTypeResolver.Empty.IsKnown("anything"));
    }
}
