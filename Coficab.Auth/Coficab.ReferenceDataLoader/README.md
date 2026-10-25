# Coficab data seeder

## Jeu réaliste (recommandé pour la démo / PFE)

```powershell
dotnet run --project .\Coficab.Auth\Coficab.ReferenceDataLoader -c Release --no-launch-profile
```

- ~1200 réclamations + ~180 CAPA, libellés métier FR (soudure, isolation, sertissage…)
- Pics récents sur `Soudure défectueuse` / `WR-04` (alertes anomalie)
- Sans préfixe `[REFDATA]` dans l’UI
- Retire automatiquement les anciennes entrées `[REFDATA]`
- Attribue une partie des dossiers à Ahlem si le compte existe

Options :

```powershell
dotnet run --project .\Coficab.Auth\Coficab.ReferenceDataLoader -c Release --no-launch-profile -- --claims=800
dotnet run --project .\Coficab.Auth\Coficab.ReferenceDataLoader -c Release --no-launch-profile -- --mode=testdata
```

## Ordre du D4 (mise à niveau additive)

Le D4 suit l'ordre D3 → Ishikawa → Pareto (cause prioritaire) → 5 Pourquoi. Le jeu réaliste le respecte : chaque
réclamation reçoit les éléments que son stade implique (dossier 8D avec D1–D3, causes Ishikawa, cause prioritaire,
réponses 5 Pourquoi). Pour mettre à niveau une base déjà remplie, sans rien supprimer ni réécrire :

```powershell
# aperçu : n'écrit rien, affiche ce qui serait ajouté
dotnet run --project .\Coficab.Auth\Coficab.ReferenceDataLoader -c Release --no-launch-profile -- --mode=d4-upgrade
# écriture (ajouts uniquement, idempotent)
dotnet run --project .\Coficab.Auth\Coficab.ReferenceDataLoader -c Release --no-launch-profile -- --mode=d4-upgrade --apply
```

## Mode legacy `[REFDATA]`

```powershell
dotnet run --project .\Coficab.Auth\Coficab.ReferenceDataLoader -c Release --no-launch-profile -- --mode=testdata
```

Emails seed : `seed.employee01@coficab.test` … mot de passe `TestEmployee@1234`.
