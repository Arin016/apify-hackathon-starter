import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Acceptance,evaluateContract,chooseWinner,researchSuite} from '../src/benchmark.js';
import {compileGraph} from '../src/graph.js';
import {renderReport,workflowSvg} from '../src/presentation.js';
const contract=Acceptance.parse({itemSchema:{type:'object',properties:{url:{type:'string'},title:{type:'string'},text:{type:'string',minLength:5}},required:['url','title','text']},minRows:1,requiredFields:['/url','/title','/text'],expectedParameterPointer:'/url',keyPointer:'/url',minCoverage:1,noDuplicates:true});
const parameters={url:'https://example.com/page/'};
const item={url:'https://example.com/page#section',title:'Example',text:'A useful public page'};
test('shared contract checks complete fields, expected input coverage, types and duplicates',()=>{
 assert.equal(evaluateContract({items:[item]},contract,parameters).passed,true);
 assert.equal(evaluateContract({items:[{...item,url:'https://other.example/'}]},contract,parameters).passed,false);
 assert.equal(evaluateContract({items:[{...item,text:null}]},contract,parameters).passed,false);
 assert.equal(evaluateContract({items:[item,item]},contract,parameters).passed,false);
});
test('cheaper failing workflows cannot beat a passing candidate',()=>{
 const result=chooseWinner([{id:'baseline',qualityPassed:true,costComplete:true,costPerUsableRowUsd:3},{id:'cheap-broken',qualityPassed:false,costComplete:true,costPerUsableRowUsd:0},{id:'replacement',qualityPassed:true,costComplete:true,costPerUsableRowUsd:2}]);assert.equal(result.winnerId,'replacement');
});
test('missing costs or no passing candidate prevent a cheapest recommendation',()=>{
 assert.equal(chooseWinner([{id:'a',qualityPassed:true,costComplete:false,costPerUsableRowUsd:null},{id:'b',qualityPassed:true,costComplete:true,costPerUsableRowUsd:1}]).status,'COST_INCOMPLETE');
 assert.equal(chooseWinner([{id:'a',qualityPassed:false,costComplete:true,costPerUsableRowUsd:0}]).winnerId,null);
});
test('built-in candidates compile under the same parameters and metered allocations',()=>{
 const suite=researchSuite({url:'https://apify.com/actors'});assert.equal(suite.candidates.length,3);
 const plans=suite.candidates.map(c=>compileGraph(c.graph,suite.reviewedActorIds,2));
 assert.equal(plans.reduce((sum,p)=>sum+p.limits.ppeCapSumUsd,0),2);
 assert.deepEqual(plans.map(p=>p.limits.actorStarts),[2,1,1]);assert.ok(plans.every(p=>p.limits.modelCalls===0));
});
test('report graph labels and embedded data do not execute untrusted markup',()=>{
 const title='</script><img src=x onerror=alert(1)>';
 const html=renderReport({title,goal:'Compare public workflows',status:'PLANNED',workflows:[{id:'a',label:title,status:'PLANNED',nodes:[{id:'n',label:title,kind:'actor',dependsOn:[]}]}]});
 assert.equal(html.includes('<img src=x onerror=alert(1)>'),false);
 const data=html.match(/<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/)![1]!;
 assert.equal(JSON.parse(data).title,title);
 assert.ok(workflowSvg({id:'x',label:'Workflow',status:'PLANNED',nodes:[]}).includes('role="img"'));
});
