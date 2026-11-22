import {Actor} from 'apify';
import {Acceptance,evaluateContract,type AcceptanceContract} from './acceptance.js';
export {Acceptance,evaluateContract} from './acceptance.js';
import {z} from 'zod';
import {Graph,compileGraph,atPointer,coverageKey,schemaValidator,assertDataOnly,type WorkflowGraph,type CompiledGraph} from './graph.js';
import {exportGraph,trustedCatalog} from './graph-runtime.js';
import {hash,type Contract} from './contracts.js';
import {renderReport,type VisualWorkflow,type VisualNode} from './presentation.js';

const Id=z.string().regex(/^[a-z][a-z0-9_-]{0,30}$/);
export const Suite=z.object({name:z.string().regex(/^[a-z][a-z0-9-]{2,49}$/),goal:z.string().min(8).max(1500),parameters:z.record(z.string(),z.unknown()),contract:Acceptance,candidates:z.array(z.object({id:Id,label:z.string().min(2).max(90),baseline:z.boolean().default(false),graph:Graph}).strict()).min(2).max(3),reviewedActorIds:z.array(z.string()).max(12).default([]),repeats:z.number().int().min(1).max(2).default(1)}).strict();
export type BenchmarkSuite=z.infer<typeof Suite>;
export function chooseWinner(rows:{id:string;qualityPassed:boolean;costComplete:boolean;costPerUsableRowUsd:number|null}[]) {
 const passing=rows.filter(row=>row.qualityPassed);
 if(!passing.length)return {status:'NO_PASSING_CANDIDATE',winnerId:null};
 if(passing.some(row=>!row.costComplete||row.costPerUsableRowUsd===null||!Number.isFinite(row.costPerUsableRowUsd)||row.costPerUsableRowUsd<0))return {status:'COST_INCOMPLETE',winnerId:null};
 const sorted=passing.sort((a,b)=>a.costPerUsableRowUsd!-b.costPerUsableRowUsd!||a.id.localeCompare(b.id));
 return {status:'WINNER_SELECTED',winnerId:sorted[0]!.id};
}
export function researchSuite(parameters:Record<string,unknown>):BenchmarkSuite {
 const url=String(parameters.url??'');if(!/^https:\/\//.test(url))throw new Error('Provide parametersJson with a public HTTPS url for the built-in research comparison. Other jobs need benchmarkJson with candidate graphs and a shared contract.');
 const query=String(parameters.query??url);
 const goal='Return usable source text, title and URL for every supplied public page.';
 const itemSchema={type:'object',properties:{url:{type:'string',minLength:10},title:{type:'string',minLength:3},text:{type:'string',minLength:300}},required:['url','title','text'],additionalProperties:false};
 const inputSchema={type:'object',properties:{url:{type:'string'},query:{type:'string'}},required:['url','query'],additionalProperties:false};
 const outputSchema={type:'object',properties:{items:{type:'array',minItems:1,items:itemSchema}},required:['items'],additionalProperties:false};
 const crawlInput={crawlerType:'cheerio',maxCrawlDepth:0,maxCrawlPages:1,maxResults:1,maxConcurrency:1,requestTimeoutSecs:25,respectRobotsTxtFile:true,saveMarkdown:true,saveHtml:false,proxyConfiguration:{useApifyProxy:true}};
 const ref=(from:string,path:string)=>({$from:from,path});
 const project=(source:string,rag=false)=>({id:'normalize',kind:'transform',dependsOn:[source],operation:'project',sources:[ref(source,'/items')],fields:{url:rag?['/metadata/url','/metadata.url','/url']:['/url'],title:['/metadata/title','/metadata.title','/title'],text:['/text','/markdown']},uniqueBy:'',maxItems:1});
 const actor=(id:string,actorId:string,inputTemplate:any,dependsOn:string[]=[])=>({id,kind:'actor',actorId,dependsOn,inputTemplate,timeoutSecs:90,memoryMb:1024,chargeCapUsd:0.5,maxItems:1});
 const definition=(name:string,steps:any[]):any=>({version:1,name,goal,inputSchema,steps,outputTemplate:{items:ref('normalize','/items')},outputSchema,checks:[{type:'minItems',value:ref('normalize','/items'),min:1},{type:'requiredFields',value:ref('normalize','/items'),fields:['/url','/title','/text']},{type:'coverage',value:ref('normalize','/items'),expected:ref('$input','/url'),keyPointer:'/url',minCoverage:1}]});
 const baseline=definition('source-baseline-search-crawl',[actor('search','apify/google-search-scraper',{queries:ref('$input','/query'),maxPagesPerQuery:1,countryCode:'us',languageCode:'en',saveHtml:false,includeUnfilteredResults:false}),actor('collect','apify/website-content-crawler',{...crawlInput,startUrls:{$from:'search',path:'/items/0/organicResults',take:1,pluck:'/url',wrap:'url'}},['search']),project('collect')]);
 const combined=definition('source-combined-rag-browser',[actor('browse','apify/rag-web-browser',{query:ref('$input','/url'),maxResults:1,outputFormats:['text','markdown'],scrapingTool:'raw-http',requestTimeoutSecs:45,desiredConcurrency:1,serpMaxRetries:0,maxRequestRetries:0}),project('browse',true)]);
 const direct=definition('source-direct-crawler',[actor('collect','apify/website-content-crawler',{...crawlInput,startUrls:[{url:ref('$input','/url')}]}),project('collect')]);
 return Suite.parse({name:'source-workflow-comparison',goal,parameters:{url,query},contract:{itemSchema,minRows:1,requiredFields:['/url','/title','/text'],expectedParameterPointer:'/url',keyPointer:'/url',minCoverage:1,noDuplicates:true,forbiddenTextIncludes:['verify you are human','request blocked']},candidates:[{id:'baseline',label:'Current: Search + Crawler',baseline:true,graph:baseline},{id:'combined',label:'Combined RAG Web Browser',graph:combined},{id:'direct',label:'Direct URL Crawler',graph:direct}],reviewedActorIds:['apify/google-search-scraper','apify/website-content-crawler','apify/rag-web-browser'],repeats:1});
}
function visual(candidate:any):VisualWorkflow {
 const sample=candidate.samples?.find((s:any)=>s.receipt)??candidate.samples?.[0];const receipt=sample?.receipt;
 const nodes:VisualNode[]=candidate.compiled.definition.steps.map((step:any)=>{const child=receipt?.children?.[step.id];return {id:step.id,label:step.actorId?.split('/')[1]??step.id.replaceAll('_',' '),kind:step.kind,dependsOn:step.dependsOn,status:child?.status??(sample?.quality?.passed?'SUCCEEDED':sample?.runStatus==='FAILED'?'FAILED':'PLANNED'),actorId:step.actorId,runId:child?.runId,costUsd:child?.usageUsd,detail:step};});
 nodes.push({id:'_acceptance',label:'Shared acceptance contract',kind:'check',dependsOn:nodes.filter(n=>!nodes.some(next=>next.dependsOn.includes(n.id))).map(n=>n.id),status:candidate.qualityPassed?'PASSED':sample?'FAILED':'PLANNED',detail:sample?.quality});
 return {id:candidate.id,label:candidate.label,isBaseline:candidate.baseline,nodes,status:candidate.qualityPassed?'PASSED':sample?'FAILED':'PLANNED',costUsd:candidate.totalCostUsd,costComplete:candidate.costComplete,durationSecs:candidate.durationSecs,result:receipt?.result,quality:{sampleRuns:candidate.samples?.map((s:any)=>({runId:s.runId,quality:s.quality,cost:s.cost})),contractHash:candidate.contractHash},runId:sample?.runId};
}
export function benchmarkReport(output:any,archiveBase64?:string) {
 const winner=output.candidates?.find((c:any)=>c.id===output.winnerId);const baseline=output.candidates?.find((c:any)=>c.baseline);
 return renderReport({title:'Find the workflow worth switching to',goal:output.goal??'Compare complete workflows on the same inputs and acceptance contract.',status:output.status,message:output.message,comparison:true,workflows:(output.candidates??[]).map(visual),selectedId:output.winnerId??output.candidates?.[0]?.id,metrics:[{label:'Workflows completed',value:String(output.candidates?.filter((c:any)=>c.samples?.length===output.repeats).length??0)+' / '+String(output.candidates?.length??0)},{label:'Passing workflows',value:String(output.candidates?.filter((c:any)=>c.qualityPassed).length??0)},{label:'Lowest passing observed cost',value:winner?'$'+winner.totalCostUsd.toFixed(6):'Undetermined',note:'Wrapper + recorded child runs; same sample.'},{label:'Sample attempts per workflow',value:String(output.repeats??1),note:'Not a production reliability estimate.'}],archiveBase64,projectName:output.project?.generatedName,evidence:{contract:output.contract,contractHash:output.contractHash,inputHash:output.inputHash},trace:{candidates:output.candidates,events:output.events,costPolicy:output.costPolicy,baselineId:baseline?.id}});
}
export async function runBenchmark(raw:Record<string,unknown>) {
 let suite:BenchmarkSuite;
 if(typeof raw.benchmarkJson==='string'&&raw.benchmarkJson.trim())suite=Suite.parse(JSON.parse(raw.benchmarkJson));
 else suite=researchSuite(JSON.parse(typeof raw.parametersJson==='string'?raw.parametersJson:'{}'));
 assertDataOnly(suite.parameters);schemaValidator(suite.contract.itemSchema);
 if(suite.candidates.filter(c=>c.baseline).length!==1)throw new Error('Exactly one candidate must be marked baseline');
 if(new Set(suite.candidates.map(c=>c.id)).size!==suite.candidates.length)throw new Error('Duplicate candidate IDs');
 const reviewed=[...new Set([...trustedCatalog,...suite.reviewedActorIds])];
 const compiled=suite.candidates.map(c=>({...c,compiled:compileGraph(c.graph,reviewed,4)}));
 if(compiled.some(c=>c.graph.goal!==suite.goal))throw new Error('Candidate goals must match the shared suite goal');
 const totalCaps=compiled.reduce((sum,c)=>sum+c.compiled.limits.ppeCapSumUsd,0)*suite.repeats;
 const allocation=typeof raw.testBudgetUsd==='number'?raw.testBudgetUsd:2;
 if(totalCaps>allocation+1e-9)throw new Error(`BENCHMARK_BUDGET_EXCEEDED: candidate PPE allocations total $${totalCaps}; supplied allocation is $${allocation}`);
 const loads=[0,0];for(const seconds of compiled.flatMap(c=>Array(suite.repeats).fill(c.compiled.limits.maxExecutionSeconds+30)).sort((a,b)=>b-a)){const index=loads[0]!<=loads[1]!?0:1;loads[index]!+=seconds;}if(Math.max(...loads)>300)throw new Error('BENCHMARK_RUNTIME_BUDGET_EXCEEDED: reduce step timeouts or sample attempts');
 const fingerprint=hash(suite);const state:any=await Actor.getValue('BENCHMARK_STATE')??{fingerprint,runs:{},events:[]};if(state.fingerprint!==fingerprint)throw new Error('Benchmark checkpoint inputs changed; start a fresh run');
 let saveQueue=Promise.resolve();const save=()=>{const snapshot=structuredClone(state);saveQueue=saveQueue.then(()=>Actor.setValue('BENCHMARK_STATE',snapshot));return saveQueue;};
 const output:any={status:'TESTING',goal:suite.goal,repeats:suite.repeats,inputHash:hash(suite.parameters),contractHash:hash(suite.contract),contract:suite.contract,candidates:compiled.map(c=>({...c,contractHash:hash(suite.contract),samples:[],qualityPassed:false,costComplete:false,totalCostUsd:null})),events:state.events,costPolicy:'Observed Apify cost of each dedicated workflow wrapper plus its explicitly recorded child runs. Model-node costs and undocumented nested/external charges are not inferred. Optimizer coordination is separate overhead.'};
 const write=async()=>{const zip=await Actor.getValue<Buffer>('ACTOR_PROJECT.zip');await Actor.setValue('OUTPUT',output);await Actor.setValue('REPORT.html',benchmarkReport(output,Buffer.isBuffer(zip)?zip.toString('base64'):undefined),{contentType:'text/html'});};
 await Actor.setValue('ACTOR_PROJECT.zip',null);await save();await write();
 const env=Actor.getEnv();if(!env.actorId||!env.actorBuildId)throw new Error('Benchmark execution requires the Apify cloud runtime');
 const reader=Actor.newClient({maxRetries:1,timeoutSecs:75});const mutation=Actor.newClient({maxRetries:0,timeoutSecs:30});
 const build=await reader.build(env.actorBuildId).get();if(!build)throw new Error('Runner build unavailable');
 const jobs=compiled.flatMap(c=>Array.from({length:suite.repeats},(_,attempt)=>({candidate:c,attempt})));
 let cursor=0,halt=false;
 const worker=async()=>{try{while(!halt&&cursor<jobs.length){const job=jobs[cursor++]!;const key=job.candidate.id+'_'+job.attempt;const target=output.candidates.find((c:any)=>c.id===job.candidate.id);
  let saved=Object.prototype.hasOwnProperty.call(state.runs,key)?state.runs[key]:undefined;
  if(saved?.status==='STARTING'&&!saved.runId)throw new Error('AMBIGUOUS_BENCHMARK_START: inspect runs before starting another');
  if(!saved){state.runs[key]={status:'STARTING'};await save();const run=await mutation.actor(env.actorId!).start({workflowMode:'graph',mode:'execute',goal:suite.goal,workflowJson:JSON.stringify(job.candidate.graph),candidateActorIds:job.candidate.compiled.actorIds,parametersJson:JSON.stringify(suite.parameters),testBudgetUsd:Math.max(0.1,job.candidate.compiled.limits.ppeCapSumUsd),acceptanceJson:JSON.stringify(suite.contract),generatedName:job.candidate.graph.name},{build:build.buildNumber,memory:256,timeout:Math.min(330,job.candidate.compiled.limits.maxExecutionSeconds+60),restartOnError:false});saved=state.runs[key]={runId:run.id,status:run.status};await save();}
  await Actor.setStatusMessage(`Testing ${job.candidate.label}, sample ${job.attempt+1}`);
  const run=await reader.run(saved.runId).waitForFinish({waitSecs:Math.min(330,job.candidate.compiled.limits.maxExecutionSeconds+75)});saved.status=run.status;saved.storeId=run.defaultKeyValueStoreId;await save();
  if(!['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(run.status)){await mutation.run(run.id).abort();saved.status='ABORTED';}
  const record=await reader.keyValueStore(run.defaultKeyValueStoreId).getRecord('OUTPUT');const receipt:any=record?.value??{};
  const quality=evaluateContract(receipt.result,suite.contract,suite.parameters);
  if(run.status!=='SUCCEEDED'||receipt.status!=='PASSED_DECLARED_CHECKS'){quality.passed=false;quality.reasons.push(receipt.error??'Workflow did not pass its declared checks');}
  const sample={runId:run.id,storeId:run.defaultKeyValueStoreId,runStatus:saved.status,receipt,quality,cost:null,attempt:job.attempt+1};target.samples.push(sample);
  state.events.push({at:new Date().toISOString(),candidate:job.candidate.id,attempt:job.attempt+1,phase:quality.passed?'PASSED':'FAILED',runId:run.id});await save();await write();
 }}catch(error){halt=true;await Promise.allSettled(Object.values(state.runs).filter((r:any)=>r.runId&&!['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(r.status)).map((r:any)=>mutation.run(r.runId).abort()));throw error;}};
 const workerResults=await Promise.allSettled([worker(),worker()]);const failedWorker=workerResults.find(r=>r.status==='rejected');if(failedWorker?.status==='rejected')throw failedWorker.reason;
 // Refresh completed run costs after the entire cohort finished, rather than trusting an early snapshot.
 for(const candidate of output.candidates){let costComplete=candidate.compiled.limits.modelCalls===0;let total=0,duration=0;
  for(const sample of candidate.samples){const wrapper=await reader.run(sample.runId).get();let amount=typeof wrapper?.usageTotalUsd==='number'?wrapper.usageTotalUsd:0;let complete=typeof wrapper?.usageTotalUsd==='number';
   for(const child of Object.values(sample.receipt.children??{}) as any[]){try{const actual=await reader.run(child.runId).get();if(typeof actual?.usageTotalUsd!=='number')complete=false;else{amount+=actual.usageTotalUsd;child.usageUsd=actual.usageTotalUsd;}}catch{complete=false;}}
   sample.cost={reportedUsd:amount,complete:complete&&candidate.compiled.limits.modelCalls===0,observedAt:new Date().toISOString(),scope:'Dedicated wrapper plus recorded child runs'};total+=amount;costComplete&&=sample.cost.complete;
   if(wrapper?.startedAt&&wrapper?.finishedAt)duration+=(new Date(wrapper.finishedAt).getTime()-new Date(wrapper.startedAt).getTime())/1000;
  }
  candidate.qualityPassed=candidate.samples.length===suite.repeats&&candidate.samples.every((s:any)=>s.quality.passed);candidate.costComplete=costComplete;candidate.totalCostUsd=total;candidate.durationSecs=duration;const usable=candidate.samples.reduce((sum:number,s:any)=>sum+s.quality.usableRows,0);candidate.costPerUsableRowUsd=usable?total/usable:null;
 }
 const decision=chooseWinner(output.candidates);Object.assign(output,decision);
 const winner=output.candidates.find((c:any)=>c.id===output.winnerId);
 output.message=winner?`${winner.label} has the lowest observed cost per usable row among passing candidates on this sample. Every candidate used the same input and acceptance contract. This is not a global cheapest or production-reliability guarantee.`:decision.status==='COST_INCOMPLETE'?'Some workflows passed, but their complete costs are not measurable from these receipts. No cheapest recommendation is made.':'No workflow passed the shared acceptance contract. Inspect the failed fields and coverage before switching.';
 if(winner){const sample=winner.samples[0];const contractRecord=await reader.keyValueStore(sample.storeId).getRecord('GRAPH_CONTRACTS');if(!Array.isArray(contractRecord?.value))throw new Error('Winning contracts unavailable; no unpinned export will be produced');output.project=await exportGraph(winner.compiled,contractRecord.value as unknown as Contract[],suite.parameters,winner.compiled.actorIds,true,suite.contract);}
 await Actor.setValue('BENCHMARK_RESULT',output);await write();await Actor.pushData({status:output.status,winnerId:output.winnerId,candidates:output.candidates.map((c:any)=>({id:c.id,qualityPassed:c.qualityPassed,costComplete:c.costComplete,totalCostUsd:c.totalCostUsd,costPerUsableRowUsd:c.costPerUsableRowUsd,samples:c.samples.map((s:any)=>({runId:s.runId,quality:s.quality,cost:s.cost}))})),project:output.project??null});
 await Actor.setStatusMessage(output.status+': comparison receipt and visual workflow graphs saved');return output;
}
