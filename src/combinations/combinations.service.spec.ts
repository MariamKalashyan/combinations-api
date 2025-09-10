import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CombinationsService } from './combinations.service';
import { DatabaseService } from '../database/database.service';

describe('CombinationsService', () => {
  let service: CombinationsService;
  let mockDbService: jest.Mocked<DatabaseService>;

  beforeEach(async () => {
    const mockWithTransaction = jest.fn();
    const mockInsertResponse = jest.fn();
    const mockInsertItems = jest.fn();
    const mockInsertCombinations = jest.fn();

    mockDbService = {
      withTransaction: mockWithTransaction,
      insertResponse: mockInsertResponse,
      insertItems: mockInsertItems,
      insertCombinations: mockInsertCombinations,
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CombinationsService,
        {
          provide: DatabaseService,
          useValue: mockDbService,
        },
      ],
    }).compile();

    service = module.get<CombinationsService>(CombinationsService);
  });

  describe('expandItems', () => {
    it('should expand items array to groups with correct prefixes', () => {
      const result = service['expandItems']([1, 2, 1]);

      expect(result.size).toBe(3);
      expect(result.get('A')).toEqual(['A1']);
      expect(result.get('B')).toEqual(['B1', 'B2']);
      expect(result.get('C')).toEqual(['C1']);
    });

    it('should handle single item', () => {
      const result = service['expandItems']([3]);

      expect(result.size).toBe(1);
      expect(result.get('A')).toEqual(['A1', 'A2', 'A3']);
    });

    it('should handle empty array', () => {
      const result = service['expandItems']([]);

      expect(result.size).toBe(0);
    });
  });

  describe('choose', () => {
    it('should generate correct combinations', () => {
      const result = service['choose'](['A', 'B', 'C'], 2);

      expect(result).toHaveLength(3);
      expect(result).toContainEqual(['A', 'B']);
      expect(result).toContainEqual(['A', 'C']);
      expect(result).toContainEqual(['B', 'C']);
    });

    it('should handle choosing all elements', () => {
      const result = service['choose'](['A', 'B'], 2);

      expect(result).toHaveLength(1);
      expect(result).toContainEqual(['A', 'B']);
    });

    it('should handle choosing one element', () => {
      const result = service['choose'](['A', 'B', 'C'], 1);

      expect(result).toHaveLength(3);
      expect(result).toContainEqual(['A']);
      expect(result).toContainEqual(['B']);
      expect(result).toContainEqual(['C']);
    });
  });

  describe('cartesian', () => {
    it('should generate cartesian product', () => {
      const result = service['cartesian']([['A1'], ['B1', 'B2']]);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(['A1', 'B1']);
      expect(result).toContainEqual(['A1', 'B2']);
    });

    it('should handle single array', () => {
      const result = service['cartesian']([['A1', 'A2']]);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(['A1']);
      expect(result).toContainEqual(['A2']);
    });

    it('should handle empty array', () => {
      const result = service['cartesian']([]);

      expect(result).toEqual([[]]);
    });
  });

  describe('generateValidCombinations', () => {
    it('should generate valid combinations for task example', () => {
      const groups = new Map([
        ['A', ['A1']],
        ['B', ['B1', 'B2']],
        ['C', ['C1']],
      ]);

      const result = service['generateValidCombinations'](groups, 2);

      expect(result).toHaveLength(5);
      expect(result).toContainEqual(['A1', 'B1']);
      expect(result).toContainEqual(['A1', 'B2']);
      expect(result).toContainEqual(['A1', 'C1']);
      expect(result).toContainEqual(['B1', 'C1']);
      expect(result).toContainEqual(['B2', 'C1']);
    });

    it('should handle length 1 combinations', () => {
      const groups = new Map([
        ['A', ['A1']],
        ['B', ['B1', 'B2']],
      ]);

      const result = service['generateValidCombinations'](groups, 1);

      expect(result).toHaveLength(3);
      expect(result).toContainEqual(['A1']);
      expect(result).toContainEqual(['B1']);
      expect(result).toContainEqual(['B2']);
    });
  });

  describe('generateAndStore', () => {
    beforeEach(() => {
      mockDbService.withTransaction.mockImplementation(async (fn) => {
        const mockConn = {} as any;
        return fn(mockConn);
      });
      mockDbService.insertResponse.mockResolvedValue(1);
      mockDbService.insertItems.mockResolvedValue();
      mockDbService.insertCombinations.mockResolvedValue();
    });

    it('should generate and store combinations for valid input', async () => {
      const input = { items: [1, 2, 1], length: 2 };

      const result = await service.generateAndStore(input);

      expect(result.id).toBe(1);
      expect(result.combination).toHaveLength(5);
      expect(result.combination).toContainEqual(['A1', 'B1']);
      expect(result.combination).toContainEqual(['A1', 'B2']);
      expect(result.combination).toContainEqual(['A1', 'C1']);
      expect(result.combination).toContainEqual(['B1', 'C1']);
      expect(result.combination).toContainEqual(['B2', 'C1']);

      expect(mockDbService.withTransaction).toHaveBeenCalledTimes(1);
    });

    it('should throw BadRequestException for invalid length', async () => {
      const input = { items: [1, 2], length: 0 };

      await expect(service.generateAndStore(input)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.generateAndStore(input)).rejects.toThrow(
        'length must be >= 1',
      );
    });

    it('should throw BadRequestException for empty items array', async () => {
      const input = { items: [], length: 2 };

      await expect(service.generateAndStore(input)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.generateAndStore(input)).rejects.toThrow(
        'items must be a non-empty array',
      );
    });

    it('should throw BadRequestException for non-array items', async () => {
      const input = { items: null as any, length: 2 };

      await expect(service.generateAndStore(input)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.generateAndStore(input)).rejects.toThrow(
        'items must be a non-empty array',
      );
    });

    it('should return empty combinations when length exceeds groups', async () => {
      const input = { items: [1, 1], length: 3 };

      const result = await service.generateAndStore(input);

      expect(result.id).toBe(null);
      expect(result.combination).toEqual([]);
    });

    it('should handle single group with multiple items', async () => {
      const input = { items: [3], length: 1 };

      const result = await service.generateAndStore(input);

      expect(result.id).toBe(1);
      expect(result.combination).toHaveLength(3);
      expect(result.combination).toContainEqual(['A1']);
      expect(result.combination).toContainEqual(['A2']);
      expect(result.combination).toContainEqual(['A3']);
    });
  });
});
