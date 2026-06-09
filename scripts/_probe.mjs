import { evaluate, disconnect } from '../src/connection.js';
async function scan(cols,ticker='NASDAQ:AAPL'){
  const body={symbols:{tickers:[ticker]},columns:cols};
  const expr=`(async function(){var r=await fetch('https://scanner.tradingview.com/america/scan',{method:'POST',credentials:'include',headers:{'Content-Type':'text/plain'},body:${JSON.stringify(JSON.stringify(body))}});var j=await r.json();return (j.data&&j.data[0]&&j.data[0].d)||null;})()`;
  return evaluate(expr,{awaitPromise:true});
}
const cols=['close','recommendation_strong_buy','recommendation_buy','recommendation_hold','recommendation_sell','recommendation_strong_sell','sector','industry'];
const a=await scan(cols);
cols.forEach((c,i)=>console.log(c,'=',a[i]));
await disconnect();
