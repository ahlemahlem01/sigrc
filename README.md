# SIGRC — Gestion des réclamations qualité Coficab

Application de suivi des réclamations clients, des dossiers 8D et des plans d'action.

| Composant | Technologie | Dossier |
|---|---|---|
| Interface | React 19 | `coficab-auth-frontend` |
| API d'authentification (OpenIddict, rôles, permissions) | ASP.NET Core 9 | `Coficab.Auth/Coficab.Auth.API` |
| API réclamations, 8D, plans d'action, KPI | ASP.NET Core 9 (MediatR, FluentValidation, Dapper) | `Coficab.Auth/Coficab.ActionPlan.*` |
| Service de prédiction et de recommandation | FastAPI (scikit-learn) | `ml-service` |
| Base de données | SQL Server (schémas `app_auth` et `actionplan`) | migrations EF Core dans chaque projet |

## Démarrer toute l'application (Docker)

Prérequis : Docker Desktop.

1. Copiez `.env.example` en `.env` et renseignez `MSSQL_SA_PASSWORD` (8 caractères minimum avec majuscule, minuscule, chiffre et symbole), ainsi que `SEED_SUPERADMIN_PASSWORD` et `SEED_ADMIN_PASSWORD` pour les deux comptes créés sur une base vide.
2. Lancez :

```bash
docker compose up -d --build
```

| Service | Adresse |
|---|---|
| Interface | http://localhost:3001 |
| API d'authentification | http://localhost:5119 (`/health`, `/health/ready`) |
| API plans et réclamations | http://localhost:5129 (`/health`) |
| Service ML | http://localhost:8001 (modifiable avec `ML_PORT`) |
| SQL Server | localhost:1433 |

Les migrations des deux bases sont appliquées automatiquement au démarrage des API. Si la base n'est pas encore prête (démarrage du conteneur, base serverless en veille), les API attendent et réessaient ; `/health/ready` répond 503 tant que ce n'est pas terminé.

Vérification automatique de la pile (santé, connexion, jeton accepté par la seconde API, KPI) :

```bash
SEED_ADMIN_PASSWORD=<mot de passe admin> python scripts/stack-smoke.py
```

Choix techniques à connaître :

- L'API plans partage le réseau de l'API d'authentification (`network_mode`) : l'adresse de l'émetteur de jetons (`http://localhost:5119/`) est ainsi la même pour le navigateur et pour les deux API, sans configuration de nom d'hôte ni accès internet. Si le conteneur d'authentification est recréé, redémarrez aussi l'API plans.
- La version de SQL Server se règle avec `MSSQL_IMAGE` (2019 par défaut, 2022 possible, voir `.env.example`).
- Les clés de signature des jetons sont conservées dans un volume Docker (`authkeys`) ; sans lui, chaque recréation du conteneur déconnecterait tout le monde.

Pour ne lancer que la base et exécuter les API depuis l'IDE : `docker compose up -d sqlserver`.

## Développement sans Docker

Les API lisent leurs réglages dans les variables d'environnement (ou les *user secrets* .NET). Le minimum :

| Variable | Rôle |
|---|---|
| `ConnectionStrings__DefaultConnection` | chaîne de connexion SQL Server (entre guillemets si elle contient `;`) |
| `Auth__Issuer` | URL publique de l'API d'authentification avec `/` final, identique sur les deux API |
| `Cors__AllowedOrigins` | URL du frontend (plusieurs séparées par des virgules) |
| `Frontend__Url` | URL du frontend, utilisée dans le lien de réinitialisation du mot de passe |
| `AuthApi__BaseUrl` | URL de l'API d'authentification, vue depuis l'API plans |
| `MlService__BaseUrl` | URL du service ML |
| `Seed__SuperAdminPassword`, `Seed__AdminPassword` | mots de passe des comptes créés au premier démarrage (absents en production : comptes non créés) |

Optionnelles : `MlFeatures__DatasetApiKey` (accès au jeu d'entraînement sans jeton admin), `Gemini__ApiKey` (recherche sémantique), `Semantic__BackfillEnabled` et `Semantic__IdleMinutes` (calcul des embeddings en arrière-plan, toutes les 30 minutes par défaut une fois à jour), `Database__AutoMigrate=false` (n'applique pas les migrations de l'API plans au démarrage), `EmailSettings__*` (SMTP).

Le frontend lit `REACT_APP_AUTH_API_URL`, `REACT_APP_ACTION_PLAN_API_URL` (suffixe `/api`) et `REACT_APP_ML_API_URL` au moment de la compilation (`coficab-auth-frontend/.env.example`).

Les chaînes de connexion SQL Server acceptent `Connect Timeout`, `ConnectRetryCount` et `ConnectRetryInterval` ; les valeurs par défaut sont 60 s, 6 essais et 10 s, pour attendre une base qui démarre.

## Tests

```bash
cd Coficab.Auth && dotnet test          # xUnit : unitaires, intégration, modèle SQL Server
cd ml-service && pytest tests           # service ML
cd coficab-auth-frontend && npm test -- --watchAll=false
```

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) :

