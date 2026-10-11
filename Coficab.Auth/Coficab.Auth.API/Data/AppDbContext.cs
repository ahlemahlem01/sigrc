using Coficab.ActionPlan.Core.Entities;
using Coficab.Auth.API.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Coficab.Auth.API.Data;

public class AppDbContext : IdentityDbContext<ApplicationUser>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<UserPermission> UserPermissions => Set<UserPermission>();
    public DbSet<Badge> Badges { get; set; }
    public DbSet<Notification> Notifications { get; set; } = null!;
    public DbSet<AuditLog> AuditLogs { get; set; } = null!;
    public DbSet<UserPreference> UserPreferences { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder builder)
    {
        builder.HasDefaultSchema("app_auth");
        base.OnModelCreating(builder);

        // ─── ApplicationUser ──────────────────────────────────────
        builder.Entity<ApplicationUser>(entity =>
        {
            entity.Property(u => u.OrganizationId).IsRequired(false);
        });

        // ─── Permission ───────────────────────────────────────────
        builder.Entity<Permission>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.HasIndex(p => p.Name).IsUnique();
            entity.HasIndex(p => p.AppId);
        });

        // ─── UserPermission ───────────────────────────────────────
        builder.Entity<UserPermission>(entity =>
        {
            entity.HasKey(up => up.Id);
            entity.HasOne(up => up.User)
                  .WithMany(u => u.UserPermissions)
                  .HasForeignKey(up => up.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(up => up.Permission)
                  .WithMany(p => p.UserPermissions)
                  .HasForeignKey(up => up.PermissionId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(up => up.GrantedBy)
                  .WithMany()
                  .HasForeignKey(up => up.GrantedById)
                  .OnDelete(DeleteBehavior.NoAction);
            entity.HasIndex(up => new { up.UserId, up.PermissionId }).IsUnique();
        });

        // ─── Notification ─────────────────────────────────────────
        builder.Entity<Notification>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.RecipientId);
            entity.HasIndex(e => new { e.RecipientId, e.IsRead });
            entity.Property(e => e.RecipientId).IsRequired().HasMaxLength(450);
            entity.Property(e => e.Type).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Message).HasMaxLength(500);
            entity.HasOne(e => e.ActionPlan)
                  .WithMany()
                  .HasForeignKey(e => e.ActionPlanId)
                  .OnDelete(DeleteBehavior.SetNull);
        });

        // ─── AuditLog ─────────────────────────────────────────────
        builder.Entity<AuditLog>(entity =>
        {
            entity.HasKey(a => a.Id);
            entity.HasIndex(a => a.ActorId);
            entity.HasIndex(a => a.TargetEmail);
            entity.HasIndex(a => a.Timestamp);
            entity.Property(a => a.Action).IsRequired().HasMaxLength(64);
            entity.Property(a => a.ActorEmail).HasMaxLength(256);
            entity.Property(a => a.TargetEmail).HasMaxLength(256);
            entity.Property(a => a.Detail).HasMaxLength(512);
        });

        builder.Entity<UserPreference>(entity =>
        {
            entity.HasKey(p => p.UserId);
            entity.Property(p => p.UserId).HasMaxLength(450);
            entity.Property(p => p.Theme).HasMaxLength(16);
            entity.Property(p => p.ExportFormat).HasMaxLength(16);
            entity.Property(p => p.ImportFormat).HasMaxLength(16);
        });

        // SQL Server rejects ambiguous cascade paths; nothing is ever deleted here, so those links become Restrict.
        SqlServerCascadeGuard.RestrictAmbiguousCascades(builder);
    }
}