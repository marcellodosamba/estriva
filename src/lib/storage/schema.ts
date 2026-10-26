/**
 * ESTRIVA - Contratos de Armazenamento (IndexedDB)
 * Migrado de fontes-legadas/engenharia-aberta-g1-tablet/core/schema.js
 * Versão TypeScript para React + Vite
 */

export const DB_NAME = 'estriva-mapa-danos';
export const DB_VERSION = 1;
export const STORES = ['projects', 'locations', 'elements', 'occurrences', 'observations', 'photos'] as const;

export type StoreName = typeof STORES[number];

export interface Project {
  id: string;
  name: string;
  description?: string;
  location?: string;
  norma: 'ABNT-NBR-6118' | 'EUROCODE-2';
  createdAt: string; // ISO 8601
  updatedAt: string;
  [key: string]: unknown;
}

export interface Location {
  id: string;
  projectId: string;
  name: string;
  [key: string]: unknown;
}

export interface Element {
  id: string;
  locationId: string;
  type: string;
  label: string;
  [key: string]: unknown;
}

export interface Occurrence {
  id: string;
  elementId: string;
  category: 'FISSURA' | 'INFILTRACAO' | 'CORROSAO' | 'OUTRO';
  createdAt: string;
  [key: string]: unknown;
}

export interface Observation {
  id: string;
  occurrenceId: string;
  observedAt: string; // ISO 8601
  description: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface Photo {
  id: string;
  observationId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  originalBlob?: Blob; // Apenas em memória, não persistido
  createdAt: string;
  [key: string]: unknown;
}

export interface PhotoInput {
  id: string;
  observationId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  contentBase64: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface BackupData {
  projects: Project[];
  locations: Location[];
  elements: Element[];
  occurrences: Occurrence[];
  observations: Observation[];
  photos: Photo[];
}

export interface BackupFile {
  format: 'estriva-mapa-danos';
  schemaVersion: 1;
  exportedAt: string;
  data: BackupData;
}

export function emptyRecords(): BackupData {
  return {
    projects: [],
    locations: [],
    elements: [],
    occurrences: [],
    observations: [],
    photos: [],
  };
}

export function requiredText(text: unknown, label: string, max = 5000): string {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error(`${label} obrigatório`);
  }
  const v = text.trim();
  if (v.length > max) {
    throw new Error(`${label} excede ${max} caracteres`);
  }
  return v;
}

export function assertIso(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) || isNaN(Date.parse(value))) {
    throw new Error(`${label} inválida`);
  }
  return value;
}

export function newId(): string {
  return crypto.randomUUID();
}

export async function hashBlob(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
}

export function validateProject(input: Partial<Project>): Project {
  return {
    id: input.id ?? newId(),
    name: requiredText(input.name, 'Nome do projeto', 160),
    description: input.description ? requiredText(input.description, 'Descrição', 10000) : undefined,
    location: input.location ? requiredText(input.location, 'Localização', 160) : undefined,
    norma: input.norma ?? 'ABNT-NBR-6118',
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function validateLocation(input: Partial<Location>, _projectIds: Set<string>): Location {
  return {
    id: input.id ?? newId(),
    projectId: requiredText(input.projectId, 'Project ID'),
    name: requiredText(input.name, 'Local', 160),
  };
}

export function validateElement(input: Partial<Element>, _locationIds: Set<string>): Element {
  return {
    id: input.id ?? newId(),
    locationId: requiredText(input.locationId, 'Location ID'),
    type: requiredText(input.type, 'Tipo'),
    label: requiredText(input.label, 'Elemento', 160),
  };
}

export function validateOccurrence(input: Partial<Occurrence>, _elementIds: Set<string>): Occurrence {
  return {
    id: input.id ?? newId(),
    elementId: requiredText(input.elementId, 'Element ID'),
    category: input.category ?? 'OUTRO',
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function validateObservation(input: Partial<Observation>, _occurrenceIds: Set<string>): Observation {
  return {
    id: input.id ?? newId(),
    occurrenceId: requiredText(input.occurrenceId, 'Occurrence ID'),
    observedAt: assertIso(input.observedAt, 'Data observada'),
    description: requiredText(input.description, 'Observação', 10000),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}