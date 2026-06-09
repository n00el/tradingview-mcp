import * as ins from '../src/core/insights.js';
import { disconnect } from '../src/connection.js';
console.log('key_stats AAPL ->', JSON.stringify(await ins.keyStats({symbol:'NASDAQ:AAPL'})));
await disconnect();
