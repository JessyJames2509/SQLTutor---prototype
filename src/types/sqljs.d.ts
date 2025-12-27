declare module "sql.js" {
  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export interface Database {
    exec(sql: string): QueryExecResult[];
    run(sql: string): void;
  }

  export interface SqlJsStatic {
    Database: new () => Database;
  }

  const initSqlJs: (config?: {
    locateFile?: (file: string) => string;
  }) => Promise<SqlJsStatic>;

  export default initSqlJs;
}