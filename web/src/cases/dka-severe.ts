import type { Band, CaseDef, Citation, Condition, PatientState } from "@/engine/types";

// Pilot case. Clinical content is drafted from the sources below and must be checked and
// signed off by two clinicians before real use. Text is paraphrased, never quoted.

const JBDS: Citation = {
  source: "JBDS-IP: The Management of Diabetic Ketoacidosis in Adults",
  section: "",
  year: 2023,
  url: "https://abcd.care/joint-british-diabetes-societies-jbds-inpatient-care-group",
};
const ADA: Citation = {
  source: "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report (ADA/EASD/JBDS/AACE/DTS), Diabetes Care",
  section: "",
  year: 2024,
  url: "https://diabetesjournals.org/care/article/47/8/1257/156808",
};
const DAV: Citation = {
  source: "Davidson's Principles and Practice of Medicine, 24th ed.",
  section: "Diabetes mellitus: diabetic ketoacidosis",
  year: 2023,
};
const jbds = (section: string): Citation => ({ ...JBDS, section });
const ada = (section: string): Citation => ({ ...ADA, section });

// Condition helpers (produce plain JSON).
const given = (drug: string): Condition => ({ fact: `${drug}.given`, op: "==", value: true });
const notGiven = (drug: string): Condition => ({ not: given(drug) });
const band = (drug: string, bands: Band[]): Condition => ({ fact: `${drug}.band`, op: "in", value: bands });
const f = (fact: string, op: "<" | "<=" | ">" | ">=" | "==", value: number | boolean): Condition => ({ fact, op, value });
const all = (...c: Condition[]): Condition => ({ all: c });
const any = (...c: Condition[]): Condition => ({ any: c });
const OK: Band[] = ["therapeutic", "high"];
const fluids = any(band("nacl", ["therapeutic", "high"]), band("hartmann", ["therapeutic", "high"]));

// ---------- States ----------

const T0: PatientState = {
  id: "T0",
  checkpoint: "T0",
  facts: { glucose: 34, ph: 7.08, hco3: 8, k: 4.6, na: 131, creat: 1.6, ketones: 6.2 },
  vitals: { hr: 124, sbp: 96, dbp: 60, rr: 30, spo2: 98, gcs: 13, temp: 37.2, grbs: "HI" },
  results: {
    grbs: { value: "HI (>33.3 mmol/L)", abnormal: true },
    vbg: { value: "pH 7.08 · HCO3 8 · lactate 2.1", abnormal: true },
    k_vbg: { value: "4.6 mmol/L" },
    ketones_blood: { value: "6.2 mmol/L", abnormal: true },
    urine_ketones: { value: "+++", abnormal: true },
    ecg: { value: "Sinus tachycardia 124/min. Normal T waves." },
    preg: { value: "Urine β-hCG negative" },
    lytes: { value: "Na 131 · K 4.7 · Urea 58 mg/dL · Creat 1.6 mg/dL", abnormal: true },
    cbc: { value: "WBC 13.8 · Hb 13.1 · Plt 310" },
    crp: { value: "CRP 6 mg/L" },
    amylase: { value: "Amylase 92 U/L" },
    culture: { value: "No growth at 48 h" },
    cxr: { value: "Lung fields clear" },
    urine_re: { value: "Glucose +++, ketones +++, no pus cells" },
  },
  nurseNote: {
    who: "Staff Nurse Shirin",
    time: "02:12",
    text: "Drowsy but answers to name. Vomited twice in ER. Husband says she ran out of insulin.",
    highlight: "ran out of insulin",
  },
};

function s6(id: string, facts: PatientState["facts"], vitals: PatientState["vitals"], note: PatientState["nurseNote"], event?: string): PatientState {
  const r = labsFrom(facts);
  return { id, checkpoint: "6h", facts, vitals, results: r, nurseNote: note, event };
}

function labsFrom(fx: PatientState["facts"]): PatientState["results"] {
  const g = fx.glucose as number;
  const k = fx.k as number;
  const ph = fx.ph as number;
  return {
    grbs: { value: g > 33.3 ? "HI (>33.3 mmol/L)" : `${g} mmol/L`, abnormal: g > 11 || g < 4 },
    vbg: { value: `pH ${ph.toFixed(2)} · HCO3 ${fx.hco3}`, abnormal: ph < 7.3 },
    k_vbg: { value: `${k} mmol/L`, abnormal: k < 3.5 || k > 5.5 },
    ketones_blood: { value: `${fx.ketones} mmol/L`, abnormal: (fx.ketones as number) >= 0.6 },
    urine_ketones: { value: (fx.ketones as number) > 3 ? "+++" : (fx.ketones as number) > 1 ? "+" : "trace", abnormal: (fx.ketones as number) > 1 },
    ecg: { value: k < 3.3 ? "Sinus tachycardia. Flat T waves, U waves." : "Sinus rhythm. Normal T waves.", abnormal: k < 3.3 },
    preg: { value: "Urine β-hCG negative" },
    lytes: { value: `Na ${fx.na} · K ${k} · Creat ${fx.creat} mg/dL`, abnormal: k < 3.5 || (fx.creat as number) > 1.2 },
    cbc: { value: "WBC 11.2 · Hb 12.4 · Plt 296" },
    crp: { value: "CRP 6 mg/L" },
    amylase: { value: "Amylase 88 U/L" },
    culture: { value: "No growth at 48 h" },
    cxr: { value: "Lung fields clear" },
    urine_re: { value: "Glucose ++, ketones +, no pus cells" },
  };
}

