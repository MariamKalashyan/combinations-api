import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

type Combo = string[];

@Injectable()
export class CombinationsService {
  constructor(private readonly db: DatabaseService) {}

  async generateAndStore(input: { items: number[]; length: number }) {
    const { items, length } = input;

    if (length < 1) throw new BadRequestException('length must be >= 1');
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('items must be a non-empty array');
    }

    const groups = this.expandItems(items);

    if (length > groups.size) {
      return { id: null, combination: [] as Combo[] };
    }

    const allCombos = this.generateValidCombinations(groups, length);

    const result = await this.db.withTransaction(async (conn) => {
      const responseId = await this.db.insertResponse(conn, input);

      await this.db.insertItems(conn, groups);

      await this.db.insertCombinations(conn, responseId, allCombos);

      return responseId;
    });

    return { id: result, combination: allCombos };
  }

  private expandItems(items: number[]): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    let codePoint = 'A'.charCodeAt(0);

    for (const count of items) {
      const prefix = String.fromCharCode(codePoint++);
      const arr: string[] = [];
      for (let i = 1; i <= count; i++) arr.push(`${prefix}${i}`);
      groups.set(prefix, arr);
    }
    return groups;
  }

  private generateValidCombinations(
    groups: Map<string, string[]>,
    length: number,
  ): Combo[] {
    const prefixes = Array.from(groups.keys());
    const chosenPrefixCombos = this.choose(prefixes, length);

    const combos: Combo[] = [];
    for (const prefixSet of chosenPrefixCombos) {
      const arrays = prefixSet.map((p) => groups.get(p)!);
      for (const pick of this.cartesian(arrays)) {
        combos.push(pick);
      }
    }
    return combos;
  }

  private choose(items: string[], combinationLength: number): string[][] {
    const result: string[][] = [];
    const backtrack = (startIndex: number, currentPath: string[]) => {
      if (currentPath.length === combinationLength) {
        result.push([...currentPath]);
        return;
      }
      for (let i = startIndex; i < items.length; i++) {
        currentPath.push(items[i]);
        backtrack(i + 1, currentPath);
        currentPath.pop();
      }
    };
    backtrack(0, []);
    return result;
  }

  private cartesian(itemGroups: string[][]): string[][] {
    return itemGroups.reduce<string[][]>(
      (accumulator, currentGroup) =>
        accumulator.flatMap((previousCombination) =>
          currentGroup.map((item) => [...previousCombination, item]),
        ),
      [[]],
    );
  }
}
