using Coficab.ActionPlan.Core.DTOs.Claims;
using System.Text.RegularExpressions;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

/// <summary>
/// Guardrails IATF locaux pour le coach 5 Why (fallback si Gemini indisponible).
/// Logique Core Tools (AIAG/VDA) : même si une personne est impliquée, la question
/// qualité est "pourquoi le système n'a pas empêché / détecté ?"
/// </summary>
public static class FiveWhyCoachRules
{
    private static readonly string[] HumanErrorPatterns =
    {
        "erreur humaine", "erreur de l'operateur", "erreur operateur", "erreur opérateur",
        "faute de l'operateur", "faute operateur", "operateur a mal", "opérateur a mal",
        "negligence", "négligence", "inattention", "manque d'attention", "manque de vigilance",
        "a appuye sur le bouton", "a appuyé sur le bouton",
        "n'a pas fait attention", "pas fait attention", "pas paye attention", "pas payé attention",
        "n'a pas paye attention", "n'a pas payé attention",
        "erreur de manipulation", "mauvaise manipulation",
        // Attribution à une personne (faits souvent vrais, mais pas une cause IATF)
        "n'a pas constate", "n a pas constate", "pas constate le",
        "n'a pas vu", "n a pas vu", "pas vu le",
        "n'a pas detecte", "n a pas detecte", "pas detecte le",
        "n'a pas remarque", "n a pas remarque",
        "n'a pas controle", "n a pas controle",
        "a oublie", "a oublié", "oublie de",
        "le technicien n'a", "le technicien n a",
        "l'operateur n'a", "l operateur n'a", "l'opérateur n'a",
        "le controleur n'a", "l'inspecteur n'a",
        "pas constate le probleme", "pas constate le défaut", "pas constate le defaut",
        // Autres façons de mettre une personne en cause
        "distraction", "etourderie", "étourderie", "inadvertance", "maladresse", "mauvais geste",
        "s'est trompe", "s'est trompé", "se serait trompe", "a fait une erreur", "a commis une erreur",
        "erreur de saisie", "erreur de lecture", "erreur de reglage", "erreur de réglage", "erreur d'etiquetage", "erreur d'étiquetage",
        "fatigue de l'operateur", "fatigue de l'opérateur", "stress de l'operateur", "stress de l'opérateur",
        "non respect de la procedure", "non-respect de la procedure", "non respect de la procédure", "non-respect de la procédure",
        "n'a pas respecte", "n'a pas respecté", "n'a pas suivi la procedure", "n'a pas suivi la procédure",
        "n'a pas applique", "n'a pas appliqué", "a ignore la consigne", "a ignoré la consigne",
        "responsabilite de l'operateur", "responsabilité de l'opérateur", "faute de l'equipe", "faute de l'équipe"
    };

