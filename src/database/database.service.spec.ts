import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.service';

jest.mock('mysql2/promise');

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockPool: any;
  let mockConnection: any;

  beforeEach(async () => {
    mockConnection = {
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      getConnection: jest.fn().mockResolvedValue(mockConnection),
    };

    mockConfigService = {
      get: jest.fn(),
    } as any;

    const mysql = require('mysql2/promise');
    mysql.createPool = jest.fn().mockReturnValue(mockPool);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should create MySQL pool with correct configuration', async () => {
      mockConfigService.get
        .mockReturnValueOnce('localhost')
        .mockReturnValueOnce(3306)
        .mockReturnValueOnce('root')
        .mockReturnValueOnce('password')
        .mockReturnValueOnce('test_db');

      mockConnection.query.mockResolvedValue([]);

      await service.onModuleInit();

      const mysql = require('mysql2/promise');
      expect(mysql.createPool).toHaveBeenCalledWith({
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'password',
        database: 'test_db',
        waitForConnections: true,
        connectionLimit: 10,
        namedPlaceholders: true,
      });
    });

    it('should use default port when not specified', async () => {
      mockConfigService.get
        .mockReturnValueOnce('localhost')
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce('root')
        .mockReturnValueOnce('password')
        .mockReturnValueOnce('test_db');

      mockConnection.query.mockResolvedValue([]);

      await service.onModuleInit();

      const mysql = require('mysql2/promise');
      expect(mysql.createPool).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 3306,
        }),
      );
    });

    it('should create database schema tables', async () => {
      mockConfigService.get.mockReturnValue('test_value');

      mockConnection.query.mockResolvedValue([]);

      await service.onModuleInit();

      expect(mockConnection.query).toHaveBeenCalledTimes(3);
      expect(mockConnection.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('CREATE TABLE IF NOT EXISTS items'),
      );
      expect(mockConnection.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('CREATE TABLE IF NOT EXISTS responses'),
      );
      expect(mockConnection.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('CREATE TABLE IF NOT EXISTS combinations'),
      );
    });
  });

  describe('getPool', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue('test');
      mockConnection.query.mockResolvedValue([]);
      await service.onModuleInit();
    });

    it('should return the MySQL pool', () => {
      const pool = service.getPool();
      expect(pool).toBe(mockPool);
    });
  });

  describe('withTransaction', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue('test');
      mockConnection.query.mockResolvedValue([]);
      await service.onModuleInit();
      jest.clearAllMocks();
    });

    it('should execute function within transaction and commit', async () => {
      const mockFunction = jest.fn().mockResolvedValue('test result');

      const result = await service.withTransaction(mockFunction);

      expect(mockPool.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockFunction).toHaveBeenCalledWith(mockConnection);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
      expect(result).toBe('test result');
    });

    it('should rollback transaction on error', async () => {
      const error = new Error('Test error');
      const mockFunction = jest.fn().mockRejectedValue(error);

      await expect(service.withTransaction(mockFunction)).rejects.toThrow(
        error,
      );

      expect(mockPool.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockFunction).toHaveBeenCalledWith(mockConnection);
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).not.toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    it('should release connection even if rollback fails', async () => {
      const error = new Error('Test error');
      const rollbackError = new Error('Rollback error');
      const mockFunction = jest.fn().mockRejectedValue(error);
      mockConnection.rollback.mockRejectedValue(rollbackError);

      await expect(service.withTransaction(mockFunction)).rejects.toThrow(
        rollbackError,
      );

      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple parallel transactions', async () => {
      const mockFunction1 = jest.fn().mockResolvedValue('result1');
      const mockFunction2 = jest.fn().mockResolvedValue('result2');

      const mockConnection2 = {
        ...mockConnection,
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
      };

      mockPool.getConnection
        .mockResolvedValueOnce(mockConnection)
        .mockResolvedValueOnce(mockConnection2);

      const [result1, result2] = await Promise.all([
        service.withTransaction(mockFunction1),
        service.withTransaction(mockFunction2),
      ]);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(mockPool.getConnection).toHaveBeenCalledTimes(2);
    });
  });

  describe('insertResponse', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue('test');
      mockConnection.query.mockResolvedValue([]);
      await service.onModuleInit();
      jest.clearAllMocks();
    });

    it('should insert response and return insertId', async () => {
      const mockResult = { insertId: 123 };
      mockConnection.query.mockResolvedValue([mockResult]);

      const payload = { items: [1, 2, 1], length: 2 };
      const result = await service.insertResponse(mockConnection, payload);

      expect(result).toBe(123);
      expect(mockConnection.query).toHaveBeenCalledWith(
        'INSERT INTO responses (request_json, length) VALUES (CAST(:req AS JSON), :len)',
        { req: JSON.stringify([1, 2, 1]), len: 2 },
      );
    });
  });

  describe('insertItems', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue('test');
      mockConnection.query.mockResolvedValue([]);
      await service.onModuleInit();
      jest.clearAllMocks();
    });

    it('should insert items with correct values', async () => {
      const groups = new Map([
        ['A', ['A1']],
        ['B', ['B1', 'B2']],
      ]);

      await service.insertItems(mockConnection, groups);

      expect(mockConnection.query).toHaveBeenCalledWith(
        'INSERT IGNORE INTO items (code, prefix, idx) VALUES (?,?,?),(?,?,?),(?,?,?)',
        ['A1', 'A', 1, 'B1', 'B', 1, 'B2', 'B', 2],
      );
    });

    it('should handle empty groups', async () => {
      const groups = new Map();

      await service.insertItems(mockConnection, groups);

      expect(mockConnection.query).not.toHaveBeenCalled();
    });
  });

  describe('insertCombinations', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue('test');
      mockConnection.query.mockResolvedValue([]);
      await service.onModuleInit();
      jest.clearAllMocks();
    });

    it('should insert combinations with correct values', async () => {
      const combos = [
        ['A1', 'B1'],
        ['A1', 'B2'],
      ];

      await service.insertCombinations(mockConnection, 1, combos);

      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'INSERT INTO combinations (response_id, combination_key, combination_json)',
        ),
        [1, 'A1|B1', '["A1","B1"]', 1, 'A1|B2', '["A1","B2"]'],
      );
    });

    it('should handle empty combinations', async () => {
      await service.insertCombinations(mockConnection, 1, []);

      expect(mockConnection.query).not.toHaveBeenCalled();
    });

    it('should handle large number of combinations in chunks', async () => {
      const combos = Array(2000).fill(['A1', 'B1']);

      await service.insertCombinations(mockConnection, 1, combos);

      expect(mockConnection.query).toHaveBeenCalledTimes(2);
    });
  });
});
