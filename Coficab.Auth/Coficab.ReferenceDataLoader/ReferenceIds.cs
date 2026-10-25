using System.Security.Cryptography;
using System.Text;

namespace Coficab.ReferenceDataLoader;

internal static class ReferenceIds
{
    public static Guid For(string key)
    {
        var hash = MD5.HashData(Encoding.UTF8.GetBytes("coficab-testdata-v1:" + key));
        // RFC 4122 variant bits for a stable name-based-like Guid.
        hash[6] = (byte)((hash[6] & 0x0F) | 0x40);
        hash[8] = (byte)((hash[8] & 0x3F) | 0x80);
        return new Guid(hash);
    }

    public static Guid Org() => For("org");
    public static Guid Dept(string code) => For("dept:" + code);
    public static Guid Claim(int index1Based) => For($"claim:{index1Based:000}");
    public static Guid Plan(int index1Based) => For($"plan:{index1Based:000}");
    public static Guid PlanAction(int planIndex1Based, int actionOrder) => For($"plan:{planIndex1Based:000}:action:{actionOrder}");
    public static Guid FiveWhy(int claimIndex1Based) => For($"fivewhy:{claimIndex1Based:000}");
    public static Guid Profile(string userId) => For("profile:" + userId);
}
