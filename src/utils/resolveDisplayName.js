// Single source of truth for student display names (table, Excel, modals).
// Chain: staged name -> call context -> direct fields -> sheet rawFields ->
// transcript recovery -> plain phone. Never "Recipient (...)", never "Not provided".

export function isGenericName(n) {
  if (!n) return true;
  const s = String(n).trim();
  return (
    s === '' || s === '—' || s === '-' ||
    s.toLowerCase() === 'student' ||
    s.toLowerCase() === 'not provided' ||
    s.toLowerCase() === 'null' ||
    /^recipient\s*\(/i.test(s)
  );
}

function userSpeech(callRecord) {
  const parts = [];
  if (Array.isArray(callRecord?.interactions)) {
    callRecord.interactions.forEach((t) => {
      if (t && t.user_query && String(t.user_query).trim()) parts.push(String(t.user_query).trim());
    });
  }
  const rf = callRecord?.rawFields || {};
  const conv = callRecord?.call_conversation || callRecord?.transcript || callRecord?.conversation ||
    rf.full_conversation || rf.transcript || rf.conversation || '';
  if (typeof conv === 'string' && conv) {
    conv.replace(/<br\s*\/?>/gi, '\n').split('\n').forEach((line) => {
      const m = line.match(/^\s*user\s*:(.*)$/i);
      if (m && m[1].trim()) parts.push(m[1].trim());
    });
  }
  return parts.join(' ');
}

function transcriptText(callRecord) {
  const rf = callRecord?.rawFields || {};
  const raw = callRecord?.call_conversation || callRecord?.transcript || callRecord?.conversation ||
    rf.full_conversation || rf.transcript || rf.conversation || '';
  return String(raw || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
}

function recoverNameFromTranscript(callRecord) {
  const titleCase = (s) => String(s || '').trim().toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
  const userText = userSpeech(callRecord);
  const fullText = transcriptText(callRecord);

  const selfM = userText.match(/\bmy name is\s+([a-z][a-z'.\- ]{1,40})/i);
  if (selfM) {
    const name = titleCase(selfM[1].split(/[.,!?]/)[0])
      .split(/\s+/).filter((w) => !/^(and|uh|um|er|ah|yeah)$/i.test(w)).slice(0, 4).join(' ');
    if (/^[A-Za-z][A-Za-z .'-]{1,40}$/.test(name)) return name;
  }

  const teM = (fullText.slice(0, 600) + ' ' + userText.slice(0, 300)).match(/([\u0C00-\u0C7F]{2,20})\s*గార[ుూ]/);
  if (teM) return teM[1];

  const greetM = fullText.slice(0, 600).match(/\b(?:hello|hi|hey|namaste|namaskar)[,!]?\s+([a-z]{2,20})\b/i);
  if (greetM) {
    const word = greetM[1].toLowerCase();
    const stop = new Set(['there', 'sir', 'maam', 'madam', 'everyone', 'all', 'dear', 'friend', 'how', 'what', 'can', 'may', 'welcome', 'thanks', 'thank', 'good', 'morning', 'evening', 'afternoon', 'today', 'this', 'that', 'these', 'those', 'is', 'are', 'you', 'your', 'we', 'our', 'iam', 'im']);
    if (!stop.has(word)) return titleCase(word);
  }
  return '';
}

function formatPhoneFallback(call) {
  const digits = String(call?.contactNumber || call?.to_number || call?.phone_number || call?.to || call?.phone || '').replace(/\D/g, '');
  if (!digits) return '—';
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}

export function resolveDisplayName(call, queueMatch) {
  if (queueMatch && !isGenericName(queueMatch.name)) return String(queueMatch.name).trim();

  const ctx = call?.call_context || {};
  for (const cand of [ctx.student_name, ctx.name]) {
    if (!isGenericName(cand)) return String(cand).trim();
  }

  for (const cand of [call?.name, call?.studentName, call?.student_name, call?.fullName]) {
    if (!isGenericName(cand)) return String(cand).trim();
  }

  const rf = call?.rawFields || {};
  for (const cand of [rf.student_name, rf['Student Name'], rf.studentName, rf.name]) {
    if (!isGenericName(cand)) return String(cand).trim();
  }

  const recovered = recoverNameFromTranscript(call || {});
  if (recovered) return recovered;

  return formatPhoneFallback(call);
}
