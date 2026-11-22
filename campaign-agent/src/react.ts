import {z} from 'zod';
export const Action=z.object({decisionSummary:z.string().min(3).max(350),tool:z.enum(['maps','instagram','tiktok','finish']),query:z.string().max(140),rejectedEvidenceIds:z.array(z.string()).max(15),finishReason:z.enum(['continue','enough_evidence','insufficient_evidence','needs_clarification'])}).strict();
export type AgentAction=z.infer<typeof Action>;
export type Observation={status:string;summary:string;newEvidenceIds:string[];usableRows:number};
export type Turn={iteration:number;action:AgentAction;observation?:Observation};
export type LoopState={version:1;turns:Turn[];stopReason?:string};
export async function runReact(state:LoopState,services:{decide:(iteration:number)=>Promise<unknown>;execute:(action:AgentAction,iteration:number)=>Promise<Observation>;knownEvidenceIds:()=>string[];save:()=>Promise<void>;changed:()=>Promise<void>},maxToolCalls=5,maxDecisions=7){
 const finish=async(reason:string)=>{state.stopReason=reason;await services.save();await services.changed();return state;};
 for(let i=0;i<maxDecisions;i++){
  if(state.stopReason)return state;
  let turn=state.turns[i];
  if(!turn){turn={iteration:i+1,action:Action.parse(await services.decide(i+1))};state.turns.push(turn);await services.save();await services.changed();}
  if(turn.observation)continue;
  const a=turn.action;const known=new Set(services.knownEvidenceIds());
  if(a.rejectedEvidenceIds.some(id=>!known.has(id))){turn.observation={status:'CONTROLLER_REJECTED',summary:'Unknown evidence IDs cannot be rejected; use only IDs in the supplied observations.',newEvidenceIds:[],usableRows:0};await services.save();await services.changed();continue;}
  if(a.tool==='finish'){
   if(a.finishReason==='continue'){turn.observation={status:'CONTROLLER_REJECTED',summary:'Finish requires an explicit stop reason.',newEvidenceIds:[],usableRows:0};await services.save();continue;}
   return finish(a.finishReason);
  }
  if(a.finishReason!=='continue'||!a.query.trim()||(a.tool==='instagram'&&!/^[A-Za-z0-9_]{1,60}$/.test(a.query))){turn.observation={status:'CONTROLLER_REJECTED',summary:'Tool actions require continue and a nonempty query; Instagram requires a plain ASCII hashtag.',newEvidenceIds:[],usableRows:0};await services.save();await services.changed();continue;}
  const previous=state.turns.slice(0,i).filter(t=>t.action.tool!=='finish'&&t.observation?.status!=='CONTROLLER_REJECTED');
  if(previous.length>=maxToolCalls)return finish('tool_budget_exhausted');
  if(!a.query.trim()||(a.tool==='instagram'&&!/^[A-Za-z0-9_]{1,60}$/.test(a.query))){turn.observation={status:'CONTROLLER_REJECTED',summary:'Use a nonempty query; Instagram requires one plain hashtag without # or spaces.',newEvidenceIds:[],usableRows:0};await services.save();await services.changed();continue;}
  if(previous.some(t=>t.action.tool===a.tool&&t.action.query.trim().toLowerCase()===a.query.trim().toLowerCase())){turn.observation={status:'CONTROLLER_REJECTED',summary:'Duplicate tool/query blocked: no additional evidence would be collected. Change the search or finish.',newEvidenceIds:[],usableRows:0};await services.save();await services.changed();continue;}
  turn.observation=await services.execute(a,i+1);await services.save();await services.changed();
 }
 return finish('decision_budget_exhausted');
}
