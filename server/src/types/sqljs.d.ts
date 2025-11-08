declare module 'sql.js' {
  export interface Statement {
    bind(values?: Record<string, unknown>): void;
    step(): boolean;
    getAsObject(): any;
    free(): void;
  }

  export interface Database {
    exec(sql: string): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
  }

  export interface SqlJsStatic {
    Database: { new(data?: Uint8Array): Database };
  }

  export interface SqlJsInitObject {
    locateFile?: (file: string, prefix?: string) => string;
  }

  const initSqlJs: (init?: SqlJsInitObject) => Promise<SqlJsStatic>;
  export default initSqlJs;
}