| Job | Quand | Action |
|---|---|---|
| Frontend build and tests | pull request et push | `npm ci`, `npm run build` (ESLint inclus), `npm test` |
| Backend unit + integration | pull request et push | `dotnet build`, vérification que les migrations correspondent aux modèles (`dotnet ef migrations has-pending-model-changes`), puis xUnit |
| ML service tests | pull request et push | pytest |
| Docker stack on SQL Server | pull request et push | `docker compose up --build` sur une base vide (migrations et seed réels), puis `scripts/stack-smoke.py` |
| CI | après les quatre jobs | échoue si l'un a échoué |
| Deploy staging | push sur `main`, si CI est vert | frontend sur Vercel (preview) |
| Deploy production | après staging | frontend sur Vercel `--prod`. L'approbation manuelle se règle dans GitHub (`Settings` → `Environments` → `production` → *Required reviewers*) |

Les pull requests ne déploient rien. Les API, le service ML et la base ne sont pas déployés par la CI : ils tournent avec `docker compose` sur le serveur de démonstration.

### Secrets GitHub (environnements `staging` et `production`)

| Secret | Usage |
|---|---|
| `VERCEL_TOKEN` | jeton Vercel (Account Settings → Tokens) |
| `VERCEL_ORG_ID` | équipe ou compte, visible dans `.vercel/project.json` après `vercel link` |
| `VERCEL_PROJECT_ID` | projet Vercel lié à `coficab-auth-frontend` |

Sur Vercel, renseignez pour Preview et Production `REACT_APP_AUTH_API_URL`, `REACT_APP_ACTION_PLAN_API_URL` et `REACT_APP_ML_API_URL` (adresses publiques des API).

## Mise en ligne sur un serveur

Sur une machine Linux avec Docker : copiez le dépôt, créez le `.env` (avec `PUBLIC_HOST` = nom DNS du serveur), puis `docker compose up -d --build`. Pour l'accès HTTPS, placez un proxy (Caddy) devant les ports 5119 et 5129 et réglez `Auth__Issuer` et `Cors__AllowedOrigins` sur les adresses publiques.

En production (`ASPNETCORE_ENVIRONMENT=Production`) :

| Variable | Service | Valeur |
|---|---|---|
| `Auth__Issuer` | Auth **et** plans, même valeur | URL publique de l'API d'authentification avec `/` final |
| `Auth__SigningCertificate__Base64`, `Auth__SigningCertificate__Password` | Auth | certificat PFX encodé en base64 et son mot de passe |
| `Auth__EncryptionCertificate__Base64`, `Auth__EncryptionCertificate__Password` | Auth | idem, un second certificat |

Sans certificats, l'API d'authentification démarre avec des clés éphémères et le journalise : chaque redémarrage déconnecte tout le monde. Pour en générer un :

```powershell
$cert = New-SelfSignedCertificate -Subject "CN=Coficab Signing" -KeyUsage DigitalSignature -KeyExportPolicy Exportable -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(2)
$pwd = ConvertTo-SecureString "<mot de passe>" -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath signing.pfx -Password $pwd
[Convert]::ToBase64String([IO.File]::ReadAllBytes("signing.pfx"))
```

Pour le certificat de chiffrement, refaites la même chose avec `-Subject "CN=Coficab Encryption" -KeyUsage KeyEncipherment`.

Le frontend se connecte avec le client OpenIddict public `coficab-frontend`, sans secret. Le client `postman-test` n'existe qu'en Development.

## Images Docker

- `Coficab.Auth/Dockerfile.auth` — API d'authentification, écoute `$PORT`
- `Coficab.Auth/Dockerfile.actionplan` — API plans et réclamations
- `ml-service/Dockerfile` — FastAPI, avec un modèle de test généré à l'image
- `coficab-auth-frontend/Dockerfile` — compilation React puis nginx

## Ajouter une étape à la CI

Dans `.github/workflows/ci.yml`, ajoutez un step au job concerné, par exemple après `npm test` :

```yaml
      - name: Audit npm
        run: npm audit --audit-level=high
```

Si l'étape doit empêcher le déploiement, placez-la dans `frontend`, `backend-tests`, `ml-tests` ou `docker-stack` : le job `CI` bloque `deploy-staging` dès qu'un de ces jobs échoue.
