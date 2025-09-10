import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';

describe('Combinations API (e2e)', () => {
  let app: INestApplication;
  let databaseService: DatabaseService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );

    databaseService = moduleFixture.get<DatabaseService>(DatabaseService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  async function cleanDatabase() {
    const pool = databaseService.getPool();
    const conn = await pool.getConnection();
    try {
      await conn.query('DELETE FROM combinations');
      await conn.query('DELETE FROM responses');
      await conn.query('DELETE FROM items');
      await conn.query('ALTER TABLE responses AUTO_INCREMENT = 1');
    } finally {
      conn.release();
    }
  }

  describe('POST /generate', () => {
    it('should generate combinations for valid input [1, 2, 1] with length 2', async () => {
      const response = await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [1, 2, 1], length: 2 })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('combination');
      expect(response.body.id).toBe(1);
      expect(response.body.combination).toHaveLength(5);

      const expectedCombinations = [
        ['A1', 'B1'],
        ['A1', 'B2'],
        ['A1', 'C1'],
        ['B1', 'C1'],
        ['B2', 'C1'],
      ];

      for (const combo of expectedCombinations) {
        expect(response.body.combination).toContainEqual(combo);
      }
    });

    it('should generate combinations for [2, 1] with length 2', async () => {
      const response = await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [2, 1], length: 2 })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('combination');
      expect(response.body.id).toBe(1);
      expect(response.body.combination).toHaveLength(2);
      expect(response.body.combination).toContainEqual(['A1', 'B1']);
      expect(response.body.combination).toContainEqual(['A2', 'B1']);
    });

    it('should generate single item combinations for length 1', async () => {
      const response = await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [2, 1], length: 1 })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('combination');
      expect(response.body.combination).toHaveLength(3);
      expect(response.body.combination).toContainEqual(['A1']);
      expect(response.body.combination).toContainEqual(['A2']);
      expect(response.body.combination).toContainEqual(['B1']);
    });

    it('should return empty combinations when length exceeds available groups', async () => {
      const response = await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [1, 1], length: 3 })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('combination');
      expect(response.body.id).toBe(null);
      expect(response.body.combination).toEqual([]);
    });

    it('should handle large input arrays', async () => {
      const response = await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [3, 2, 1], length: 2 })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('combination');
      expect(response.body.combination).toHaveLength(11); // A-B: 3*2=6, A-C: 3*1=3, B-C: 2*1=2
    });

    it('should increment response IDs for multiple requests', async () => {
      const response1 = await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [1], length: 1 })
        .expect(201);

      const response2 = await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [1], length: 1 })
        .expect(201);

      expect(response1.body.id).toBe(1);
      expect(response2.body.id).toBe(2);
    });
  });

  describe('POST /generate - Validation', () => {
    it('should reject invalid length (0)', async () => {
      await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [1, 2], length: 0 })
        .expect(400);
    });

    it('should reject negative length', async () => {
      await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [1, 2], length: -1 })
        .expect(400);
    });

    it('should reject empty items array', async () => {
      await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [], length: 2 })
        .expect(400);
    });

    it('should reject non-array items', async () => {
      await request(app.getHttpServer())
        .post('/generate')
        .send({ items: 'not an array', length: 2 })
        .expect(400);
    });

    it('should reject missing items', async () => {
      await request(app.getHttpServer())
        .post('/generate')
        .send({ length: 2 })
        .expect(400);
    });

    it('should reject missing length', async () => {
      await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [1, 2] })
        .expect(400);
    });

    it('should reject non-integer items', async () => {
      await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [1.5, 2], length: 2 })
        .expect(400);
    });

    it('should reject negative items', async () => {
      await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [-1, 2], length: 2 })
        .expect(400);
    });

    it('should reject non-integer length', async () => {
      await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [1, 2], length: 2.5 })
        .expect(400);
    });

    it('should reject requests with extra fields when whitelist is enabled', async () => {
      const response = await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [1, 2], length: 2, extraField: 'should be removed' })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('combination');
    });
  });

  describe('Database Integration', () => {
    it('should store data in all three tables', async () => {
      await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [1, 2], length: 2 })
        .expect(201);

      const pool = databaseService.getPool();
      const conn = await pool.getConnection();

      try {
        const [responses] = await conn.query('SELECT * FROM responses');
        const [items] = await conn.query('SELECT * FROM items');
        const [combinations] = await conn.query('SELECT * FROM combinations');

        expect((responses as any[]).length).toBe(1);
        expect((items as any[]).length).toBeGreaterThan(0);
        expect((combinations as any[]).length).toBeGreaterThan(0);

        const response = (responses as any[])[0];
        expect(response.request_json).toEqual([1, 2]);
        expect(response.length).toBe(2);

        const itemCodes = (items as any[]).map((item) => item.code);
        expect(itemCodes).toContain('A1');
        expect(itemCodes).toContain('B1');
        expect(itemCodes).toContain('B2');
      } finally {
        conn.release();
      }
    });

    it('should handle database transaction rollback on error', async () => {
      jest
        .spyOn(databaseService, 'withTransaction')
        .mockRejectedValueOnce(new Error('Database error'));

      await request(app.getHttpServer())
        .post('/generate')
        .send({ items: [1, 2], length: 2 })
        .expect(500);

      jest.restoreAllMocks();
    });
  });
});
