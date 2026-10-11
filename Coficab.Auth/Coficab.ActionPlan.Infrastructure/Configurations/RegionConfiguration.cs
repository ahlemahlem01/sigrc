using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Coficab.ActionPlan.Infrastructure.Configurations;

public class RegionConfiguration : IEntityTypeConfiguration<Region>
{
    public void Configure(EntityTypeBuilder<Region> builder)
    {
        builder.HasKey(r => r.Id);
        builder.Property(r => r.Name).IsRequired().HasMaxLength(200);
        builder.Property(r => r.Code).IsRequired().HasMaxLength(50);

        builder.HasMany(r => r.Countries)
               .WithOne(c => c.Region)
               .HasForeignKey(c => c.RegionId)
               .IsRequired(false)
               .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(r => r.Departments)
               .WithOne(d => d.Region)
               .HasForeignKey(d => d.RegionId)
               .IsRequired(false)
               .OnDelete(DeleteBehavior.Restrict);
    }
}