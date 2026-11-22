#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export async function readProject(directory) {
 const root=resolve(directory);
 const manifest=JSON.parse(await readFile(join(root,'.actor/actor.json'),'utf8'));
 if(!/^[a-z][a-z0-9-]{2,49}$/.test(manifest.name))throw new Error('Invalid generated Actor name');
 for(const file of ['package.json','package-lock.json','.actor/Dockerfile','.actor/INPUT_SCHEMA.json','README.md','src/main.ts'])await readFile(join(root,file));
 let compiled;
 for(const name of ['compiled.graph.json','compiled.creator.json','compiled.workflow.json']){try{compiled={name,data:JSON.parse(await readFile(join(root,name),'utf8'))};break;}catch(e){if(e.code!=='ENOENT')throw e;}}
 if(!compiled)throw new Error('No compiled workflow configuration found. A result JSON alone is not a deployable project.');
 return {root,manifest,compiled};
}
function cli(args,cwd,{raw=false,input}={}) {
 return new Promise((done,reject)=>{
  const child=spawn('apify',args,{cwd,stdio:[input===undefined?'ignore':'pipe','pipe','pipe'],shell:false});let output='';
  if(input!==undefined)child.stdin.end(input);
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>4_000_000)child.kill();});
  child.stderr.on('data',chunk=>process.stderr.write(chunk));
  child.on('error',e=>reject(new Error(e.code==='ENOENT'?'Install the official Apify CLI and log in first.':e.message)));
  child.on('close',code=>{if(code!==0)return reject(new Error(`Apify CLI failed (${code}); inspect the log above. No automatic mutation retry was attempted.`));if(raw)return done(output);try{done(JSON.parse(output));}catch{reject(new Error('CLI did not return valid JSON; inspect Console before retrying deployment.'));}});
 });
}
export async function deploy(directory,{actorId,smoke=false}={}) {
 if(actorId&&!/^[A-Za-z0-9][A-Za-z0-9_/-]{1,100}$/.test(actorId))throw new Error('Invalid target Actor ID');
 const project=await readProject(directory);
 // Existing auth stays in the local official CLI. Never copy tokens into a workflow Actor.
 const args=['push',...(actorId?[actorId]:[]),'--json','--wait-for-finish','360'];
 const pushed=await cli(args,project.root);
 if(pushed.build?.status!=='SUCCEEDED')throw new Error('Build is not successful yet: '+(pushed.build?.url??'check Console'));
 const result={status:'DEPLOYED',actor:pushed.actor,build:pushed.build,compiledConfiguration:project.compiled.name,smokeTest:null};
 await mkdir(join(project.root,'deployment'),{recursive:true});
 const persist=()=>writeFile(join(project.root,'deployment/result.json'),JSON.stringify(result,null,2));await persist();
 if(smoke){
  const response=await cli(['call',pushed.actor.id,'--build',pushed.build.number,'--input','{}','--memory','256','--timeout','360','--json'],project.root);
  let run=response.run??response.data?.run??response.data??response;
  const runId=run.id??run.runId??response.runId;
  if(runId){const details=await cli(['runs','info',runId,'--json'],project.root);run=details.run??details.data??details;}
  const storeId=run.defaultKeyValueStoreId;
  result.smokeTest={runId:run.id,status:run.status,storeId};await persist();
  if(!storeId)throw new Error('Deployment succeeded but the CLI response has no smoke-test store ID; inspect deployment/result.json before retrying.');
  const output=await cli(['key-value-stores','get-value',storeId,'OUTPUT'],project.root);
  result.smokeTest.outputStatus=output.status;
  if(!['VERIFIED','VERIFIED_SAMPLE','PASSED_DECLARED_CHECKS'].includes(output.status)){result.status='SMOKE_CHECKS_FAILED';await persist();throw new Error('Actor was deployed but output checks did not pass: '+output.status);}
  result.status='DEPLOYED_AND_TESTED';await persist();
 }
 const origin=project.compiled.data.origin;
 if(origin&&/^[A-Za-z0-9_-]{10,80}$/.test(origin.storeId??'')) {try{
  await cli(['key-value-stores','set-value',origin.storeId,'DEPLOYMENT','--content-type','application/json'],project.root,{raw:true,input:JSON.stringify(result)});
  const html=await cli(['key-value-stores','get-value',origin.storeId,'REPORT.html'],project.root,{raw:true});
  const actorUrl='https://console.apify.com/actors/'+pushed.actor.id;
  const runUrl=result.smokeTest?.runId?actorUrl+'/runs/'+result.smokeTest.runId:null;
  const card=`<!--DEPLOYMENT_STATUS_START--><article class="card"><h3>Actor created on Apify</h3><p><a href="${actorUrl}" target="_blank" rel="noreferrer">Open the reusable Actor</a>${runUrl?` · <a href="${runUrl}" target="_blank" rel="noreferrer">Open the independent test</a>`:''}</p><p>${result.status}. Build ${pushed.build.number}. The original workflow runtime retains limited permissions.</p></article><!--DEPLOYMENT_STATUS_END-->`;
  const updated=html.replace(/<!--DEPLOYMENT_STATUS_START-->[\s\S]*?<!--DEPLOYMENT_STATUS_END-->/,card);
  if(updated!==html)await cli(['key-value-stores','set-value',origin.storeId,'REPORT.html','--content-type','text/html'],project.root,{raw:true,input:updated});
 }catch(error){result.originReceipt={status:'ATTACH_FAILED',message:error.message};await persist();process.stderr.write('Actor deployment is complete; attaching its receipt failed. See deployment/result.json.\n');}}
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const args=process.argv.slice(2);const option=name=>{const at=args.indexOf(name);return at<0?undefined:args[at+1];};
 if(args.includes('--help'))console.log('node scripts/deploy-workflow.mjs --project-dir . [--actor-id ID] [--test]\nDeploys a generated project using the logged-in Apify CLI. --test starts a fresh paid smoke run. Without --actor-id, apify push creates or updates the Actor named by the project manifest.');
 else try{console.log(JSON.stringify(await deploy(option('--project-dir')??'.',{actorId:option('--actor-id'),smoke:args.includes('--test')}),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
