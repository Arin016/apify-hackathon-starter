import 'dotenv/config';
import {Actor} from 'apify';
import {runCampaign,campaignReport} from './campaign.js';
await Actor.init();
try{await runCampaign(await Actor.getInput());await Actor.exit();}catch(error){const token=process.env.APIFY_TOKEN??'';const message=String(error instanceof Error?error.message:error).replaceAll(token||'__NO_TOKEN__','[redacted]').slice(0,1500);const prior=await Actor.getValue<Record<string,any>>('OUTPUT')??{};const output={...prior,status:'FAILED',error:message,message,campaign:null};await Actor.setValue('OUTPUT',output);await Actor.setValue('REPORT.html',campaignReport(output),{contentType:'text/html'});await Actor.fail(message);}
