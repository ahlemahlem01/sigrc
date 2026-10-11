using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Coficab.ActionPlan.Infrastructure.Configurations;

public class OrganizationConfiguration : IEntityTypeConfiguration<Organization>
{
    public void Configure(EntityTypeBuilder<Organization> builder)
    {
        builder.HasKey(o => o.Id);
        builder.Property(o => o.Name).IsRequired().HasMaxLength(200);
        builder.Property(o => o.Type).IsRequired();

        builder.HasMany(o => o.Regions)
               .WithOne(r => r.Organization)
               .HasForeignKey(r => r.OrganizationId)
               .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(o => o.Countries)
               .WithOne(c => c.Organization)
               .HasForeignKey(c => c.OrganizationId)
               .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(o => o.Sites)
               .WithOne(s => s.Organization)
               .HasForeignKey(s => s.OrganizationId)
               .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(o => o.Departments)
               .WithOne(d => d.Organization)
               .HasForeignKey(d => d.OrganizationId)
               .OnDelete(DeleteBehavior.Restrict);
    }
}