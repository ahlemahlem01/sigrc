# Mise en ligne sur une VM Azure

Une seule machine virtuelle (Ubuntu) fait tourner SQL Server, les deux API et le service ML avec Docker. Caddy fournit le HTTPS. Le frontend reste sur Vercel.

```
Navigateur ──► Vercel (frontend)
     │
     └──► https://<nom-vm>        ─► Caddy ─► API d'authentification (émetteur des jetons)
          https://<nom-vm>:8443   ─► Caddy ─► API plans et réclamations (+ SignalR)
          https://<nom-vm>:8444   ─► Caddy ─► service ML
                                              SQL Server : pas exposé à internet
```

## 1. Créer la VM (portail Azure)

Tout dans **un seul groupe de ressources** (`rg-coficab`), région **Spain Central**, pour tout supprimer d'un coup à la fin.

| Réglage | Valeur |
|---|---|
| Image | Ubuntu Server 24.04 LTS (x64) |
| Taille | `B2s_v2` ou `B2as_v2` (2 vCPU, 8 Gio). SQL Server ne tourne pas sur les tailles ARM |
| Disque | Standard SSD, 64 Gio |
| Authentification | clé SSH (téléchargez le fichier `.pem`, gardez-le) |
| IP publique | créez-la avec une **étiquette DNS** : vous obtenez `<nom>.spaincentral.cloudapp.azure.com`, c'est le `PUBLIC_HOST` |
| Ports entrants (NSG) | 22 (SSH, limitez à votre adresse IP), 80, 443, 8443, 8444. **Jamais 1433** |
| Arrêt automatique | activez-le (par exemple 20 h) |

## 2. Protéger le crédit

Avant d'aller plus loin :

1. **Budget** : *Cost Management → Budgets*, montant 30 $, alertes à 50 %, 80 % et 100 % par e-mail.
2. **Arrêt automatique** de la VM (étape 1), et un arrêt manuel **« Désallouer »** (pas seulement « Arrêter » dans le système) quand vous ne l'utilisez pas : une VM désallouée ne coûte plus de calcul. Le disque et l'IP publique continuent de coûter quelques euros par mois.
3. Une seule VM, pas de SQL managé, pas d'autre service : rien d'autre ne consomme le crédit.
4. Après la soutenance : supprimez le groupe de ressources.

## 3. Envoyer le code et la base

Depuis votre PC (dossier du dépôt) :

```bash
git archive --format=tar.gz -o sigrc.tgz HEAD
bash deploy/backup-db.sh coficab.bak        # sauvegarde de votre base locale
scp -i <cle.pem> sigrc.tgz coficab.bak azureuser@<nom-vm>:~
```

Sur la VM :

```bash
mkdir sigrc && tar -xzf sigrc.tgz -C sigrc && cd sigrc
bash deploy/bootstrap-vm.sh <nom-vm>.spaincentral.cloudapp.azure.com https://<votre-app>.vercel.app
```

La première exécution installe Docker puis s'arrête : reconnectez-vous en SSH et relancez la même commande. Elle crée le `.env` (mots de passe aléatoires et certificats des jetons ; **gardez-en une copie privée**) puis démarre la pile.

Chargez ensuite vos données (les API créent d'abord les tables vides, puis la sauvegarde les remplace) :

```bash
docker compose stop auth-api actionplan-api
bash deploy/restore-db.sh ~/coficab.bak
docker compose -f docker-compose.yml -f deploy/docker-compose.azure.yml up -d
```

Vérifications :

```bash
curl https://<nom-vm>.spaincentral.cloudapp.azure.com/health/ready
curl https://<nom-vm>.spaincentral.cloudapp.azure.com:8443/health
curl https://<nom-vm>.spaincentral.cloudapp.azure.com:8444/health
```

## 4. Frontend sur Vercel

Dans les variables d'environnement du projet Vercel, puis redéploiement :

```
REACT_APP_AUTH_API_URL=https://<nom-vm>.spaincentral.cloudapp.azure.com
REACT_APP_ACTION_PLAN_API_URL=https://<nom-vm>.spaincentral.cloudapp.azure.com:8443/api
REACT_APP_ML_API_URL=https://<nom-vm>.spaincentral.cloudapp.azure.com:8444
```

## 5. Au quotidien

| Action | Commande |
|---|---|
| Voir l'état | `docker compose -f docker-compose.yml -f deploy/docker-compose.azure.yml ps` |
| Journaux d'une API | `docker logs --tail 100 sigrc_auth_api` |
| Redémarrer après un arrêt de la VM | rien à faire : les conteneurs ont `restart: unless-stopped` |
| Mise à jour du code | renvoyez l'archive, puis relancez `bash deploy/bootstrap-vm.sh ...` (le `.env` est conservé) |
| Sauvegarde | `bash deploy/backup-db.sh coficab.bak` |

Si le conteneur d'authentification est recréé, redémarrez aussi `actionplan-api` (il partage son réseau).
