using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Coficab.ActionPlan.Infrastructure.Configurations;

public class SiteConfiguration : IEntityTypeConfiguration<Site>
{
    public void Configure(EntityTypeBuilder<Site> builder)
    {
        builder.HasKey(s => s.Id);
        builder.Property(s => s.Name).IsRequired().HasMaxLength(200);
        builder.Property(s => s.Code).IsRequired().HasMaxLength(50);

        builder.HasMany(s => s.Departments)
               .WithOne(d => d.Site)
               .HasForeignKey(d => d.SiteId)
               .IsRequired(false)
               .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(s => s.Licences)
               .WithOne(l => l.Site)
               .HasForeignKey(l => l.SiteId)
               .IsRequired(false)
               .OnDelete(DeleteBehavior.Restrict);
    }
}