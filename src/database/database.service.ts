import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';
import { Pool, PoolConnection } from 'mysql2/promise';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.pool = mysql.createPool({
      host: this.config.get<string>('MYSQL_HOST'),
      port: this.config.get<number>('MYSQL_PORT') || 3306,
      user: this.config.get<string>('MYSQL_USER'),
      password: this.config.get<string>('MYSQL_PASSWORD'),
      database: this.config.get<string>('MYSQL_DATABASE'),
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
    });
    await this.ensureSchema();
  }

  getPool(): Pool {
    return this.pool;
  }

  async withTransaction(
    transactionFunction: (conn: PoolConnection) => Promise<number>,
  ): Promise<number> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await transactionFunction(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async insertResponse(
    conn: PoolConnection,
    payload: { items: number[]; length: number },
  ): Promise<number> {
    const [r] = await conn.query(
      `INSERT INTO responses (request_json, length) VALUES (CAST(:req AS JSON), :len)`,
      { req: JSON.stringify(payload.items), len: payload.length },
    );
    return (r as any).insertId as number;
  }

  async insertItems(
    conn: PoolConnection,
    groups: Map<string, string[]>,
  ): Promise<void> {
    const values: Array<[string, string, number]> = [];
    for (const [prefix, codes] of groups.entries()) {
      for (const code of codes) {
        const idx = parseInt(code.slice(1), 10);
        values.push([code, prefix, idx]);
      }
    }
    if (values.length === 0) return;

    const placeholders = values.map(() => '(?,?,?)').join(',');
    const flat = values.flat();
    await conn.query(
      `INSERT IGNORE INTO items (code, prefix, idx) VALUES ${placeholders}`,
      flat,
    );
  }

  async insertCombinations(
    conn: PoolConnection,
    responseId: number,
    combos: string[][],
  ): Promise<void> {
    if (combos.length === 0) return;

    const CHUNK = 1000;
    for (let i = 0; i < combos.length; i += CHUNK) {
      const slice = combos.slice(i, i + CHUNK);
      const values: Array<[number, string, string]> = slice.map((c) => [
        responseId,
        [...c].sort().join('|'),
        JSON.stringify(c),
      ]);

      const placeholders = values.map(() => '(?,?,?)').join(',');
      const flat = values.flat();
      await conn.query(
        `INSERT INTO combinations (response_id, combination_key, combination_json)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE combination_json = VALUES(combination_json)`,
        flat,
      );
    }
  }

  private async ensureSchema() {
    const conn = await this.pool.getConnection();
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS items (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          code VARCHAR(16) NOT NULL UNIQUE,
          prefix CHAR(1) NOT NULL,
          idx INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_prefix(prefix)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS responses (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          request_json JSON NOT NULL,
          length INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS combinations (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          response_id BIGINT UNSIGNED NOT NULL,
          combination_key VARCHAR(255) NOT NULL,
          combination_json JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_combinations_response
            FOREIGN KEY (response_id) REFERENCES responses(id) ON DELETE CASCADE,
          UNIQUE KEY uniq_resp_key (response_id, combination_key),
          KEY idx_resp (response_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } finally {
      conn.release();
    }
  }
}
