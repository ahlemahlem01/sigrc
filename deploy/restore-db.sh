#!/usr/bin/env bash
# Replaces the content of a database with a backup made by backup-db.sh.   bash deploy/restore-db.sh <file.bak> [database=coficab]
# Stop the APIs first:  docker compose stop auth-api actionplan-api   (and start them again afterwards).
set -euo pipefail
IN="${1:?backup file}"; DB="${2:-coficab}"
export MSYS_NO_PATHCONV=1
SQLCMD='if [ -x /opt/mssql-tools18/bin/sqlcmd ]; then S=/opt/mssql-tools18/bin/sqlcmd; C=-C; else S=/opt/mssql-tools/bin/sqlcmd; C=; fi; $S $C -S localhost -U sa -P "$MSSQL_SA_PASSWORD"'
docker cp "$IN" sigrc_sqlserver:/var/opt/mssql/restore.bak
# Logical file names of the backup (data first, then log).
FILES="$(docker exec sigrc_sqlserver bash -c "$SQLCMD -h -1 -W -s '|' -Q \"SET NOCOUNT ON; RESTORE FILELISTONLY FROM DISK='/var/opt/mssql/restore.bak'\"" | cut -d'|' -f1,3 | grep '|[DL]$')"
DATA="$(echo "$FILES" | grep '|D$' | head -1 | cut -d'|' -f1)"; LOG="$(echo "$FILES" | grep '|L$' | head -1 | cut -d'|' -f1)"
docker exec sigrc_sqlserver bash -c "$SQLCMD -b -Q \"ALTER DATABASE [$DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE\"" 2>/dev/null || true
docker exec sigrc_sqlserver bash -c "$SQLCMD -b -Q \"RESTORE DATABASE [$DB] FROM DISK='/var/opt/mssql/restore.bak' WITH REPLACE, MOVE '$DATA' TO '/var/opt/mssql/data/$DB.mdf', MOVE '$LOG' TO '/var/opt/mssql/data/${DB}_log.ldf'\""
docker exec sigrc_sqlserver bash -c "$SQLCMD -b -Q \"ALTER DATABASE [$DB] SET MULTI_USER\""
docker exec sigrc_sqlserver rm -f /var/opt/mssql/restore.bak
echo "Database $DB restored from $IN"
