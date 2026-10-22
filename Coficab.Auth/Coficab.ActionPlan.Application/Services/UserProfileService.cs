using AutoMapper;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.DTOs.Employee;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Services;

public class UserProfileService : IUserProfileService
{
    private readonly IApplicationDbContext _context;
    private readonly IMapper _mapper;

    public UserProfileService(IApplicationDbContext context, IMapper mapper)
    {
        _context = context;
        _mapper = mapper;
    }

    public async Task<UserProfileDto?> GetByUserIdAsync(string userId)
    {
        var profile = await _context.UserProfiles
            .Include(p => p.Department)
            .FirstOrDefaultAsync(p => p.UserId == userId);

        if (profile == null) return null;

        var dto = _mapper.Map<UserProfileDto>(profile);
        EnsureValidDtoName(dto, profile);
        return dto;
    }

    public async Task<UserProfileDto?> UpdateProfileAsync(string userId, UpdateUserProfileDto dto)
    {
        var profile = await _context.UserProfiles
            .FirstOrDefaultAsync(p => p.UserId == userId);

        if (profile == null)
        {
            profile = new UserProfile
            {
                UserId = userId,
                HireDate = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
            };
            _context.UserProfiles.Add(profile);
        }

        var previousStatus = profile.Status;

        _mapper.Map(dto, profile);

        if (!string.IsNullOrWhiteSpace(dto.Name))
            profile.Name = dto.Name.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Email))
            profile.Email = dto.Email.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Role))
            profile.Role = dto.Role.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Poste))
            profile.Poste = dto.Poste.Trim();
        if (dto.LigneProduction != null)
            profile.LigneProduction = string.IsNullOrWhiteSpace(dto.LigneProduction) ? null : dto.LigneProduction.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Equipe))
            profile.Equipe = dto.Equipe.Trim();
        if (dto.Phone != null)
            profile.Phone = string.IsNullOrWhiteSpace(dto.Phone) ? null : dto.Phone.Trim();
        if (dto.ProfilePictureUrl != null)
            profile.ProfilePictureUrl = string.IsNullOrWhiteSpace(dto.ProfilePictureUrl)
                ? null
                : dto.ProfilePictureUrl.Trim();

        // Status RH uniquement (active / onLeave / remote) — jamais un libellé account
        if (!string.IsNullOrWhiteSpace(dto.Status))
        {
            var st = dto.Status.Trim();
            profile.Status = st is "active" or "onLeave" or "remote" ? st : previousStatus;
        }
        else if (profile.Status is not ("active" or "onLeave" or "remote"))
        {
            profile.Status = string.IsNullOrWhiteSpace(previousStatus) ? "active" : previousStatus;
        }

        // Sanitize: Do not store generic fallback strings or empty values in the DB
        if (profile.Name == "Utilisateur")
        {
            profile.Name = string.Empty;
        }

        profile.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        var resultDto = _mapper.Map<UserProfileDto>(profile);
        EnsureValidDtoName(resultDto, profile);
        return resultDto;
    }

    public async Task<UserProfileDto> CreateOrUpdateAsync(string userId, UpdateUserProfileDto dto)
    {
        var profileDto = await UpdateProfileAsync(userId, dto);
        return profileDto ?? throw new InvalidOperationException("Échec de la création/mise à jour du profil.");
    }

    public async Task<UserProfileDto> UpdateAvatarAsync(string userId, string avatarUrl)
    {
        var profile = await _context.UserProfiles
            .FirstOrDefaultAsync(p => p.UserId == userId);

        if (profile == null)
        {
            profile = new UserProfile { UserId = userId };
            _context.UserProfiles.Add(profile);
        }

        profile.ProfilePictureUrl = avatarUrl;
        profile.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        var resultDto = _mapper.Map<UserProfileDto>(profile);
        EnsureValidDtoName(resultDto, profile);
        return resultDto;
    }

    public async Task<DepartmentMoveResult> MoveToDepartmentAsync(string userId, Guid departmentId)
    {
        var profile = await _context.UserProfiles.FirstOrDefaultAsync(p => p.UserId == userId);
        if (profile == null) return DepartmentMoveResult.ProfileNotFound;

        var exists = await _context.Departments.AsNoTracking()
            .AnyAsync(d => d.Id == departmentId && !d.IsArchived);
        if (!exists) return DepartmentMoveResult.DepartmentNotFound;

        profile.DepartmentId = departmentId;
        profile.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return DepartmentMoveResult.Moved;
    }

    public async Task<bool> ExistsAsync(string userId)
    {
        return await _context.UserProfiles.AnyAsync(p => p.UserId == userId);
    }

    public async Task<IEnumerable<TeamMemberDto>> GetTeamMembersAsync(string userId)
    {
        var profile = await _context.UserProfiles
            .FirstOrDefaultAsync(p => p.UserId == userId);

        if (profile?.DepartmentId == null)
            return new List<TeamMemberDto>();

        var teamMembers = await _context.UserProfiles
            .Where(p => p.DepartmentId == profile.DepartmentId && p.UserId != userId)
            .Select(p => new { p.Name, p.Role, p.Status, p.UserId, p.Email })
            .ToListAsync();

        return teamMembers.Select(p => {
            var resolvedName = CleanName(p.Name, p.Email, p.UserId);
            return new TeamMemberDto
            {
                Name = resolvedName,
                Role = p.Role,
                Initials = GetInitials(resolvedName),
                Status = MapStatus(p.Status)
            };
        });
    }

    public async Task<IEnumerable<UserProfileDto>> GetAllAsync()
    {
        var profiles = await _context.UserProfiles
            .Include(p => p.Department)
            .ToListAsync();

        var dtos = _mapper.Map<List<UserProfileDto>>(profiles);

        for (int i = 0; i < profiles.Count; i++)
        {
            EnsureValidDtoName(dtos[i], profiles[i]);
        }

        return dtos;
    }

    public async Task<IEnumerable<TeamMemberDto>> GetByDepartmentAsync(Guid departmentId)
    {
        var members = await _context.UserProfiles
            .Where(p => p.DepartmentId == departmentId)
            .Select(p => new { p.Name, p.Role, p.Status, p.Email, p.UserId })
            .ToListAsync();

        return members.Select(p => {
            var resolvedName = CleanName(p.Name, p.Email, p.UserId);
            return new TeamMemberDto
            {
                Name = resolvedName,
                Role = p.Role,
                Initials = GetInitials(resolvedName),
                Status = MapStatus(p.Status)
            };
        });
    }

    public async Task DeleteAsync(string userId)
    {
        var profile = await _context.UserProfiles
            .FirstOrDefaultAsync(p => p.UserId == userId);

        if (profile != null)
        {
            _context.UserProfiles.Remove(profile);
            await _context.SaveChangesAsync();
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private static void EnsureValidDtoName(UserProfileDto dto, UserProfile entity)
    {
        if (dto == null) return;

        // Ensure the frontend receives the Identity sub/UserId as Id
        dto.Id = entity.UserId;

        // If Name is null, empty or literally "Utilisateur", fall back to email username or clean string
        dto.Name = CleanName(entity.Name, entity.Email, entity.UserId);
    }

    private static string CleanName(string? rawName, string? email, string userId)
    {
        if (!string.IsNullOrWhiteSpace(rawName) && rawName.Trim() != "Utilisateur")
        {
            return rawName.Trim();
        }

        if (!string.IsNullOrWhiteSpace(email) && email.Contains('@'))
        {
            var prefix = email.Split('@')[0].Replace('.', ' ');
            return System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(prefix);
        }

        return !string.IsNullOrWhiteSpace(userId) ? $"Utilisateur ({userId.Substring(0, Math.Min(8, userId.Length))})" : "Utilisateur";
    }

    private static string GetInitials(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return "U";

        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return string.Concat(parts.Select(n => n[0])).ToUpper();
    }

    private static string MapStatus(string? status) => status switch
    {
        "remote" => "remote",
        "onLeave" => "leave",
        _ => "active"
    };
}