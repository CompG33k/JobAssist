const JAH = {
  mapperActive: false,
  mapperHandler: null,
  lastHighlightCleanup: null,
  lastMapperCleanup: null
};

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normKey(s) {
  return norm(s).replace(/[^a-z0-9]+/g, " ");
}

function isVisible(el) {
  const r = el.getBoundingClientRect();
  if (r.width <= 2 || r.height <= 2) return false;
  const st = window.getComputedStyle(el);
  if (st.visibility === "hidden" || st.display === "none") return false;
  return true;
}

function getLabelTextFor(el) {
  const id = el.getAttribute("id");
  if (id) {
    const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (l) return l.innerText || l.textContent || "";
  }

  const parentLabel = el.closest("label");
  if (parentLabel) return parentLabel.innerText || parentLabel.textContent || "";

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  const ariaLabelledBy = el.getAttribute("aria-labelledby");
  if (ariaLabelledBy) {
    const ids = ariaLabelledBy.split(/\s+/).filter(Boolean);
    const parts = ids
      .map((x) => document.getElementById(x))
      .filter(Boolean)
      .map((n) => n.innerText || n.textContent || "");
    if (parts.length) return parts.join(" ").trim();
  }

  const ph = el.getAttribute("placeholder");
  if (ph) return ph;

  return "";
}

function getFieldHints(el) {
  const pieces = [
    getLabelTextFor(el),
    el.getAttribute("name"),
    el.getAttribute("id"),
    el.getAttribute("placeholder"),
    el.getAttribute("autocomplete"),
    el.getAttribute("aria-label"),
    el.getAttribute("data-qa"),
    el.getAttribute("data-testid")
  ]
    .filter(Boolean)
    .map((x) => normKey(x));

  return normKey(pieces.join(" "));
}

function setNativeValue(el, value) {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function selectOptionByBestMatch(selectEl, desired) {
  const desiredNorm = normKey(desired);
  const options = Array.from(selectEl.options || []);
  if (!options.length) return false;

  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const txt = normKey(opt.textContent || opt.label || opt.value || "");
    if (!txt) continue;

    let score = 0;
    if (txt === desiredNorm) score += 1000;
    if (txt.includes(desiredNorm) || desiredNorm.includes(txt)) score += 200;

    const a = new Set(txt.split(" ").filter(Boolean));
    const b = new Set(desiredNorm.split(" ").filter(Boolean));
    let overlap = 0;
    for (const w of a) if (b.has(w)) overlap++;
    score += overlap * 25;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0 && bestScore > 0) {
    // keep the original synchronous setter for backwards compatibility
    selectEl.selectedIndex = bestIdx;
    selectEl.dispatchEvent(new Event("input", { bubbles: true }));
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}

function selectOptionIndexByBestMatch(selectEl, desired) {
  const desiredNorm = normKey(desired);
  const options = Array.from(selectEl.options || []);
  if (!options.length) return -1;

  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const txt = normKey(opt.textContent || opt.label || opt.value || "");
    if (!txt) continue;

    let score = 0;
    if (txt === desiredNorm) score += 1000;
    if (txt.includes(desiredNorm) || desiredNorm.includes(txt)) score += 200;

    const a = new Set(txt.split(" ").filter(Boolean));
    const b = new Set(desiredNorm.split(" ").filter(Boolean));
    let overlap = 0;
    for (const w of a) if (b.has(w)) overlap++;
    score += overlap * 25;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0 && bestScore > 0) return bestIdx;
  return -1;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanSelectOption(selectEl, desired) {
  // Try to find best matching option index
  const idx = selectOptionIndexByBestMatch(selectEl, desired);
  if (idx < 0) return false;

  try {
    // Focus and simulate user opening the select
    selectEl.focus();
    selectEl.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    selectEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    selectEl.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    selectEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // Wait a human-like delay for dropdown to open
    await sleep(rand(300, 900));

    // Set the selection (native <select> options are not clickable in DOM in many browsers,
    // so set selectedIndex and emit events, but after a pause to mimic a human choosing)
    selectEl.selectedIndex = idx;
    // small delay to mimic user deliberation
    await sleep(rand(200, 600));
    selectEl.dispatchEvent(new Event("input", { bubbles: true }));
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));

    // Wait for any page JS to react
    await sleep(rand(200, 700));

    return true;
  } catch (e) {
    return false;
  }
}

