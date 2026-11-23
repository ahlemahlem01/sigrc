using Coficab.ActionPlan.API.Services;
using Microsoft.AspNetCore.Http;

namespace Coficab.ActionPlan.API.Tests;

public class CancelledRequestTests
{
    private static async Task<HttpContext> Run(Func<HttpContext, Task> endpoint, bool clientGone)
    {
        using var abort = new CancellationTokenSource();
        var context = new DefaultHttpContext { RequestAborted = abort.Token };
        if (clientGone) abort.Cancel();
        await new ValidationExceptionMiddleware(new RequestDelegate(endpoint)).InvokeAsync(context);
        return context;
    }

    [Fact]
    public async Task ARequestTheClientGaveUpOn_EndsWith499_NotAnError()
    {
        var context = await Run(_ => throw new TaskCanceledException("client went away"), clientGone: true);
        Assert.Equal(499, context.Response.StatusCode);
    }

    [Fact]
    public async Task ACancellationNotCausedByTheClient_IsStillAnError()
    {
        // e.g. a timeout of an outgoing call: the client is still waiting, the exception must reach the normal error handling
        await Assert.ThrowsAsync<TaskCanceledException>(() => Run(_ => throw new TaskCanceledException("upstream timeout"), clientGone: false));
    }
}
