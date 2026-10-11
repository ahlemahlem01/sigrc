using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace Coficab.Auth.API.Services;

public class EmailService
{
    private readonly IConfiguration _config;

    public EmailService(IConfiguration config) => _config = config;

    // ─── Shared SMTP sender ───────────────────────────────────

    private async Task SendAsync(MimeMessage message)
    {
        var settings = _config.GetSection("EmailSettings");

        using var smtp = new SmtpClient();
        await smtp.ConnectAsync(
            Required(settings, "Host"),
            int.Parse(settings["Port"]!),
            SecureSocketOptions.StartTls);
        await smtp.AuthenticateAsync(Required(settings, "Username"), Required(settings, "Password"));
        await smtp.SendAsync(message);
        await smtp.DisconnectAsync(true);
    }

    private MailboxAddress FromAddress()
    {
        var settings = _config.GetSection("EmailSettings");
        return new MailboxAddress(settings["FromName"], Required(settings, "Username"));
    }

    private static string Required(IConfigurationSection settings, string key)
        => settings[key] is { Length: > 0 } value
            ? value
            : throw new InvalidOperationException($"{settings.Path}:{key} is not configured.");

    // ─── Reset password ───────────────────────────────────────

    public async Task SendResetPasswordEmailAsync(string toEmail, string resetLink)
    {
        var message = new MimeMessage();
        message.From.Add(FromAddress());
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = "Réinitialisation de mot de passe – Coficab";
        message.Body = new TextPart("html")
        {
            Text = $"""
                <h2>Réinitialisation de mot de passe</h2>
                <p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe :</p>
                <a href="{resetLink}">Réinitialiser mon mot de passe</a>
                <p>Ce lien expire dans 1 heure.</p>
                <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
            """
        };

        await SendAsync(message);
    }

    // ─── Welcome / account created ────────────────────────────

    public async Task SendWelcomeEmailAsync(string toEmail, string fullName, string temporaryPassword)
    {
        var message = new MimeMessage();
        message.From.Add(FromAddress());
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = "Bienvenue sur Coficab – Vos identifiants de connexion";
        message.Body = new TextPart("html")
        {
            Text = $"""
                <h2>Bienvenue, {fullName} !</h2>
                <p>Votre compte Coficab a été créé. Voici vos identifiants temporaires :</p>
                <table cellpadding="8" style="border-collapse:collapse;">
                  <tr>
                    <td><strong>Email</strong></td>
                    <td>{toEmail}</td>
                  </tr>
                  <tr>
                    <td><strong>Mot de passe temporaire</strong></td>
                    <td style="font-family:monospace;">{temporaryPassword}</td>
                  </tr>
                </table>
                <p style="margin-top:16px;">
                  Pour des raisons de sécurité, veuillez changer votre mot de passe
                  dès votre première connexion.
                </p>
                <p>Si vous n'êtes pas à l'origine de cette demande, contactez votre administrateur immédiatement.</p>
            """
        };

        await SendAsync(message);
    }

    // ─── Account locked ───────────────────────────────────────

    public async Task SendLockoutEmailAsync(string toEmail, string fullName, DateTimeOffset lockoutEnd)
    {
        var message = new MimeMessage();
        message.From.Add(FromAddress());
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = "Compte verrouillé – Coficab";
        message.Body = new TextPart("html")
        {
            Text = $"""
                <h2>Compte temporairement verrouillé</h2>
                <p>Bonjour {fullName},</p>
                <p>
                  Votre compte Coficab a été <strong>verrouillé</strong> suite à plusieurs
                  tentatives de connexion échouées.
                </p>
                <table cellpadding="8" style="border-collapse:collapse;">
                  <tr>
                    <td><strong>Email</strong></td>
                    <td>{toEmail}</td>
                  </tr>
                  <tr>
                    <td><strong>Déverrouillage automatique</strong></td>
                    <td>{lockoutEnd.ToLocalTime():dd/MM/yyyy HH:mm}</td>
                  </tr>
                </table>
                <p style="margin-top:16px;">
                  Si vous n'êtes pas à l'origine de ces tentatives, contactez votre
                  administrateur immédiatement.
                </p>
                <p>Un administrateur peut également déverrouiller votre compte manuellement.</p>
            """
        };

        await SendAsync(message);
    }
}