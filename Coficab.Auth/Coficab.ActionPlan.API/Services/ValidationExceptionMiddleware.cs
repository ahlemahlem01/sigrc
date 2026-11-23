using FluentValidation;

namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// Turns a failed FluentValidation check into HTTP 400 with the same shape the screens already read:
/// { message, errors: [{ field, message }] }. A request the browser gave up on (tab closed, page left, connection lost) is not a
/// server error: it ends quietly with 499, so that it is neither logged as a failure nor counted as a 500.
/// Anything else is left to the normal error handling.
/// </summary>
public class ValidationExceptionMiddleware
{
    private readonly RequestDelegate _next;

    public ValidationExceptionMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            if (!context.Response.HasStarted)
                context.Response.StatusCode = 499;   // "client closed request": nobody is left to read an answer
        }
        catch (ValidationException ex) when (!context.Response.HasStarted)
        {
            var errors = ex.Errors
                .Select(e => new { field = e.PropertyName, message = e.ErrorMessage })
                .Distinct()
                .ToList();
            context.Response.Clear();
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(new
            {
                message = errors.Count > 0 ? string.Join(" ", errors.Select(e => e.message).Distinct()) : "Données invalides.",
                errors,
            });
        }
    }
}
