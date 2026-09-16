/**
 * Product-Level Call Outcome Status System
 * Reusable schema and status resolution for OmniDimension Voice AI campaigns
 * across all universities and outreach programs.
 */

export const CALL_OUTCOME_STATUS = Object.freeze({
  INTERESTED: 'INTERESTED',
  CALLBACK: 'CALLBACK',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
  ALREADY_JOINED: 'ALREADY_JOINED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  WRONG_NUMBER_INVALID: 'WRONG_NUMBER_INVALID',
  NOT_ANSWERED: 'NOT_ANSWERED'
});

export const STATUS_DISPLAY_CONFIG = Object.freeze({
  [CALL_OUTCOME_STATUS.INTERESTED]: {
    key: CALL_OUTCOME_STATUS.INTERESTED,
    label: 'Interested',
    color: '#4ade80',
    bg: 'rgba(34, 197, 94, 0.15)',
    border: '#22c55e',
    icon: '🟢',
    class: 'completed',
    description: 'Prospect confirmed explicit interest in admissions / course offerings.'
  },
  [CALL_OUTCOME_STATUS.CALLBACK]: {
    key: CALL_OUTCOME_STATUS.CALLBACK,
    label: 'Callback',
    color: '#fbbf24',
    bg: 'rgba(245, 158, 11, 0.15)',
    border: '#f59e0b',
    icon: '📞',
    class: 'callback',
    description: 'Prospect requested a follow-up call at a later time.'
  },
  [CALL_OUTCOME_STATUS.ALREADY_APPLIED]: {
    key: CALL_OUTCOME_STATUS.ALREADY_APPLIED,
    label: 'Already Applied',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.15)',
    border: '#0284c7',
    icon: '📝',
    class: 'already-applied',
    description: 'Prospect has already submitted an admission application.'
  },
  [CALL_OUTCOME_STATUS.ALREADY_JOINED]: {
    key: CALL_OUTCOME_STATUS.ALREADY_JOINED,
    label: 'Already Joined',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.15)',
    border: '#9333ea',
    icon: '🎓',
    class: 'already-joined',
    description: 'Prospect has already enrolled / taken admission elsewhere or in college.'
  },
  [CALL_OUTCOME_STATUS.NOT_INTERESTED]: {
    key: CALL_OUTCOME_STATUS.NOT_INTERESTED,
    label: 'Not Interested',
    color: '#f87171',
    bg: 'rgba(239, 68, 68, 0.15)',
    border: '#dc2626',
    icon: '🔴',
    class: 'canceled',
    description: 'Prospect explicitly declined or is currently working/not seeking college.'
  },
  [CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID]: {
    key: CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID,
    label: 'Wrong Number / Invalid',
    color: '#fb923c',
    bg: 'rgba(251, 146, 60, 0.15)',
    border: '#ea580c',
    icon: '⚠️',
    class: 'wrong-number',
    description: 'Number is invalid, wrong contact, or does not belong to student.'
  },
  [CALL_OUTCOME_STATUS.NOT_ANSWERED]: {
    key: CALL_OUTCOME_STATUS.NOT_ANSWERED,
    label: 'Calls Not Answered',
    color: '#fb7185',
    bg: 'rgba(244, 63, 94, 0.15)',
    border: '#e11d48',
    icon: '❌',
    class: 'failed',
    description: 'Call was missed, unreachable, busy, canceled, or timed out.'
  }
});

// Keywords for robust text matching
const UNANSWERED_STATUSES = new Set([
  'failed', 'canceled', 'cancelled', 'busy', 'no-answer', 'no_answer', 
  'timeout', 'timedout', 'unreachable', 'missed', 'not answered', 'unanswered'
]);

const WRONG_NUMBER_KEYWORDS = [
  'wrong number', 'wrong person', 'invalid number', 'not the right person',
  'wrong contact', 'not my number', 'mistaken number', 'incorrect number', 
  'does not belong', 'fake number', 'out of service'
];

const ALREADY_JOINED_KEYWORDS = [
  'already joined', 'already enrolled', 'already taken admission', 'already admitted',
  'already taken', 'joined another college', 'joined college', 'joined university',
  'currently studying in another college', 'enrolled in another', 'joined degree'
];

const ALREADY_APPLIED_KEYWORDS = [
  'already applied', 'applied already', 'application submitted', 'submitted application',
  'already submitted form', 'form already submitted', 'already filled application',
  'filled application', 'applied online', 'application pending'
];

