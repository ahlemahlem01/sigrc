# Jeu de référence et évaluation du modèle « livré à l'heure »

Les réclamations de test de l'application ne contiennent aucun lien entre l'employé et le respect du délai : aucun
modèle ne peut y apprendre quoi que ce soit (AUC 0,52 mesuré, c'est-à-dire le hasard). Ce dossier contient les outils
pour **valider la chaîne de traitement** sur des données simulées dont les relations sont connues, puis pour
l'évaluer honnêtement sur l'historique réel quand il sera disponible.

> Les données produites ici sont **simulées**. Elles ne doivent jamais être présentées comme des données Coficab.
> Elles sont chargées dans la base sous un lot d'import nommé « REFERENCE-DATASET », qui peut être archivé puis restauré
> depuis l'application (rien n'est supprimé).

| Fichier | Rôle |
|---|---|
| `generate.py` | génère des réclamations clôturées à partir d'un processus (capacité cachée des employés, charge, difficulté du défaut, gravité, bruit, retards exceptionnels). Les hypothèses sont listées en tête du fichier |
| `to_sql.py` | transforme le CSV en script SQL qui charge les réclamations comme un seul lot d'import « REFERENCE-DATASET » |
| `evaluate.py` | construit les variables sans fuite d'information (uniquement ce qui était connu à l'assignation), évalue par validation croisée et par découpage dans le temps, écrit `REPORT.md` |
| `REPORT.md` | dernier rapport (données simulées) |

```bash
# employees.csv : user_id,name,hire_date
python generate.py --employees employees.csv --out reference_claims.csv --truth truth.csv --n 3200 --seed 7
python evaluate.py --claims reference_claims.csv --truth truth.csv --report REPORT.md
python to_sql.py --claims reference_claims.csv --out load_reference_dataset.sql
sqlcmd -f 65001 -d coficab -i load_reference_dataset.sql
```

Pour retirer les données simulées de l'application : *Import historique → archiver le lot « REFERENCE-DATASET »*.
