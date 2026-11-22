import {z} from 'zod';
import {Ajv} from 'ajv';
import {hash} from './contracts.js';

const Id=z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const ActorId=z.string().regex(/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/);
const Pointer=z.string().max(300).refine(v=>v===''||v.startsWith('/'),'Use an RFC 6901 JSON pointer');
export const Binding=z.object({$from:z.string().max(40),path:Pointer,pluck:Pointer.optional(),wrap:z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,59}$/).optional(),take:z.number().int().min(1).max(100).optional(),maxChars:z.number().int().min(100).max(8000).optional()}).strict();
export type Ref=z.infer<typeof Binding>;
const Base={id:Id,dependsOn:z.array(Id).max(6).default([])};
const ActorNode=z.object({...Base,kind:z.literal('actor'),actorId:ActorId,inputTemplate:z.record(z.string(),z.unknown()),timeoutSecs:z.number().int().min(30).max(120).default(90),memoryMb:z.union([z.literal(256),z.literal(512),z.literal(1024),z.literal(2048),z.literal(4096)]).default(1024),chargeCapUsd:z.number().min(0.05).max(1).default(0.5),maxItems:z.number().int().min(1).max(100).default(20)}).strict();
const TransformNode=z.object({...Base,kind:z.literal('transform'),operation:z.enum(['concat','project','dedupe']),sources:z.array(Binding).min(1).max(6),fields:z.record(z.string(),z.union([Pointer,z.array(Pointer).min(1).max(4)])).default({}),uniqueBy:Pointer.default(''),maxItems:z.number().int().min(1).max(100).default(30)}).strict();
const ModelNode=z.object({...Base,kind:z.literal('model'),contextTemplate:z.record(z.string(),z.unknown()),instruction:z.string().min(8).max(1800),outputSchema:z.record(z.string(),z.unknown())}).strict();
const Gate=z.discriminatedUnion('type',[
 z.object({type:z.literal('minItems'),value:Binding,min:z.number().int().min(1).max(100)}).strict(),
 z.object({type:z.literal('requiredFields'),value:Binding,fields:z.array(Pointer).min(1).max(12)}).strict(),
 z.object({type:z.literal('recent'),value:Binding,datePointer:Pointer,maxAgeDays:z.number().int().min(1).max(30)}).strict(),
 z.object({type:z.literal('quoteProvenance'),claims:Binding,sources:Binding,urlPointer:Pointer,textPointer:Pointer}).strict(),
 z.object({type:z.literal('coverage'),value:Binding,expected:Binding,keyPointer:Pointer,minCoverage:z.number().min(0).max(1).default(1)}).strict(),
]);
export const Graph=z.object({version:z.literal(1),name:z.string().regex(/^[a-z][a-z0-9-]{2,49}$/),goal:z.string().min(8).max(1500),inputSchema:z.record(z.string(),z.unknown()),steps:z.array(z.discriminatedUnion('kind',[ActorNode,TransformNode,ModelNode])).min(1).max(6),outputTemplate:z.record(z.string(),z.unknown()),outputSchema:z.record(z.string(),z.unknown()),checks:z.array(Gate).min(1).max(12)}).strict();
export type WorkflowGraph=z.infer<typeof Graph>;
export type Node=WorkflowGraph['steps'][number];
export type CompiledGraph={definition:WorkflowGraph;order:string[];fingerprint:string;actorIds:string[];limits:{actorStarts:number;modelCalls:number;ppeCapSumUsd:number;maxExecutionSeconds:number}};
const forbidden=new Set(['__proto__','prototype','constructor']);
const activeInputKeys=new Set(['pagefunction','code','script','javascript','customjs','customfunction','prenavigationhooks','postnavigationhooks','requesthandler','handlepagefunction','pythoncode','command','shell','exec','apikey','apifytoken','accesstoken','password','secret','cookies','sessiontoken']);
export function assertDataOnly(value:unknown,depth=0):void {
 if(depth>18)throw new Error('INPUT_DEPTH_LIMIT');
 if(Array.isArray(value)){if(value.length>100)throw new Error('INPUT_ARRAY_LIMIT');value.forEach(v=>assertDataOnly(v,depth+1));return;}
 if(value&&typeof value==='object')for(const [key,v] of Object.entries(value)){safeKey(key);if(activeInputKeys.has(key.toLowerCase().replace(/[^a-z]/g,'')))throw new Error('ACTIVE_CODE_OR_CREDENTIAL_INPUT_REJECTED: '+key);assertDataOnly(v,depth+1);}
 if(typeof value==='string'&&/^https?:\/\//i.test(value)){try{const url=new URL(value);if(url.username||url.password)throw new Error('CREDENTIAL_URL_REJECTED');}catch(error){if(String(error).includes('CREDENTIAL_URL_REJECTED'))throw error;}}
}
function safeKey(key:string) {if(forbidden.has(key))throw new Error('UNSAFE_OBJECT_KEY');}
function bounded(value:unknown,maxBytes=150000) {const s=JSON.stringify(value);if(s===undefined||Buffer.byteLength(s)>maxBytes)throw new Error('DATA_SIZE_LIMIT');return value;}
function walk(value:unknown,visit:(ref:Ref)=>void,depth=0):void {
 if(depth>18)throw new Error('TEMPLATE_DEPTH_LIMIT');
 if(Array.isArray(value)){if(value.length>100)throw new Error('TEMPLATE_ARRAY_LIMIT');value.forEach(v=>walk(v,visit,depth+1));return;}
 if(value&&typeof value==='object') {
  const obj=value as Record<string,unknown>;Object.keys(obj).forEach(safeKey);
  if('$from' in obj){const ref=Binding.parse(obj);pointerParts(ref.path);if(ref.pluck!==undefined)pointerParts(ref.pluck);if(ref.wrap)safeKey(ref.wrap);visit(ref);return;}
  Object.values(obj).forEach(v=>walk(v,visit,depth+1));
 }
}
function pointerParts(pointer:string) {
 if(pointer==='')return [];
 if(!pointer.startsWith('/')||/~[^01]/.test(pointer)||pointer.endsWith('~'))throw new Error('INVALID_JSON_POINTER');
 const parts=pointer.slice(1).split('/').map(s=>s.replace(/~1/g,'/').replace(/~0/g,'~'));parts.forEach(safeKey);return parts;
}
export function atPointer(value:unknown,pointer:string):any {
 let current:any=value;
 for(const key of pointerParts(pointer)) {
  if(current===null||typeof current!=='object'||!Object.prototype.hasOwnProperty.call(current,key))throw new Error(`MISSING_MAPPING_VALUE: ${pointer}`);
  current=current[key];
 }
 return current;
}
const schemaKeywords=new Set(['type','properties','required','items','additionalProperties','minItems','maxItems','minLength','maxLength','minimum','maximum','enum','const','description','title','anyOf','oneOf','allOf']);
export function schemaValidator(schema:Record<string,unknown>) {
 bounded(schema,12000);
 function inspectSchema(s:any,depth=0):void {
  if(depth>12||!s||typeof s!=='object'||Array.isArray(s))throw new Error('UNSUPPORTED_OUTPUT_SCHEMA');
  for(const [key,v] of Object.entries(s)) {
   if(!schemaKeywords.has(key))throw new Error(`UNSUPPORTED_SCHEMA_KEYWORD: ${key}`);
   if(key==='properties'){if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('INVALID_PROPERTIES');for(const [field,sub] of Object.entries(v)){safeKey(field);inspectSchema(sub,depth+1);}}
   if(key==='items')inspectSchema(v,depth+1);
   if(key==='additionalProperties'&&typeof v==='object')inspectSchema(v,depth+1);
   if(['anyOf','oneOf','allOf'].includes(key)){if(!Array.isArray(v)||v.length>10)throw new Error('SCHEMA_BRANCH_LIMIT');v.forEach(sub=>inspectSchema(sub,depth+1));}
  }
 }
 inspectSchema(schema);
 const ajv=new Ajv({strict:false,allErrors:true});
 if(!ajv.validateSchema(schema))throw new Error('INVALID_JSON_SCHEMA: '+ajv.errorsText());
 const validate=ajv.compile(schema);
 return (value:unknown)=>{if(!validate(value))throw new Error('SCHEMA_GATE_FAILED: '+ajv.errorsText(validate.errors));};
}
export function compileGraph(raw:unknown,allowedActorIds:string[],ppeBudgetUsd=2):CompiledGraph {
 bounded(raw,60000);
 const graph=Graph.parse(raw);
 schemaValidator(graph.inputSchema);schemaValidator(graph.outputSchema);
 const ids=new Set(graph.steps.map(s=>s.id));if(ids.size!==graph.steps.length)throw new Error('DUPLICATE_STEP_ID');
 ids.forEach(safeKey);
 const actorIds=[...new Set(graph.steps.flatMap(s=>s.kind==='actor'?[s.actorId]:[]))];
 if(actorIds.some(id=>!allowedActorIds.includes(id)))throw new Error('ACTOR_NOT_ADMITTED');
 const actorNodes=graph.steps.filter(s=>s.kind==='actor');
 const modelNodes=graph.steps.filter(s=>s.kind==='model');
 const ppeCapSumUsd=actorNodes.reduce((sum,s)=>sum+s.chargeCapUsd,0);
 if(actorNodes.length>4||modelNodes.length>2||ppeCapSumUsd>ppeBudgetUsd+1e-9)throw new Error('WORKFLOW_BUDGET_EXCEEDED');
  const maxExecutionSeconds=actorNodes.reduce((sum,s)=>sum+s.timeoutSecs,0)+45*modelNodes.length;
  if(maxExecutionSeconds>300)throw new Error(`WORKFLOW_RUNTIME_BUDGET_EXCEEDED: ${maxExecutionSeconds} seconds declared, maximum 300; reduce step timeouts or step count`);
  if(!graph.checks.some(g=>g.type==='minItems'||g.type==='quoteProvenance'))throw new Error('NONEMPTY_DATA_GATE_REQUIRED');
 for(const step of graph.steps) {
  if(step.kind==='actor')assertDataOnly(step.inputTemplate);
  if(new Set(step.dependsOn).size!==step.dependsOn.length||step.dependsOn.some(id=>!ids.has(id)||id===step.id))throw new Error('INVALID_DEPENDENCY');
  walk(step,ref=>{if(ref.$from!=='$input'&&(!ids.has(ref.$from)||!step.dependsOn.includes(ref.$from)))throw new Error('REFERENCE_NOT_A_DECLARED_DEPENDENCY');});
  if(step.kind==='model'){if(step.outputSchema.type!=='object')throw new Error('MODEL_REQUIRES_OBJECT_SCHEMA');schemaValidator(step.outputSchema);}
  if(step.kind==='transform'){Object.keys(step.fields).forEach(safeKey);Object.values(step.fields).flat().forEach(pointerParts);pointerParts(step.uniqueBy);if(step.operation==='project'&&!Object.keys(step.fields).length)throw new Error('PROJECT_FIELDS_REQUIRED');}
 }
 walk(graph.outputTemplate,ref=>{if(ref.$from!=='$input'&&!ids.has(ref.$from))throw new Error('UNKNOWN_OUTPUT_REFERENCE');});
 walk(graph.checks,ref=>{if(ref.$from!=='$input'&&!ids.has(ref.$from))throw new Error('UNKNOWN_GATE_REFERENCE');});
 for(const gate of graph.checks){if(gate.type==='requiredFields')gate.fields.forEach(pointerParts);if(gate.type==='recent')pointerParts(gate.datePointer);if(gate.type==='quoteProvenance'){pointerParts(gate.urlPointer);pointerParts(gate.textPointer);}if(gate.type==='coverage')pointerParts(gate.keyPointer);}
 const order:string[]=[];
 while(order.length<graph.steps.length){const ready=graph.steps.find(s=>!order.includes(s.id)&&s.dependsOn.every(id=>order.includes(id)));if(!ready)throw new Error('WORKFLOW_CYCLE');order.push(ready.id);}
 return {definition:graph,order,fingerprint:hash(graph),actorIds,limits:{actorStarts:actorNodes.length,modelCalls:modelNodes.length,ppeCapSumUsd,maxExecutionSeconds}};
}
export function resolveTemplate(value:unknown,input:unknown,outputs:Record<string,unknown>):any {
 if(Array.isArray(value))return value.map(v=>resolveTemplate(v,input,outputs));
 if(value&&typeof value==='object') {
  const object=value as Record<string,unknown>;Object.keys(object).forEach(safeKey);
  if('$from' in object) {
   const ref=Binding.parse(object);
   let result=atPointer(ref.$from==='$input'?input:atPointer(outputs,'/'+ref.$from),ref.path);
   if(ref.take!==undefined){if(!Array.isArray(result))throw new Error('TAKE_REQUIRES_ARRAY');result=result.slice(0,ref.take);}
   if(ref.pluck!==undefined){if(!Array.isArray(result))throw new Error('PLUCK_REQUIRES_ARRAY');result=result.map(v=>atPointer(v,ref.pluck!));}
   if(ref.maxChars!==undefined){if(typeof result!=='string')throw new Error('MAX_CHARS_REQUIRES_STRING');result=result.slice(0,ref.maxChars);}
   if(ref.wrap){safeKey(ref.wrap);result=Array.isArray(result)?result.map(v=>({[ref.wrap!]:v})):{[ref.wrap]:result};}
   return structuredClone(result);
  }
  return Object.fromEntries(Object.entries(object).map(([key,v])=>[key,resolveTemplate(v,input,outputs)]));
 }
 return value;
}
export function transform(step:Extract<Node,{kind:'transform'}>,input:unknown,outputs:Record<string,unknown>) {
 const sources=step.sources.map(ref=>resolveTemplate(ref,input,outputs));
 if(sources.some(s=>!Array.isArray(s)))throw new Error('TRANSFORM_REQUIRES_ARRAYS');
 let items:any[]=sources.flat();
 if(items.length>100)throw new Error('FANOUT_LIMIT');
 if(step.operation==='project')items=items.map(item=>Object.fromEntries(Object.entries(step.fields).map(([field,path])=>{
  const paths=Array.isArray(path)?path:[path];for(const pointer of paths){try{const value=atPointer(item,pointer);if(value!==null&&value!==undefined&&value!=='')return [field,value];}catch(error){if(!String(error).includes('MISSING_MAPPING_VALUE'))throw error;}}
  throw new Error('MISSING_MAPPING_VALUE: none of '+paths.join(', '));
 })));
 if(step.operation==='dedupe')items=[...new Map(items.map(item=>[JSON.stringify(atPointer(item,step.uniqueBy)),item])).values()];
 return {items:items.slice(0,step.maxItems)};
}
export function checkOutput(compiled:CompiledGraph,input:unknown,outputs:Record<string,unknown>,now:number) {
 const results:{type:string;passed:true;normalization?:string}[]=[];
 for(const gate of compiled.definition.checks) {
  if(gate.type==='quoteProvenance') {
   const claims=resolveTemplate(gate.claims,input,outputs),sources=resolveTemplate(gate.sources,input,outputs);
   if(!Array.isArray(claims)||!claims.length||!Array.isArray(sources))throw new Error('PROVENANCE_SHAPE_FAILED');
   for(const claim of claims){const source=sources.find(s=>atPointer(s,gate.urlPointer)===claim?.sourceUrl);const quote=typeof claim.quote==='string'?claim.quote.replace(/\s+/g,' ').trim():'';const text=source?String(atPointer(source,gate.textPointer)).replace(/\s+/g,' ').trim():'';if(!source||quote.length<8||!text.includes(quote))throw new Error('QUOTE_PROVENANCE_FAILED');}
  } else if(gate.type==='coverage') {
   const items=resolveTemplate(gate.value,input,outputs),expected=resolveTemplate(gate.expected,input,outputs);const wanted=Array.isArray(expected)?expected:[expected];
   if(!Array.isArray(items)||!wanted.length)throw new Error('COVERAGE_INPUT_FAILED');
   const actual=new Set(items.map(item=>coverageKey(atPointer(item,gate.keyPointer))));const unique=[...new Set(wanted.map(coverageKey))];
   if(unique.filter(key=>actual.has(key)).length/unique.length<gate.minCoverage)throw new Error('COVERAGE_GATE_FAILED');
  } else {
   const items=resolveTemplate(gate.value,input,outputs);
   if(!Array.isArray(items))throw new Error('QUALITY_GATE_REQUIRES_ARRAY');
   if(gate.type==='minItems'&&items.length<gate.min)throw new Error('MINIMUM_ITEMS_FAILED');
   if(gate.type==='requiredFields')for(const item of items)for(const path of gate.fields){const v=atPointer(item,path);if(v===null||v===undefined||v==='')throw new Error('REQUIRED_FIELD_FAILED');}
   if(gate.type==='recent')for(const item of items){const raw=atPointer(item,gate.datePointer);const at=typeof raw==='number'?raw*(raw<1e12?1000:1):Date.parse(String(raw));if(!Number.isFinite(at)||at>now||at<now-gate.maxAgeDays*86400000)throw new Error('FRESHNESS_GATE_FAILED');}
  }
  results.push({type:gate.type,passed:true,...(gate.type==='quoteProvenance'?{normalization:'Collapse whitespace only; preserve words, case and punctuation.'}:{})});
 }
 const result=resolveTemplate(compiled.definition.outputTemplate,input,outputs);schemaValidator(compiled.definition.outputSchema)(result);bounded(result);
 return {result,checks:results};
}
export function coverageKey(value:unknown):string {if(typeof value!=='string'&&typeof value!=='number')throw new Error('INVALID_COVERAGE_KEY');try{const url=new URL(String(value));url.hash='';url.pathname=url.pathname.replace(/\/$/,'')||'/';return url.href.replace(/\/$/,'');}catch{return String(value);}}
export type GraphServices={actor:(step:Extract<Node,{kind:'actor'}>,input:Record<string,unknown>)=>Promise<unknown>;model:(step:Extract<Node,{kind:'model'}>,context:Record<string,unknown>)=>Promise<unknown>;load:(id:string)=>Promise<{fingerprint:string;value:unknown}|null>;save:(id:string,value:{fingerprint:string;value:unknown})=>Promise<void>;event:(phase:string,step:string)=>Promise<void>;candidateOutput?:(value:unknown)=>Promise<void>};
export async function executeGraph(compiled:CompiledGraph,input:unknown,services:GraphServices,now=Date.now()) {
 schemaValidator(compiled.definition.inputSchema)(input);
 const fingerprint=hash({plan:compiled.fingerprint,input});
 const outputs:Record<string,unknown>={};
 const deadline=Date.now()+300000;
 for(const id of compiled.order) {
  const step=compiled.definition.steps.find(s=>s.id===id)!;
  const cached=await services.load(id);
  if(cached){if(cached.fingerprint!==fingerprint)throw new Error('CHECKPOINT_FINGERPRINT_CHANGED');outputs[id]=cached.value;await services.event('REUSED',id);continue;}
  const reservedMs=step.kind==='actor'?step.timeoutSecs*1000:step.kind==='model'?45000:0;
  if(Date.now()+reservedMs>deadline)throw new Error('CONTROLLER_DEADLINE_EXCEEDED');
  await services.event('RUNNING',id);
  let value:unknown;
  if(step.kind==='actor'){const resolved=resolveTemplate(step.inputTemplate,input,outputs);assertDataOnly(resolved);value=await services.actor(step,resolved);}
  else if(step.kind==='model'){value=await services.model(step,resolveTemplate(step.contextTemplate,input,outputs));schemaValidator(step.outputSchema)(value);}
  else value=transform(step,input,outputs);
  bounded(value);await services.save(id,{fingerprint,value});outputs[id]=value;await services.event('COMPLETED',id);
 }
 const candidate=resolveTemplate(compiled.definition.outputTemplate,input,outputs);bounded(candidate);await services.candidateOutput?.(candidate);
 const checked=checkOutput(compiled,input,outputs,now);
 return {status:'PASSED_DECLARED_CHECKS',...checked,outputs,planHash:compiled.fingerprint,limits:compiled.limits,interpretation:'Only the declared schema and quality checks passed. This is not proof of semantic correctness, global cost optimality or unrestricted goal coverage.'};
}
