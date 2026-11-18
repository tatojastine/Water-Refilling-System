import { AppError, isValidState, seed } from './domain.mjs';

const documentId = 'station';
const maxAttempts = 12;

// A school-sized station fits in one MongoDB document. Its revision makes a
// stock reservation and its matching order visible in the same atomic write.
export function createMongoStore({ uri, database = 'aquarefresh', collection } = {}) {
  let client;
  let connection;

  async function getCollection() {
    if (collection) return collection;
    connection ??= (async () => {
      const { MongoClient } = await import('mongodb');
      client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, writeConcern: { w: 'majority' } });
      try {
        await client.connect();
        return client.db(database).collection('app_state');
      } catch (error) {
        await client.close().catch(() => {});
        throw error;
      }
    })().catch((error) => {
      connection = undefined;
      throw error;
    });
    return connection;
  }

  async function readDocument(records) {
    const document = await records.findOne({ _id: documentId });
    if (document === null) return null;
    if (!Number.isSafeInteger(document.revision) || document.revision < 1 || !isValidState(document.state)) {
      throw new AppError(503, 'INVALID_DATA_FILE', 'The account data in the database is invalid. Restore a verified backup.');
    }
    return document;
  }

  return {
    async read() {
      const document = await readDocument(await getCollection());
      return document?.state ?? seed();
    },
    async change(apply) {
      const records = await getCollection();
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const document = await readDocument(records);
        const state = document?.state ?? seed();
        const result = apply(state);
        if (!document) {
          try {
            await records.insertOne({ _id: documentId, revision: 1, state });
            return { state, result };
          } catch (error) {
            if (error.code !== 11000) throw error;
          }
        } else {
          const update = await records.updateOne(
            { _id: documentId, revision: document.revision },
            { $set: { state }, $inc: { revision: 1 } },
          );
          if (update.matchedCount === 1) return { state, result };
        }
      }
      throw new AppError(409, 'CONCURRENT_CHANGE', 'The station data changed while saving. Refresh and try again.');
    },
    async close() {
      if (connection) await connection.catch(() => {});
      await client?.close();
    },
  };
}
