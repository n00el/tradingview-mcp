import { evaluate, disconnect } from '../src/connection.js';
async function tv(url,{method='GET',body=null,creds='include',ct='application/json'}={}){
  const b = body==null?'null':JSON.stringify(typeof body==='string'?body:JSON.stringify(body));
  const expr=`(async function(){try{
    var o={method:${JSON.stringify(method)},credentials:${JSON.stringify(creds)},headers:{'Accept':'application/json'}};
    var b=${b}; if(b!==null){o.headers['Content-Type']=${JSON.stringify(ct)};o.body=b;}
    var r=await fetch(${JSON.stringify(url)},o); var t=await r.text(); var d; try{d=JSON.parse(t)}catch(e){d=t.slice(0,120)}
    return {status:r.status,data:d};
  }catch(e){return {err:String(e)}}})()`;
  return evaluate(expr,{awaitPromise:true});
}
const r={};
// A) Technicals gauge via scanner
r.technicals = await tv('https://scanner.tradingview.com/america/scan',{method:'POST',ct:'text/plain',body:{symbols:{tickers:['NASDAQ:AAPL']},columns:['Recommend.All','Recommend.MA','Recommend.Other','RSI','Mom','ADX','Stoch.K']}});
// B) Symbol profile columns
r.profile = await tv('https://scanner.tradingview.com/america/scan',{method:'POST',ct:'text/plain',body:{symbols:{tickers:['NASDAQ:AAPL']},columns:['description','country','sector','industry','number_of_employees','web_site_url','number_of_shareholders','float_shares_outstanding']}});
// C) symbol-search
r.search = await tv('https://symbol-search.tradingview.com/symbol_search/?text=apple&hl=1&lang=en&type=&domain=production',{creds:'omit'});
// D) financials endpoint guess
r.financials = await tv('https://www.tradingview.com/api/v1/symbols/NASDAQ:AAPL/financials/',{});
// E) minds (social)
r.minds = await tv('https://www.tradingview.com/api/v1/minds/?symbol=NASDAQ:AAPL&limit=3',{});
// F) ideas
r.ideas = await tv('https://www.tradingview.com/api/v1/ideas/?symbol=NASDAQ:AAPL&limit=3',{});
for(const [k,v] of Object.entries(r)){ console.log('### '+k+' status='+(v.status||v.err)); console.log(JSON.stringify(v.data).slice(0,260)); console.log(''); }
await disconnect();
