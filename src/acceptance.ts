import {z} from 'zod';
import {atPointer,coverageKey,schemaValidator} from './graph.js';
export const Acceptance=z.object({itemPointer:z.string().default('/items'),itemSchema:z.record(z.string(),z.unknown()),minRows:z.number().int().min(1).max(100),requiredFields:z.array(z.string()).min(1).max(12),expectedParameterPointer:z.string().default('/url'),keyPointer:z.string().default('/url'),minCoverage:z.number().min(0).max(1).default(1),noDuplicates:z.boolean().default(true),requiredTextIncludes:z.array(z.string().max(80)).max(8).default([]),textPointer:z.string().default('/text'),forbiddenTextIncludes:z.array(z.string().max(80)).max(8).default([])}).strict();
export type AcceptanceContract=z.infer<typeof Acceptance>;
export function evaluateContract(result:unknown,contract:AcceptanceContract,parameters:unknown) {
 let items:any[]=[];const reasons:string[]=[];
 try{const value=atPointer(result,contract.itemPointer);if(!Array.isArray(value))throw new Error('Expected an item array');items=value;}catch{reasons.push('Required output item array is missing');}
 const valid=schemaValidator(contract.itemSchema);const fieldCounts:Record<string,number>=Object.fromEntries(contract.requiredFields.map(f=>[f,0]));
 const usable=items.filter(item=>{
  let complete=true;
  for(const field of contract.requiredFields){try{const value=atPointer(item,field);if(value===null||value===undefined||value==='')throw new Error('empty');fieldCounts[field]++;}catch{complete=false;}}
  try{valid(item);}catch{complete=false;}
  if(contract.requiredTextIncludes.length||contract.forbiddenTextIncludes.length){let text='';try{text=String(atPointer(item,contract.textPointer)).toLowerCase();}catch{complete=false;}if(contract.requiredTextIncludes.some(term=>!text.includes(term.toLowerCase()))||contract.forbiddenTextIncludes.some(term=>text.includes(term.toLowerCase())))complete=false;}
  return complete;
 });
 const keys=new Set<string>();for(const item of usable){try{keys.add(coverageKey(atPointer(item,contract.keyPointer)));}catch{}}
 let expected:unknown;try{expected=atPointer(parameters,contract.expectedParameterPointer);}catch{reasons.push('Expected input coverage values are missing');}
 const target=Array.isArray(expected)?expected:expected===undefined?[]:[expected];const targetKeys=[...new Set(target.map(coverageKey))];
 const covered=targetKeys.filter(key=>keys.has(key)).length;const coverage=targetKeys.length?covered/targetKeys.length:0;
 if(usable.length<contract.minRows)reasons.push(`Usable rows ${usable.length} < required ${contract.minRows}`);
 if(usable.length!==items.length)reasons.push(`${items.length-usable.length} rows fail required fields, types or content checks`);
 if(coverage<contract.minCoverage)reasons.push(`Input coverage ${(coverage*100).toFixed(0)}% < required ${(contract.minCoverage*100).toFixed(0)}%`);
 if(contract.noDuplicates&&keys.size!==usable.length)reasons.push('Duplicate output keys');
 return {passed:reasons.length===0,totalRows:items.length,usableRows:usable.length,uniqueRows:keys.size,coverage,coveredInputs:covered,totalInputs:targetKeys.length,fieldCounts,reasons};
}
