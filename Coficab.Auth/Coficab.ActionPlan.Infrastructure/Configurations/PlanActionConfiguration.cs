using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Coficab.ActionPlan.Infrastructure.Configurations;

public class PlanActionHistoryConfiguration : IEntityTypeConfiguration<PlanActionHistory>
{
    public void Configure(EntityTypeBuilder<PlanActionHistory> builder)
    {
        builder.HasKey(e => e.Id);

        builder.Property(e => e.PlanActionId).IsRequired();
        builder.Property(e => e.ChangedBy).IsRequired().HasMaxLength(450);
        builder.Property(e => e.OldProgress).IsRequired();
        builder.Property(e => e.NewProgress).IsRequired();
        builder.Property(e => e.Note).HasMaxLength(500);
        builder.Property(e => e.CreatedAt).IsRequired();
        builder.Property(e => e.CreatedBy).IsRequired().HasMaxLength(450);
        builder.Property(e => e.UpdatedAt).IsRequired();
        builder.Property(e => e.UpdatedBy).IsRequired().HasMaxLength(450);

        // Index pour performances
        builder.HasIndex(e => e.PlanActionId);
        builder.HasIndex(e => e.CreatedAt);

        // Relation (optionnel, déjà défini dans PlanActionConfiguration)
        builder.HasOne(e => e.PlanAction)
               .WithMany()
               .HasForeignKey(e => e.PlanActionId)
               .OnDelete(DeleteBehavior.Cascade);
    }
}