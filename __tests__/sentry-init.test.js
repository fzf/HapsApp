it('App.js calls initSentry and wraps the export', () => {
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '../App.js'), 'utf8');
  expect(source).toMatch(/initSentry\(\)/);
  expect(source).toMatch(/Sentry\.wrap\(App\)/);
});
