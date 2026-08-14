// The startup SQLite open is a prime suspect for launch-time crash loops
// (corrupt db file → every launch throws). Sentry needs to see it happen and
// see it fail, so a reinstall isn't the only diagnosis available.
describe('TimelineDatabase startup instrumentation', () => {
  let Sentry;
  let SQLite;
  let TimelineDatabase;
  let mockDb;

  beforeEach(() => {
    jest.resetModules();

    mockDb = { execAsync: jest.fn().mockResolvedValue(undefined) };

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => mockDb),
    }));

    Sentry = require('@sentry/react-native');
    SQLite = require('expo-sqlite');
    TimelineDatabase = require('../../services/TimelineDatabase').default;
  });

  it('leaves a breadcrumb when the timeline database opens', async () => {
    await TimelineDatabase.init();

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'startup',
        message: 'TimelineDatabase initialized',
      })
    );
  });

  it('reports the exception when the timeline database fails to open', async () => {
    const failure = new Error('database disk image is malformed');
    SQLite.openDatabaseAsync.mockRejectedValueOnce(failure);

    await expect(TimelineDatabase.init()).rejects.toThrow(failure);

    expect(Sentry.captureException).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({
        tags: expect.objectContaining({ section: 'timeline_database' }),
      })
    );
  });

  it('does not reopen an already-initialized database', async () => {
    await TimelineDatabase.init();
    await TimelineDatabase.init();

    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
  });
});
