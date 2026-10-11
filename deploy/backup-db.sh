#!/usr/bin/env bash
# Writes a backup of the database to a .bak file on this machine.   bash deploy/backup-db.sh <file.bak> [database=coficab]
set -euo pipefail
OUT="${1:?output file, e.g. coficab.bak}"; DB="${2:-coficab}"
export MSYS_NO_PATHCONV=1
SQLCMD='if [ -x /opt/mssql-tools18/bin/sqlcmd ]; then S=/opt/mssql-tools18/bin/sqlcmd; C=-C; else S=/opt/mssql-tools/bin/sqlcmd; C=; fi; $S $C -S localhost -U sa -P "$MSSQL_SA_PASSWORD"'
docker exec sigrc_sqlserver bash -c "$SQLCMD -b -Q \"BACKUP DATABASE [$DB] TO DISK='/var/opt/mssql/backup.bak' WITH INIT, COPY_ONLY\""
docker cp sigrc_sqlserver:/var/opt/mssql/backup.bak "$OUT"
docker exec sigrc_sqlserver rm -f /var/opt/mssql/backup.bak
echo "Backup written to $OUT"
