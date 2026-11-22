import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileGraph,executeGraph,resolveTemplate,schemaValidator,transform,type GraphServices} from '../src/graph.js';
const claimSchema={type:'object',properties:{claims:{type:'array',minItems:1,items:{type:'object',properties:{sourceUrl:{type:'string'},quote:{type:'string',minLength:8},finding:{type:'string'}},required:['sourceUrl','quote','finding'],additionalProperties:false}}},required:['claims'],additionalProperties:false};
const definition=()=>({version:1,name:'graph-test-demo',goal:'Create a sourced brief from public data',inputSchema:{type:'object',properties:{},additionalProperties:false},steps:[
 {id:'source',kind:'actor',actorId:'demo/source',dependsOn:[],inputTemplate:{},chargeCapUsd:0.5},
 {id:'enrich',kind:'actor',actorId:'demo/enrich',dependsOn:['source'],inputTemplate:{startUrls:{$from:'source',path:'/items',pluck:'/url',wrap:'url',take:1}},chargeCapUsd:0.5},
 {id:'brief',kind:'model',dependsOn:['enrich'],contextTemplate:{sources:{$from:'enrich',path:'/items'}},instruction:'Produce a grounded source brief with exact quotes',outputSchema:claimSchema},
],outputTemplate:{claims:{$from:'brief',path:'/claims'}},outputSchema:claimSchema,checks:[{type:'minItems',value:{$from:'brief',path:'/claims'},min:1},{type:'quoteProvenance',claims:{$from:'brief',path:'/claims'},sources:{$from:'enrich',path:'/items'},urlPointer:'/url',textPointer:'/text'}]});
const allowed=['demo/source','demo/enrich'];
const source={url:'https://example.com/',text:'A real public source describes useful tools for developers.'};
const brief={claims:[{sourceUrl:source.url,quote:'useful tools for developers',finding:'The source describes developer tools.'}]};
function harness(overrides:Partial<GraphServices>={}) {
 const cache=new Map<string,any>();const calls:string[]=[];
 const services:GraphServices={load:async id=>cache.get(id)??null,save:async(id,value)=>{cache.set(id,value);},event:async()=>{},actor:async(step,input)=>{calls.push(step.id);if(step.id==='enrich')assert.deepEqual(input.startUrls,[{url:source.url}]);return {items:[source]};},model:async()=>{calls.push('model');return brief;},...overrides};
 return {services,calls,cache};
}
test('general graph maps two Actor steps into a schema-checked model and exact provenance gate',async()=>{
 const compiled=compileGraph(definition(),allowed,1);const h=harness();const result=await executeGraph(compiled,{},h.services);
 assert.equal(result.status,'PASSED_DECLARED_CHECKS');assert.deepEqual(compiled.order,['source','enrich','brief']);assert.deepEqual(h.calls,['source','enrich','model']);assert.equal(result.checks.length,2);
});
test('compiler rejects cycles, undeclared references, unadmitted Actors and excessive charges before execution',()=>{
 let graph=definition();graph.steps[0]!.dependsOn=['enrich'];assert.throws(()=>compileGraph(graph,allowed,1),/WORKFLOW_CYCLE/);
 graph=definition();graph.steps[1]!.dependsOn=[];assert.throws(()=>compileGraph(graph,allowed,1),/REFERENCE_NOT_A_DECLARED_DEPENDENCY/);
 assert.throws(()=>compileGraph(definition(),['demo/source'],1),/ACTOR_NOT_ADMITTED/);
 assert.throws(()=>compileGraph(definition(),allowed,0.5),/WORKFLOW_BUDGET_EXCEEDED/);
});
test('a missing mapped field halts before starting a downstream Actor or model',async()=>{
 const h=harness({actor:async step=>{h.calls.push(step.id);return {items:[{title:'No URL'}]};}});
 await assert.rejects(executeGraph(compileGraph(definition(),allowed,1),{},h.services),/MISSING_MAPPING_VALUE/);assert.deepEqual(h.calls,['source']);
});
test('schema failures and invented quotes cannot produce a passing receipt',async()=>{
 let h=harness({model:async()=>({claims:[]})});await assert.rejects(executeGraph(compileGraph(definition(),allowed,1),{},h.services),/SCHEMA_GATE_FAILED/);
 h=harness({model:async()=>({claims:[{...brief.claims[0],quote:'This quote was never retrieved'}]})});await assert.rejects(executeGraph(compileGraph(definition(),allowed,1),{},h.services),/QUOTE_PROVENANCE_FAILED/);
});
test('quote provenance permits layout whitespace changes but preserves exact wording',async()=>{
 const h=harness({actor:async()=>({items:[{...source,text:source.text.replace('tools for','tools\nfor')}]})});
 const result=await executeGraph(compileGraph(definition(),allowed,1),{},h.services);assert.equal(result.checks[1]!.normalization,'Collapse whitespace only; preserve words, case and punctuation.');
});
test('completed checkpoints avoid duplicate remote calls and reject changed workflow inputs',async()=>{
 const h=harness();const compiled=compileGraph(definition(),allowed,1);await executeGraph(compiled,{},h.services);await executeGraph(compiled,{},h.services);assert.deepEqual(h.calls,['source','enrich','model']);
 const changed=definition();changed.inputSchema={type:'object',properties:{q:{type:'string'}}} as any;const other=compileGraph(changed,allowed,1);await assert.rejects(executeGraph(other,{q:'new'},h.services),/CHECKPOINT_FINGERPRINT_CHANGED/);
});
test('template DSL rejects prototype traversal and dangerous schema constructs',()=>{
 assert.throws(()=>resolveTemplate({$from:'$input',path:'/__proto__/polluted'},{},{}),/UNSAFE_OBJECT_KEY/);
 assert.throws(()=>schemaValidator({type:'object',additionalProperties:{type:'string',pattern:'(a+)+$'}}),/UNSUPPORTED_SCHEMA_KEYWORD/);
 assert.throws(()=>schemaValidator({$ref:'https://external.example/schema'}),/UNSUPPORTED_SCHEMA_KEYWORD/);
});
test('code-bearing and credential-bearing Actor inputs are rejected before remote execution',()=>{
 const graph=definition() as any;graph.steps[0].inputTemplate={pageFunction:'async () => process.env.APIFY_TOKEN'};
 assert.throws(()=>compileGraph(graph,allowed,1),/ACTIVE_CODE_OR_CREDENTIAL_INPUT_REJECTED/);
 graph.steps[0].inputTemplate={accessToken:'not-a-real-token'};assert.throws(()=>compileGraph(graph,allowed,1),/ACTIVE_CODE_OR_CREDENTIAL_INPUT_REJECTED/);
});
test('declared freshness checks reject future or stale evidence',async()=>{
 const graph=definition() as any;graph.checks.push({type:'recent',value:{$from:'source',path:'/items'},datePointer:'/date',maxAgeDays:7});
 const h=harness({actor:async()=>({items:[{...source,date:'2030-01-01T00:00:00Z'}]})});await assert.rejects(executeGraph(compileGraph(graph,allowed,1),{},h.services,Date.parse('2026-11-22T00:00:00Z')),/FRESHNESS_GATE_FAILED/);
});
test('deterministic transforms project, combine and deduplicate bounded records',async()=>{
 const graph={version:1,name:'merge-test-demo',goal:'Combine public records and deduplicate them',inputSchema:{type:'object',properties:{items:{type:'array'}},required:['items']},steps:[{id:'project',kind:'transform',dependsOn:[],operation:'project',sources:[{$from:'$input',path:'/items'}],fields:{url:'/link'},uniqueBy:'',maxItems:10},{id:'unique',kind:'transform',dependsOn:['project'],operation:'dedupe',sources:[{$from:'project',path:'/items'}],fields:{},uniqueBy:'/url',maxItems:10}],outputTemplate:{items:{$from:'unique',path:'/items'}},outputSchema:{type:'object',properties:{items:{type:'array',minItems:1}},required:['items']},checks:[{type:'minItems',value:{$from:'unique',path:'/items'},min:1}]};
 const h=harness();const result=await executeGraph(compileGraph(graph,[],0),{items:[{link:'a'},{link:'a'},{link:'b'}]},h.services);assert.deepEqual(result.result,{items:[{url:'a'},{url:'b'}]});assert.deepEqual(h.calls,[]);
});
test('declared fallback mappings preserve real zero values and reject absent alternatives',()=>{
 const step:any={id:'map',kind:'transform',dependsOn:[],operation:'project',sources:[{$from:'$input',path:'/items'}],fields:{url:['/metadata/url','/metadata.url'],likes:['/likes','/count']},uniqueBy:'',maxItems:10};
 assert.deepEqual(transform(step,{items:[{'metadata.url':'https://example.com',likes:0}]},{}),{items:[{url:'https://example.com',likes:0}]});
 assert.throws(()=>transform(step,{items:[{likes:0}]},{}),/MISSING_MAPPING_VALUE/);
});
test('coverage gates reject unrelated outputs even when their row schemas are valid',async()=>{
 const graph=definition() as any;graph.inputSchema={type:'object',properties:{url:{type:'string'}},required:['url']};graph.checks.push({type:'coverage',value:{$from:'source',path:'/items'},expected:{$from:'$input',path:'/url'},keyPointer:'/url',minCoverage:1});
 const h=harness();await assert.rejects(executeGraph(compileGraph(graph,allowed,1),{url:'https://different.example/'},h.services),/COVERAGE_GATE_FAILED/);
});
