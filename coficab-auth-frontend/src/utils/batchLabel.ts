/**
 * The demonstration data loaded at the start (batches named REFERENCE-DATASET - ...) are shown under a readable name; the name stored
 * with the batch is not changed (the overview recognizes these batches by it). A real import shows the name of its file.
 */
export function batchLabel(fileName: string, t: (key: string) => string): string {
  if (!/^REFERENCE-DATASET/i.test(fileName)) return fileName;
  const n = fileName.toLowerCase();
  const kind = n.includes('catalogue 25') ? 'catalog' : n.includes('cable varies') ? 'cableVaried' : n.includes('cable') ? 'cable' : 'base';
  return `${t('historyImport.demo.prefix')} · ${t(`historyImport.demo.${kind}`)}`;
}
