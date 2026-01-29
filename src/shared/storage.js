// ===============================
// Base helpers
// ===============================
export function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

export function storageSet(obj) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(obj, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(err);
      else resolve(true);
    });
  });
}

// ===============================
// Field mappings (per-domain)
// mappingsByDomain = {
//   "example.com": { email: { selector, kind, meta }, ... }
// }
// ===============================
export async function getMappingsByDomain() {
  const res = await storageGet(["mappingsByDomain"]);
  return res.mappingsByDomain || {};
}

export async function getDomainMappings(hostname) {
  const host = String(hostname || "").trim();
  if (!host) return {};
  const all = await getMappingsByDomain();
  return all[host] || {};
}

export async function saveDomainMapping(hostname, fieldKey, mapping) {
  const host = String(hostname || "").trim();
  const key = String(fieldKey || "").trim();
  if (!host) throw new Error("saveDomainMapping: hostname is required");
  if (!key) throw new Error("saveDomainMapping: fieldKey is required");

  const all = await getMappingsByDomain();
  const next = { ...all };

  next[host] = {
    ...(next[host] || {}),
    [key]: mapping
  };

  await storageSet({ mappingsByDomain: next });
  return next[host];
}

export async function deleteDomainMapping(hostname, fieldKey) {
  const host = String(hostname || "").trim();
  const key = String(fieldKey || "").trim();
  if (!host) return {};

  const all = await getMappingsByDomain();
  const current = all[host] || {};
  const nextDomain = { ...current };
  if (key) delete nextDomain[key];

  const nextAll = { ...all, [host]: nextDomain };
  await storageSet({ mappingsByDomain: nextAll });

  return nextDomain;
}

export async function clearDomainMappings(hostname) {
  const host = String(hostname || "").trim();
  if (!host) return;

  const all = await getMappingsByDomain();
  const nextAll = { ...all };
  delete nextAll[host];

  await storageSet({ mappingsByDomain: nextAll });
}

// ===============================
// Dynamic Q/A Rules (per-domain)
// customRulesByDomain = {
//   "example.com": [
//     { id, matchText, source: "literal"|"pref", prefKey?, value? }
//   ]
// }
// ===============================
export async function getCustomRulesByDomain() {
  const res = await storageGet(["customRulesByDomain"]);
  return res.customRulesByDomain || {};
}

export async function getDomainCustomRules(hostname) {
  const host = String(hostname || "").trim();
  if (!host) return [];

  const all = await getCustomRulesByDomain();
  const list = all[host] || [];
  return Array.isArray(list) ? list : [];
}

export async function saveDomainCustomRule(hostname, rule) {
  const host = String(hostname || "").trim();
  if (!host) throw new Error("saveDomainCustomRule: hostname is required");
  if (!rule || !rule.id) throw new Error("saveDomainCustomRule: rule.id is required");

  const all = await getCustomRulesByDomain();
  const nextAll = { ...all };
  const list = Array.isArray(nextAll[host]) ? [...nextAll[host]] : [];

  // Upsert by id
  const idx = list.findIndex((x) => x && x.id === rule.id);
  if (idx >= 0) list[idx] = rule;
  else list.push(rule);

  nextAll[host] = list;
  await storageSet({ customRulesByDomain: nextAll });
  return list;
}

export async function deleteDomainCustomRule(hostname, ruleId) {
  const host = String(hostname || "").trim();
  const id = String(ruleId || "").trim();
  if (!host || !id) return [];

  const all = await getCustomRulesByDomain();
  const nextAll = { ...all };
  const list = Array.isArray(nextAll[host]) ? [...nextAll[host]] : [];

  nextAll[host] = list.filter((x) => x && x.id !== id);
  await storageSet({ customRulesByDomain: nextAll });
  return nextAll[host];
}

export async function clearDomainCustomRules(hostname) {
  const host = String(hostname || "").trim();
  if (!host) return;

  const all = await getCustomRulesByDomain();
  const nextAll = { ...all };
  delete nextAll[host];

  await storageSet({ customRulesByDomain: nextAll });
}

// ===============================
// ✅ Global rules (apply to ANY domain)
// globalCustomRules = [rule, ...]
// ===============================
export async function getGlobalCustomRules() {
  const res = await storageGet(["globalCustomRules"]);
  return Array.isArray(res.globalCustomRules) ? res.globalCustomRules : [];
}

export async function saveGlobalCustomRule(rule) {
  if (!rule || !rule.id) throw new Error("saveGlobalCustomRule: rule.id is required");

  const list = await getGlobalCustomRules();
  const next = [...list];

  const idx = next.findIndex((x) => x && x.id === rule.id);
  if (idx >= 0) next[idx] = rule;
  else next.push(rule);

  await storageSet({ globalCustomRules: next });
  return next;
}

export async function deleteGlobalCustomRule(ruleId) {
  const id = String(ruleId || "").trim();
  if (!id) return await getGlobalCustomRules();

  const list = await getGlobalCustomRules();
  const next = list.filter((x) => x && x.id !== id);

  await storageSet({ globalCustomRules: next });
  return next;
}

export async function clearGlobalCustomRules() {
  await storageSet({ globalCustomRules: [] });
}