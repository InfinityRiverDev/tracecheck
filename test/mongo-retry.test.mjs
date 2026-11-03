import test from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient } from 'mongodb'
import { createMongoStore } from '../server.mjs'

// Every network-capable operation is mocked before constructing the store.
for (const stage of ['connect', 'index']) {
  test(`Mongo store retries after a temporary ${stage} initialization failure`, async t => {
    let connections = 0
    let indexes = 0
    const document = { state: { selected: ['address-sign'] }, updatedAt: '2026-11-03' }
    const sessions = {
      async createIndex() {
        indexes++
        if (stage === 'index' && indexes === 1) throw new Error('temporary index failure')
      },
      async findOne(query) {
        assert.equal(query.sessionId, 'test_12345678901234567890')
        return document
      },
    }
    t.mock.method(MongoClient.prototype, 'connect', async function () {
      connections++
      if (stage === 'connect' && connections === 1) throw new Error('temporary connect failure')
      return this
    })
    t.mock.method(MongoClient.prototype, 'db', () => ({
      collection(name) { assert.equal(name, 'sessions'); return sessions },
    }))
    t.mock.method(MongoClient.prototype, 'close', async () => {})
    const store = createMongoStore('mongodb://127.0.0.1:1/unused_test_database')
    t.after(() => store.close())
    await assert.rejects(store.get('test_12345678901234567890'), /temporary/)
    assert.deepEqual(await store.get('test_12345678901234567890'), document)
    assert.equal(connections, 2)
    assert.deepEqual(await store.get('test_12345678901234567890'), document)
    assert.equal(connections, 2, 'successful initialization is reused')
  })
}