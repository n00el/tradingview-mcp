import * as f from '../src/core/financials.js';
import * as s from '../src/core/screener.js';
import { disconnect } from '../src/connection.js';
const log=(t,o)=>console.log(t,JSON.stringify(o));
log('analysts AAPL ->', await f.analysts({symbol:'NASDAQ:AAPL'}));
const p=await s.peers({symbol:'NASDAQ:AAPL',limit:5});
log('peers AAPL ->', {ok:p.success,sector:p.sector,industry:p.industry,peers:p.peers?.map(x=>x.name+' $'+(x.market_cap_basic/1e9).toFixed(0)+'B')});
await disconnect();
