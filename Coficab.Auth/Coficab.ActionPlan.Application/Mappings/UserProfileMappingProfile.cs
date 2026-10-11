using AutoMapper;
using Coficab.ActionPlan.Core.DTOs.Employee;
using Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Application.Mappings;

public class UserProfileMappingProfile : Profile
{
    public UserProfileMappingProfile()
    {
        // 1. Entity -> DTO (Mappe aussi ProfilePictureUrl automatiquement)
        CreateMap<UserProfile, UserProfileDto>()
            .ForMember(dest => dest.Department,
                opt => opt.MapFrom(src => src.Department != null ? src.Department.Name : null))
            .ForMember(dest => dest.CreatedAt,
                opt => opt.MapFrom(src => src.CreatedAt.Year > 2000 ? src.CreatedAt.ToString("o") : null));

        // 2. DTO -> Entity
        CreateMap<UpdateUserProfileDto, UserProfile>()
            .ForAllMembers(opts => opts.Condition((src, dest, srcMember) => srcMember != null));
    }
}