const states: Record<string, PatientState> = {
  T0,
  // ---- 6 hours ----
  S6_good: s6(
    "S6_good",
    { glucose: 13.5, ph: 7.24, hco3: 13, k: 4.1, na: 136, creat: 1.3, ketones: 2.8, resolved: false },
    { hr: 102, sbp: 112, dbp: 70, rr: 22, spo2: 98, gcs: 15, grbs: 13.5 },
    { who: "Night nurse handover", time: "08:15", text: "Feeling better, talking. Urine 450 mL since admission. Asked for water.", highlight: "Urine 450 mL since admission." },
  ),
  S6_lowK: s6(
    "S6_lowK",
    { glucose: 13.5, ph: 7.23, hco3: 13, k: 3.3, na: 136, creat: 1.3, ketones: 2.9, resolved: false },
    { hr: 104, sbp: 112, dbp: 70, rr: 22, spo2: 98, gcs: 15, grbs: 13.5 },
    { who: "Night nurse handover", time: "08:15", text: "Feeling better, talking. Urine 400 mL since admission. Says her legs feel heavy.", highlight: "legs feel heavy" },
  ),
  S6_dry: s6(
    "S6_dry",
    { glucose: 19, ph: 7.14, hco3: 10, k: 3.9, na: 134, creat: 1.9, ketones: 4.1, resolved: false },
    { hr: 118, sbp: 92, dbp: 58, rr: 26, spo2: 98, gcs: 14, grbs: 19 },
    { who: "Night nurse handover", time: "08:15", text: "Still drowsy. Only 60 mL urine since admission. Lips dry.", highlight: "Only 60 mL urine" },
    "Still dry, poor urine",
  ),
  S6_ketotic: s6(
    "S6_ketotic",
    { glucose: 28, ph: 7.06, hco3: 7, k: 4.9, na: 132, creat: 1.6, ketones: 5.9, resolved: false },
    { hr: 120, sbp: 100, dbp: 62, rr: 30, spo2: 98, gcs: 13, grbs: 28 },
    { who: "Night nurse handover", time: "08:15", text: "No better. Vomited twice more. Breathing still deep and fast.", highlight: "No better." },
    "Acidosis not improving",
  ),
  S6_fast: s6(
    "S6_fast",
    { glucose: 6.4, ph: 7.2, hco3: 12, k: 3.4, na: 137, creat: 1.3, ketones: 3.0, resolved: false },
    { hr: 108, sbp: 110, dbp: 70, rr: 22, spo2: 98, gcs: 15, grbs: 6.4 },
    { who: "Night nurse handover", time: "08:15", text: "Sweaty and shaky at 07:30. Sugar dropping fast on the chart.", highlight: "Sugar dropping fast" },
    "Glucose fell too fast",
  ),
  S6_slow: s6(
    "S6_slow",
    { glucose: 20, ph: 7.15, hco3: 10, k: 4.0, na: 134, creat: 1.5, ketones: 4.0, resolved: false },
    { hr: 112, sbp: 104, dbp: 66, rr: 26, spo2: 98, gcs: 14, grbs: 20 },
    { who: "Night nurse handover", time: "08:15", text: "A little more alert. Urine 200 mL since admission.", highlight: "A little more alert." },
  ),
  // ---- Day 2 ----
  D2_good: {
    id: "D2_good",
    checkpoint: "D2",
    facts: { glucose: 8.4, ph: 7.36, hco3: 20, k: 4.2, na: 138, creat: 1.0, ketones: 0.4, resolved: true },
    vitals: { hr: 86, sbp: 118, dbp: 76, rr: 16, spo2: 99, gcs: 15, grbs: 8.4 },
    results: {},
    nurseNote: { who: "Staff Nurse Shirin", time: "07:40", text: "Eating breakfast. No complaints. Asking when she can go home.", highlight: "Asking when she can go home." },
  },
  D2_hypoK: {
    id: "D2_hypoK",
    checkpoint: "D2",
    facts: { glucose: 9.8, ph: 7.31, hco3: 17, k: 3.1, na: 137, creat: 1.1, ketones: 0.8, resolved: false, hypok: true },
    vitals: { hr: 118, sbp: 110, dbp: 72, rr: 18, spo2: 98, gcs: 15, grbs: 9.8 },
    results: {},
    nurseNote: { who: "Staff Nurse Shirin", time: "07:40", text: "Complaining of palpitations and leg weakness. ECG done: flat T waves, U waves.", highlight: "palpitations and leg weakness." },
    event: "Palpitations, U waves",
  },
  D2_hypo: {
    id: "D2_hypo",
    checkpoint: "D2",
    facts: { glucose: 2.9, ph: 7.29, hco3: 16, k: 3.8, na: 138, creat: 1.1, ketones: 1.1, resolved: false, hypo: true },
    vitals: { hr: 112, sbp: 116, dbp: 74, rr: 18, spo2: 98, gcs: 13, grbs: 2.9 },
    results: {},
    nurseNote: { who: "Staff Nurse Shirin", time: "05:10", text: "Found sweaty and confused at 05:00, GRBS 2.9. Gave 10% glucose as per hypo protocol.", highlight: "sweaty and confused" },
    event: "Hypoglycaemia overnight",
  },
  D2_rebound: {
    id: "D2_rebound",
    checkpoint: "D2",
    facts: { glucose: 22, ph: 7.18, hco3: 11, k: 4.5, na: 135, creat: 1.3, ketones: 3.6, resolved: false, rebound: true },
    vitals: { hr: 114, sbp: 106, dbp: 66, rr: 26, spo2: 98, gcs: 14, grbs: 22 },
    results: {},
    nurseNote: { who: "Staff Nurse Shirin", time: "07:40", text: "Vomiting again since midnight. Breathing fast. Drip was taken down yesterday.", highlight: "Vomiting again" },
    event: "Ketoacidosis came back",
  },
  D2_slow: {
    id: "D2_slow",
    checkpoint: "D2",
    facts: { glucose: 11, ph: 7.28, hco3: 15, k: 3.8, na: 137, creat: 1.2, ketones: 1.2, resolved: false },
    vitals: { hr: 98, sbp: 112, dbp: 72, rr: 20, spo2: 98, gcs: 15, grbs: 11 },
    results: {},
    nurseNote: { who: "Staff Nurse Shirin", time: "07:40", text: "Sitting up. Took some tea. Still a bit nauseated.", highlight: "Still a bit nauseated." },
  },
  D2_icu: {
    id: "D2_icu",
    checkpoint: "D2",
    facts: { glucose: 30, ph: 6.98, hco3: 5, k: 5.2, na: 131, creat: 2.4, ketones: 6.8, resolved: false },
    vitals: { hr: 134, sbp: 84, dbp: 50, rr: 34, spo2: 95, gcs: 10, grbs: "HI" },
    results: {},
    nurseNote: { who: "Duty doctor", time: "03:00", text: "GCS dropped to 10, BP 84/50. ICU team called and accepted transfer.", highlight: "ICU team called" },
    outcome: "icu",
    outcomeNote: "Severe DKA progressed without adequate insulin and fluids.",
    event: "Transferred to ICU",
  },
  // ---- Day 5 ----
  D5_recovered: {
    id: "D5_recovered",
    checkpoint: "D5",
    facts: { glucose: 7.2, ph: 7.39, hco3: 24, k: 4.3, na: 139, creat: 0.9, ketones: 0.1, resolved: true },
    vitals: { hr: 78, sbp: 120, dbp: 78, rr: 14, spo2: 99, gcs: 15, grbs: 7.2 },
    results: {},
    nurseNote: { who: "Staff Nurse Shirin", time: "10:00", text: "Doing her own insulin with the diabetes educator. Ready for discharge.", highlight: "Ready for discharge." },
    outcome: "recovered",
  },
  D5_complication: {
    id: "D5_complication",
    checkpoint: "D5",
    facts: { glucose: 7.8, ph: 7.38, hco3: 23, k: 4.0, na: 139, creat: 0.9, ketones: 0.2, resolved: true },
    vitals: { hr: 82, sbp: 118, dbp: 76, rr: 14, spo2: 99, gcs: 15, grbs: 7.8 },
    results: {},
    nurseNote: { who: "Staff Nurse Shirin", time: "10:00", text: "Well now. Stayed an extra day for monitoring after the problem on day 2.", highlight: "extra day for monitoring" },
    outcome: "complication",
  },
  D5_relapse: {
    id: "D5_relapse",
    checkpoint: "D5",
    facts: { glucose: 9.0, ph: 7.35, hco3: 21, k: 4.1, na: 138, creat: 1.0, ketones: 0.3, resolved: true },
    vitals: { hr: 84, sbp: 116, dbp: 74, rr: 15, spo2: 99, gcs: 15, grbs: 9.0 },
    results: {},
    nurseNote: { who: "Staff Nurse Shirin", time: "10:00", text: "Restarted on the drip on day 3 after ketones came back. Settled now.", highlight: "ketones came back" },
    outcome: "complication",
  },
  D5_icu: {
    id: "D5_icu",
    checkpoint: "D5",
    facts: { glucose: 8.0, ph: 7.33, hco3: 19, k: 2.7, na: 137, creat: 1.0, ketones: 0.4, resolved: false },
    vitals: { hr: 140, sbp: 96, dbp: 60, rr: 20, spo2: 97, gcs: 15, grbs: 8.0 },
    results: {},
    nurseNote: { who: "Duty doctor", time: "02:30", text: "Runs of ventricular tachycardia on the monitor. K+ 2.7. Moved to CCU.", highlight: "ventricular tachycardia" },
    outcome: "icu",
  },
  // ---- Harm states (reached from any checkpoint, end the case) ----
  H_arrest: {
    id: "H_arrest",
    checkpoint: "harm",
    facts: { glucose: 20, ph: 7.1, hco3: 9, k: 8.9, na: 134, creat: 1.6, ketones: 5.0 },
    vitals: { hr: 0, sbp: 0, dbp: 0, rr: 0, spo2: 0, gcs: 3 },
    results: {},
    nurseNote: { who: "Staff Nurse Shirin", time: "—", text: "Arrested within minutes of the potassium injection. CPR for 40 minutes. Not revived.", highlight: "Arrested within minutes" },
    outcome: "died",
    outcomeNote: "Undiluted potassium given as an IV push.",
    event: "Cardiac arrest",
  },
  H_hypo: {
    id: "H_hypo",
    checkpoint: "harm",
    facts: { glucose: 1.4, ph: 7.18, hco3: 11, k: 2.6, na: 136, creat: 1.4, ketones: 3.0 },
    vitals: { hr: 128, sbp: 104, dbp: 64, rr: 24, spo2: 96, gcs: 8, grbs: 1.4 },
    results: {},
    nurseNote: { who: "Staff Nurse Shirin", time: "—", text: "Seizure. GRBS 1.4, K+ 2.6. ICU called.", highlight: "Seizure." },
    outcome: "icu",
    outcomeNote: "A dose in the dangerous range was given after the nurse questioned it.",
    event: "Severe hypoglycaemia, seizure",
  },
  H_overload: {
    id: "H_overload",
    checkpoint: "harm",
    facts: { glucose: 18, ph: 7.16, hco3: 10, k: 3.8, na: 129, creat: 1.4, ketones: 3.8 },
    vitals: { hr: 126, sbp: 150, dbp: 92, rr: 34, spo2: 86, gcs: 12, grbs: 18 },
    results: {},
    nurseNote: { who: "Staff Nurse Shirin", time: "—", text: "Short of breath, frothy sputum, crackles to mid-zones. SpO2 86% on air. ICU called.", highlight: "SpO2 86% on air" },
    outcome: "icu",
    outcomeNote: "IV fluid was run at a dangerous rate after the nurse questioned it.",
    event: "Pulmonary oedema",
  },
  H_adverse: {
    id: "H_adverse",
    checkpoint: "harm",
    facts: { glucose: 22, ph: 7.12, hco3: 9, k: 4.2, na: 133, creat: 1.8, ketones: 4.5 },
    vitals: { hr: 132, sbp: 88, dbp: 52, rr: 28, spo2: 93, gcs: 12, grbs: 22 },
    results: {},
    nurseNote: { who: "Duty doctor", time: "—", text: "Serious reaction after the high dose. BP falling. ICU review.", highlight: "Serious reaction" },
    outcome: "icu",
    outcomeNote: "A drug was given in the dangerous range after the nurse questioned it.",
    event: "Serious adverse drug reaction",
  },
  H_shock: {
    id: "H_shock",
    checkpoint: "harm",
    facts: { glucose: 31, ph: 7.02, hco3: 6, k: 5.1, na: 133, creat: 2.8, ketones: 6.0 },
    vitals: { hr: 140, sbp: 78, dbp: 44, rr: 32, spo2: 96, gcs: 11, grbs: "HI" },
    results: {},
    nurseNote: { who: "Duty doctor", time: "—", text: "BP 78/44 after the diuretic, no urine for 3 hours. ICU transfer.", highlight: "no urine for 3 hours" },
    outcome: "icu",
    outcomeNote: "A loop diuretic was given to a volume-depleted patient.",
    event: "Shock and AKI",
  },
};

