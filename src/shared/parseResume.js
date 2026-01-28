function norm(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function findFirstMatch(text, regex) {
  const m = text.match(regex);
  return m ? m[1] || m[0] : "";
}

function findEmail(text) {
  return findFirstMatch(
    text,
    /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i
  );
}

function findPhone(text) {
  // Broad US-ish matching, tolerates separators
  const m = text.match(
    /(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/
  );
  return m ? m[0] : "";
}

function findLinkedIn(text) {
  // linkedin.com/in/...
  const m = text.match(/(https?:\/\/)?(www\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%/]+/i);
  return m ? (m[0].startsWith("http") ? m[0] : `https://${m[0].replace(/^www\./i, "www.")}`) : "";
}

function findGitHub(text) {
  const m = text.match(/(https?:\/\/)?(www\.)?github\.com\/[A-Za-z0-9\-_.]+/i);
  return m ? (m[0].startsWith("http") ? m[0] : `https://${m[0].replace(/^www\./i, "www.")}`) : "";
}

function findWebsite(text) {
  // Find a URL that is not linkedin/github
  const urls = text.match(/https?:\/\/[^\s)]+/gi) || [];
  for (const u of urls) {
    const low = u.toLowerCase();
    if (low.includes("linkedin.com") || low.includes("github.com")) continue;
    return u.replace(/[.,]+$/, "");
  }
  return "";
}

function guessName(text) {
  // Heuristic: first non-empty line with letters, not email/url
  const lines = text
    .split(/\r?\n/)
    .map((l) => norm(l))
    .filter(Boolean)
    .slice(0, 12);

  for (const line of lines) {
    const low = line.toLowerCase();
    if (low.includes("@")) continue;
    if (low.includes("http")) continue;
    if (line.length < 3 || line.length > 48) continue;
    if (!/[a-z]/i.test(line)) continue;

    // Prefer 2-4 words
    const words = line.split(" ").filter(Boolean);
    if (words.length >= 2 && words.length <= 4) {
      // Strip weird chars
      const clean = line.replace(/[^a-zA-Z'\- ]+/g, "").trim();
      if (clean.split(" ").length >= 2) return clean;
    }
  }
  return "";
}

function guessAddressBlock(text) {
  // Very naive address guess: look for a line containing a 5-digit zip
  const lines = text.split(/\r?\n/).map((l) => norm(l)).filter(Boolean);
  for (const line of lines) {
    if (/\b\d{5}(-\d{4})?\b/.test(line)) {
      return line;
    }
  }
  return "";
}

function parseAddressLine(line) {
  // Example: "123 Main St, San Jose, CA 95112"
  const out = { address1: "", city: "", state: "", zip: "" };
  const s = norm(line);

  const zip = (s.match(/\b\d{5}(-\d{4})?\b/) || [])[0] || "";
  if (zip) out.zip = zip;

  // Try "..., City, ST 12345"
  const m = s.match(/^(.*?),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/);
  if (m) {
    out.address1 = norm(m[1]);
    out.city = norm(m[2]);
    out.state = norm(m[3]);
    if (m[4]) out.zip = m[4];
    return out;
  }

  // Try "City, ST 12345"
  const m2 = s.match(/([^,]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/);
  if (m2) {
    out.city = norm(m2[1]);
    out.state = norm(m2[2]);
    if (m2[3]) out.zip = m2[3];
  }

  // If starts with number, treat as address1
  if (/^\d+\s+/.test(s)) out.address1 = s;

  return out;
}

export function parseResumeToProfile(resumeText) {
  const text = String(resumeText || "");
  const profile = {};

  const fullName = guessName(text);
  if (fullName) {
    profile.fullName = fullName;
    const parts = fullName.split(" ").filter(Boolean);
    profile.firstName = parts[0] || "";
    profile.lastName = parts.slice(1).join(" ") || "";
  }

  const email = findEmail(text);
  if (email) profile.email = email;

  const phone = findPhone(text);
  if (phone) profile.phone = phone;

  const linkedin = findLinkedIn(text);
  if (linkedin) profile.linkedin = linkedin;

  const github = findGitHub(text);
  if (github) profile.github = github;

  const website = findWebsite(text);
  if (website) profile.website = website;

  const addrLine = guessAddressBlock(text);
  if (addrLine) {
    const a = parseAddressLine(addrLine);
    if (a.address1) profile.address1 = a.address1;
    if (a.city) profile.city = a.city;
    if (a.state) profile.state = a.state;
    if (a.zip) profile.zip = a.zip;
    // Country is rarely included; leave blank by default
  }

  return profile;
}
