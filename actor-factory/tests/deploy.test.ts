import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readProject} from '../scripts/deploy-workflow.mjs';
test('deploy helper refuses a result-only JSON and accepts a complete compiled project',async()=>{
 const root=await mkdtemp(join(tmpdir(),'workflow-deploy-'));
 try {
  await mkdir(join(root,'.actor'));await mkdir(join(root,'src'));
  await writeFile(join(root,'.actor/actor.json'),JSON.stringify({name:'deploy-test-demo'}));
  for(const name of ['package.json','package-lock.json','.actor/Dockerfile','.actor/INPUT_SCHEMA.json','README.md','src/main.ts'])await writeFile(join(root,name),'{}');
  await assert.rejects(readProject(root),/No compiled workflow configuration/);
  await writeFile(join(root,'compiled.graph.json'),JSON.stringify({definition:{name:'deploy-test-demo'}}));
  const project=await readProject(root);assert.equal(project.compiled.name,'compiled.graph.json');
 } finally {await rm(root,{recursive:true,force:true});}
});
