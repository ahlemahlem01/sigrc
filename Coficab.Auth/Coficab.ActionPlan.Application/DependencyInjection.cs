using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.Mappings;
using Coficab.ActionPlan.Application.QualityAnalyses.Services;
using Coficab.ActionPlan.Application.Services;
using Coficab.ActionPlan.Application.DomainEvents;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        var assembly = typeof(DependencyInjection).Assembly;

        // AutoMapper
        services.AddAutoMapper(typeof(ActionPlanMappingProfile).Assembly);

        // MediatR (Commands/Queries + INotification domain-event handlers)
        services.AddMediatR(cfg =>
        {
            cfg.RegisterServicesFromAssembly(assembly);
            cfg.AddOpenBehavior(typeof(Behaviors.ValidationBehavior<,>));
        });

        // Domain events — MediatR in-process today; swap implementation for a broker later.
        services.AddScoped<IDomainEventPublisher, MediatRDomainEventPublisher>();

        // FluentValidation
        services.AddValidatorsFromAssembly(assembly);

        // Services Applicatifs existants
        services.AddScoped<IActionPlanService, ActionPlanService>();
        services.AddScoped<IPlanActionService, PlanActionService>();
        services.AddScoped<IDepartmentService, DepartmentService>();
        services.AddScoped<IOrganizationService, OrganizationService>();
        services.AddScoped<IQualityReportPdfService, QualityReportPdfService>();
        services.AddScoped<IEightDService, EightDService>();
        services.AddScoped<IGeminiService, GeminiService>();
        services.AddScoped<ISemanticSearchService, SemanticSearchService>();
        services.AddScoped<IQualityAssistantService, QualityAssistantService>();
        services.AddScoped<IAnomalyTimeseriesService, AnomalyTimeseriesService>();
        services.AddScoped<IAnomalyDetectionService, AnomalyDetectionService>();
        services.AddScoped<IAlertAnalysisService, AlertAnalysisService>();
        services.AddScoped<IAlertHistoryService, AlertHistoryService>();
        services.AddScoped<IClaimResolutionEstimateService, ClaimResolutionEstimateService>();
        services.AddScoped<ICalendarEventService, CalendarEventService>();
        services.AddScoped<Workflow.IClaimWorkflow, Workflow.ClaimWorkflow>();
        return services;
    }
}