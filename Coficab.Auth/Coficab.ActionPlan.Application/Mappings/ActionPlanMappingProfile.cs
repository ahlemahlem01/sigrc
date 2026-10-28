using AutoMapper;
using Coficab.ActionPlan.Core.DTOs.ActionPlan;
using Coficab.ActionPlan.Core.DTOs.Department;
using Coficab.ActionPlan.Core.DTOs.Organization;
using Coficab.ActionPlan.Core.DTOs.PlanAction;
using Coficab.ActionPlan.Core.Entities;
using CoreEntities = Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Application.Mappings;

public class ActionPlanMappingProfile : Profile
{
    private static string DisplayDepartment(Department? department)
    {
        if (department == null) return string.Empty;
        var name = (department.Name ?? string.Empty).Trim();
        var code = (department.Code ?? string.Empty).Trim();
        var description = (department.Description ?? string.Empty).Trim();
        if (IsRawCode(name) && description.Contains(' '))
            return description;
        if (!string.IsNullOrEmpty(name) && !string.Equals(name, code, StringComparison.OrdinalIgnoreCase))
            return name;
        if (description.Contains(' '))
            return description;
        return string.IsNullOrEmpty(name) ? code : name;
    }

    private static bool IsRawCode(string value) =>
        value.Length is >= 2 and <= 12
        && !value.Contains(' ')
        && value.All(c => char.IsLetterOrDigit(c) || c is '-' or '_');

    public ActionPlanMappingProfile()
    {
        // ActionPlan
        CreateMap<CoreEntities.ActionPlan, ActionPlanDto>()
            .ForMember(dest => dest.DepartmentName,
                       opt => opt.MapFrom(src => DisplayDepartment(src.Department)))
            .ForMember(dest => dest.Progress,
                       opt => opt.MapFrom((src, _) =>
                           src.Status == Core.Enums.ActionPlanStatus.Closed
                           || src.Status == Core.Enums.ActionPlanStatus.Archived
                           || src.IsArchived
                               ? 100
                               : Coficab.ActionPlan.Application.Services.PlanProgress.FromActions(
                                   (src.PlanActions ?? new List<PlanAction>()).Where(a => !a.IsArchived).Select(a => a.Progress), src.Progress)));
        // the domain is checked against the reference list by the service, which sets it
        CreateMap<CreateActionPlanDto, CoreEntities.ActionPlan>()
            .ForMember(dest => dest.Domain, opt => opt.Ignore())
            .ForMember(dest => dest.PlanActions, opt => opt.Ignore());   // CreateAsync adds them itself
        CreateMap<UpdateActionPlanDto, CoreEntities.ActionPlan>()
   .ForMember(dest => dest.Id, opt => opt.Ignore())
    .ForMember(dest => dest.CreatedAt, opt => opt.Ignore())
    .ForMember(dest => dest.CreatedBy, opt => opt.Ignore())
    .ForMember(dest => dest.UpdatedAt, opt => opt.Ignore())
    .ForMember(dest => dest.UpdatedBy, opt => opt.Ignore())
    .ForMember(dest => dest.ArchivedAt, opt => opt.Ignore())
    .ForMember(dest => dest.ArchivedBy, opt => opt.Ignore())
    .ForMember(dest => dest.IsArchived, opt => opt.Ignore())
    .ForMember(dest => dest.Domain, opt => opt.Ignore())
    .ForMember(dest => dest.ClaimId, opt => opt.Ignore());
        // PlanAction
        CreateMap<PlanAction, PlanActionDto>();

        CreateMap<CreatePlanActionDto, PlanAction>();
        CreateMap<UpdatePlanActionDto, PlanAction>();

        // Department
        CreateMap<Department, DepartmentDto>();
        CreateMap<CreateDepartmentDto, Department>();
        CreateMap<UpdateDepartmentDto, Department>();

        // Organization
        CreateMap<Organization, OrganizationDto>();
        CreateMap<CreateOrganizationDto, Organization>();
        CreateMap<UpdateOrganizationDto, Organization>();
    }
}