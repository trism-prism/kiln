// Test helper: a fresh in-memory database per call (fake-indexeddb).
import 'fake-indexeddb/auto'
import { KilnDB } from './db'
import { uuidv7 } from './uuid'

export const newDb = () => new KilnDB(`test-${uuidv7()}`)
