import { spawn } from 'node:child_process'
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { afterEach, expect, it } from 'vitest'

const directories: string[] = []
const servers: Server[] = []
const digest = 'a'.repeat(64)
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  for (const dir of directories.splice(0)) await rm(dir,{recursive:true,force:true})
})

async function fixture() {
  const root=await mkdtemp(join(existsSync('/tmp/opencode')?'/tmp/opencode':tmpdir(),'astrobio-dual-setup-')); directories.push(root)
  for(const dir of ['scripts','src','server']) await cp(dir,join(root,dir),{recursive:true})
  await writeFile(join(root,'package.json'),'{"type":"module"}')
  const models = new Set(['medgemma1.5:4b'])
  const pulled: string[] = [], generated: Record<string, unknown>[] = []
  const server=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json')
    if(req.url==='/api/tags') return res.end(JSON.stringify({models:[...models].map(name=>({name,digest}))}))
    if(req.url==='/api/ps') return res.end(JSON.stringify({models:[]}))
    const chunks: Buffer[]=[]; for await(const chunk of req) chunks.push(Buffer.from(chunk))
    const body=JSON.parse(Buffer.concat(chunks).toString())
    if(req.url==='/api/pull') { models.add(body.model); pulled.push(body.model); return res.end('{"status":"success"}\n') }
    if(req.url==='/api/chat') { generated.push(body); return res.end(JSON.stringify({done:true,message:{content:'OK'}})) }
    res.writeHead(404); res.end('{}')
  }); servers.push(server)
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`
  const initial=`# preserve\nAPI_PORT=9999\nDB_FILE=data/untouched.sqlite\nLOCAL_AI_ENABLED=true\nLOCAL_AI_MODEL=medgemma1.5:4b\nLOCAL_AI_URL=${url}\nCOMPANION_AI_MODEL=\nCOMPANION_AI_URL=${url}\nVOICE_ENABLED=false\n`
  await writeFile(join(root,'.env'),initial)
  async function run(args: string[]) {
    await new Promise<void>((resolve,reject)=>{
      // Native Node script only: fake Ollama, no actual model/system commands.
      const child=spawn(process.execPath,['scripts/setup-local-ai.ts','--yes','--skip-voice',...args],{cwd:root,env:{PATH:'',HOME:root,LOCAL_AI_URL:url,COMPANION_AI_URL:url},stdio:['ignore','pipe','pipe']})
      let output=''; child.stdout.on('data',c=>{output+=String(c)}); child.stderr.on('data',c=>{output+=String(c)})
      child.on('error',reject); child.on('close',code=>code===0?resolve():reject(new Error(output)))
    })
  }
  return {root,initial,pulled,generated,run}
}

it('installs medical then Qwen3 in the default workflow with separate locks and preserved settings',async()=>{
  const f=await fixture(); await f.run([])
  expect(f.generated.map(b=>b.model)).toEqual(['medgemma1.5:4b','qwen3:1.7b'])
  expect(f.generated.every(b=>b.think===false)).toBe(true)
  expect(f.pulled).toEqual(['qwen3:1.7b'])
  const values=parseEnv(await readFile(join(f.root,'.env'),'utf8'))
  expect(values).toMatchObject({API_PORT:'9999',DB_FILE:'data/untouched.sqlite',LOCAL_AI_MODEL:'medgemma1.5:4b',COMPANION_AI_MODEL:'qwen3:1.7b',COMPANION_AI_ENABLED:'true',VOICE_ENABLED:'false'})
  expect(JSON.parse(await readFile(join(f.root,'local-ai/model-lock.json'),'utf8')).model).toBe('medgemma1.5:4b')
  expect(JSON.parse(await readFile(join(f.root,'local-ai/companion-model-lock.json'),'utf8')).model).toBe('qwen3:1.7b')
},15000)

it('supports a companion-only retry without changing the medical lock or generating with MedGemma',async()=>{
  const f=await fixture(); await mkdir(join(f.root,'local-ai'))
  const original=JSON.stringify({schemaVersion:1,model:'medgemma1.5:4b',digest})+'\n'
  await writeFile(join(f.root,'local-ai/model-lock.json'),original)
  await f.run(['--role','companion'])
  expect(f.generated.map(b=>b.model)).toEqual(['qwen3:1.7b'])
  expect(await readFile(join(f.root,'local-ai/model-lock.json'),'utf8')).toBe(original)
  expect(parseEnv(await readFile(join(f.root,'.env'),'utf8')).LOCAL_AI_MODEL).toBe('medgemma1.5:4b')
},15000)
