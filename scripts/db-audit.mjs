import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('MONGODB_URI is not configured')
  process.exitCode = 2
} else {
  const client = new MongoClient(uri, { appName: 'tracecheck-db-audit' })
  try {
    await client.connect()
    const db = client.db()
    await db.command({ ping: 1 })

    const names = (await db.listCollections({}, { nameOnly: true }).toArray())
      .map(item => item.name)
      .sort()
    const counts = {}
    const indexes = {}
    for (const name of names) {
      const collection = db.collection(name)
      counts[name] = await collection.countDocuments()
      indexes[name] = (await collection.indexes()).map(index => index.key)
    }

    const users = db.collection('users')
    const progress = db.collection('progress')
    const authSessions = db.collection('authSessions')
    const connectionStatus = await db.command({ connectionStatus: 1, showPrivileges: false })
    const duplicateNicknameKeys = await users.aggregate([
      { $group: { _id: '$nicknameKey', count: { $sum: 1 } } },
      { $match: { _id: { $ne: null }, count: { $gt: 1 } } },
      { $count: 'count' },
    ]).next()
    const usersWithoutProgress = await users.aggregate([
      { $lookup: { from: 'progress', localField: '_id', foreignField: 'userId', as: 'progress' } },
      { $match: { progress: { $size: 0 } } },
      { $count: 'count' },
    ]).next()
    const progressWithoutUsers = await progress.aggregate([
      { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'users' } },
      { $match: { users: { $size: 0 } } },
      { $count: 'count' },
    ]).next()

    const quizDocument = await db.collection('quizLeaderboardState').findOne(
      { key: 'main' },
      { projection: { _id: 0, payload: 1, updatedAt: 1 } },
    )
    let quiz = {
      present: false,
      valid: true,
      users: 0,
      admins: 0,
      malformedUsers: 0,
      invalidPasswordHashes: 0,
      plaintextPasswordFields: 0,
      updatedAt: null,
    }
    if (quizDocument) {
      quiz.present = true
      quiz.updatedAt = quizDocument.updatedAt ?? null
      try {
        const parsed = JSON.parse(quizDocument.payload)
        const quizUsers = parsed?.users && typeof parsed.users === 'object' && !Array.isArray(parsed.users)
          ? Object.values(parsed.users)
          : []
        quiz.users = quizUsers.length
        quiz.admins = quizUsers.filter(user => user?.role === 'admin').length
        quiz.malformedUsers = quizUsers.filter(user =>
          !user || typeof user.salt !== 'string' || typeof user.hash !== 'string' ||
          !user.solved || typeof user.solved !== 'object' || Array.isArray(user.solved)
        ).length
        quiz.invalidPasswordHashes = quizUsers.filter(user =>
          !/^[a-f0-9]{32}$/i.test(user?.salt ?? '') || !/^[a-f0-9]{64}$/i.test(user?.hash ?? '')
        ).length
        quiz.plaintextPasswordFields = quizUsers.filter(user =>
          Object.hasOwn(user ?? {}, 'password') || Object.hasOwn(user ?? {}, 'passwordHash')
        ).length
      } catch {
        quiz.valid = false
      }
    }

    console.log(JSON.stringify({
      ok: true,
      database: db.databaseName,
      collections: names,
      counts,
      indexes,
      integrity: {
        duplicateNicknameKeys: duplicateNicknameKeys?.count ?? 0,
        usersWithoutProgress: usersWithoutProgress?.count ?? 0,
        progressWithoutUsers: progressWithoutUsers?.count ?? 0,
        expiredAuthSessionsAwaitingTtl: await authSessions.countDocuments({ expiresAt: { $lte: new Date() } }),
        mainAdminProfiles: await users.countDocuments({ nicknameKey: 'admin', role: 'admin' }),
      },
      credentials: {
        mainUsersWithPlaintextPassword: await users.countDocuments({ password: { $exists: true } }),
        mainUsersWithInvalidPasswordHash: await users.countDocuments({
          $or: [
            { passwordHash: { $exists: false } },
            { passwordHash: { $not: /^scrypt\$32768\$8\$1\$/ } },
          ],
        }),
        databaseRoles: connectionStatus.authInfo.authenticatedUserRoles,
        leastPrivilegeWarning: connectionStatus.authInfo.authenticatedUserRoles.some(role => role.role === 'atlasAdmin'),
      },
      quiz,
    }, null, 2))
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error?.message ?? String(error) }))
    process.exitCode = 1
  } finally {
    await client.close()
  }
}