function highlightEls(elements, color) {
  const cleanupFns = [];

  for (const el of elements) {
    if (!el || !el.style) continue;
    const prevOutline = el.style.outline;
    const prevOutlineOffset = el.style.outlineOffset;

    el.style.outline = `2px solid ${color}`;
    el.style.outlineOffset = "2px";

    cleanupFns.push(() => {
      el.style.outline = prevOutline;
      el.style.outlineOffset = prevOutlineOffset;
    });
  }

  return () => cleanupFns.forEach((fn) => fn());
}

/** Mapper selector generation */
function cssEscapeValue(v) {
  return String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function uniqueSelectorFor(el) {
  if (!el || el.nodeType !== 1) return "";

  const id = el.getAttribute("id");
  if (id) return `#${CSS.escape(id)}`;

  const tag = el.tagName.toLowerCase();

  const name = el.getAttribute("name");
  if (name) {
    const sel = `${tag}[name="${cssEscapeValue(name)}"]`;
    const matches = document.querySelectorAll(sel);
    if (matches.length === 1) return sel;
  }

  const aria = el.getAttribute("aria-label");
  if (aria) {
    const sel = `${tag}[aria-label="${cssEscapeValue(aria)}"]`;
    const matches = document.querySelectorAll(sel);
    if (matches.length === 1) return sel;
  }

  const parts = [];
  let node = el;

  while (node && node.nodeType === 1 && parts.length < 6) {
    const t = node.tagName.toLowerCase();

    const nid = node.getAttribute("id");
    if (nid) {
      parts.unshift(`#${CSS.escape(nid)}`);
      break;
    }

    const parent = node.parentElement;
    if (!parent) {
      parts.unshift(t);
      break;
    }

    const siblingsSameTag = Array.from(parent.children).filter(
      (c) => c.tagName.toLowerCase() === t
    );
    if (siblingsSameTag.length === 1) {
      parts.unshift(t);
    } else {
      const idx = siblingsSameTag.indexOf(node) + 1;
      parts.unshift(`${t}:nth-of-type(${idx})`);
    }

    node = parent;
  }

  return parts.join(" > ");
}

function isFillableTarget(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input") {
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (type === "hidden" || type === "file") return false;
    if (el.disabled || el.readOnly) return false;
    return true;
  }
  if (tag === "textarea") {
    if (el.disabled || el.readOnly) return false;
    return true;
  }
  if (tag === "select") {
    if (el.disabled) return false;
    return true;
  }
  if (el.getAttribute("contenteditable") === "true") return true;
  return false;
}

function startMapper() {
  if (JAH.mapperActive) return { ok: true, already: true };

  JAH.mapperActive = true;

  const banner = document.createElement("div");
  banner.setAttribute("data-jah-banner", "1");
  banner.style.position = "fixed";
  banner.style.left = "12px";
  banner.style.right = "12px";
  banner.style.bottom = "12px";
  banner.style.zIndex = "2147483647";
  banner.style.padding = "12px 14px";
  banner.style.borderRadius = "14px";
  banner.style.background = "rgba(17, 24, 39, 0.92)";
  banner.style.color = "#e5e7eb";
  banner.style.border = "1px solid rgba(229,231,235,0.18)";
  banner.style.fontFamily =
    "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  banner.style.fontSize = "13px";
  banner.style.backdropFilter = "blur(8px)";
  banner.textContent =
    "Job Application Helper: Mapper is ON. Click a form field to map it. (Esc to cancel)";
  document.documentElement.appendChild(banner);

  const cleanupBanner = () => {
    try {
      banner.remove();
    } catch {}
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      stopMapper();
      chrome.runtime.sendMessage({
        type: "JAH_MAPPER_CANCELLED",
        payload: { hostname: window.location.hostname }
      });
    }
  };

  const onClickCapture = (e) => {
  const target = e.target;
  if (!isFillableTarget(target)) return;

  const tag = (target.tagName || "").toLowerCase();

  // Allow native behavior for <select> elements so their dropdowns can open.
  // For non-selects, prevent default/page handlers so mapper clicks are clean.
  if (tag !== "select") {
    e.preventDefault();
    e.stopPropagation();
  }

  const selector = uniqueSelectorFor(target);
  const hints = getFieldHints(target);
  const label = getLabelTextFor(target);

  if (JAH.lastMapperCleanup) {
    try {
      JAH.lastMapperCleanup();
    } catch {}
  }
  JAH.lastMapperCleanup = highlightEls([target], "#60a5fa");

  const fieldInfo = {
    hostname: window.location.hostname,
    selector,
    tag: target.tagName.toLowerCase(),
    inputType: (target.getAttribute("type") || "").toLowerCase(),
    name: target.getAttribute("name") || "",
    id: target.getAttribute("id") || "",
    label: label || "",
    hints: hints || ""
  };

  chrome.runtime.sendMessage({
    type: "JAH_MAPPER_FIELD_SELECTED",
    payload: fieldInfo
  });
};
  
  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("keydown", onKeyDown, true);

  JAH.mapperHandler = { onClickCapture, onKeyDown, cleanupBanner };

  return { ok: true };
}

