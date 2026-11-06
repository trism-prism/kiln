// Test helpers shared by the import screen's tests.
// test-db first: it installs fake-indexeddb before Dexie is loaded (Dexie reads the global when it loads).
export { newDb as newDbForTests } from '../../data/test-db'
export { fixtureTexts } from '../../data/fixtures'
export { importPlan } from '../../data'