const CALLBACK_KEYWORDS = [
  'callback', 'call back', 'call later', 'call me later', 'call tomorrow',
  'reach out later', 'talk later', 'busy right now call later', 'contact later',
  'call again', 'schedule a call', 'call after', 'call evening', 'call afternoon'
];

const NOT_INTERESTED_KEYWORDS = [
  'not interested', 'no interest', 'dont call', "don't call", 'do not call',
  'no thanks', 'not looking', 'reject', 'cancel', 'not planning', 'no need',
  'doing a job', 'doing job', 'working', 'already working', 'doing work',
  'im working', "i'm working", 'im doing a job', "i'm doing a job", 'employed',
  'not required', 'bad timing', 'stop calling', 'not interested in any college'
];

const EXPLICIT_INTEREST_KEYWORDS = [
  'interested in college', 'looking for college', 'want admission', 'want to join',
  'tell me fees', 'send details', 'fee structure', 'which college', 'which course',
  'want to take admission', 'looking for admission', 'interested in b.tech',
  'interested in mba', 'interested in computer science', 'provide details',
  'send information', 'connect me with counselor', 'connect with counselor'
];

/**
 * Resolves the single, primary, mutually exclusive final outcome status for any call record.
 * Follows strict priority order:
 * 1. Pre-computed/structured final_status if valid enum
 * 2. Unanswered / Failed / Busy / Canceled
 * 3. Wrong Number / Invalid
 * 4. Already Joined
 * 5. Already Applied
 * 6. Callback Requested
 * 7. Not Interested
 * 8. Explicitly Interested
 * 9. Fallback: NOT_ANSWERED for un-contacted, or NOT_INTERESTED for answered without positive interest.
 * (Crucial: Answered calls DO NOT blindly become "Interested")
 */
