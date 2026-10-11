using FluentValidation;

namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// Turns a failed FluentValidation check into HTTP 400 with the same shape the screens already read:
/// { message, errors: [{ field, message }] }. Anything else is left to the normal error handling.
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
