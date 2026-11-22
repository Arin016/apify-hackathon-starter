import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {Actor} from 'apify';
import {runGraph,type FrozenGraph} from './graph-runtime.js';
await Actor.init();
try {
 const raw=await Actor.getInput<Record<string,unknown>>()??{};
 let frozen:FrozenGraph|undefined;
 try{frozen=JSON.parse(await readFile(new URL('../compiled.graph.json',import.meta.url),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 if(!await Actor.getValue('DEPLOYMENT'))await Actor.setValue('DEPLOYMENT',{status:'NOT_DEPLOYED',message:'Download the generated project and run the deployment helper.'});
 await runGraph({...raw,goal:frozen?.definition.goal??raw.goal,mode:raw.mode??(frozen?'execute':'plan')},frozen);
 await Actor.exit();
}catch(e){await Actor.fail(e instanceof Error?e.message:String(e));}
