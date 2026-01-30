import React, { useEffect, useMemo, useState } from "react";
import { extractTextFromFile } from "../shared/extractText.js";
import { parseResumeToProfile } from "../shared/parseResume.js";
import {
  storageGet,
  storageSet,
  getDomainMappings,
  saveDomainMapping,
  deleteDomainMapping,
  clearDomainMappings,
  getDomainCustomRules,
  saveDomainCustomRule,
  deleteDomainCustomRule,
  clearDomainCustomRules
} from "../shared/storage.js";

const DEFAULT_PREFS = {
  workAuth: "Yes",
  needSponsorship: "No",

  // EEO-ish (existing)
  gender: "Decline to self-identify",
  veteran: "I am not a protected veteran",
  disability: "I don't wish to answer",
  raceEthnicity: "Decline to self-identify",

  // New EEO/H1B-ish
  sex: "Prefer not to say",
  sexualOrientation: "Prefer not to say",
  maritalStatus: "Prefer not to say",
  hispanicLatino: "Prefer not to say",
  h1b: "Prefer not to say"
};

const FIELD_KEYS = [
  { key: "fullName", label: "Full Name" },
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address1", label: "Address Line 1" },
  { key: "address2", label: "Address Line 2" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP" },
  { key: "country", label: "Country" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "website", label: "Website/Portfolio" },
  { key: "github", label: "GitHub" },

  // Core job app / EEO fields
  { key: "workAuth", label: "Work Authorized?" },
  { key: "needSponsorship", label: "Need Sponsorship?" },
  { key: "gender", label: "Gender" },
  { key: "sex", label: "Sex" },
  { key: "sexualOrientation", label: "Sexual Orientation" },
  { key: "maritalStatus", label: "Marital Status" },
  { key: "hispanicLatino", label: "Hispanic/Latino" },
  { key: "raceEthnicity", label: "Race / Ethnicity" },
  { key: "veteran", label: "Veteran Status" },
  { key: "disability", label: "Disability Status" },
  { key: "h1b", label: "H-1B / H1B" }
];

function makeId() {
  return `r_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function isWindowMode() {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get("mode") === "window";
  } catch {
    return false;
  }
}

function hasChromeRuntime() {
  return typeof chrome !== "undefined" && !!chrome?.runtime?.id && !!chrome?.runtime?.sendMessage;
}

export default function App() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [buildCount, setBuildCount] = useState(null);

  const [profile, setProfile] = useState({
    fullName: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
    country: "",
    linkedin: "",
    website: "",
    github: ""
  });

  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  // Active tab context
  const [hostname, setHostname] = useState("");
  const [activeUrl, setActiveUrl] = useState("");

  // Mapper state
  const [mapperOn, setMapperOn] = useState(false);
  const [selectedField, setSelectedField] = useState(null);
  const [mapToKey, setMapToKey] = useState("email");
  const [domainMappings, setDomainMappings] = useState({});

  // Dynamic rules state (per-site)
  const [domainRules, setDomainRules] = useState([]);
  const [ruleMatchText, setRuleMatchText] = useState("sexual orientation");
  const [ruleSource, setRuleSource] = useState("pref"); // "pref" | "literal"
  const [rulePrefKey, setRulePrefKey] = useState("sexualOrientation");
  const [ruleLiteralValue, setRuleLiteralValue] = useState("Prefer not to say");
  // Quick-add controls for common rules
  const [quickAddMode, setQuickAddMode] = useState("pref"); // "pref" | "literal"
  const [quickAddLiteralValue, setQuickAddLiteralValue] = useState("Prefer not to say");

  const [lastReport, setLastReport] = useState(null);

  // keep-open window mode support
  const [windowMode] = useState(isWindowMode);

  // ✅ FIX: mapper requires floating window (your previous code used undefined isFloating)
  const isFloating = windowMode;

  // When starting mapper from the dropdown popup, the popup closes as soon as you
  // click the target page. So we "handoff" to the floating window and auto-start there.
  const AUTO_START_MAPPER_KEY = "jah_autoStartMapper";

  async function safeSendMessage(payload) {
    if (!hasChromeRuntime()) {
      throw new Error("Chrome extension runtime not available (are you opening this outside the extension popup/window?)");
    }
    return await chrome.runtime.sendMessage(payload);
  }
  useEffect(() => {
  async function refreshFromStorage() {
    try {
      const s = await storageGet(["resumeText", "profile", "prefs"]);
      if (s.resumeText !== undefined) setResumeText(s.resumeText || "");
      if (s.profile !== undefined) setProfile(s.profile || {});
      if (s.prefs !== undefined) setPrefs((prev) => ({ ...prev, ...(s.prefs || {}) }));
    } catch {
      // ignore
    }
  }

  window.addEventListener("focus", refreshFromStorage);
  return () => window.removeEventListener("focus", refreshFromStorage);
}, []);

// Keep popup + floating window in sync (both read/write chrome.storage.local)
useEffect(() => {
  function onChanged(changes, area) {
    if (area !== "local") return;

    // If another window saved something, mirror it here
    if (changes.resumeText?.newValue !== undefined) {
      setResumeText(changes.resumeText.newValue || "");
    }
    if (changes.profile?.newValue !== undefined) {
      setProfile(changes.profile.newValue || {});
    }
    if (changes.prefs?.newValue !== undefined) {
      setPrefs((prev) => ({ ...prev, ...(changes.prefs.newValue || {}) }));
    }
  }

  chrome.storage.onChanged.addListener(onChanged);
  return () => chrome.storage.onChanged.removeListener(onChanged);
}, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = await storageGet(["resumeText", "profile", "prefs"]);
        if (saved.resumeText) setResumeText(saved.resumeText);
        if (saved.profile) setProfile(saved.profile);
        if (saved.prefs) setPrefs({ ...DEFAULT_PREFS, ...saved.prefs });

        await refreshActiveTabInfo();
      } catch (e) {
        setStatus(e?.message || String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-start mapper in the floating window when the dropdown popup triggered it.
  useEffect(() => {
    if (!windowMode) return;

    (async () => {
      try {
        const s = await storageGet([AUTO_START_MAPPER_KEY]);
        if (!s?.[AUTO_START_MAPPER_KEY]) return;

        // Clear first so refreshes don't re-trigger.
        await storageSet({ [AUTO_START_MAPPER_KEY]: false });

        setBusy(true);
        await startMapperHere();
      } catch (e) {
        setStatus(`Mapper error: ${e?.message || String(e)}`);
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowMode]);

  // Listen for mapper selection events
  useEffect(() => {
    if (!hasChromeRuntime() || !chrome?.runtime?.onMessage?.addListener) return;

    function onMsg(msg) {
      if (!msg || !msg.type) return;

      if (msg.type === "JAH_MAPPER_FIELD_SELECTED") {
        const payload = msg.payload || {};
        setSelectedField(payload);
        setStatus(`Field selected on ${payload.hostname}. Choose “Map to” then Save mapping.`);
      }

      if (msg.type === "JAH_MAPPER_CANCELLED") {
        setMapperOn(false);
        setStatus("Mapper cancelled (Esc).");
      }
    }

    chrome.runtime.onMessage.addListener(onMsg);
    return () => chrome.runtime.onMessage.removeListener(onMsg);
  }, []);

  useEffect(() => {
    // Reads version from manifest.json (always correct)
    try {
      if (hasChromeRuntime() && chrome.runtime.getManifest) {
        const mv = chrome.runtime.getManifest();
        setAppVersion(mv?.version || "");
      } else {
        setAppVersion("");
      }
    } catch {
      setAppVersion("");
    }

    // Reads local build counter
    (async () => {
      const saved = await storageGet(["buildCount"]);
      const n = typeof saved.buildCount === "number" ? saved.buildCount : 0;
      setBuildCount(n);
    })();
  }, []);

  // persist floating window size for next time
  useEffect(() => {
    if (!windowMode) return;

    let t = null;
    const onResize = () => {
      if (t) clearTimeout(t);
      t = setTimeout(async () => {
        try {
          await storageSet({
            floatingSize: { width: window.outerWidth, height: window.outerHeight }
          });
        } catch {
          // ignore
        }
      }, 300);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [windowMode]);

  const completeness = useMemo(() => {
    const keys = [
      "fullName",
      "email",
      "phone",
      "address1",
      "city",
      "state",
      "zip",
      "linkedin",
      "website",
      "github"
    ];
    let filled = 0;
    for (const k of keys) if (String(profile[k] || "").trim()) filled++;
    return Math.round((filled / keys.length) * 100);
  }, [profile]);

  async function refreshActiveTabInfo() {
    try {
      if (!hasChromeRuntime()) return;

      const res = await safeSendMessage({ type: "JAH_GET_ACTIVE_TAB_INFO" });
      if (!res?.ok) return;

      setHostname(res.hostname || "");
      setActiveUrl(res.url || "");

      if (res.hostname) {
        const dm = await getDomainMappings(res.hostname);
        setDomainMappings(dm || {});
        const rules = await getDomainCustomRules(res.hostname);
        setDomainRules(Array.isArray(rules) ? rules : []);
      }
    } catch {
      // ignore
    }
  }

  // open keep-open floating window
  async function openFloatingWindow() {
    try {
      const saved = await storageGet(["floatingSize"]);
      const w = saved?.floatingSize?.width || 480;
      const h = saved?.floatingSize?.height || 760;

      const res = await safeSendMessage({
        type: "JAH_OPEN_FLOATING_WINDOW",
        width: w,
        height: h
      });

  //    if (!res?.ok) {
//        setStatus(res?.error || "Failed to open floating window.");
    //  } else {
        setStatus(res.reused ? "Focused floating window." : "Opened floating window (stays open).");

        // Optional: close any open dropdown/focus before closing popup
        //document.activeElement?.blur?.();

        // Optional: if we're currently the popup (not the floating window), close it
        if (!windowMode) window.close();
      //}
    } catch (e) {
      setStatus(`Window error: ${e?.message || String(e)}`);
    }
  }

  async function startMapperHere() {
    await refreshActiveTabInfo();
    const res = await safeSendMessage({ type: "JAH_START_MAPPER" });
    if (!res?.ok) throw new Error(res?.error || "Failed to start mapper.");
    setMapperOn(true);
    setSelectedField(null);
    setStatus("Mapper ON: click a field on the page (press Esc to cancel).");
  }

  async function onUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setBusy(true);
    setStatus("Reading resume…");

    try {
      const text = await extractTextFromFile(file);
      setResumeText(text);

      setStatus("Parsing key info…");
      const nextProfile = parseResumeToProfile(text);

      // keep React state consistent + persist the same merged profile
      const merged = { ...profile, ...nextProfile };
      setProfile(merged);

      await storageSet({
        resumeText: text,
        profile: merged
      });

      setStatus("Saved. You can now auto-fill on a job application page.");
    } catch (err) {
      setStatus(`Upload failed: ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function saveAll() {
    setBusy(true);
    try {
      await storageSet({ resumeText, profile, prefs });
      await bumpBuildCounter();
      setStatus("Saved settings.");
    } catch (err) {
      setStatus(`Save failed: ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleMapper() {
  setBusy(true);
  try {
    await refreshActiveTabInfo();

    if (!mapperOn) {
      const res = await safeSendMessage({ type: "JAH_START_MAPPER" });
      if (!res?.ok) {
        setStatus(res?.error || "Failed to start mapper.");
      } else {
        setMapperOn(true);
        setSelectedField(null);
        setStatus("Mapper ON: click a field on the page (press Esc to cancel).");
      }
    } else {
      await safeSendMessage({ type: "JAH_STOP_MAPPER" });
      setMapperOn(false);
      setStatus("Mapper OFF.");
    }
  } catch (err) {
    setStatus(`Mapper error: ${err?.message || String(err)}`);
  } finally {
    setBusy(false);
  }
}
  async function saveMappingNow() {
    if (!hostname) {
      setStatus("No hostname detected. Click Refresh tab info, then try again.");
      return;
    }
    if (!selectedField?.selector) {
      setStatus("No field selected. Start Mapper, then click a field.");
      return;
    }
    if (!mapToKey) {
      setStatus("Pick a field key to map to.");
      return;
    }

    setBusy(true);
    try {
      const mapping = {
        selector: selectedField.selector,
        kind: selectedField.tag || "input",
        meta: {
          label: selectedField.label || "",
          name: selectedField.name || "",
          id: selectedField.id || "",
          inputType: selectedField.inputType || ""
        }
      };

      const nextDomain = await saveDomainMapping(hostname, mapToKey, mapping);
      setDomainMappings(nextDomain || {});
      setStatus(`Saved mapping for ${hostname}: ${mapToKey} → ${mapping.selector}`);
    } catch (err) {
      setStatus(`Save mapping failed: ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeMapping(fieldKey) {
    if (!hostname) return;
    setBusy(true);
    try {
      const nextDomain = await deleteDomainMapping(hostname, fieldKey);
      setDomainMappings(nextDomain || {});
      setStatus(`Deleted mapping: ${fieldKey}`);
    } catch (err) {
      setStatus(`Delete failed: ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function wipeDomainMappings() {
    if (!hostname) return;
    setBusy(true);
    try {
      await clearDomainMappings(hostname);
      setDomainMappings({});
      setStatus(`Cleared all mappings for ${hostname}`);
    } catch (err) {
      setStatus(`Clear failed: ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function addRule() {
    if (!hostname) {
      setStatus("No hostname detected. Click Refresh tab info, then try again.");
      return;
    }
    const mt = String(ruleMatchText || "").trim();
    if (!mt) {
      setStatus("Rule needs a match text (example: sexual orientation).");
      return;
    }

    const newRule = {
      id: makeId(),
      matchText: mt,
      source: ruleSource,
      prefKey: ruleSource === "pref" ? rulePrefKey : undefined,
      value: ruleSource === "literal" ? ruleLiteralValue : undefined
    };

    setBusy(true);
    try {
      const next = await saveDomainCustomRule(hostname, newRule);
      setDomainRules(next || []);
      setStatus(`Saved rule for ${hostname}: match “${mt}”`);
    } catch (err) {
      setStatus(`Save rule failed: ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRule(ruleId) {
    if (!hostname) return;
    setBusy(true);
    try {
      const next = await deleteDomainCustomRule(hostname, ruleId);
      setDomainRules(next || []);
      setStatus("Deleted rule.");
    } catch (err) {
      setStatus(`Delete rule failed: ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function clearRules() {
    if (!hostname) return;
    setBusy(true);
    try {
      await clearDomainCustomRules(hostname);
      setDomainRules([]);
      setStatus(`Cleared all dynamic rules for ${hostname}`);
    } catch (err) {
      setStatus(`Clear rules failed: ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function quickAddCommonRules() {
    if (!hostname) {
      setStatus("No hostname detected. Click Refresh tab info, then try again.");
      return;
    }

    const commonBase = [
      { matchText: "sexual orientation", prefKey: "sexualOrientation" },
      { matchText: "marital status", prefKey: "maritalStatus" },
      { matchText: "hispanic", prefKey: "hispanicLatino" },
      { matchText: "latino", prefKey: "hispanicLatino" },
      { matchText: "gender", prefKey: "gender" },
      { matchText: "sex", prefKey: "sex" },
      { matchText: "disability", prefKey: "disability" },
      { matchText: "veteran", prefKey: "veteran" },
      { matchText: "h1b", prefKey: "h1b" },
      { matchText: "h-1b", prefKey: "h1b" }
    ];

    const common = commonBase.map((r) => {
      const id = makeId();
      if (quickAddMode === "pref") {
        return { id, matchText: r.matchText, source: "pref", prefKey: r.prefKey };
      }
      return { id, matchText: r.matchText, source: "literal", value: quickAddLiteralValue };
    });

    setBusy(true);
    try {
      let current = Array.isArray(domainRules) ? [...domainRules] : [];
      for (const r of common) {
        const exists = current.some((x) => {
          if (norm(x.matchText) !== norm(r.matchText)) return false;
          if (r.source === "pref") return x.source === "pref" && x.prefKey === r.prefKey;
          return x.source === "literal" && String(x.value || "") === String(r.value || "");
        });
        if (exists) continue;
        current = await saveDomainCustomRule(hostname, r);
      }
      setDomainRules(current || []);
      setStatus("Added common dynamic rules (you can delete any you don’t want).");
    } catch (err) {
      setStatus(`Quick add failed: ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function bumpBuildCounter() {
    setBusy(true);
    try {
      const saved = await storageGet(["buildCount"]);
      const n = typeof saved.buildCount === "number" ? saved.buildCount : 0;
      const next = n + 1;
      await storageSet({ buildCount: next });
      setBuildCount(next);
      setStatus(`Build counter bumped to ${next}`);
    } catch (e) {
      setStatus(`Build counter error: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function autofillActiveTab() {
    setBusy(true);
    setStatus("Sending auto-fill to current tab…");
    setLastReport(null);

    try {
      await refreshActiveTabInfo();
      await storageSet({ resumeText, profile, prefs });

      const res = await safeSendMessage({
        type: "JAH_APPLY_FILL",
        payload: {
          profile,
          prefs,
          mappings: domainMappings || {},
          customRules: domainRules || []
        }
      });

      if (!res?.ok) {
        setStatus(res?.error || "Failed to auto-fill.");
        return;
      }

      const result = res?.result;
      setLastReport(result?.report || null);
      setStatus(`Auto-fill complete. Highlighted: ${result?.highlightCount ?? 0}`);
    } catch (err) {
      setStatus(`Auto-fill error: ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  function setProfileField(k, v) {
    setProfile((p) => ({ ...p, [k]: v }));
  }

  function setPrefField(k, v) {
    setPrefs((p) => ({ ...p, [k]: v }));
  }

  const mappingEntries = Object.entries(domainMappings || {}).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  const ruleEntries = Array.isArray(domainRules) ? domainRules.slice() : [];
  ruleEntries.sort((a, b) =>
    String(a.matchText || "").localeCompare(String(b.matchText || ""))
  );

  const fieldKeyOptions = FIELD_KEYS.map((x) => x.key);
  const fieldKeyLabels = Object.fromEntries(FIELD_KEYS.map((x) => [x.key, x.label]));

  return (
    <div className="wrap">
      <header className="header">
        <div className="title">
          Job Application Helper{" "}
          {windowMode ? <span className="pill ok">Window</span> : null}
        </div>

        <div className="sub">
          Version: <b>{appVersion || "—"}</b> • Builds: <b>{buildCount ?? "—"}</b>
          <br />
          Upload resume → save → open a job form → Auto-fill
          <br />
          Popup auto-closes — use Floating Window to keep it open.
        </div>
      </header>

      {/* Floating Window controls */}
      <section className="card">
        <div className="btnRow">
          {!windowMode ? (
            <button className="btnPrimary" onClick={openFloatingWindow} disabled={busy}>
              Open Floating Window
            </button>
          ) : (
            <button className="btnPrimary" onClick={() => window.close()} disabled={busy}>
              Close Window
            </button>
          )}

          <button className="btn" onClick={refreshActiveTabInfo} disabled={busy}>
            Refresh tab info
          </button>

          <button className="btn" onClick={bumpBuildCounter} disabled={busy}>
            Bump Build #
          </button>
        </div>

        <div className="small" style={{ marginTop: 10 }}>
          Domain: <b>{hostname || "—"}</b>
          <br />
          <span className="mono">{activeUrl ? activeUrl.slice(0, 68) : "—"}</span>
        </div>
      </section>

      <section className="card">
        <div className="row">
          <label className="label">Upload resume (PDF / DOCX / TXT)</label>
          <input
            className="file"
            type="file"
            accept=".pdf,.docx,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={onUpload}
            disabled={busy}
          />
        </div>

        <div className="small">
          Tip: If parsing misses anything, edit fields below and click <b>Save</b>.
        </div>

        <div className="meter">
          <div className="meterText">Profile completeness: {completeness}%</div>
          <div className="meterBar">
            <div className="meterFill" style={{ width: `${completeness}%` }} />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="cardTitle">Field Mapper Mode (per-site)</div>

        <div className="small">
          Mapper = most reliable. Start Mapper → click a field → Map to a key → Save mapping.
        </div>

        <div className="btnRow">
          <button className="btnPrimary" onClick={toggleMapper} disabled={busy}>
            {mapperOn ? "Stop Mapper" : "Start Mapper"}
          </button>
          <button className="btn" onClick={wipeDomainMappings} disabled={busy || !hostname}>
            Clear domain mappings
          </button>
        </div>

        <div className="divider" />

        <div className="field" style={{ marginTop: 10 }}>
          <div className="label">Last selected field</div>
          <div className="small">
            {selectedField ? (
              <>
                <div>
                  <span className="pill ok">selector</span>{" "}
                  <span className="mono">{selectedField.selector}</span>
                </div>
                <div className="small" style={{ marginTop: 6 }}>
                  Label: {selectedField.label || "—"} • Name: {selectedField.name || "—"} • Id:{" "}
                  {selectedField.id || "—"}
                </div>
              </>
            ) : (
              "None yet."
            )}
          </div>
        </div>

        <div className="grid2" style={{ marginTop: 10 }}>
          <SelectField
            label="Map this field to"
            value={mapToKey}
            onChange={(v) => setMapToKey(v)}
            options={fieldKeyOptions}
            optionLabels={fieldKeyLabels}
          />
          <div className="field">
            <div className="label">Save mapping</div>
            <button className="btnPrimary" onClick={saveMappingNow} disabled={busy}>
              Save mapping
            </button>
          </div>
        </div>

        <div className="divider" />

        <div className="cardTitle" style={{ fontSize: 13, marginBottom: 6 }}>
          Mappings for {hostname || "—"}
        </div>

        {mappingEntries.length === 0 ? (
          <div className="small">No mappings saved yet for this domain.</div>
        ) : (
          <div className="mappingList">
            {mappingEntries.map(([k, m]) => (
              <div className="mappingRow" key={k}>
                <span className="pill ok">{k}</span>
                <span className="mono">{m?.selector || ""}</span>
                <button
                  className="btn"
                  style={{ padding: "6px 10px", borderRadius: 12 }}
                  onClick={() => removeMapping(k)}
                  disabled={busy}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="cardTitle">Dynamic Q/A Rules (per-site)</div>
        <div className="small">
          Use this when the site’s labels are weird. Rule example: match “sexual orientation” → answer “Heterosexual”.
          <br />
          Works on inputs, selects, and many radio groups.
        </div>

        <div className="grid2" style={{ alignItems: "end" }}>
          <SelectField
            label="Quick add answer"
            value={quickAddMode}
            onChange={(v) => setQuickAddMode(v)}
            options={["pref", "literal"]}
            optionLabels={{ pref: "Use Preference", literal: "Use Literal" }}
          />

          {quickAddMode === "literal" ? (
            <SelectField
              label="Literal value"
              value={quickAddLiteralValue}
              onChange={(v) => setQuickAddLiteralValue(v)}
              options={[
                "Prefer not to say",
                "Decline to self-identify",
                "I don't wish to answer",
                "Yes",
                "No",
                "Heterosexual / Straight",
                "Gay or Lesbian",
                "Bisexual"
              ]}
            />
          ) : (
            <div />
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn" onClick={quickAddCommonRules} disabled={busy || !hostname}>
              Quick add common rules
            </button>
            <button className="btn" onClick={clearRules} disabled={busy || !hostname}>
              Clear domain rules
            </button>
          </div>
        </div>

        <div className="divider" />

        <div className="grid2">
          <div className="field">
            <div className="label">Match text (contains)</div>
            <input
              className="input"
              value={ruleMatchText}
              onChange={(e) => setRuleMatchText(e.target.value)}
              placeholder='ex: "sexual orientation"'
            />
          </div>

          <SelectField
            label="Answer source"
            value={ruleSource}
            onChange={(v) => setRuleSource(v)}
            options={["pref", "literal"]}
            optionLabels={{ pref: "Use Preference", literal: "Literal Text" }}
          />
        </div>

        <div className="grid2" style={{ marginTop: 10 }}>
          {ruleSource === "pref" ? (
            <SelectField
              label="Preference key"
              value={rulePrefKey}
              onChange={(v) => setRulePrefKey(v)}
              options={[
                "workAuth",
                "needSponsorship",
                "gender",
                "sex",
                "sexualOrientation",
                "maritalStatus",
                "hispanicLatino",
                "raceEthnicity",
                "veteran",
                "disability",
                "h1b"
              ]}
              optionLabels={{
                workAuth: "Work Authorized",
                needSponsorship: "Need Sponsorship",
                gender: "Gender",
                sex: "Sex",
                sexualOrientation: "Sexual Orientation",
                maritalStatus: "Marital Status",
                hispanicLatino: "Hispanic/Latino",
                raceEthnicity: "Race/Ethnicity",
                veteran: "Veteran",
                disability: "Disability",
                h1b: "H-1B / H1B"
              }}
            />
          ) : (
            <div className="field">
              <div className="label">Literal answer</div>
              <input
                className="input"
                value={ruleLiteralValue}
                onChange={(e) => setRuleLiteralValue(e.target.value)}
                placeholder='ex: "Heterosexual / Straight"'
              />
            </div>
          )}

          <div className="field">
            <div className="label">Save rule</div>
            <button className="btnPrimary" onClick={addRule} disabled={busy}>
              Add rule
            </button>
          </div>
        </div>

        <div className="divider" />

        <div className="cardTitle" style={{ fontSize: 13, marginBottom: 6 }}>
          Rules for {hostname || "—"}
        </div>

        {ruleEntries.length === 0 ? (
          <div className="small">No dynamic rules saved yet for this domain.</div>
        ) : (
          <div className="mappingList">
            {ruleEntries.map((r) => (
              <div className="mappingRow" key={r.id}>
                <span className="pill ok">{(r.matchText || "").slice(0, 22)}</span>
                <span className="small">
                  →{" "}
                  <span className="mono">
                    {r.source === "pref" ? `pref:${r.prefKey}` : `literal:${r.value}`}
                  </span>
                </span>
                <button
                  className="btn"
                  style={{ padding: "6px 10px", borderRadius: 12 }}
                  onClick={() => deleteRule(r.id)}
                  disabled={busy}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="cardTitle">Profile (Auto-fill basics)</div>

        <div className="grid2">
          <Field label="Full name" value={profile.fullName} onChange={(v) => setProfileField("fullName", v)} />
          <Field label="Email" value={profile.email} onChange={(v) => setProfileField("email", v)} />
          <Field label="Phone" value={profile.phone} onChange={(v) => setProfileField("phone", v)} />
          <Field label="LinkedIn" value={profile.linkedin} onChange={(v) => setProfileField("linkedin", v)} />
          <Field label="Website/Portfolio" value={profile.website} onChange={(v) => setProfileField("website", v)} />
          <Field label="GitHub" value={profile.github} onChange={(v) => setProfileField("github", v)} />
        </div>

        <div className="divider" />

        <div className="grid2">
          <Field label="Address line 1" value={profile.address1} onChange={(v) => setProfileField("address1", v)} />
          <Field label="Address line 2" value={profile.address2} onChange={(v) => setProfileField("address2", v)} />
          <Field label="City" value={profile.city} onChange={(v) => setProfileField("city", v)} />
          <Field label="State" value={profile.state} onChange={(v) => setProfileField("state", v)} />
          <Field label="ZIP" value={profile.zip} onChange={(v) => setProfileField("zip", v)} />
          <Field label="Country" value={profile.country} onChange={(v) => setProfileField("country", v)} />
        </div>
      </section>

      <section className="card">
        <div className="cardTitle">Common Job App / EEO / H1B Preferences</div>

        <div className="grid2">
          <SelectField
            label="Work authorized in the US?"
            value={prefs.workAuth}
            onChange={(v) => setPrefField("workAuth", v)}
            options={["Yes", "No", "Prefer not to say"]}
          />

          <SelectField
            label="Need sponsorship?"
            value={prefs.needSponsorship}
            onChange={(v) => setPrefField("needSponsorship", v)}
            options={["No", "Yes", "Prefer not to say"]}
          />

          <SelectField
            label="Gender"
            value={prefs.gender}
            onChange={(v) => setPrefField("gender", v)}
            options={["Male", "Female", "Non-binary", "Decline to self-identify", "Prefer not to say"]}
          />

          <SelectField
            label="Sex"
            value={prefs.sex}
            onChange={(v) => setPrefField("sex", v)}
            options={["Male", "Female", "Intersex", "Prefer not to say", "Decline to self-identify"]}
          />

          <SelectField
            label="Sexual Orientation"
            value={prefs.sexualOrientation}
            onChange={(v) => setPrefField("sexualOrientation", v)}
            options={[
              "Heterosexual / Straight",
              "Gay or Lesbian",
              "Bisexual",
              "Asexual",
              "Prefer not to say",
              "Decline to self-identify"
            ]}
          />

          <SelectField
            label="Marital Status"
            value={prefs.maritalStatus}
            onChange={(v) => setPrefField("maritalStatus", v)}
            options={[
              "Single",
              "Married",
              "Divorced",
              "Separated",
              "Widowed",
              "Domestic partnership",
              "Prefer not to say"
            ]}
          />

          <SelectField
            label="Hispanic / Latino"
            value={prefs.hispanicLatino}
            onChange={(v) => setPrefField("hispanicLatino", v)}
            options={["Yes", "No", "Prefer not to say", "Decline to self-identify"]}
          />

          <SelectField
            label="Race / Ethnicity"
            value={prefs.raceEthnicity}
            onChange={(v) => setPrefField("raceEthnicity", v)}
            options={[
              "Hispanic or Latino",
              "Not Hispanic or Latino",
              "American Indian or Alaska Native",
              "Asian",
              "Black or African American",
              "Native Hawaiian or Other Pacific Islander",
              "White",
              "Two or More Races",
              "Decline to self-identify",
              "I don't wish to answer"
            ]}
          />

          <SelectField
            label="Veteran status"
            value={prefs.veteran}
            onChange={(v) => setPrefField("veteran", v)}
            options={[
              "I am not a protected veteran",
              "I identify as one or more of the classifications of protected veteran",
              "I don't wish to answer",
              "Decline to self-identify",
              "No",
              "Yes"
            ]}
          />

          <SelectField
            label="Disability status"
            value={prefs.disability}
            onChange={(v) => setPrefField("disability", v)}
            options={[
              "Yes, I have a disability",
              "No, I don't have a disability",
              "I don't wish to answer"
            ]}
          />

          <SelectField
            label="H-1B / H1B"
            value={prefs.h1b}
            onChange={(v) => setPrefField("h1b", v)}
            options={["Yes", "No", "Prefer not to say"]}
          />
        </div>

        <div className="divider" />

        <div className="btnRow">
          <button className="btn" onClick={saveAll} disabled={busy}>
            Save
          </button>
          <button className="btnPrimary" onClick={autofillActiveTab} disabled={busy}>
            Auto-fill current page
          </button>
        </div>

        <div className="status" aria-live="polite">
          {busy ? "Working…" : status}
        </div>
      </section>

      <section className="card">
        <div className="cardTitle">Resume Text (stored locally)</div>
        <textarea
          className="textarea"
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          placeholder="If PDF/DOCX parsing fails, paste your resume text here."
        />
        <div className="btnRow">
          <button className="btn" onClick={saveAll} disabled={busy}>
            Save text
          </button>
        </div>
      </section>

      {lastReport && (
        <section className="card">
          <div className="cardTitle">Last Auto-fill Report (summary)</div>
          <ReportView report={lastReport} />
        </section>
      )}

      <footer className="footer">
        <div className="small">
          Privacy: everything is stored in <code>chrome.storage.local</code> on your machine.
        </div>
      </footer>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div className="field">
      <div className="label">{label}</div>
      <input className="input" value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function SelectField({ label, value, options, onChange, optionLabels }) {
  return (
    <div className="field">
      <div className="label">{label}</div>
      <select className="input" value={value || ""} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {optionLabels && optionLabels[o] ? optionLabels[o] : o}
          </option>
        ))}
      </select>
    </div>
  );
}

function ReportView({ report }) {
  const mapped = report.mapped || [];
  const dyn = report.dynamicRules || [];
  const filled = report.filled || [];
  const selects = report.selects || [];
  const totals = report.totals || {};

  const mappedChanged = mapped.filter((m) => m.changed).length;
  const dynChanged = dyn.filter((d) => d.changed).length;

  return (
    <div className="report">
      <div className="small">
        Mapped fills: <b>{mappedChanged}</b> • Dynamic rules: <b>{dynChanged}</b> • Heuristic fills: <b>{filled.length}</b> • Selects:{" "}
        <b>{selects.filter((s) => s.changed).length}</b>
        <br />
        Inputs: {totals.inputs || 0} • Textareas: {totals.textareas || 0} • Selects: {totals.selects || 0}
      </div>

      <div className="reportBlock">
        <div className="reportTitle">Dynamic rules</div>
        {dyn.slice(0, 12).map((x, i) => (
          <div className="reportRow" key={i}>
            <span className={`pill ${x.changed ? "ok" : ""}`}>{x.kind}</span>
            <span className="mono">{String(x.matched || "").slice(0, 40)}</span>
            <span className="small">{x.changed ? "applied" : x.why}</span>
          </div>
        ))}
        {dyn.length > 12 && <div className="small">…and {dyn.length - 12} more</div>}
      </div>

      <div className="reportBlock">
        <div className="reportTitle">Mapped fields</div>
        {mapped.slice(0, 12).map((x, i) => (
          <div className="reportRow" key={i}>
            <span className={`pill ${x.changed ? "ok" : ""}`}>{x.fieldKey}</span>
            <span className="mono">{String(x.selector || "").slice(0, 60)}</span>
            <span className="small">{x.changed ? "filled" : x.why}</span>
          </div>
        ))}
        {mapped.length > 12 && <div className="small">…and {mapped.length - 12} more</div>}
      </div>

      <div className="reportBlock">
        <div className="reportTitle">Heuristic filled</div>
        {filled.slice(0, 12).map((x, i) => (
          <div className="reportRow" key={i}>
            <span className="pill ok">{x.key}</span>
            <span className="mono">{String(x.value).slice(0, 60)}</span>
          </div>
        ))}
        {filled.length > 12 && <div className="small">…and {filled.length - 12} more</div>}
      </div>
    </div>
  );
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}
