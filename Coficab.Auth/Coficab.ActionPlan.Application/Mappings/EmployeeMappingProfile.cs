using AutoMapper;
using Coficab.ActionPlan.Core.DTOs.Employee;
using Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Application.Mappings;

public class EmployeeMappingProfile : Profile
{
    public EmployeeMappingProfile()
    {
        CreateMap<UserProfile, UserProfileDto>()
            .ForMember(dest => dest.HireDate, opt => opt.MapFrom(src => src.HireDate.Year > 2000 ? src.HireDate.ToString("yyyy-MM-dd") : string.Empty))
            .ForMember(dest => dest.CreatedAt, opt => opt.MapFrom(src => src.CreatedAt.Year > 2000 ? src.CreatedAt.ToString("o") : null));

        CreateMap<Badge, BadgeDto>()
            .ForMember(dest => dest.Id, opt => opt.MapFrom(src => src.Id.ToString()))
            .ForMember(dest => dest.UserId, opt => opt.MapFrom(src => src.UserId))
            .ForMember(dest => dest.Category, opt => opt.MapFrom(src => src.Category))
            .ForMember(dest => dest.PlanId, opt => opt.MapFrom(src => src.PlanId.HasValue ? src.PlanId.Value.ToString() : null))
            .ForMember(dest => dest.EarnedAt, opt => opt.MapFrom(src => src.EarnedAt.ToString("yyyy-MM-dd")));

        CreateMap<TimelineEvent, TimelineEventDto>()
            .ForMember(dest => dest.Timestamp, opt => opt.MapFrom(src => src.Timestamp.ToString("yyyy-MM-ddTHH:mm:ss")))
            .ForMember(dest => dest.Description, opt => opt.MapFrom(src => src.Description));

        CreateMap<Document, DocumentDto>()
           .ForMember(dest => dest.LastViewed, opt => opt.MapFrom(src => src.LastViewedAt != null ? src.LastViewedAt.Value.ToString("yyyy-MM-dd") : src.CreatedAt.ToString("yyyy-MM-dd")));
    }
}