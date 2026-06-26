/**
 * Script: copy-db-test-to-prod.mjs
 * Copia tutte le collection dal DB "test" a "portfolio_prod" su Railway MongoDB.
 * NON elimina il DB originale (operazione non distruttiva).
 *
 * Uso:
 *   MONGODB_URI="mongodb://user:pass@host:port/test?authSource=admin" \
 *   node scripts/copy-db-test-to-prod.mjs
 *
 * Dopo l'esecuzione aggiorna la variabile MONGODB_URI su Railway sostituendo
 * "/test?" con "/portfolio_prod?" nella stringa di connessione.
 */

import { MongoClient } from 'mongodb';

const SOURCE_DB = 'test';
const TARGET_DB = 'portfolio_prod';
const BATCH_SIZE = 500;

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('❌ Imposta MONGODB_URI come variabile d\'ambiente');
  process.exit(1);
}

// Costruisce URI base senza nome DB per poter accedere a entrambi i DB
const baseUri = uri.replace(/\/[^/?]+(\?|$)/, '/$1').replace(/\/$/, '');

const maskedUri = uri.replace(/:([^:@]+)@/, ':<credentials>@');
console.log(`\n📦 MongoDB: ${maskedUri}`);
console.log(`📤 Sorgente: ${SOURCE_DB}`);
console.log(`📥 Destinazione: ${TARGET_DB}\n`);

const client = new MongoClient(uri.replace(/\/[^/?]+(\?|$)/, '/admin$1'));

try {
  await client.connect();

  const sourceDb = client.db(SOURCE_DB);
  const targetDb = client.db(TARGET_DB);

  // Ottieni lista collection
  const collections = await sourceDb.listCollections().toArray();
  if (collections.length === 0) {
    console.log(`⚠️  Nessuna collection trovata nel DB "${SOURCE_DB}"`);
    process.exit(0);
  }

  console.log(`🗂️  Collection trovate: ${collections.map(c => c.name).join(', ')}\n`);

  let totalCopied = 0;
  let totalErrors = 0;

  for (const collInfo of collections) {
    const collName = collInfo.name;
    if (collName.startsWith('system.')) continue;

    const sourceColl = sourceDb.collection(collName);
    const targetColl = targetDb.collection(collName);

    const sourceCount = await sourceColl.countDocuments();
    console.log(`📋 [${collName}] — ${sourceCount} documenti`);

    if (sourceCount === 0) {
      console.log(`   ⏭  Vuota, saltata\n`);
      continue;
    }

    // Controlla se la collection target ha già dati
    const targetCount = await targetColl.countDocuments();
    if (targetCount > 0) {
      console.log(`   ⚠️  Target già contiene ${targetCount} documenti — elimino e riscrivo`);
      await targetColl.drop();
    }

    // Copia a batch per gestire collection grandi
    let copied = 0;
    const cursor = sourceColl.find({});
    let batch = [];

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      batch.push(doc);

      if (batch.length >= BATCH_SIZE) {
        await targetColl.insertMany(batch, { ordered: false });
        copied += batch.length;
        batch = [];
        process.stdout.write(`\r   📄 Copiati: ${copied}/${sourceCount}`);
      }
    }

    if (batch.length > 0) {
      await targetColl.insertMany(batch, { ordered: false });
      copied += batch.length;
    }

    // Ricrea gli indici
    const indexes = await sourceColl.indexes();
    for (const index of indexes) {
      if (index.name === '_id_') continue;
      const { key, name, ...options } = index;
      try {
        await targetColl.createIndex(key, { ...options, name });
      } catch {
        // Ignora errori di indice duplicato
      }
    }

    const finalCount = await targetColl.countDocuments();
    if (finalCount === sourceCount) {
      console.log(`\r   ✅ [${collName}] → ${finalCount}/${sourceCount} documenti copiati + indici\n`);
      totalCopied += finalCount;
    } else {
      console.log(`\r   ❌ [${collName}] → conteggio non corrisponde: ${finalCount} vs ${sourceCount}\n`);
      totalErrors++;
    }
  }

  console.log('─────────────────────────────────────────────');
  console.log(`✅ Documenti copiati: ${totalCopied} | ❌ Errori: ${totalErrors}`);
  console.log('─────────────────────────────────────────────\n');

  if (totalErrors === 0) {
    console.log('🎉 Migrazione completata con successo!');
    console.log('');
    console.log('📋 PROSSIMO PASSO — Aggiorna MONGODB_URI su Railway:');
    console.log('   Vecchio: .../<host:port>/test?authSource=admin');
    console.log('   Nuovo:   .../<host:port>/portfolio_prod?authSource=admin');
    console.log('');
    console.log('   Railway Dashboard → Backend service → Variables → MONGODB_URI');
  } else {
    console.log('⚠️  Alcune collection hanno avuto errori. Verifica prima di aggiornare Railway.');
  }

} catch (err) {
  console.error('❌ Errore:', err.message);
  process.exit(1);
} finally {
  await client.close();
}
