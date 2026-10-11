using Coficab.ActionPlan.Application.Services;

namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// Remplit progressivement les embeddings manquants en arrière-plan
/// (sans bloquer les requêtes de recherche).
/// Le travail se fait par lots courts tant qu'il reste du retard ; une fois à jour, la tâche ne
/// interroge la base que rarement (Semantic:IdleMinutes, 30 par défaut) pour laisser une base
/// serverless s'endormir. En cas d'erreur (base en veille, ML arrêté), l'attente double jusqu'à 30 min.
/// Désactivable avec Semantic:BackfillEnabled=false.
/// </summary>
public class SemanticEmbeddingHostedService : BackgroundService
{
    private static readonly TimeSpan BusyDelay = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan MaxErrorDelay = TimeSpan.FromMinutes(30);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SemanticEmbeddingHostedService> _logger;
    private readonly bool _enabled;
    private readonly TimeSpan _idleDelay;

    public SemanticEmbeddingHostedService(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<SemanticEmbeddingHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _enabled = configuration.GetValue("Semantic:BackfillEnabled", true);
        _idleDelay = TimeSpan.FromMinutes(Math.Max(1, configuration.GetValue("Semantic:IdleMinutes", 30)));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_enabled)
        {
            _logger.LogInformation("Semantic backfill disabled (Semantic:BackfillEnabled=false)");
            return;
        }

        if (!await WaitAsync(TimeSpan.FromSeconds(15), stoppingToken)) return;

        var errorDelay = TimeSpan.FromMinutes(1);
        while (!stoppingToken.IsCancellationRequested)
        {
            TimeSpan next;
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var semantic = scope.ServiceProvider.GetRequiredService<ISemanticSearchService>();
                var n = await semantic.BackfillMissingAsync(12, stoppingToken);
                if (n > 0)
                    _logger.LogInformation("Semantic backfill: {Count} embeddings added", n);
                errorDelay = TimeSpan.FromMinutes(1);
                next = n > 0 ? BusyDelay : _idleDelay;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Semantic background backfill failed; retrying in {Delay}", errorDelay);
                next = errorDelay;
                errorDelay = TimeSpan.FromTicks(Math.Min(errorDelay.Ticks * 2, MaxErrorDelay.Ticks));
            }

            if (!await WaitAsync(next, stoppingToken)) return;
        }
    }

    private static async Task<bool> WaitAsync(TimeSpan delay, CancellationToken token)
    {
        try { await Task.Delay(delay, token); return true; }
        catch (OperationCanceledException) { return false; }
    }
}
