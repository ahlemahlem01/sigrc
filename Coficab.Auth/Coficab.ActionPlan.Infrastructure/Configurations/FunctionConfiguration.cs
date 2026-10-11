
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Coficab.ActionPlan.Infrastructure.Configurations;

public class FunctionConfiguration : IEntityTypeConfiguration<Function>
{
    public void Configure(EntityTypeBuilder<Function> builder)
    {
        builder.HasKey(f => f.Id);
        builder.Property(f => f.FunctionCode).IsRequired().HasMaxLength(50);
        builder.Property(f => f.Description).IsRequired().HasMaxLength(500);
        builder.Property(f => f.JobDescriptionFilePath).HasMaxLength(500);

        builder.HasMany(f => f.UserFunctions)
               .WithOne(uf => uf.Function)
               .HasForeignKey(uf => uf.FunctionId)
               .OnDelete(DeleteBehavior.Restrict);
    }
}