// Day 2/5 states share lab text generated from their facts.
for (const s of Object.values(states)) if (Object.keys(s.results).length === 0) s.results = labsFrom(s.facts);

const route = (id: string, label: string, unit: string, bands: [Band, number, number][], perKg = false) => ({
  id,
  label,
  unit,
  perKg,
  bands: bands.map(([b, min, max]) => ({ band: b, min, max })),
});

export const dkaSevere: CaseDef = {
  id: "dka-severe",
  version: 1,
  level: "fcps1",
  diagnosisLabel: "Diabetic ketoacidosis, severe",
  sex: "F",
  age: 34,
  weightKg: 52,
  allergy: "none",
  ward: "Medicine Ward B",
  bed: "12",
  estMinutes: 25,
  complaint: "Vomiting since yesterday, drowsy, breathing fast",
  history:
    "{first} has had type 1 diabetes since age 19. She ran out of insulin 4 days ago and could not buy more. Vomiting since yesterday evening with central abdominal pain; drowsy since this afternoon. No fever, cough or urinary symptoms. Brought in by her husband at 02:10.",
  exam:
    "Drowsy, GCS 13. Dry tongue, sunken eyes. Deep sighing respiration, ketotic breath. Abdomen soft, mild diffuse tenderness, no guarding. Chest clear.",
  source: { label: "Composite teaching case based on open-access DKA case reports", license: "CC-BY 4.0" },
  authors: ["Pilot author (pending clinician)"],
  reviewers: ["Pilot reviewer (pending clinician)"],
  investigations: [
    { id: "grbs", name: "GRBS (capillary glucose)", kind: "bedside" },
    { id: "vbg", name: "Venous blood gas", kind: "bedside" },
    { id: "k_vbg", name: "Serum K+ (on VBG)", kind: "bedside" },
    { id: "ketones_blood", name: "Blood ketones (bedside meter)", kind: "bedside" },
    { id: "urine_ketones", name: "Urine dipstick ketones", kind: "bedside" },
    { id: "ecg", name: "ECG", kind: "bedside" },
    { id: "preg", name: "Urine pregnancy test", kind: "bedside" },
    { id: "lytes", name: "Serum electrolytes, urea, creatinine", kind: "lab" },
    { id: "cbc", name: "CBC", kind: "lab" },
    { id: "crp", name: "CRP", kind: "lab" },
    { id: "amylase", name: "Serum amylase", kind: "lab" },
    { id: "culture", name: "Blood culture", kind: "lab" },
    { id: "cxr", name: "Chest X-ray", kind: "lab" },
    { id: "urine_re", name: "Urine R/E", kind: "lab" },
  ],
  essentialInvestigations: ["grbs", "vbg", "k_vbg", "ketones_blood", "ecg", "lytes"],
  investigationBudget: 10,
  diagnoses: {
    options: [
      { id: "dka_severe", label: "Diabetic ketoacidosis, severe" },
      { id: "dka_mild", label: "Diabetic ketoacidosis, mild/moderate" },
      { id: "hhs", label: "Hyperosmolar hyperglycaemic state" },
      { id: "pancreatitis", label: "Acute pancreatitis" },
      { id: "sepsis", label: "Sepsis with metabolic acidosis" },
      { id: "gastro", label: "Acute gastroenteritis with dehydration" },
    ],
    correct: ["dka_severe"],
    acceptable: ["dka_mild"],
  },
  drugs: [
    {
      id: "nacl",
      short: "NaCl 0.9%",
      name: "Sodium chloride 0.9%",
      brands: ["Normal saline"],
      classTags: ["crystalloid"],
      kind: "fluid",
      routes: [route("iv", "IV", "mL/h", [["low", 1, 249], ["therapeutic", 250, 1000], ["high", 1001, 2000]])],
    },
    {
      id: "hartmann",
      short: "Hartmann's",
      name: "Hartmann's solution",
      brands: ["Ringer's lactate"],
      classTags: ["crystalloid"],
      kind: "fluid",
      routes: [route("iv", "IV", "mL/h", [["low", 1, 249], ["therapeutic", 250, 1000], ["high", 1001, 2000]])],
    },
    {
      id: "dex10",
      short: "Glucose 10%",
      name: "Glucose 10%",
      brands: ["Dextrose 10%"],
      classTags: ["glucose"],
      kind: "fluid",
      routes: [route("iv", "IV", "mL/h", [["low", 1, 74], ["therapeutic", 75, 150], ["high", 151, 300]])],
    },
    {
      id: "insulin",
      short: "Insulin",
      name: "Insulin, soluble (regular)",
      brands: ["Insulin Regular", "Actrapid", "Insulin R"],
      classTags: ["insulin"],
      routes: [
        route("iv_infusion", "IV infusion", "U/h", [["low", 0.001, 0.049], ["therapeutic", 0.05, 0.149], ["high", 0.15, 0.3]], true),
        route("iv_bolus", "IV bolus", "U", [["high", 0.1, 10]]),
        route("sc", "SC", "U", [["low", 0.1, 3], ["therapeutic", 3.1, 20], ["high", 20.1, 40]]),
      ],
    },
    {
      id: "glargine",
      short: "Glargine",
      name: "Insulin glargine (long-acting)",
      brands: ["Lantus", "Glarine", "Basalog"],
      classTags: ["insulin", "basal-insulin"],
      routes: [route("sc", "SC once daily", "U", [["low", 0.1, 3.9], ["therapeutic", 4, 30], ["high", 30.1, 50]])],
    },
    {
      id: "kcl",
      short: "KCl",
      name: "Potassium chloride",
      brands: ["KCl 15%"],
      classTags: ["potassium"],
      routes: [route("in_fluid", "added to each litre of IV fluid", "mmol/L", [["low", 1, 19], ["therapeutic", 20, 40], ["high", 41, 60]])],
      dangerousRoutes: [{ id: "iv_push", label: "IV push (undiluted)" }],
    },
    {
      id: "bicarb",
      short: "NaHCO3",
      name: "Sodium bicarbonate 8.4%",
      classTags: ["alkali"],
      routes: [route("iv", "IV", "mmol", [["low", 1, 49], ["therapeutic", 50, 100], ["high", 101, 150]])],
    },
    {
      id: "ceftriaxone",
      short: "Ceftriaxone",
      name: "Ceftriaxone",
      brands: ["Ceftron", "Traxon", "Oricef"],
      classTags: ["antibiotic", "cephalosporin"],
      routes: [route("iv", "IV", "mg", [["low", 1, 499], ["therapeutic", 500, 2000], ["high", 2001, 4000]])],
    },
    {
      id: "ondansetron",
      short: "Ondansetron",
      name: "Ondansetron",
      brands: ["Emistat", "Onaseron"],
      classTags: ["antiemetic"],
      routes: [route("iv", "IV", "mg", [["low", 0.1, 1.9], ["therapeutic", 2, 8], ["high", 8.1, 16]])],
    },
    {
      id: "furosemide",
      short: "Furosemide",
      name: "Furosemide",
      brands: ["Lasix", "Frusin"],
      classTags: ["loop-diuretic"],
      routes: [route("iv", "IV", "mg", [["low", 1, 9], ["therapeutic", 10, 80], ["high", 81, 160]])],
    },
    { id: "mon_grbs", name: "Hourly capillary glucose", classTags: [], kind: "monitoring", routes: [route("order", "order", "", [["therapeutic", 1, 1]])] },
    { id: "mon_vbg", name: "2-hourly VBG with K+, then 4-hourly", classTags: [], kind: "monitoring", routes: [route("order", "order", "", [["therapeutic", 1, 1]])] },
    { id: "mon_ketones", name: "Hourly blood ketones", classTags: [], kind: "monitoring", routes: [route("order", "order", "", [["therapeutic", 1, 1]])] },
    { id: "mon_io", name: "Strict input/output chart", classTags: [], kind: "monitoring", routes: [route("order", "order", "", [["therapeutic", 1, 1]])] },
    { id: "mon_cardiac", name: "Cardiac monitor", classTags: [], kind: "monitoring", routes: [route("order", "order", "", [["therapeutic", 1, 1]])] },
  ],
  caseHarmList: [
    {
      id: "case-loop-diuretic",
      classTag: "loop-diuretic",
      state: "H_shock",
      reason: "She is severely volume depleted. A diuretic worsens shock and kidney injury.",
      cite: [jbds("Fluid replacement"), DAV],
    },
  ],
  globalHarmStates: {
    "global-kcl-push": "H_arrest",
    "global-dangerous-dose": "H_adverse",
  },
  dangerousDoseStates: {
    insulin: "H_hypo",
    glargine: "H_hypo",
    nacl: "H_overload",
    hartmann: "H_overload",
    dex10: "H_overload",
    kcl: "H_arrest",
  },
  checkpoints: ["T0", "6h", "D2", "D5"],
  initialState: "T0",
  states,
  transitions: [
    {
      from: "T0",
      to: "6h",
      clock: "02:29 → 08:29",
      headline: "6 hours later",
      scene: "Ward round. Night nurse handing over.",
      defaultState: "S6_slow",
      rules: [
        { id: "t0-no-insulin", priority: 1, kind: "response", when: { not: band("insulin@iv_infusion", OK) }, then: "S6_ketotic", note: "No effective IV insulin" },
        { id: "t0-dry", priority: 2, kind: "response", when: { not: fluids }, then: "S6_dry", note: "Insulin without enough fluid" },
        { id: "t0-too-fast", priority: 3, kind: "response", when: band("insulin@iv_infusion", ["high"]), then: "S6_fast", note: "Insulin rate too high" },
        { id: "t0-bicarb-lowk", priority: 4, kind: "response", when: all(given("bicarb"), { not: band("kcl", OK) }), then: "S6_lowK" },
        { id: "t0-no-kcl", priority: 5, kind: "response", when: { not: band("kcl", OK) }, then: "S6_lowK", note: "Insulin and fluid, no potassium" },
        { id: "t0-good", priority: 6, kind: "response", when: all(band("insulin@iv_infusion", ["therapeutic"]), fluids, band("kcl", OK)), then: "S6_good" },
      ],
    },
    {
      from: "6h",
      to: "D2",
      clock: "08:29 → 07:40 next day",
      headline: "Next morning",
      scene: "Day 2. Morning round.",
      defaultState: "D2_slow",
      rules: [
        { id: "6h-icu", priority: 1, kind: "response", when: all(f("ph", "<", 7.1), { not: band("insulin@iv_infusion", OK) }), then: "D2_icu" },
        { id: "6h-stop-insulin", priority: 2, kind: "response", when: all(f("ph", "<", 7.3), { not: band("insulin@iv_infusion", OK) }), then: "D2_rebound" },
        { id: "6h-hypok", priority: 3, kind: "response", when: all(given("insulin"), f("k", "<", 4.5), { not: band("kcl", OK) }), then: "D2_hypoK" },
        { id: "6h-hypo", priority: 4, kind: "response", when: all(f("glucose", "<", 14), given("insulin"), notGiven("dex10")), then: "D2_hypo" },
        { id: "6h-good", priority: 5, kind: "response", when: all(band("insulin@iv_infusion", OK), f("ph", ">=", 7.2)), then: "D2_good" },
      ],
    },
    {
      from: "D2",
      to: "D5",
      clock: "Day 2 → Day 5",
      headline: "Three days later",
      scene: "Day 5. Discharge round.",
      defaultState: "D5_complication",
      rules: [
        { id: "d2-hypok-untreated", priority: 1, kind: "response", when: all(f("hypok", "==", true), { not: band("kcl", OK) }), then: "D5_icu" },
        { id: "d2-hypok-treated", priority: 2, kind: "response", when: f("hypok", "==", true), then: "D5_complication" },
        { id: "d2-hypo", priority: 3, kind: "response", when: f("hypo", "==", true), then: "D5_complication" },
        { id: "d2-rebound", priority: 4, kind: "response", when: f("rebound", "==", true), then: "D5_relapse" },
        { id: "d2-no-cover", priority: 5, kind: "response", when: all(f("resolved", "==", true), notGiven("glargine"), { not: given("insulin@sc") }, { not: band("insulin@iv_infusion", OK) }), then: "D5_relapse" },
        { id: "d2-good", priority: 6, kind: "response", when: all(f("resolved", "==", true), given("glargine")), then: "D5_recovered" },
        { id: "d2-slow-ok", priority: 7, kind: "response", when: all(band("insulin@iv_infusion", OK), band("kcl", OK)), then: "D5_recovered" },
      ],
    },
  ],
  stability: all(f("ph", ">=", 7.3), f("hco3", ">=", 15)),
  debrief: [
    // ---- T0 ----
    { id: "fluid-good", checkpoint: "T0", when: fluids, verdict: "good", about: "nacl", category: "management", points: 3, text: "Fluid first. A litre of 0.9% saline in the first hour restores circulating volume, then slower bags.", cite: [jbds("Fluid replacement"), DAV] },
    { id: "fluid-miss", checkpoint: "T0", when: { not: fluids }, verdict: "miss", about: "nacl", category: "management", points: 0, penalty: 3, text: "Not enough fluid. She is around 6 L down; insulin without volume replacement keeps her shocked and the kidneys dry.", cite: [jbds("Fluid replacement"), ada("Fluid therapy")] },
    { id: "insulin-good", checkpoint: "T0", when: band("insulin@iv_infusion", ["therapeutic"]), verdict: "good", about: "insulin", category: "management", points: 3, text: "Fixed-rate IV insulin at about 0.1 U/kg/h, no bolus needed.", cite: [jbds("Fixed-rate IV insulin infusion"), ada("Insulin therapy")] },
    { id: "insulin-high", checkpoint: "T0", when: band("insulin@iv_infusion", ["high"]), verdict: "miss", about: "insulin", category: "management", points: 0, text: "Rate too high. Glucose and potassium fall too fast; 0.1 U/kg/h is enough.", cite: [jbds("Fixed-rate IV insulin infusion")] },
    { id: "insulin-bolus", checkpoint: "T0", when: given("insulin@iv_bolus"), verdict: "miss", about: "insulin", category: "management", points: 0, text: "An IV insulin bolus is not needed when a fixed-rate infusion is started promptly.", cite: [jbds("Fixed-rate IV insulin infusion"), ada("Insulin therapy")] },
    { id: "insulin-sc-only", checkpoint: "T0", when: all(given("insulin@sc"), { not: band("insulin@iv_infusion", OK) }), verdict: "miss", about: "insulin", category: "management", points: 0, penalty: 3, text: "Subcutaneous insulin alone is not reliable in severe DKA with poor perfusion. Use an IV infusion.", cite: [ada("Insulin therapy"), DAV] },
    { id: "kcl-good", checkpoint: "T0", when: band("kcl", OK), verdict: "good", about: "kcl", category: "management", points: 3, text: "Potassium added. K+ 4.6 is in the 3.5 to 5.5 range, so add 40 mmol/L to each litre once urine is flowing.", cite: [jbds("Potassium replacement"), ada("Potassium")] },
    { id: "kcl-miss", checkpoint: "T0", when: { not: band("kcl", OK) }, verdict: "miss", about: "kcl", category: "management", points: 0, penalty: 3, text: "No potassium. K+ 4.6 looks normal but total body potassium is low; insulin drives it into cells and it falls within hours.", cite: [jbds("Potassium replacement"), ada("Potassium"), DAV] },
    { id: "glargine-good", checkpoint: "T0", when: given("glargine"), verdict: "good", about: "glargine", category: "management", points: 1, text: "Continuing long-acting insulin alongside the infusion prevents rebound when the drip stops.", cite: [jbds("Long-acting insulin")] },
    { id: "bicarb-miss", checkpoint: "T0", when: given("bicarb"), verdict: "miss", about: "bicarb", category: "management", points: 0, text: "Bicarbonate is not recommended at pH 7.08. It worsens hypokalaemia and gives no proven benefit above pH 7.0.", cite: [ada("Bicarbonate"), jbds("Bicarbonate")] },
    { id: "abx-miss", checkpoint: "T0", when: given("ceftriaxone"), verdict: "miss", about: "ceftriaxone", category: "management", points: 0, text: "No evidence of infection here (CRP 6, clear chest, clean urine). The trigger was missed insulin.", cite: [jbds("Precipitating causes")] },
    { id: "mon-good", checkpoint: "T0", when: all(given("mon_grbs"), given("mon_vbg")), verdict: "good", about: "general", category: "monitoring", points: 4, text: "Hourly glucose and regular VBG with K+ are the minimum for safe titration.", cite: [jbds("Monitoring")] },
    { id: "mon-miss", checkpoint: "T0", when: { not: all(given("mon_grbs"), given("mon_vbg")) }, verdict: "miss", about: "general", category: "monitoring", points: 0, text: "Without hourly glucose and regular K+ checks, a falling potassium or glucose is found late.", cite: [jbds("Monitoring")] },
    { id: "diuretic-harm", checkpoint: "T0", when: given("furosemide"), verdict: "miss", about: "furosemide", category: "safety", points: 0, text: "Never give a diuretic to a volume-depleted DKA patient.", cite: [jbds("Fluid replacement")] },
    // ---- 6h ----
    { id: "dex-good", checkpoint: "6h", when: all(f("glucose", "<", 14), given("dex10")), verdict: "good", about: "dex10", category: "monitoring", points: 3, text: "Glucose under 14: 10% glucose added alongside saline so insulin can keep clearing ketones.", cite: [jbds("Glucose below 14 mmol/L")] },
    { id: "dex-miss", checkpoint: "6h", when: all(f("glucose", "<", 14), notGiven("dex10")), verdict: "miss", about: "dex10", category: "monitoring", points: 0, text: "Glucose was under 14 mmol/L. Without 10% glucose, continued insulin causes hypoglycaemia.", cite: [jbds("Glucose below 14 mmol/L"), ada("Insulin therapy")] },
    { id: "k6-good", checkpoint: "6h", when: band("kcl", OK), verdict: "good", about: "kcl", category: "monitoring", points: 2, text: "Potassium continued while insulin runs.", cite: [jbds("Potassium replacement")] },
    { id: "k6-miss", checkpoint: "6h", when: all(f("k", "<", 4.5), { not: band("kcl", OK) }), verdict: "miss", about: "kcl", category: "monitoring", points: 0, penalty: 2, text: "K+ was falling and no potassium was running. This is what caused the arrhythmia risk on day 2.", cite: [jbds("Potassium replacement"), DAV] },
    { id: "stop-early", checkpoint: "6h", when: all(f("ph", "<", 7.3), { not: band("insulin@iv_infusion", OK) }), verdict: "miss", about: "insulin", category: "monitoring", points: 0, text: "The infusion was stopped before DKA resolved (ketones under 0.6 and pH over 7.3).", cite: [jbds("Resolution of DKA")] },
    // ---- D2 ----
    { id: "switch-good", checkpoint: "D2", when: all(f("resolved", "==", true), given("glargine"), given("insulin@sc")), verdict: "good", about: "insulin", category: "monitoring", points: 3, text: "DKA resolved and eating: back to SC basal-bolus. Stop the drip 30 to 60 minutes after the first SC mealtime dose.", cite: [jbds("Converting to subcutaneous insulin")] },
    { id: "switch-miss", checkpoint: "D2", when: all(f("resolved", "==", true), { not: given("insulin@sc") }, { not: band("insulin@iv_infusion", OK) }), verdict: "miss", about: "insulin", category: "monitoring", points: 0, text: "IV insulin was stopped without SC cover, so ketosis returned.", cite: [jbds("Converting to subcutaneous insulin")] },
    { id: "hypok-treat", checkpoint: "D2", when: all(f("hypok", "==", true), band("kcl", OK)), verdict: "good", about: "kcl", category: "monitoring", points: 2, text: "Hypokalaemia recognised and potassium replaced with cardiac monitoring.", cite: [jbds("Potassium replacement")] },
    { id: "hypok-missed", checkpoint: "D2", when: all(f("hypok", "==", true), { not: band("kcl", OK) }), verdict: "miss", about: "kcl", category: "monitoring", points: 0, penalty: 3, text: "K+ 3.1 with U waves and no replacement led to ventricular arrhythmia.", cite: [jbds("Potassium replacement"), DAV] },
  ],
  vivaQuestion: {
    q: "Why must potassium be replaced in DKA even when serum K+ is normal on arrival?",
    a: "Osmotic diuresis and vomiting deplete total body potassium. Acidosis and lack of insulin shift potassium out of cells, so the serum level looks normal or high. Insulin and correction of acidosis move potassium back into cells, and serum K+ falls quickly unless it is replaced.",
    cite: [jbds("Potassium replacement"), DAV],
  },
  passMark: 30,
  discharge: {
    recovered: "Discharged on basal-bolus insulin. Sick-day rules taught. Diabetes clinic in 2 weeks.",
    complication: "Discharged on basal-bolus insulin after a complication during admission. Sick-day rules taught. Diabetes clinic in 1 week.",
    icu: "Transferred to the intensive care unit.",
    died: "Died in hospital.",
  },
};
