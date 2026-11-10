# Tests

- `check_configs.py` — city.js vs data.json contract, legend/tooltip integrity,
  registry/folder consistency, accent match, no per-city `app.js`.
- `check_data.py` — rebuilds every city with `_shared/motion_build.py` into a
  temp dir and compares `data.json`, both weekend files and every
  `stops-*.json` byte-for-byte (ignoring the `built` timestamp).
- `runtime-smoke.js` — browser checks used during the migration: load, total and
  per-mode counts at 12:00, legend order, tooltip rows, city menu labels,
  accent, tooltip hover, BRT toggle, Saturday switch, and the hover-ring
  stability test. Expected values: `runtime-expected.json`.
  Run it from an omp eval kernel:

  ```js
  const src = await Bun.file("visualizations/tests/runtime-smoke.js").text();
  eval(src);
  await runRuntimeSmoke("http://localhost:8741/visualizations");
  ```

`baseline-data.json` / `baseline-runtime.json` are the pre-unification capture;
`runtime-results.json` is the last migration run.
