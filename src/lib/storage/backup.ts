/**
 * ESTRIVA - Backup/Restore com Validação de Integridade
 * Migrado de fontes-legadas/engenharia-aberta-g1-tablet/core/backup.js
 */

import type { BackupData, BackupFile, PhotoInput, Photo, Project, Location, Element, Occurrence, Observation } from './schema';
import { requiredText, assertIso, hashBlob } from './schema';

function bytesToBase64(bytes: Uint8Array): string {
  let parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 16384) {
    let chunk = bytes.subarray(i, i + 16384);
    parts.push(String.fromCharCode(...chunk));
  }
  return btoa(parts.join(''));
}

function base64ToBytes(encoded: string): Uint8Array {
  if (typeof encoded !== 'string' || !encoded.length || encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error('Conteúdo base64 inválido');
  }
  const raw = atob(encoded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function recordObject(x: unknown, label: string): void {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error(`${label} inválido`);
}

function str(value: unknown, label: string, max = 10000): string {
  return requiredText(value, label, max);
}

function uniqueness(rows: { id: string }[], name: string): Set<string> {
  const found = new Set<string>();
  for (const row of rows) {
    const id = str(row.id, `${name}.id`, 200);
    if (found.has(id)) throw new Error(`ID duplicado em ${name}`);
    found.add(id);
  }
  return found;
}

function reference(row: Record<string, unknown>, field: string, parents: Set<string>): void {
  const id = str(row[field] as string, field, 200);
  if (!parents.has(id)) throw new Error(`Referência órfã ou vínculo inválido: ${field}`);
}

function parseArray<T>(src: unknown, label: string): T[] {
  if (!Array.isArray(src)) throw new Error(`Conjunto ${label} ausente`);
  return src as T[];
}

export async function prepareRestore(input: BackupFile): Promise<BackupData> {
  recordObject(input, 'Backup');
  if (input.format !== 'estriva-mapa-danos') throw new Error('Formato de backup desconhecido');
  if (input.schemaVersion !== 1) throw new Error('Versão de backup não suportada');
  assertIso(input.exportedAt, 'Data da exportação');
  recordObject(input.data, 'Dados do backup');

  const src = input.data;

  const projects = parseArray<Project>(src.projects, 'projects');
  const locations = parseArray<Location>(src.locations, 'locations');
  const elements = parseArray<Element>(src.elements, 'elements');
  const occurrences = parseArray<Occurrence>(src.occurrences, 'occurrences');
  const observations = parseArray<Observation>(src.observations, 'observations');
  const photosInput = parseArray<PhotoInput>(src.photos, 'photos');

  const ids = {
    projects: uniqueness(projects, 'projects'),
    locations: uniqueness(locations, 'locations'),
    elements: uniqueness(elements, 'elements'),
    occurrences: uniqueness(occurrences, 'occurrences'),
    observations: uniqueness(observations, 'observations'),
    photos: uniqueness(photosInput, 'photos'),
  };

  for (const p of projects) {
    str(p.name, 'Nome de projeto');
    assertIso(p.createdAt, 'Data do projeto');
    assertIso(p.updatedAt, 'Atualização do projeto');
  }
  for (const l of locations) {
    str(l.name, 'Local');
    reference(l, 'projectId', ids.projects);
  }
  for (const e of elements) {
    str(e.label, 'Elemento');
    str(e.type, 'Tipo');
    reference(e, 'locationId', ids.locations);
  }
  for (const o of occurrences) {
    str(o.category, 'Categoria');
    reference(o, 'elementId', ids.elements);
    assertIso(o.createdAt, 'Data da ocorrência');
  }
  for (const n of observations) {
    str(n.description, 'Observação');
    reference(n, 'occurrenceId', ids.observations);
    assertIso(n.observedAt, 'Data observada');
    assertIso(n.createdAt, 'Data do registro');
  }

  const photos: Photo[] = [];
  for (const p of photosInput) {
    reference(p, 'observationId', ids.observations);
    const mime = str(p.mimeType, 'MIME');
    if (!mime.startsWith('image/')) throw new Error('Tipo de fotografia não permitido');
    const filename = str(p.originalFilename, 'Nome de arquivo');
    const hex = str(p.sha256, 'Hash').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('Hash inválido');
    if (!Number.isSafeInteger(p.sizeBytes) || Number(p.sizeBytes) <= 0) throw new Error('Tamanho de foto inválido');
    assertIso(p.createdAt, 'Data da fotografia');
    const content = base64ToBytes(p.contentBase64);
    if (content.length !== p.sizeBytes) throw new Error('Falha de integridade: tamanho da fotografia difere');
    const copy = new Uint8Array(content.length);
    copy.set(content);
    const blob = new Blob([copy], { type: mime });
    if (await hashBlob(blob) !== hex) throw new Error('Falha de integridade: hash da fotografia difere');
    photos.push({
      id: str(p.id, 'ID foto'),
      observationId: p.observationId,
      originalFilename: filename,
      mimeType: mime,
      sizeBytes: content.length,
      sha256: hex,
      originalBlob: blob,
      createdAt: p.createdAt,
    });
  }

  return {
    projects,
    locations,
    elements,
    occurrences,
    observations,
    photos,
  };
}

export async function createBackup(records: BackupData): Promise<BackupFile> {
  const photos: PhotoInput[] = [];
  for (const p of records.photos) {
    if (!(p.originalBlob instanceof Blob) || p.originalBlob.size !== p.sizeBytes) {
      throw new Error('Foto original indisponível; exportação cancelada');
    }
    const digest = await hashBlob(p.originalBlob);
    if (p.sha256 && p.sha256 !== digest) {
      throw new Error('Foto original alterada: exportação cancelada');
    }
    const b = new Uint8Array(await p.originalBlob.arrayBuffer());
    photos.push({
      id: p.id,
      observationId: p.observationId,
      originalFilename: p.originalFilename,
      mimeType: p.mimeType,
      sizeBytes: b.length,
      sha256: digest,
      createdAt: p.createdAt,
      contentBase64: bytesToBase64(b),
    });
  }

  const bk: BackupFile = {
    format: 'estriva-mapa-danos',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      projects: records.projects,
      locations: records.locations,
      elements: records.elements,
      occurrences: records.occurrences,
      observations: records.observations,
      photos,
    },
  };

  await prepareRestore(bk);
  return bk;
}

export function downloadBackup(backup: BackupFile, filename?: string): void {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `estriva-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function readBackupFile(file: File): Promise<BackupFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        resolve(json);
      } catch (e) {
        reject(new Error('Arquivo de backup inválido (JSON malformado)'));
      }
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsText(file);
  });
}