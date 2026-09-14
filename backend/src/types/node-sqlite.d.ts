// Minimal typings for Node's built-in SQLite (node:sqlite, Node >= 22.13 / 24).
// @types/node 20.x (what this project uses) doesn't ship these yet.
// If you upgrade to @types/node >= 22.13, delete this file.
declare module 'node:sqlite' {
  export interface RunResult {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }
  export class StatementSync {
    run(...params: any[]): RunResult;
    get(...params: any[]): any;
    all(...params: any[]): any[];
  }
  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
