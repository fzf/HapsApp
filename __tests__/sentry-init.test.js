it('App.js imports sentry-init first, before taskDefinitions, and wraps the export', () => {
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '../App.js'), 'utf8');
  const sentryInitIndex = source.indexOf("'./config/sentry-init'");
  const taskDefinitionsIndex = source.indexOf("'./taskDefinitions'");
  expect(sentryInitIndex).toBeGreaterThan(-1);
  expect(taskDefinitionsIndex).toBeGreaterThan(-1);
  expect(sentryInitIndex).toBeLessThan(taskDefinitionsIndex);
  expect(source).toMatch(/Sentry\.wrap\(App\)/);
});

it('config/sentry-init.js calls initSentry as a side effect', () => {
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '../config/sentry-init.js'), 'utf8');
  expect(source).toMatch(/initSentry\(\)/);
});
