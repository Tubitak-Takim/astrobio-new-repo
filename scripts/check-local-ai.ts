import { localAiStatus } from '../server/localAi.ts'

const status = await localAiStatus()
console.log(JSON.stringify(status, null, 2))
if (status.state !== 'ready') process.exitCode = 1
