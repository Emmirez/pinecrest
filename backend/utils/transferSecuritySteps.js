import crypto from "crypto";

// Order matters — steps are always requested in this sequence.
export const STEP_ORDER = [
  "emailCode",
  "authenticatorCode",
  "securityAnswer",
  "complianceReviewPin",
];

export const STEP_LABELS = {
  emailCode: "Email Code",
  authenticatorCode: "Authenticator Code",
  securityAnswer: "Security Answer",
  complianceReviewPin: "Compliance Review PIN",
};

// Returns the enabled step keys for a user, in the fixed order above
export const getEnabledSteps = (user) => {
  const settings = user.transferSecurity || {};
  return STEP_ORDER.filter((key) => settings[key]?.enabled);
};

// One-time 6-digit code for a "generated" mode step
export const generateStepCode = () => crypto.randomInt(100000, 999999).toString();

// What the frontend is shown for the current step — never includes the code
export const describeStep = (user, key) => {
  const settings = user.transferSecurity?.[key] || {};
  return {
    key,
    label: STEP_LABELS[key],
    question: key === "securityAnswer" ? settings.question || "" : undefined,
    mode: settings.mode || "fixed",
  };
};