function stopMapper() {
  if (!JAH.mapperActive) return { ok: true, already: true };

  JAH.mapperActive = false;

  try {
    document.removeEventListener("click", JAH.mapperHandler?.onClickCapture, true);
    document.removeEventListener("keydown", JAH.mapperHandler?.onKeyDown, true);
  } catch {}

  try {
    JAH.mapperHandler?.cleanupBanner?.();
  } catch {}

  try {
    if (JAH.lastMapperCleanup) JAH.lastMapperCleanup();
  } catch {}

  JAH.mapperHandler = null;

  return { ok: true };
}

/** Radio helpers for dynamic rules */
function findRadioGroups() {
  const radios = Array.from(document.querySelectorAll('input[type="radio"]:not([disabled])'));
  const groups = new Map();

  for (const r of radios) {
    const name = r.getAttribute("name") || "";
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(r);
  }
  return groups;
}

function chooseRadioInGroup(radios, desired) {
  const desiredNorm = normKey(desired);
  let best = null;
  let bestScore = -1;

  for (const r of radios) {
    const label = getLabelTextFor(r);
    const txt = normKey(label || r.value || "");
    if (!txt) continue;

    let score = 0;
    if (txt === desiredNorm) score += 1000;
    if (txt.includes(desiredNorm) || desiredNorm.includes(txt)) score += 200;

    const a = new Set(txt.split(" ").filter(Boolean));
    const b = new Set(desiredNorm.split(" ").filter(Boolean));
    let overlap = 0;
    for (const w of a) if (b.has(w)) overlap++;
    score += overlap * 25;

    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  if (best && bestScore > 0) {
    try {
      best.click();
      best.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Value map including new EEO/H1B-like fields */
function buildValueMap(profile, prefs) {
  const p = profile || {};
  const pref = prefs || {};

  const fullName = (p.fullName || "").trim();
  const firstName = (p.firstName || "").trim() || fullName.split(" ")[0] || "";
  const lastName =
    (p.lastName || "").trim() ||
    (fullName.split(" ").slice(1).join(" ").trim() || "");

  return {
    firstName,
    lastName,
    fullName: fullName || `${firstName} ${lastName}`.trim(),
    email: (p.email || "").trim(),
    phone: (p.phone || "").trim(),
    address1: (p.address1 || "").trim(),
    address2: (p.address2 || "").trim(),
    city: (p.city || "").trim(),
    state: (p.state || "").trim(),
    zip: (p.zip || "").trim(),
    country: (p.country || "").trim(),
    linkedin: (p.linkedin || "").trim(),
    website: (p.website || "").trim(),
    github: (p.github || "").trim(),

    // Existing
    workAuth: pref.workAuth || "",
    needSponsorship: pref.needSponsorship || "",
    gender: pref.gender || "",
    veteran: pref.veteran || "",
    disability: pref.disability || "",
    raceEthnicity: pref.raceEthnicity || "",

    // New
    sex: pref.sex || "",
    sexualOrientation: pref.sexualOrientation || "",
    maritalStatus: pref.maritalStatus || "",
    hispanicLatino: pref.hispanicLatino || "",
    h1b: pref.h1b || ""
  };
}

/** Built-in heuristic classification expanded */
function classifyField(hints, el) {
  const h = hints;
  const ac = normKey(el.getAttribute("autocomplete") || "");
  if (ac.includes("given-name")) return "firstName";
  if (ac.includes("family-name")) return "lastName";
  if (ac.includes("name")) return "fullName";
  if (ac.includes("email")) return "email";
  if (ac.includes("tel")) return "phone";
  if (ac.includes("street-address")) return "address1";
  if (ac.includes("address-line1")) return "address1";
  if (ac.includes("address-line2")) return "address2";
  if (ac.includes("address-level2")) return "city";
  if (ac.includes("address-level1")) return "state";
  if (ac.includes("postal-code")) return "zip";
  if (ac.includes("country")) return "country";

  const has = (k) => h.includes(k);

  if (has("first name") || has("given name")) return "firstName";
  if (has("last name") || has("family name") || has("surname")) return "lastName";
  if (has("full name") || (has("name") && !has("company") && !has("school")))
    return "fullName";
  if (has("email")) return "email";
  if (has("phone") || has("mobile") || has("cell") || has("telephone"))
    return "phone";

  if (has("address line 1") || has("street address") || has("street"))
    return "address1";
  if (has("address line 2") || has("apt") || has("suite") || has("unit"))
    return "address2";
  if (has("city") || has("town")) return "city";
  if (has("state") || has("province") || has("region")) return "state";
  if (has("zip") || has("postal")) return "zip";
  if (has("country")) return "country";

  if (has("linkedin")) return "linkedin";
  if (has("portfolio") || (has("website") && !has("school"))) return "website";
  if (has("github")) return "github";

  // Work auth / visa / sponsorship / H1B
  if (has("authorized") && (has("work") || has("employment"))) return "workAuth";
  if (has("sponsor") || has("sponsorship") || has("visa")) return "needSponsorship";
  if (has("h1b") || has("h-1b") || has("h 1b")) return "h1b";

  // EEO-ish
  if (has("gender")) return "gender";

  // sexual orientation (avoid matching "sex" too early)
  if (has("sexual orientation") || (has("orientation") && has("sexual"))) return "sexualOrientation";

  // sex (but not sexual orientation)
  if (has("sex") && !has("sexual orientation")) return "sex";

  if (has("marital") || has("married")) return "maritalStatus";

  // Hispanic/Latino often asked as yes/no separate from race
  if ((has("hispanic") || has("latino") || has("latina") || has("latinx")) && (has("are you") || has("do you") || has("identify"))) {
    return "hispanicLatino";
  }

  if (has("veteran")) return "veteran";
  if (has("disability")) return "disability";
  if (has("race") || has("ethnicity") || has("hispanic") || has("latino"))
    return "raceEthnicity";

  return null;
}

function getAllFillableFields() {
  const inputs = Array.from(
    document.querySelectorAll(
      'input:not([type="hidden"]):not([disabled]):not([readonly])'
    )
  );
  const textareas = Array.from(
    document.querySelectorAll("textarea:not([disabled]):not([readonly])")
  );
  const selects = Array.from(document.querySelectorAll("select:not([disabled])"));
  return { inputs, textareas, selects };
}

function fillTextLike(el, value) {
  if (!value) return { changed: false, reason: "empty-value" };
  if (!isVisible(el)) return { changed: false, reason: "not-visible" };

  const type = (el.getAttribute("type") || "").toLowerCase();
  if (type === "checkbox" || type === "radio" || type === "file") {
    return { changed: false, reason: "not-textlike" };
  }

  const current = (el.value || "").trim();
  if (current) return { changed: false, reason: "already-has-value" };

  setNativeValue(el, value);
  return { changed: true, reason: "filled" };
}

async function fillSelect(el, desired) {
  if (!desired) return { changed: false, reason: "empty-desired" };
  if (!isVisible(el)) return { changed: false, reason: "not-visible" };

  const currentText =
    el.selectedOptions && el.selectedOptions[0]
      ? (el.selectedOptions[0].textContent || "").trim()
      : "";
  const looksPlaceholder =
    !el.value ||
    normKey(currentText).includes("select") ||
    normKey(currentText).includes("choose") ||
    normKey(currentText).includes("please");

  if (!looksPlaceholder) return { changed: false, reason: "already-selected" };

  // Attempt a human-like selection first
  const changed = await humanSelectOption(el, desired);
  return { changed, reason: changed ? "selected" : "no-match" };
}

function highlightFilled(elements) {
  if (JAH.lastHighlightCleanup) {
    try {
      JAH.lastHighlightCleanup();
    } catch {}
  }
  JAH.lastHighlightCleanup = highlightEls(elements, "#22c55e");

  setTimeout(() => {
    try {
      if (JAH.lastHighlightCleanup) JAH.lastHighlightCleanup();
    } catch {}
  }, 4500);

  return elements.length;
}

async function applyMappingsFirst(mappings, valueMap) {
  const filledEls = [];
  const report = [];

  const entries = Object.entries(mappings || {});
  for (const [fieldKey, mapping] of entries) {
    const selector = mapping?.selector || "";
    if (!selector) continue;

    const val = valueMap[fieldKey];
    if (!val) {
      report.push({ fieldKey, selector, changed: false, why: "no-value" });
      continue;
    }

    let el = null;
    try {
      el = document.querySelector(selector);
    } catch {
      el = null;
    }

    if (!el) {
      report.push({ fieldKey, selector, changed: false, why: "not-found" });
      continue;
    }

    if (!isVisible(el)) {
      report.push({ fieldKey, selector, changed: false, why: "not-visible" });
      continue;
    }

    const tag = el.tagName.toLowerCase();
    let changed = false;

    if (tag === "select") {
      const res = await fillSelect(el, val);
      changed = res.changed;
    } else if (tag === "input" || tag === "textarea") changed = fillTextLike(el, val).changed;
    else if (el.getAttribute("contenteditable") === "true") {
      if (!el.textContent.trim()) {
        el.textContent = val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        changed = true;
      }
    }

    report.push({ fieldKey, selector, changed, why: changed ? "filled" : "skipped" });
    if (changed) filledEls.push(el);
  }

  return { filledEls, report };
}

function resolveRuleAnswer(rule, valueMap) {
  if (!rule) return "";
  if (rule.source === "pref") {
    const k = rule.prefKey || "";
    return valueMap[k] || "";
  }
  return rule.value || "";
}

/**
 * Dynamic Q/A rules:
 * If hints contains rule.matchText, fill field with answer (literal or preference-backed).
 */
async function applyCustomRules(customRules, valueMap) {
  const rules = Array.isArray(customRules) ? customRules : [];
  if (!rules.length) return { filledEls: [], report: [] };

  const { inputs, textareas, selects } = getAllFillableFields();
  const radiosByName = findRadioGroups();

  const filledEls = [];
  const report = [];

  const allTextLikes = [...inputs, ...textareas];

  // 1) Inputs/Textareas
  for (const el of allTextLikes) {
    const hints = getFieldHints(el);
    if (!hints) continue;

    for (const rule of rules) {
      const m = normKey(rule.matchText || "");
      if (!m) continue;
      if (!hints.includes(m)) continue;

      const answer = resolveRuleAnswer(rule, valueMap);
      if (!answer) {
        report.push({ ruleId: rule.id, matched: rule.matchText, kind: "text", changed: false, why: "no-answer" });
        continue;
      }

      const res = fillTextLike(el, answer);
      report.push({
        ruleId: rule.id,
        matched: rule.matchText,
        kind: "text",
        changed: res.changed,
        why: res.reason
      });

      if (res.changed) filledEls.push(el);
      break; // stop after first matching rule
    }
  }

  // 2) Selects
  for (const el of selects) {
    const hints = getFieldHints(el);
    if (!hints) continue;

    for (const rule of rules) {
      const m = normKey(rule.matchText || "");
      if (!m) continue;
      if (!hints.includes(m)) continue;

      const answer = resolveRuleAnswer(rule, valueMap);
      if (!answer) {
        report.push({ ruleId: rule.id, matched: rule.matchText, kind: "select", changed: false, why: "no-answer" });
        continue;
      }
      // await human-like select
      const res = await fillSelect(el, answer);
      report.push({
        ruleId: rule.id,
        matched: rule.matchText,
        kind: "select",
        changed: res.changed,
        why: res.reason
      });

      if (res.changed) filledEls.push(el);
      break;
    }
  }

  // 3) Radios (group by name)
  for (const [name, group] of radiosByName.entries()) {
    const groupHint = normKey(
      group
        .map((r) => getLabelTextFor(r) || "")
        .join(" ")
    );

    // Also include "name" hint
    const mergedHint = normKey(`${name} ${groupHint}`);

    for (const rule of rules) {
      const m = normKey(rule.matchText || "");
      if (!m) continue;
      if (!mergedHint.includes(m)) continue;

      const answer = resolveRuleAnswer(rule, valueMap);
      if (!answer) {
        report.push({ ruleId: rule.id, matched: rule.matchText, kind: "radio", changed: false, why: "no-answer" });
        continue;
      }

      const changed = chooseRadioInGroup(group, answer);
      report.push({
        ruleId: rule.id,
        matched: rule.matchText,
        kind: "radio",
        changed,
        why: changed ? "clicked" : "no-match"
      });

      if (changed) filledEls.push(group[0]);
      break;
    }
  }

  return { filledEls, report };
}

async function runFill(payload) {
  const profile = payload?.profile || {};
  const prefs = payload?.prefs || {};
  const mappings = payload?.mappings || {};
  const customRules = payload?.customRules || [];
  const valueMap = buildValueMap(profile, prefs);

  const { inputs, textareas, selects } = getAllFillableFields();

  const report = {
    mapped: [],
    dynamicRules: [],
    filled: [],
    skipped: [],
    selects: [],
    totals: {
      inputs: inputs.length,
      textareas: textareas.length,
      selects: selects.length
    }
  };

  const filledEls = [];

  // 1) Apply per-domain mappings first
  const mapped = await applyMappingsFirst(mappings, valueMap);
  report.mapped = mapped.report;
  filledEls.push(...mapped.filledEls);

  // 2) Apply dynamic Q/A rules (per-domain)
  const dyn = await applyCustomRules(customRules, valueMap);
  report.dynamicRules = dyn.report;
  filledEls.push(...dyn.filledEls);

  // 3) Heuristic fallback for remaining fields
  const textLikes = [...inputs, ...textareas];
  for (const el of textLikes) {
    const hints = getFieldHints(el);
    const key = classifyField(hints, el);

    if (!key) continue;
    if (mappings && mappings[key] && mappings[key].selector) continue;

    const val = valueMap[key];
    const r = fillTextLike(el, val);

    if (r.changed) {
      report.filled.push({ key, value: val, hints: hints.slice(0, 120) });
      filledEls.push(el);
    } else {
      report.skipped.push({ kind: "text", key, why: r.reason, hints: hints.slice(0, 120) });
    }
  }

  for (const el of selects) {
    const hints = getFieldHints(el);
    const key = classifyField(hints, el);
    if (!key) continue;

    if (mappings && mappings[key] && mappings[key].selector) continue;

    const desired = valueMap[key];
    const r = await fillSelect(el, desired);

    report.selects.push({
      key,
      desired,
      hints: hints.slice(0, 120),
      changed: r.changed,
      why: r.reason
    });

    if (r.changed) filledEls.push(el);
  }

  const highlightCount = highlightFilled(filledEls);

  return { ok: true, highlightCount, report };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    if (!msg || !msg.type) return;

    if (msg.type === "JAH_CAN_YOU_HEAR_ME") {
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "JAH_START_MAPPER") {
      const res = startMapper();
      sendResponse(res);
      return;
    }

    if (msg.type === "JAH_STOP_MAPPER") {
      const res = stopMapper();
      sendResponse(res);
      return;
    }

    if (msg.type === "JAH_FILL_FORM") {
        // runFill is async because select handling may include human-like delays.
        runFill(msg.payload || {})
          .then((result) => sendResponse(result))
          .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }));
        return true; // indicate we'll send response asynchronously
    }
  } catch (e) {
    sendResponse({ ok: false, error: e?.message || String(e) });
  }
});
