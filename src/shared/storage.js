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

/**
 * Field mappings (per-domain)
 * mappingsByDomain = {
 *   "example.com": { email: { selector, kind, meta }, ... }
 * }
 */
export async function getMappingsByDomain() {
  const res = await storageGet(["mappingsByDomain"]);
  return res.mappingsByDomain || {};
}

export async function getDomainMappings(hostname) {
  const all = await getMappingsByDomain();
  return all[hostname] || {};
}

export async function saveDomainMapping(hostname, fieldKey, mapping) {
  const all = await getMappingsByDomain();
  const next = { ...all };

  next[hostname] = {
    ...(next[hostname] || {}),
    [fieldKey]: mapping
  };

  await storageSet({ mappingsByDomain: next });
  return next[hostname];
}

export async function deleteDomainMapping(hostname, fieldKey) {
  const all = await getMappingsByDomain();
  const current = all[hostname] || {};
  const nextDomain = { ...current };
  delete nextDomain[fieldKey];

  const nextAll = { ...all };
  nextAll[hostname] = nextDomain;

  await storageSet({ mappingsByDomain: nextAll });
  return nextDomain;
}

export async function clearDomainMappings(hostname) {
  const all = await getMappingsByDomain();
  const nextAll = { ...all };
  delete nextAll[hostname];
  await storageSet({ mappingsByDomain: nextAll });
}

/**
 * Dynamic Q/A Rules (per-domain)
 *
 * customRulesByDomain = {
 *   "example.com": [
 *     {
 *       id: "r_abc123",
 *       matchText: "sexual orientation",
 *       source: "literal" | "pref",
 *       prefKey?: "sexualOrientation",
 *       value?: "Heterosexual / Straight"
 *     }
 *   ]
 * }
 */
export async function getCustomRulesByDomain() {
  const res = await storageGet(["customRulesByDomain"]);
  return res.customRulesByDomain || {};
}

export async function getDomainCustomRules(hostname) {
  const all = await getCustomRulesByDomain();
  return all[hostname] || [];
}

export async function saveDomainCustomRule(hostname, rule) {
  const all = await getCustomRulesByDomain();
  const nextAll = { ...all };
  const list = Array.isArray(nextAll[hostname]) ? [...nextAll[hostname]] : [];

  // Upsert by id
  const idx = list.findIndex((x) => x.id === rule.id);
  if (idx >= 0) list[idx] = rule;
  else list.push(rule);

  nextAll[hostname] = list;
  await storageSet({ customRulesByDomain: nextAll });
  return list;
}

export async function deleteDomainCustomRule(hostname, ruleId) {
  const all = await getCustomRulesByDomain();
  const nextAll = { ...all };
  const list = Array.isArray(nextAll[hostname]) ? [...nextAll[hostname]] : [];
  nextAll[hostname] = list.filter((x) => x.id !== ruleId);
  await storageSet({ customRulesByDomain: nextAll });
  return nextAll[hostname];
}

export async function clearDomainCustomRules(hostname) {
  const all = await getCustomRulesByDomain();
  const nextAll = { ...all };
  delete nextAll[hostname];
  await storageSet({ customRulesByDomain: nextAll });
}
