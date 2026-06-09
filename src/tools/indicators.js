import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/indicators.js';
import { search as catalogSearch } from '../core/indicator_catalog.js';

const wrap = (fn) => async (args) => {
  try { return jsonResult(await fn(args || {})); }
  catch (err) { return jsonResult({ success: false, error: err.message }, true); }
};

export function registerIndicatorTools(server) {
  server.tool(
    'indicator_search',
    'Search known built-in indicators by name or alias (e.g. "rsi", "ema", "bollinger"). Returns the exact TradingView name to use with indicator_add.',
    { query: z.string().optional().describe('Search term; omit to list common indicators') },
    wrap(async ({ query }) => ({ success: true, results: catalogSearch(query || '') })),
  );

  server.tool(
    'indicator_add',
    'Add a built-in indicator by friendly name — resolves aliases (RSI → Relative Strength Index, EMA → Moving Average Exponential, etc.) and verifies it was created. Returns the new entity_id.',
    {
      name: z.string().describe('Indicator name or alias, e.g. "RSI", "EMA", "Bollinger Bands"'),
      inputs: z.string().optional().describe('Optional JSON of input overrides by input id, e.g. \'{"in_0": 50}\''),
    },
    wrap(({ name, inputs }) => core.addIndicator({ query: name, inputs })),
  );

  server.tool(
    'indicator_get_inputs',
    'Read a study\'s editable inputs: human name, type, current value, default, and dropdown options. Call before changing settings.',
    { entity_id: z.string().describe('Entity ID of the study (from chart_get_state)') },
    wrap(core.getInputs),
  );

  server.tool(
    'indicator_set_inputs',
    'Change study input values by INPUT ID (e.g. \'{"in_0": 50}\'). Prefer indicator_set_inputs_by_name for readability.',
    {
      entity_id: z.string().describe('Entity ID of the study (from chart_get_state)'),
      inputs: z.string().describe('JSON of input overrides keyed by input id, e.g. \'{"in_0": 50, "in_1": "close"}\''),
    },
    wrap(core.setInputs),
  );

  server.tool(
    'indicator_set_inputs_by_name',
    'Change study input values by their human name (case-insensitive), e.g. \'{"Length": 50, "Source": "close"}\'. Resolves names → input ids automatically.',
    {
      entity_id: z.string().describe('Entity ID of the study (from chart_get_state)'),
      inputs: z.string().describe('JSON of overrides keyed by display name, e.g. \'{"Length": 50}\''),
    },
    wrap(core.setInputsByName),
  );

  server.tool(
    'indicator_toggle_visibility',
    'Show or hide an indicator/study on the chart',
    {
      entity_id: z.string().describe('Entity ID of the study (from chart_get_state)'),
      visible: z.coerce.boolean().describe('true to show, false to hide'),
    },
    wrap(core.toggleVisibility),
  );
}
