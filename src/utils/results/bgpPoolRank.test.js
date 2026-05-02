import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  orderTiedSubgroupByBgpRules,
  sortPoolRowsByBgpRules,
  computeMiniStatsForTieBreak,
} from './bgpPoolRank.js';

const row = (id, wins, pf, pa, ew) => ({
  id,
  wins,
  pointsFor: pf,
  pointsAgainst: pa,
  endsWon: ew,
});

describe('orderTiedSubgroupByBgpRules / 直接対決', () => {
  it('同勝ち2名は対戦の勝者が上位（ミニリーグ勝ち数）', () => {
    const records = [
      {
        redId: 'A',
        blueId: 'B',
        redScore: 5,
        blueScore: 3,
        winnerId: 'A',
        redEndsWon: 0,
        blueEndsWon: 0,
      },
    ];
    const rows = [row('A', 2, 10, 8, 0), row('B', 2, 8, 10, 0)];
    const ordered = orderTiedSubgroupByBgpRules(rows, records);
    assert.deepStrictEqual(
      ordered.map((r) => r.id),
      ['A', 'B'],
    );
  });

  it('3名同勝ち: ミニリーグの得失点差などで順位が付く（循環も同勝ち数なら次の指標）', () => {
    const records = [
      { redId: 'A', blueId: 'B', redScore: 5, blueScore: 0, winnerId: 'A', redEndsWon: 0, blueEndsWon: 0 },
      { redId: 'B', blueId: 'C', redScore: 4, blueScore: 0, winnerId: 'B', redEndsWon: 0, blueEndsWon: 0 },
      { redId: 'A', blueId: 'C', redScore: 0, blueScore: 3, winnerId: 'C', redEndsWon: 0, blueEndsWon: 0 },
    ];
    const rows = [row('A', 1, 0, 0, 0), row('B', 1, 0, 0, 0), row('C', 1, 0, 0, 0)];
    const mini = computeMiniStatsForTieBreak(['A', 'B', 'C'], records);
    assert.strictEqual(mini.get('A').wins, 1);
    assert.strictEqual(mini.get('B').wins, 1);
    assert.strictEqual(mini.get('C').wins, 1);
    const ordered = orderTiedSubgroupByBgpRules(rows, records);
    assert.deepStrictEqual(
      ordered.map((r) => r.id),
      ['A', 'B', 'C'],
    );
  });

  it('ミニリーグが全員同値のときはプール全体の得失点差などで決まる', () => {
    const records = [
      { redId: 'A', blueId: 'B', redScore: 2, blueScore: 2, winnerId: '', redEndsWon: 0, blueEndsWon: 0 },
    ];
    const rows = [row('A', 1, 5, 3, 0), row('B', 1, 3, 5, 0)];
    const ordered = orderTiedSubgroupByBgpRules(rows, records);
    assert.deepStrictEqual(
      ordered.map((r) => r.id),
      ['A', 'B'],
    );
  });
});

describe('sortPoolRowsByBgpRules', () => {
  it('勝ち数の大きい帯を先に出し、帯内は直接対決ロジック', () => {
    const records = [
      { redId: 'A', blueId: 'B', redScore: 1, blueScore: 0, winnerId: 'A', redEndsWon: 0, blueEndsWon: 0 },
    ];
    const rows = [row('A', 2, 1, 0, 0), row('B', 1, 0, 1, 0), row('C', 2, 0, 0, 0)];
    const out = sortPoolRowsByBgpRules(rows, records);
    assert.deepStrictEqual(
      out.map((r) => r.id),
      ['A', 'C', 'B'],
    );
  });
});
