import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/templates.js';

const wrap = (fn) => async (args) => {
  try { return jsonResult(await fn(args || {})); }
  catch (err) { return jsonResult({ success: false, error: err.message }, true); }
};

export function registerTemplateTools(server) {
  server.tool(
    'template_list',
    'List bundled Pine Script indicator templates (VWAP bands, supertrend, EMA ribbon, RSI bands, ATR trailing stop, Donchian breakout, Bollinger %B) with their tunable params.',
    {},
    wrap(async () => core.listTemplates()),
  );

  server.tool(
    'template_apply',
    'Render a bundled Pine template with the given params and apply it to the chart in one call (validates, injects, compiles, adds).',
    {
      name: z.string().describe('Template name from template_list, e.g. "vwap_bands", "supertrend"'),
      params: z.string().optional().describe('Optional JSON of param overrides, e.g. \'{"mult": 2.5}\''),
    },
    wrap(({ name, params }) => core.applyTemplate({ name, params: params ? JSON.parse(params) : {} })),
  );
}