    // « le technicien … s'est trompé / était distrait / a mal réglé » : une personne et un reproche dans la même phrase.
    private static readonly Regex PersonBlamedRegex = new(
        @"\b(technicien|technicienne|operateur|operatrice|controleur|controleuse|inspecteur|agent|personne|equipe|employe|ouvrier|regleur|conducteur|collaborateur|magasinier|chef d equipe)\b.{0,70}\b(s est trompe|a mal|a commis|a omis|a neglige|a ignore|etait distrait|etait fatigue|a ete distrait|inattentif|distrait|fatigue|precipit|maladroit|incompetent|incompetence|ne connaissait pas|ne savait pas|mal lu|mal regle|mal positionne|mal installe|mal monte)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex PersonMissedRegex = new(
        @"\b(technicien|operateur|opérateur|controleur|contrôleur|inspecteur|agent|personne|equipe|équipe)\b.{0,50}\b(pas\s+(constate|constaté|vu|detecte|détecté|remarque|remarqué|controle|contrôlé)|oublie|oublié|neglige|négligé)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex MissedByPersonRegex = new(
        @"\b(n['’ ]?a\s+pas|sans)\s+(constate|constaté|vu|detecte|détecté|remarque|remarqué|controle|contrôlé)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly string[] ShallowPatterns =
    {
        "parce que", "je ne sais pas", "nsp", "aucune idee", "aucune idée",
        "probleme machine", "problème machine", "erreur", "defaut", "défaut"
    };

    public static ValidateFiveWhyStepResponseDto EvaluateLocally(ValidateFiveWhyStepRequestDto request)
    {
        var answer = (request.ProposedAnswer ?? string.Empty).Trim();
        var flags = new List<string>();
        var followUps = new List<string>();
        var branch = (request.Branch ?? "OCCURRENCE").Trim().ToUpperInvariant();
        var isDetection = branch == "DETECTION";

        if (string.IsNullOrWhiteSpace(answer) || answer.Length < 12)
        {
            return new ValidateFiveWhyStepResponseDto
            {
                IsAccepted = false,
                Severity = "BLOCK",
                Flags = new List<string> { "TOO_SHALLOW" },
                CoachMessage = "Réponse trop courte. Décrivez le fait technique (Quoi / Où / Quand / Condition) plutôt qu'une cause vague.",
                SuggestedFollowUpQuestions = new List<string>
                {
                    "Quel phénomène observable explique cette réponse ?",
                    "Quelle donnée process / contrôle la confirme ?"
                }
            };
        }

        var normalized = Normalize(answer);

        if (IsHumanAttribution(answer, normalized))
        {
            flags.Add("HUMAN_ERROR");
            followUps.AddRange(isDetection
                ? new[]
                {
                    "Pourquoi le moyen / standard de contrôle n'a-t-il pas rendu ce défaut visible ou non-acceptable ?",
                    "Y avait-il un critère d'acceptation, un poke-yoke, une alarme ou une fréquence de contrôle insuffisante ?",
                    "La méthode de détection (MSA, sampling, formation du poste) était-elle adaptée à ce mode de défaillance ?"
                }
                : new[]
                {
                    "Pourquoi le système (process / standard / poke-yoke) n'a-t-il pas empêché cette action ou condition ?",
                    "Y avait-il une alarme, une anomalie visuelle ou une consigne ambiguë ?",
                    "Quel mécanisme technique a rendu l'erreur possible ?"
                });
        }

        var wordCount = Regex.Split(answer, @"\s+").Count(w => w.Length > 1);
        if (wordCount <= 4 || (ShallowPatterns.Count(p => normalized == Normalize(p) || normalized.StartsWith(Normalize(p) + " ")) >= 1 && wordCount <= 6))
        {
            flags.Add("TOO_SHALLOW");
            followUps.Add("Quelle cause technique ou systémique sous-jacente reste à explorer ?");
        }

        var problem = Normalize(request.ProblemStatement ?? string.Empty);
        if (!string.IsNullOrWhiteSpace(problem) && problem.Length > 20 &&
            (normalized.Contains(problem) || problem.Contains(normalized)))
        {
            flags.Add("CIRCULAR");
            followUps.Add("Évitez de reformuler le problème : expliquez le mécanisme qui l'a généré.");
        }

        if (flags.Contains("HUMAN_ERROR"))
        {
            return new ValidateFiveWhyStepResponseDto
            {
                IsAccepted = false,
                Severity = "BLOCK",
                Flags = flags.Distinct().ToList(),
                CoachMessage = isDetection
                    ? "Attention (IATF 16949 / Core Tools) : « la personne n'a pas constaté / vu » décrit un symptôme, pas une cause racine. Même si un technicien a manqué le défaut, la vraie question est : pourquoi le système de détection n'a-t-il pas empêché ou signalé ce défaut ?"
                    : "Attention (IATF 16949 / Core Tools) : l'implication d'une personne n'est pas une cause racine acceptable. Même en cas d'erreur opérateur, pourquoi le système (process, standard, poke-yoke) n'a-t-il pas empêché ou détecté cette erreur ?",
                SuggestedFollowUpQuestions = followUps.Distinct().Take(3).ToList()
            };
        }

        if (flags.Contains("TOO_SHALLOW") || flags.Contains("CIRCULAR"))
        {
            return new ValidateFiveWhyStepResponseDto
            {
                IsAccepted = false,
                Severity = "WARN",
                Flags = flags.Distinct().ToList(),
                CoachMessage = "Cette réponse reste superficielle pour une analyse automobile. Approfondissez le mécanisme (process, moyen, standard, système) avant de passer au Pourquoi suivant.",
                SuggestedFollowUpQuestions = followUps.Distinct().Take(3).ToList()
            };
        }

        return new ValidateFiveWhyStepResponseDto
        {
            IsAccepted = true,
            Severity = "OK",
            Flags = new List<string>(),
            CoachMessage = "Réponse cohérente. Vous pouvez poursuivre le fil des Pourquoi.",
            SuggestedFollowUpQuestions = new List<string>()
        };
    }

    /// <summary>
    /// Évalue toute la chaîne d'une branche d'un coup (sans IA) : chaque réponse est jugée avec celles qui la précèdent, et une réponse
    /// qui répète une réponse précédente est signalée comme circulaire.
    /// </summary>
    public static List<(int StepNumber, ValidateFiveWhyStepResponseDto Result)> EvaluateChainLocally(ValidateFiveWhyChainRequestDto chain)
    {
        var ordered = (chain.Steps ?? new List<FiveWhyStepDto>()).OrderBy(s => s.StepNumber).ToList();
        var output = new List<(int, ValidateFiveWhyStepResponseDto)>();
        foreach (var step in ordered)
        {
            var request = StepRequest(chain, ordered, step);
            var result = EvaluateLocally(request);

            var answer = Normalize(step.Answer ?? string.Empty);
            var repeated = ordered.Any(p => p.StepNumber < step.StepNumber && answer.Length > 0 && Normalize(p.Answer ?? string.Empty) == answer);
            if (repeated && result.Severity == "OK")
            {
                result = new ValidateFiveWhyStepResponseDto
                {
                    IsAccepted = false,
                    Severity = "WARN",
                    Flags = new List<string> { "CIRCULAR" },
                    CoachMessage = "Cette réponse répète un Pourquoi précédent : la chaîne ne progresse pas. Cherchez le mécanisme qui explique le Pourquoi précédent.",
                    SuggestedFollowUpQuestions = new List<string> { "Qu'est-ce qui, techniquement, a rendu possible la réponse du Pourquoi précédent ?" }
                };
            }
            output.Add((step.StepNumber, result));
        }
        return output;
    }

    public static ValidateFiveWhyStepRequestDto StepRequest(ValidateFiveWhyChainRequestDto chain, IReadOnlyList<FiveWhyStepDto> ordered, FiveWhyStepDto step) => new()
    {
        StepNumber = step.StepNumber,
        Branch = chain.Branch,
        ProblemStatement = chain.ProblemStatement,
        ProposedAnswer = step.Answer ?? string.Empty,
        PreviousSteps = ordered.Where(p => p.StepNumber < step.StepNumber).ToList(),
    };

    /// <summary>
    /// Fusionne un avis Gemini avec le garde-fou local (le local peut forcer un BLOCK IATF).
    /// </summary>
    public static ValidateFiveWhyStepResponseDto MergeWithLocal(
        ValidateFiveWhyStepRequestDto request,
        ValidateFiveWhyStepResponseDto? aiResult)
    {
        var local = EvaluateLocally(request);
        if (aiResult == null)
            return local;

        // Priorité IATF : HUMAN_ERROR local → BLOCK, message Core Tools local (pas le ton permissif de Gemini).
        if (local.Flags.Contains("HUMAN_ERROR"))
        {
            return new ValidateFiveWhyStepResponseDto
            {
                IsAccepted = false,
                Severity = "BLOCK",
                Flags = local.Flags.Union(aiResult.Flags ?? new List<string>()).Distinct().ToList(),
                CoachMessage = local.CoachMessage,
                SuggestedFollowUpQuestions = local.SuggestedFollowUpQuestions.Count > 0
                    ? local.SuggestedFollowUpQuestions
                    : (aiResult.SuggestedFollowUpQuestions ?? new List<string>())
            };
        }

        if (local.Severity == "BLOCK" && local.Flags.Contains("TOO_SHALLOW") && answerTooShort(request.ProposedAnswer))
            return local;

        var sev = (aiResult.Severity ?? "OK").Trim().ToUpperInvariant();
        if (sev is not ("OK" or "WARN" or "BLOCK"))
            aiResult.Severity = aiResult.IsAccepted ? "OK" : "WARN";

        aiResult.IsAccepted = string.Equals(aiResult.Severity, "OK", StringComparison.OrdinalIgnoreCase);
        return aiResult;
    }

    private static bool IsHumanAttribution(string rawAnswer, string normalized)
    {
        if (HumanErrorPatterns.Any(p => normalized.Contains(Normalize(p))))
            return true;

        if (PersonMissedRegex.IsMatch(rawAnswer) || MissedByPersonRegex.IsMatch(rawAnswer))
            return true;

        // Variante normalisée sans accents déjà appliquée
        if (PersonMissedRegex.IsMatch(normalized) || MissedByPersonRegex.IsMatch(normalized))
            return true;

        if (PersonBlamedRegex.IsMatch(normalized.Replace('\'', ' ')))
            return true;

        return false;
    }

    private static bool answerTooShort(string? answer) =>
        string.IsNullOrWhiteSpace(answer) || answer.Trim().Length < 12;

    private static string Normalize(string input)
    {
        var s = input.Trim().ToLowerInvariant();
        s = s.Replace("é", "e").Replace("è", "e").Replace("ê", "e")
             .Replace("à", "a").Replace("â", "a")
             .Replace("î", "i").Replace("ï", "i")
             .Replace("ô", "o").Replace("ù", "u").Replace("û", "u")
             .Replace("ç", "c")
             .Replace("’", "'").Replace("`", "'");
        s = Regex.Replace(s, @"\s+", " ");
        return s;
    }
}
