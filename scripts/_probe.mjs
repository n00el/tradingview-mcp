import { evaluate, disconnect } from '../src/connection.js';
async function scan(cols){
  const body={symbols:{tickers:['NASDAQ:AAPL']},columns:cols};
  const expr=`(async function(){var r=await fetch('https://scanner.tradingview.com/america/scan',{method:'POST',credentials:'include',headers:{'Content-Type':'text/plain'},body:${JSON.stringify(JSON.stringify(body))}});var j=await r.json();return (j.data&&j.data[0]&&j.data[0].d)||null;})()`;
  return evaluate(expr,{awaitPromise:true});
}
const annual=['total_revenue_fy_h','net_income_fy_h','gross_profit_fy_h','oper_income_fy_h','ebitda_fy_h','free_cash_flow_fy_h','total_assets_fy_h','total_debt_fy_h','total_equity_fy_h','earnings_per_share_diluted_fy_h'];
const a=await scan(annual);
console.log('ANNUAL field -> length/first:');
annual.forEach((c,i)=>console.log('  '+c+' :', Array.isArray(a[i])?('len '+a[i].length+' first '+a[i][0]):a[i]));
const q=['total_revenue_fq_h','net_income_fq_h','earnings_per_share_diluted_fq_h'];
const b=await scan(q);
console.log('QUARTERLY field -> length/first:');
q.forEach((c,i)=>console.log('  '+c+' :', Array.isArray(b[i])?('len '+b[i].length+' first '+b[i][0]):b[i]));
await disconnect();
