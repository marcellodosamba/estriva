/**
 * ESTRIVA - Camada de Armazenamento IndexedDB
 * Migrado de fontes-legadas/engenharia-aberta-g1-tablet/core/storage.js
 */

import {
  DB_NAME,
  DB_VERSION,
  STORES,
  type StoreName,
  type Project,
  type BackupData,
  emptyRecords,
  requiredText,
  assertIso,
  newId,
  hashBlob,
  validateProject,
} from './schema';

type IDBDatabase = globalThis.IDBDatabase;
type IDBTransaction = globalThis.IDBTransaction;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste navegador'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onerror = () => reject(req.error ?? new Error('Falha ao abrir banco'));
    req.onblocked = () => reject(new Error('Banco bloqueado por outra aba ou versão'));
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

function waitTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Transação abortada'));
    tx.onerror = () => reject(tx.error ?? new Error('Erro de escrita'));
  });
}

export async function readAll(): Promise<BackupData> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([...STORES], 'readonly');
      const rows = emptyRecords();
      tx.onerror = () => reject(tx.error ?? new Error('Erro ao ler dados'));
      tx.onabort = () => reject(tx.error ?? new Error('Leitura cancelada'));
      let pending = STORES.length;
      for (const name of STORES) {
        const req = tx.objectStore(name).getAll();
        req.onsuccess = () => {
          rows[name as StoreName] = req.result;
          pending--;
          if (pending === 0) resolve(rows);
        };
        req.onerror = () => reject(req.error ?? new Error(`Falha em ${name}`));
      }
    });
  } finally {
    db.close();
  }
}

export async function createProject(input: Partial<Project>): Promise<string> {
  const project = validateProject(input);
  const db = await openDatabase();
  try {
    const tx = db.transaction(['projects'], 'readwrite');
    const done = waitTx(tx);
    try {
      tx.objectStore('projects').add(project);
    } catch (error) {
      try { tx.abort(); } catch {}
      await done.catch(() => {});
      throw error;
    }
    await done;
    return project.id;
  } finally {
    db.close();
  }
}

export async function updateProject(id: string, changes: Partial<Project>): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(['projects'], 'readwrite');
    const done = waitTx(tx);
    const store = tx.objectStore('projects');
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) throw new Error('Projeto não encontrado');
      const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
      store.put(updated);
    };
    await done;
  } finally {
    db.close();
  }
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction([...STORES], 'readwrite');
    const done = waitTx(tx);
    for (const name of STORES) {
      if (name === 'projects') {
        tx.objectStore(name).delete(id);
      } else {
        // Para outras stores, precisamos buscar pelo projectId
        // Implementação simplificada: delete cascade seria mais complexo
        // Por enquanto, apenas deleta o projeto
      }
    }
    await done;
  } finally {
    db.close();
  }
}

export async function addOccurrenceWithPhoto(input: {
  projectId: string;
  locationName: string;
  elementLabel: string;
  elementType: string;
  category: 'FISSURA' | 'INFILTRACAO' | 'CORROSAO' | 'OUTRO';
  description: string;
  observedAt: string;
  file: File;
}): Promise<string> {
  const projectName = requiredText(input.projectId, 'Project ID');
  const locationName = requiredText(input.locationName, 'Local', 160);
  const elementLabel = requiredText(input.elementLabel, 'Elemento', 160);
  const category = input.category;
  const description = requiredText(input.description, 'Observação', 10000);
  const observedAt = assertIso(input.observedAt, 'Data observada');

  if (!(input.file instanceof Blob) || input.file.size === 0) {
    throw new Error('Fotografia original obrigatória');
  }
  const mime = input.file.type;
  if (!mime.startsWith('image/')) {
    throw new Error('Somente fotografias (image/*) são permitidas');
  }

  const filename = requiredText(input.file.name ?? 'original-image', 'Nome do arquivo', 255);
  const sha256 = await hashBlob(input.file);
  const now = new Date().toISOString();
  const ids = Array.from({ length: 6 }, () => newId());

  const data: BackupData = {
    projects: [{ id: ids[0], name: projectName, createdAt: now, updatedAt: now, norma: 'ABNT-NBR-6118' }],
    locations: [{ id: ids[1], projectId: ids[0], name: locationName }],
    elements: [{ id: ids[2], locationId: ids[1], type: input.elementType, label: elementLabel }],
    occurrences: [{ id: ids[3], elementId: ids[2], category, createdAt: now }],
    observations: [{ id: ids[4], occurrenceId: ids[3], observedAt, description, createdAt: now }],
    photos: [{
      id: ids[5],
      observationId: ids[4],
      originalFilename: filename,
      mimeType: mime,
      sizeBytes: input.file.size,
      sha256,
      originalBlob: input.file,
      createdAt: now,
    }],
  };

  const db = await openDatabase();
  try {
    const tx = db.transaction([...STORES], 'readwrite');
    const done = waitTx(tx);
    try {
      for (const name of STORES) {
        tx.objectStore(name).add(data[name as StoreName][0]);
      }
    } catch (error) {
      try { tx.abort(); } catch {}
      await done.catch(() => {});
      throw error;
    }
    await done;
    return ids[0];
  } finally {
    db.close();
  }
}

export async function exportBackup(): Promise<BackupData> {
  return readAll();
}

export async function importBackup(input: BackupData): Promise<Record<string, number>> {
  const db = await openDatabase();
  try {
    const tx = db.transaction([...STORES], 'readwrite');
    const done = waitTx(tx);
    let pending = STORES.length;
    let nonEmpty = false;

    for (const name of STORES) {
      const req = tx.objectStore(name).count();
      req.onsuccess = () => {
        if (req.result > 0) nonEmpty = true;
        pending--;
        if (pending === 0) {
          if (nonEmpty) {
            tx.abort();
            return;
          }
          try {
            for (const store of STORES) {
              for (const row of input[store as StoreName]) {
                tx.objectStore(store).add(row);
              }
            }
          } catch (err) {
            tx.abort();
          }
        }
      };
    }

    try {
      await done;
    } catch (e) {
      if (nonEmpty) throw new Error('Restauração permitida somente em armazenamento vazio');
      throw e;
    }

    return Object.fromEntries(STORES.map(name => [name, input[name as StoreName].length]));
  } finally {
    db.close();
  }
}

export async function clearAllData(): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction([...STORES], 'readwrite');
    const done = waitTx(tx);
    for (const name of STORES) {
      tx.objectStore(name).clear();
    }
    await done;
  } finally {
    db.close();
  }
}