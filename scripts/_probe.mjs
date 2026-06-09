import { evaluate, disconnect } from '../src/connection.js';
async function scan(cols,ticker='NASDAQ:AAPL',market='america'){
  const body={symbols:{tickers:[ticker]},columns:cols};
  const expr=`(async function(){try{var r=await fetch('https://scanner.tradingview.com/${market}/scan',{method:'POST',credentials:'include',headers:{'Content-Type':'text/plain'},body:${JSON.stringify(JSON.stringify(body))}});var j=await r.json();return (j.data&&j.data[0]&&j.data[0].d)||j.errmsg||'empty'}catch(e){return String(e)}})()`;
  return evaluate(expr,{awaitPromise:true});
}
// extra key stats
const cols=['beta_1_year','short_interest_percent','float_shares_percent_current','average_volume_10d_calc','price_52_week_high','price_52_week_low','High.All','VWAP','relative_volume_10d_calc'];
const a=await scan(cols);
console.log('KEY STATS:'); cols.forEach((c,i)=>console.log('  '+c,'=',a[i]));
// crypto market screener
const c=await scan(['name','close','change','market_cap_calc'],'BINANCE:BTCUSDT','crypto');
console.log('CRYPTO scan BTC:', JSON.stringify(c));
await disconnect();
