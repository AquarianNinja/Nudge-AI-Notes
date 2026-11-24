import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COREDATA_CONTAINER_ID,
  COREDATA_EMBEDDING_DIM,
  computeTextEmbedding,
  cosineSimilarity,
  createInitialCoreDataStore,
  deleteCoreDataDocument,
  extractDomainEntities,
  toLocalDocument,
  upsertCoreDataDocument
} from './coreDataVectorDb.ts';

test('computeTextEmbedding produces L2-normalized 128-dim vectors with strong semantic similarity', () => {
  const a = computeTextEmbedding('Guidewire ClaimCenter FNOL initial reserve Gosu rules');
  const b = computeTextEmbedding('ClaimCenter FNOL reserve allocation in Gosu');
  const c = computeTextEmbedding('Sourdough hydration fermentation starter schedule');

  assert.equal(a.length, COREDATA_EMBEDDING_DIM);
  const norm = Math.sqrt(a.reduce((acc, v) => acc + v * v, 0));
  assert.ok(Math.abs(norm - 1.0) < 0.01);

  assert.ok(cosineSimilarity(a, b) > cosineSimilarity(a, c));
});

test('CoreData Cloud Vector DB seeds, upserts, and deletes documents and chunk embeddings cleanly', () => {
  const store = createInitialCoreDataStore();
  assert.equal(store.containerId, COREDATA_CONTAINER_ID);
  assert.equal(store.embeddingDim, 128);
  assert.equal(store.documents.length, 3);
  assert.ok(store.chunks.length >= 6);

  const { nextStore, document, chunks } = upsertCoreDataDocument(store, {
    id: 'doc-uploaded-epub',
    title: 'Guidewire_Billing_Guide.epub',
    format: 'EPUB',
    assetKind: 'document',
    sizeKB: 420,
    text: 'BillingCenter reconciles deductible payments and direct bill invoices asynchronously.',
    sections: [
      {
        label: 'Chapter 1',
        text: 'BillingCenter reconciles deductible payments and direct bill invoices asynchronously.'
      }
    ],
    tags: ['BillingCenter', 'EPUB']
  });

  assert.equal(document.entityName, 'CDDocument');
  assert.ok(document.managedObjectId.startsWith(COREDATA_CONTAINER_ID));
  assert.equal(chunks[0].entityName, 'CDChunkEmbedding');
  assert.equal(nextStore.documents.length, 4);
  assert.equal(toLocalDocument(document).format, 'EPUB');

  const afterDelete = deleteCoreDataDocument(nextStore, 'doc-uploaded-epub');
  assert.equal(afterDelete.documents.length, 3);
  assert.ok(afterDelete.chunks.every((c) => c.documentId !== 'doc-uploaded-epub'));
});

test('extractDomainEntities detects acronyms, PascalCase symbols, and domain endpoints', () => {
  const ents = extractDomainEntities(
    'POST /claim/v1/claims calls IPolicySearchAdapter during FNOL in ClaimCenter.'
  );
  assert.ok(ents.includes('POST'));
  assert.ok(ents.includes('FNOL'));
  assert.ok(ents.includes('/claim/v1/claims'));
  assert.ok(ents.includes('ClaimCenter'));
});
