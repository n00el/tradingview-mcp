/**
 * Core indicator settings logic.
 */
import { evaluate, safeString } from '../connection.js';
import { resolve as resolveName } from './indicator_catalog.js';

const CHART_API = 'window.TradingViewApi._activeChartWidgetWV.value()';

// Internal study inputs that aren't user-facing (Pine plumbing).
const INTERNAL_INPUT_IDS = new Set(['text', 'pineId', 'pineVersion']);

/**
 * Read a study's user-facing input schema: each input's id, human name, type,
 * current value, default, and options (for dropdowns). Filters internal Pine
 * plumbing inputs. Use this before set_inputs to know what you can change.
 */
export async function getInputs({ entity_id }) {
  if (!entity_id) throw new Error('entity_id is required. Use chart_get_state to find study IDs.');
  const result = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var study = chart.getStudyById(${safeString(entity_id)});
      if (!study) return { error: 'Study not found: ' + ${safeString(entity_id)} };
      // Current values come from the API study object (reliable id + value).
      var values = [];
      try { values = study.getInputValues() || []; } catch (e) {}
      // Names / types / options come from the model data source's metaInfo.
      var meta = {};
      var name = null;
      try {
        var ds = chart._chartWidget.model().model().dataSources().filter(function(d){
          return d.id && typeof d.id === 'function' && d.id() === ${safeString(entity_id)};
        })[0];
        if (ds && ds.metaInfo) {
          var mi = ds.metaInfo();
          name = mi.shortDescription || mi.description || null;
          (mi.inputs || []).forEach(function(i){ meta[i.id] = { name: i.name, type: i.type, options: i.options || null, defval: i.defval }; });
        }
      } catch (e) {}
      var inputs = values.map(function(v){
        var m = meta[v.id] || {};
        return { id: v.id, name: m.name || v.id, type: m.type || null, value: v.value, defval: m.defval, options: m.options || null };
      });
      return { name: name, inputs: inputs };
    })()
  `);
  if (result && result.error) throw new Error(result.error);
  const internalHidden = (result.inputs || []).filter(i => INTERNAL_INPUT_IDS.has(i.id) || i.type === 'text');
  const visible = (result.inputs || []).filter(i => !INTERNAL_INPUT_IDS.has(i.id) && i.type !== 'text');
  return {
    success: true,
    entity_id,
    indicator: result.name,
    inputs: visible,
    hidden_count: internalHidden.length,
  };
}

/**
 * Set inputs by their human-readable name (case-insensitive), e.g.
 * { "Length": 50, "Source": "close" }. Resolves names → input ids via the
 * study's metaInfo, then delegates to setInputs.
 */
export async function setInputsByName({ entity_id, inputs: named }) {
  if (!entity_id) throw new Error('entity_id is required.');
  const obj = typeof named === 'string' ? JSON.parse(named) : named;
  if (!obj || typeof obj !== 'object' || !Object.keys(obj).length) {
    throw new Error('inputs must be a non-empty object, e.g. { "Length": 50 }');
  }
  const schema = await getInputs({ entity_id });
  const byName = new Map(schema.inputs.map(i => [String(i.name).toLowerCase(), i.id]));
  const byId = new Map(schema.inputs.map(i => [i.id, true]));
  const mapped = {};
  const unresolved = [];
  for (const [k, v] of Object.entries(obj)) {
    const id = byId.has(k) ? k : byName.get(String(k).toLowerCase());
    if (id) mapped[id] = v;
    else unresolved.push(k);
  }
  if (!Object.keys(mapped).length) {
    throw new Error(`No inputs matched. Available: ${schema.inputs.map(i => i.name).join(', ')}`);
  }
  const res = await setInputs({ entity_id, inputs: mapped });
  return { ...res, unresolved: unresolved.length ? unresolved : undefined, available: unresolved.length ? schema.inputs.map(i => i.name) : undefined };
}

/**
 * Add a built-in indicator by friendly name (resolves aliases like "RSI" →
 * "Relative Strength Index"). Verifies a study was actually created.
 */
export async function addIndicator({ query, inputs: inputsRaw }) {
  const resolved = resolveName(query);
  const studyName = resolved ? resolved.name : query;
  const inputs = inputsRaw ? (typeof inputsRaw === 'string' ? JSON.parse(inputsRaw) : inputsRaw) : null;
  const inputArr = inputs ? Object.entries(inputs).map(([k, v]) => ({ id: k, value: v })) : [];

  const before = await evaluate(`${CHART_API}.getAllStudies().map(function(s){ return s.id; })`);
  await evaluate(`
    (function() {
      ${CHART_API}.createStudy(${safeString(studyName)}, false, false, ${JSON.stringify(inputArr)});
    })()
  `);
  await new Promise(r => setTimeout(r, 1500));
  const after = await evaluate(`${CHART_API}.getAllStudies().map(function(s){ return s.id; })`);
  const newIds = (after || []).filter(id => !(before || []).includes(id));

  if (!newIds.length) {
    return {
      success: false,
      query,
      resolved_name: studyName,
      matched: resolved ? resolved.matched : 'none',
      error: `No study created for "${studyName}". The exact TradingView name may differ — try indicator_search to find it.`,
    };
  }
  return { success: true, query, resolved_name: studyName, matched: resolved ? resolved.matched : 'literal', entity_id: newIds[0], new_study_count: newIds.length };
}

export async function setInputs({ entity_id, inputs: inputsRaw }) {
  const inputs = inputsRaw ? (typeof inputsRaw === 'string' ? JSON.parse(inputsRaw) : inputsRaw) : undefined;
  if (!entity_id) throw new Error('entity_id is required. Use chart_get_state to find study IDs.');
  if (!inputs || typeof inputs !== 'object' || Object.keys(inputs).length === 0) {
    throw new Error('inputs must be a non-empty object, e.g. { length: 50 }');
  }

  const inputsJson = JSON.stringify(inputs);

  const result = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var study = chart.getStudyById(${safeString(entity_id)});
      if (!study) return { error: 'Study not found: ' + ${safeString(entity_id)} };
      var currentInputs = study.getInputValues();
      var overrides = ${inputsJson};
      var updatedKeys = {};
      for (var i = 0; i < currentInputs.length; i++) {
        if (overrides.hasOwnProperty(currentInputs[i].id)) {
          currentInputs[i].value = overrides[currentInputs[i].id];
          updatedKeys[currentInputs[i].id] = overrides[currentInputs[i].id];
        }
      }
      study.setInputValues(currentInputs);
      return { updated_inputs: updatedKeys };
    })()
  `);

  if (result && result.error) throw new Error(result.error);
  return { success: true, entity_id, updated_inputs: result.updated_inputs };
}

export async function toggleVisibility({ entity_id, visible }) {
  if (!entity_id) throw new Error('entity_id is required. Use chart_get_state to find study IDs.');
  if (typeof visible !== 'boolean') throw new Error('visible must be a boolean (true or false)');

  const result = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var study = chart.getStudyById(${safeString(entity_id)});
      if (!study) return { error: 'Study not found: ' + ${safeString(entity_id)} };
      study.setVisible(${visible});
      var actualVisible = study.isVisible();
      return { visible: actualVisible };
    })()
  `);

  if (result && result.error) throw new Error(result.error);
  return { success: true, entity_id, visible: result.visible };
}
