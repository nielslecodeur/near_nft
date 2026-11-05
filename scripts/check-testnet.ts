import {readFile,writeFile,mkdir} from "node:fs/promises";
import {SandboxAccount} from "./harness.js";
import {TESTNET} from "../packages/shared/network.js";
import {verifyPair,type Snapshot} from "../packages/shared/index.js";
const endpoint=process.env.NEAR_TESTNET_RPC||TESTNET.rpc,{deployment:d}=JSON.parse(await readFile("public/testnet.json","utf8")),reader=new SandboxAccount(d.parent,endpoint),status=await reader.rpc("status",[]);
if(status.chain_id!=="testnet"||status.protocol_version<88)throw new Error("TESTNET_PROTOCOL_88_REQUIRED");
const b=await reader.rpc("block",{finality:"final"}),contracts=[];
for(const [id,hash]of Object.entries(d.code_hashes)){const a=reader.getAccount(id),state=await a.accountView(),keys=await a.viewAccessKeys(id);if(state.code_hash!==hash||keys.keys.length)throw new Error("DEPLOYMENT_MISMATCH "+id);contracts.push({account:id,code_hash:state.code_hash,keyless:true});}
const series=await reader.getAccount(d.collection).view<any>("series",{},b.header.hash);
if(series.series.mandate_hash!==d.mandate_hash||series.series.terms.asset!==d.asset||series.series.terms.strategy!==d.strategy)throw new Error("SERIES_MISMATCH");
const owner=process.argv[2],positions=[];
let wallet=null;
if(owner){if(!owner.endsWith(".testnet"))throw new Error("TESTNET_ACCOUNT_REQUIRED");const a=await reader.getAccount(owner).accountView(),token=await reader.getAccount(d.asset).view<string>("ft_balance_of",{account_id:owner},b.header.hash);wallet={account:owner,near:a.amount,demoUSD:token,storage_usage:a.storage_usage};const tokens=await reader.getAccount(d.collection).view<any[]>("nft_tokens_for_owner",{account_id:owner,limit:100},b.header.hash);for(const t of tokens){const s=await reader.getAccount(t.token_id).view<Snapshot>("snapshot",{},b.header.hash);verifyPair(d.collection,t.token_id,s,t,true);positions.push({account:s.account_id,owner:s.owner_id,funded:s.funded,available:s.available,principal:s.principal,status:s.status});}}
const report={checked_at:new Date().toISOString(),endpoint,chain_id:status.chain_id,protocol_version:status.protocol_version,block:b.header.hash,contracts,series,wallet,positions};
await mkdir("docs/results",{recursive:true});await writeFile("docs/results/testnet-capability.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
