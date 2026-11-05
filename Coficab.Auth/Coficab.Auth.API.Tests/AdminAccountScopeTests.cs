using Coficab.Auth.API.Services;

namespace Coficab.Auth.API.Tests;

public class AdminAccountScopeTests
{
    private static readonly Guid Org = Guid.NewGuid(), Dept = Guid.NewGuid();

    [Fact]
    public void AnAdministrator_MayCreateAUser_InHisOwnDepartment()
    {
        Assert.Null(AdminAccountScope.Check("user", null, null, Org, Dept));
        Assert.Null(AdminAccountScope.Check(null, Org, Dept, Org, Dept));
    }

    [Fact]
    public void AnAdministrator_MayNotCreateAnotherDepartmentOrAHigherRole()
    {
        Assert.NotNull(AdminAccountScope.Check("user", Org, Guid.NewGuid(), Org, Dept));
        Assert.NotNull(AdminAccountScope.Check("user", Guid.NewGuid(), Dept, Org, Dept));
        Assert.NotNull(AdminAccountScope.Check("admin", null, null, Org, Dept));
        Assert.NotNull(AdminAccountScope.Check("superadmin", null, null, Org, Dept));
    }

    [Fact]
    public void AnAdministratorWithoutADepartment_CreatesNothing() =>
        Assert.NotNull(AdminAccountScope.Check("user", null, null, Org, null));
}
