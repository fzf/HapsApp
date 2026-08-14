// In-memory fake for expo-sqlite good enough to exercise TimelineDatabase's
// SQL strings and control flow.
const rows = { visits: [], travels: [] };

const defaultRunAsync = async (sql, params = []) => {
  if (sql.includes('INSERT OR REPLACE INTO visits')) {
    // Mirror the schema: end_time is params[3]. NOT NULL would throw here.
    rows.visits.push(params);
  } else if (sql.includes('INSERT OR REPLACE INTO travels')) {
    rows.travels.push(params);
  }
};

// Named `mockDb` (not `fakeDb`): jest.mock() factories may only close over
// out-of-scope variables whose name is prefixed `mock` (case-insensitive).
const mockDb = {
  execAsync: jest.fn(async () => {}),
  getAllAsync: jest.fn(async () => []),
  getFirstAsync: jest.fn(async () => null),
  runAsync: jest.fn(defaultRunAsync),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => mockDb),
}));

jest.mock('../../services/LoggingService', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

const TimelineDatabase = require('../../services/TimelineDatabase').default;

describe('TimelineDatabase', () => {
  beforeEach(() => {
    rows.visits = [];
    rows.travels = [];
    jest.clearAllMocks();
    // clearAllMocks() wipes call history but not implementations swapped in
    // via mockImplementation — restore the default so tests stay isolated
    // regardless of run order.
    mockDb.runAsync.mockImplementation(defaultRunAsync);
    // TimelineDatabase is a singleton with `this.db` memoized on init();
    // reset it so each test re-opens against the fresh mockDb mocks above.
    TimelineDatabase.db = null;
  });

  it('declares end_time as nullable in both tables', async () => {
    await TimelineDatabase.init();
    const createStatements = mockDb.execAsync.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => sql.includes('CREATE TABLE'));
    expect(createStatements).toHaveLength(2);
    for (const sql of createStatements) {
      expect(sql).not.toMatch(/end_time TEXT NOT NULL/);
      expect(sql).toMatch(/end_time TEXT/);
    }
  });

  it('saves an in-progress visit (null end_time)', async () => {
    await TimelineDatabase.saveTimelineData('2026-08-13', {
      visits: [{ id: 1, start_time: '2026-08-12T22:00:00Z', end_time: null, duration: null }],
      travels: [],
    });
    expect(rows.visits).toHaveLength(1);
    expect(rows.visits[0][3]).toBeNull(); // end_time param
  });

  it('continues past a failing row instead of aborting the save', async () => {
    // Make the first visit INSERT throw, subsequent visit/travel inserts succeed.
    let threw = false;
    mockDb.runAsync.mockImplementation(async (sql, params = []) => {
      if (sql.includes('INSERT OR REPLACE INTO visits') && !threw) {
        threw = true;
        throw new Error('NOT NULL constraint failed');
      }
      if (sql.includes('INSERT OR REPLACE INTO visits')) rows.visits.push(params);
      if (sql.includes('INSERT OR REPLACE INTO travels')) rows.travels.push(params);
    });

    await expect(
      TimelineDatabase.saveTimelineData('2026-08-13', {
        visits: [
          { id: 1, start_time: 'a', end_time: null },
          { id: 2, start_time: 'b', end_time: 'c' },
        ],
        travels: [{ id: 3, start_time: 'd', end_time: 'e' }],
      })
    ).resolves.not.toThrow();

    expect(rows.visits).toHaveLength(1);  // second visit survived
    expect(rows.travels).toHaveLength(1); // travels still saved
  });
});
