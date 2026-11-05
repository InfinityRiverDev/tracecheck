import { randomBytes } from 'node:crypto'
import { MongoClient } from 'mongodb'
import { hashPassword, isValidPassword } from '../auth.mjs'
import { hashQuizPassword } from '../server/leaderboard.mjs'

const uri = process.env.MONGODB_URI
const nickname = 'admin'
const password = process.env.ADMIN_PASSWORD || randomBytes(18).toString('base64url')

if (!uri) throw new Error('MONGODB_URI is not configured')
if (!isValidPassword(password)) throw new Error('ADMIN_PASSWORD must contain 10–128 characters')

const client = new MongoClient(uri, { appName: 'tracecheck-create-admin' })
try {
  await client.connect()
  const db = client.db()
  const users = db.collection('users')
  const progress = db.collection('progress')
  const authSessions = db.collection('authSessions')
  const quizState = db.collection('quizLeaderboardState')
  const now = new Date()

  await Promise.all([
    users.createIndex({ nicknameKey: 1 }, { unique: true }),
    progress.createIndex({ userId: 1 }, { unique: true }),
    quizState.createIndex({ key: 1 }, { unique: true }),
  ])

  let mainUser = await users.findOne({ nicknameKey: nickname })
  const passwordHash = await hashPassword(password)
  if (mainUser) {
    await users.updateOne({ _id: mainUser._id }, {
      $set: {
        nickname,
        nicknameKey: nickname,
        passwordHash,
        role: 'admin',
        'providers.password': true,
        updatedAt: now,
      },
    })
    await authSessions.deleteMany({ userId: mainUser._id })
  } else {
    const result = await users.insertOne({
      nickname,
      nicknameKey: nickname,
      passwordHash,
      role: 'admin',
      providers: { password: true },
      avatarKey: 'detective-violet',
      settings: {},
      createdAt: now,
      updatedAt: now,
    })
    mainUser = { _id: result.insertedId }
  }

  await progress.updateOne(
    { userId: mainUser._id },
    {
      $setOnInsert: {
        userId: mainUser._id,
        exp: 0,
        expReachedAt: now,
        completedLevels: [],
        achievements: [],
        dossierFragments: [],
        habits: null,
        createdAt: now,
      },
      $set: { updatedAt: now },
    },
    { upsert: true },
  )

  const savedQuiz = await quizState.findOne({ key: 'main' }, { projection: { payload: 1 } })
  let quiz = { users: {} }
  try {
    const parsed = JSON.parse(savedQuiz?.payload ?? '')
    if (parsed?.users && typeof parsed.users === 'object' && !Array.isArray(parsed.users)) quiz = parsed
  } catch { /* start a valid state only if the stored payload is absent or broken */ }
  const oldAdminKey = Object.keys(quiz.users).find(key => key.normalize('NFKC').toLocaleLowerCase('ru-RU') === nickname)
  if (oldAdminKey && oldAdminKey !== nickname) delete quiz.users[oldAdminKey]
  quiz.users[nickname] = { ...hashQuizPassword(password), solved: {}, role: 'admin' }
  await quizState.updateOne(
    { key: 'main' },
    { $set: { payload: JSON.stringify(quiz), updatedAt: now } },
    { upsert: true },
  )

  console.log(JSON.stringify({
    ok: true,
    nickname,
    password,
    mainProfile: true,
    quizAdmin: true,
    preservedQuizUsers: Math.max(0, Object.keys(quiz.users).length - 1),
  }, null, 2))
} finally {
  await client.close()
}
