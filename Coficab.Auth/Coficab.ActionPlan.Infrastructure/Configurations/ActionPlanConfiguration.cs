using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using CoreEntities = Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Infrastructure.Configurations;

public class ActionPlanConfiguration : IEntityTypeConfiguration<CoreEntities.ActionPlan>
{
    public void Configure(EntityTypeBuilder<CoreEntities.ActionPlan> builder)
    {
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Title).IsRequired().HasMaxLength(300);
        builder.Property(a => a.OwnerId).IsRequired();
        builder.Property(a => a.Type).IsRequired();
        builder.Property(a => a.Status).IsRequired();

        builder.HasMany(a => a.PlanActions)
               .WithOne(pa => pa.ActionPlan)
               .HasForeignKey(pa => pa.ActionPlanId)
               .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(a => a.History)
               .WithOne(h => h.ActionPlan)
               .HasForeignKey(h => h.ActionPlanId)
               .OnDelete(DeleteBehavior.Cascade);
    }
}