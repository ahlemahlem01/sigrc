
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Coficab.ActionPlan.Infrastructure.Configurations;

public class DepartmentConfiguration : IEntityTypeConfiguration<Department>
{
    public void Configure(EntityTypeBuilder<Department> builder)
    {
        builder.HasKey(d => d.Id);
        builder.Property(d => d.Name).IsRequired().HasMaxLength(200);
        builder.Property(d => d.Code).IsRequired().HasMaxLength(50);

        builder.HasMany(d => d.Functions)
               .WithOne(f => f.Department)
               .HasForeignKey(f => f.DepartmentId)
               .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(d => d.ActionPlans)
               .WithOne(ap => ap.Department)
               .HasForeignKey(ap => ap.DepartmentId)
               .OnDelete(DeleteBehavior.Restrict);
    }
}