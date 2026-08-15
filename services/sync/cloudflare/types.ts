export interface D1Meta {
  changes?: number;
}

export interface D1Result<T = unknown> {
  success: boolean;
  results: T[];
  meta: D1Meta;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}

export interface DurableObjectSqlStorage {
  exec<T = Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): IterableIterator<T> & { rowsRead: number; rowsWritten: number };
}

export interface DurableObjectStorage {
  sql: DurableObjectSqlStorage;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  transactionSync<T>(callback: () => T): T;
}

export interface DurableObjectState {
  storage: DurableObjectStorage;
}

export interface PagesFunctionContext<Env> {
  request: Request;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
}
