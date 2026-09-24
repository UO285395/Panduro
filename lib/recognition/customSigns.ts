import type { CustomSign } from "@/lib/esku/domain/recognition/entities/CustomSign";
import type { ICustomSignRepository } from "@/lib/esku/domain/recognition/repositories/ICustomSignRepository";

const DATABASE = "panduro";
const STORE = "custom-signs";
const VERSION = 1;

/**
 * Signos enseñados por el usuario, guardados en su dispositivo (port del repositorio
 * IndexedDB de Esku). IndexedDB y no localStorage porque los prototipos son Float32Array,
 * que se guardan tal cual; y porque salen del cuerpo del usuario, no se sincronizan.
 */
export class IndexedDBCustomSignRepository implements ICustomSignRepository {
  private database: Promise<IDBDatabase> | null = null;

  async save(sign: CustomSign): Promise<void> {
    const database = await this.open();
    await run(database, "readwrite", (store) => store.put(sign));
  }

  async findAll(): Promise<CustomSign[]> {
    const database = await this.open();
    const signs = await run<CustomSign[]>(database, "readonly", (store) => store.getAll());
    return signs.sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  async delete(id: string): Promise<void> {
    const database = await this.open();
    await run(database, "readwrite", (store) => store.delete(id));
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.database;
  }
}

function run<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const request = operation(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