export function resolveCallFinalStatus(item) {
  if (!item) return CALL_OUTCOME_STATUS.NOT_ANSWERED;

  // 1. Direct structured final_status / finalStatus
  const directStatus = String(item.final_status || item.finalStatus || '').toUpperCase().trim();
  if (directStatus && CALL_OUTCOME_STATUS[directStatus]) {
    return CALL_OUTCOME_STATUS[directStatus];
  }

  const outcome = String(item.callOutcome || item.call_status || item.status || '').toUpperCase().trim();
  const leadStatus = String(item.leadStatus || item.lead_status || '').toUpperCase().trim();
  const interestLevel = String(item.interestLevel || item.interest_level || '').toUpperCase().trim();
  const callbackReq = String(item.callbackRequired || item.callback_required || '').toLowerCase().trim();

  // Aggregate relevant text fields
  const fullText = (
    String(item.summary || item.call_summary || '') + ' ' +
    String(item.notes || item.additional_notes || '') + ' ' +
    String(item.call_conversation || item.transcript || item.conversation || '') + ' ' +
    String(item.details || item.interest_details || '') + ' ' +
    String(leadStatus) + ' ' +
    String(outcome)
  ).toLowerCase();

  // 2. Calls Not Answered
  const lowerOutcome = outcome.toLowerCase();
  const lowerCallStatus = String(item.call_status || item.status || '').toLowerCase().trim();
  if (
    UNANSWERED_STATUSES.has(lowerCallStatus) ||
    UNANSWERED_STATUSES.has(lowerOutcome) ||
    outcome.includes('NO ANSWER') || outcome.includes('NO-ANSWER') || outcome.includes('MISSED') ||
    outcome.includes('FAILED') || outcome.includes('BUSY') || outcome.includes('UNREACHABLE') ||
    outcome.includes('CANCEL') || outcome.includes('TIMEOUT') ||
    leadStatus === 'NO_ANSWER' || leadStatus === 'NOT ANSWERED' || leadStatus === 'UNANSWERED' ||
    interestLevel === 'NO_ANSWER' ||
    outcome === 'NO_ANSWER'
  ) {
    return CALL_OUTCOME_STATUS.NOT_ANSWERED;
  }

  // 3. Wrong Number / Invalid
  if (
    leadStatus.includes('WRONG') || leadStatus.includes('INVALID') ||
    outcome.includes('WRONG') || outcome.includes('INVALID') ||
    WRONG_NUMBER_KEYWORDS.some(kw => fullText.includes(kw))
  ) {
    return CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID;
  }

  // 4. Already Joined
  if (
    leadStatus.includes('ALREADY_JOINED') || leadStatus.includes('ALREADY JOINED') || leadStatus.includes('ENROLLED') ||
    outcome.includes('ALREADY_JOINED') || outcome.includes('ALREADY JOINED') ||
    ALREADY_JOINED_KEYWORDS.some(kw => fullText.includes(kw))
  ) {
    return CALL_OUTCOME_STATUS.ALREADY_JOINED;
  }

  // 5. Already Applied
  if (
    leadStatus.includes('ALREADY_APPLIED') || leadStatus.includes('ALREADY APPLIED') ||
    outcome.includes('ALREADY_APPLIED') || outcome.includes('ALREADY APPLIED') ||
    ALREADY_APPLIED_KEYWORDS.some(kw => fullText.includes(kw))
  ) {
    return CALL_OUTCOME_STATUS.ALREADY_APPLIED;
  }

  // 6. Callback
  if (
    callbackReq === 'yes' || callbackReq === 'true' ||
    leadStatus.includes('CALLBACK') || leadStatus.includes('CALL_BACK') || leadStatus.includes('CALL BACK') ||
    outcome.includes('CALLBACK') || outcome.includes('CALL_BACK') || outcome.includes('CALL BACK') ||
    CALLBACK_KEYWORDS.some(kw => fullText.includes(kw))
  ) {
    return CALL_OUTCOME_STATUS.CALLBACK;
  }

  // 7. Not Interested
  if (
    leadStatus === 'NOT INTERESTED' || leadStatus === 'NOT_INTERESTED' || leadStatus === 'DECLINED' ||
    interestLevel === 'NOT INTERESTED' || interestLevel === 'NOT_INTERESTED' || interestLevel === 'LOW' ||
    outcome.includes('NOT INTERESTED') || outcome.includes('NOT_INTERESTED') || outcome.includes('DECLINED') ||
    NOT_INTERESTED_KEYWORDS.some(kw => fullText.includes(kw))
  ) {
    return CALL_OUTCOME_STATUS.NOT_INTERESTED;
  }

  // 8. Explicitly Interested (Strict check: verified interest, hot lead, or explicit affirmative)
  if (
    leadStatus === 'INTERESTED' || leadStatus === 'HOT LEAD' || leadStatus === 'QUALIFIED' ||
    leadStatus.includes('HOT') || interestLevel === 'HIGH' || interestLevel === 'INTERESTED' ||
    EXPLICIT_INTEREST_KEYWORDS.some(kw => fullText.includes(kw))
  ) {
    return CALL_OUTCOME_STATUS.INTERESTED;
  }

  // 9. If answered and transcript/summary exists without positive interest
  // DO NOT blindly mark as INTERESTED!
  if (lowerCallStatus === 'completed' || outcome.includes('COMPLETED') || outcome.includes('ANSWERED')) {
    // If interestLevel is Medium or has positive sentiment, it can qualify as interested
    if (interestLevel === 'MEDIUM' || String(item.sentiment || '').toLowerCase() === 'positive') {
      return CALL_OUTCOME_STATUS.INTERESTED;
    }
    // Otherwise it is neutral/not interested, not "Interested"
    return CALL_OUTCOME_STATUS.NOT_INTERESTED;
  }

  return CALL_OUTCOME_STATUS.NOT_ANSWERED;
}

/**
 * Visual metadata helper for rendering status badge/tag.
 */
export function getStatusDisplay(statusKey) {
  // Normalize alias like WRONG_NUMBER -> WRONG_NUMBER_INVALID, UNANSWERED -> NOT_ANSWERED
  let key = statusKey;
  if (key === 'WRONG_NUMBER') key = CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID;
  if (key === 'UNANSWERED') key = CALL_OUTCOME_STATUS.NOT_ANSWERED;

  return STATUS_DISPLAY_CONFIG[key] || STATUS_DISPLAY_CONFIG[CALL_OUTCOME_STATUS.NOT_ANSWERED];
}

/**
 * Helper to check if a call requires counsellor follow-up as a secondary action.
 * (Mutually exclusive from primary status calculations)
 */
export function isCounselorFollowupRequired(item) {
  if (!item) return false;
  const raw = String(
    item.counselorRequired ||
    item.counselor_required ||
    (item.rawFields && (item.rawFields.counselor_required || item.rawFields.counselor)) ||
    ''
  ).toLowerCase().trim();
  return raw === 'yes' || raw === 'true' || raw === '1' || raw.includes('required');
}

/**
 * Helper to extract callback time if scheduled.
 */
export function getCallbackTime(item) {
  if (!item) return null;
  const rawTime = item.callbackTime || item.callback_time || item.preferred_callback_time || (item.rawFields && item.rawFields.callback_time);
  if (rawTime && String(rawTime).trim() !== '' && String(rawTime).trim() !== '—') {
    return String(rawTime).trim();
  }
  return null;
}
