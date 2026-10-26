/**
 * ESTRIVA - Outbox Pattern para Sincronização Offline-First
 * Migrado de fontes-legadas/engenharia-aberta-cloud-004/core/indexeddb-outbox-e2e.js
 */

const OUTBOX_DB = 'estriva-outbox';
const OUTBOX_VERSION = 1;
const OUTBOX_STORE = 'jobs';

interface OutboxJob {
  id: string;
  type: 'CREATE_PROJECT' | 'ADD_OCCURRENCE' | 'UPDATE_PROJECT' | 'DELETE_PROJECT' | 'BACKUP' | 'RESTORE';
  payload: unknown;
  createdAt: string;
  retries: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  lastError?: string;
}

function waitTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Gravação da fila cancelada'));
    tx.onerror = () => reject(tx.error ?? new Error('Erro ao gravar fila'));
  });
}

async function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB não suportado');
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB, OUTBOX_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('Erro ao abrir fila'));
    req.onblocked = () => reject(new Error('Fila bloqueada por outra aba'));
  });
}

async function writeRecord(record: OutboxJob, method: 'add' | 'put'): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    const done = waitTx(tx);
    try {
      tx.objectStore(OUTBOX_STORE)[method](record);
    } catch (error) {
      try { tx.abort(); } catch {}
      await done.catch(() => {});
      throw error;
    }
    await done;
  } finally {
    db.close();
  }
}

export const outbox = {
  async add(job: Omit<OutboxJob, 'id' | 'createdAt' | 'retries' | 'status'>): Promise<string> {
    const id = newId();
    const record: OutboxJob = {
      ...job,
      id,
      createdAt: new Date().toISOString(),
      retries: 0,
      status: 'pending',
    };
    await writeRecord(record, 'add');
    return id;
  },

  async put(record: OutboxJob): Promise<void> {
    await writeRecord(record, 'put');
  },

  async get(id: string): Promise<OutboxJob | undefined> {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, 'readonly');
        const req = tx.objectStore(OUTBOX_STORE).get(id);
        let record: OutboxJob | undefined;
        req.onsuccess = () => { record = req.result; };
        req.onerror = () => reject(req.error ?? new Error('Falha ao ler fila'));
        tx.oncomplete = () => resolve(record);
        tx.onerror = () => reject(tx.error ?? new Error('Falha na transação de leitura'));
        tx.onabort = () => reject(tx.error ?? new Error('Leitura cancelada'));
      });
    } finally {
      db.close();
    }
  },

  async getAllPending(): Promise<OutboxJob[]> {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, 'readonly');
        const req = tx.objectStore(OUTBOX_STORE).getAll();
        req.onsuccess = () => {
          const all = req.result as OutboxJob[];
          const pending = all.filter(j => j.status === 'pending' || j.status === 'failed');
          resolve(pending);
        };
        req.onerror = () => reject(req.error ?? new Error('Falha ao ler fila'));
        tx.oncomplete = () => {};
        tx.onerror = () => reject(tx.error ?? new Error('Falha na transação de leitura'));
      });
    } finally {
      db.close();
    }
  },

  async markProcessing(id: string): Promise<void> {
    const job = await this.get(id);
    if (job) {
      job.status = 'processing';
      job.retries += 1;
      await this.put(job);
    }
  },

  async markCompleted(id: string): Promise<void> {
    const job = await this.get(id);
    if (job) {
      job.status = 'completed';
      await this.put(job);
    }
  },

  async markFailed(id: string, error: string): Promise<void> {
    const job = await this.get(id);
    if (job) {
      job.status = 'failed';
      job.lastError = error;
      await this.put(job);
    }
  },

  async clearCompleted(): Promise<number> {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, 'readwrite');
        const store = tx.objectStore(OUTBOX_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          const all = req.result as OutboxJob[];
          let count = 0;
          for (const job of all) {
            if (job.status === 'completed') {
              store.delete(job.id);
              count++;
            }
          }
          tx.oncomplete = () => resolve(count);
        };
        req.onerror = () => reject(req.error ?? new Error('Falha ao limpar fila'));
      });
    } finally {
      db.close();
    }
  },
};

function newId(): string {
  return crypto.randomUUID();
}