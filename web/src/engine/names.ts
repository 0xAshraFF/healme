// Patient names are cosmetic. They are drawn per session from many origins and never
// change clinical facts, rules or outcomes.

interface Pool {
  origin: string;
  female: string[];
  male: string[];
  family: string[];
  /** Some naming traditions use a female-specific family name. */
  familyFemale?: string[];
}

export const NAME_POOLS: Pool[] = [
  { origin: "Bengali", female: ["Rahima", "Nusrat", "Farhana", "Sumaiya", "Tahmina", "Mitu"], male: ["Tanvir", "Rafiq", "Habib", "Arif", "Sajib", "Mahbub"], family: ["Hasan", "Chowdhury", "Rahman", "Islam", "Ahmed", "Sarkar"] },
  { origin: "Bengali Hindu", female: ["Anjali", "Shampa", "Rupa", "Mousumi"], male: ["Prosenjit", "Subrata", "Dipankar", "Amit"], family: ["Das", "Roy", "Saha", "Ghosh", "Dey"] },
  { origin: "Chakma", female: ["Jharna", "Shanti", "Mithila"], male: ["Joydeb", "Bijoy", "Sudatta"], family: ["Chakma"] },
  { origin: "Marma", female: ["Mya Ching", "Ching Ma"], male: ["Aung Thowai", "Mong Sing"], family: ["Marma"] },
  { origin: "Garo", female: ["Shefali", "Lucy"], male: ["Pradip", "Thomas"], family: ["Sangma", "Marak", "Mree"] },
  { origin: "Santal", female: ["Mali", "Sumi"], male: ["Babulal", "Ravi"], family: ["Murmu", "Hembrom", "Soren"] },
  { origin: "Indian", female: ["Priya", "Lakshmi", "Kavya", "Meera"], male: ["Arjun", "Vikram", "Rohan", "Suresh"], family: ["Nair", "Iyer", "Sharma", "Reddy", "Patel"] },
  { origin: "Pakistani", female: ["Ayesha", "Hira", "Sana"], male: ["Imran", "Bilal", "Usman"], family: ["Khan", "Qureshi", "Malik"] },
  { origin: "Nepali", female: ["Sita", "Anita"], male: ["Bishal", "Ramesh"], family: ["Shrestha", "Gurung", "Thapa"] },
  { origin: "Sri Lankan", female: ["Dilani", "Nirosha"], male: ["Kasun", "Chaminda"], family: ["Perera", "Fernando", "Silva"] },
  { origin: "Rohingya", female: ["Sabekun", "Rashida"], male: ["Mohammed Ayaz", "Nur Alam"], family: ["Begum", "Ullah"] },
  { origin: "Chinese", female: ["Mei-Lin", "Xiao", "Yun"], male: ["Wei", "Jun", "Hao"], family: ["Chen", "Wang", "Li", "Zhang"] },
  { origin: "Japanese", female: ["Yuki", "Aiko", "Haruka"], male: ["Kenji", "Hiroshi", "Takeshi"], family: ["Watanabe", "Sato", "Tanaka"] },
  { origin: "Korean", female: ["Ji-woo", "Seo-yeon"], male: ["Min-jun", "Dong-hyun"], family: ["Kim", "Park", "Lee"] },
  { origin: "Filipino", female: ["Maricel", "Joy"], male: ["Jomar", "Ramon"], family: ["Santos", "Reyes", "Dela Cruz"] },
  { origin: "Vietnamese", female: ["Linh", "Thu"], male: ["Minh", "Tuan"], family: ["Nguyen", "Tran", "Pham"] },
  { origin: "Thai", female: ["Siriporn", "Nok"], male: ["Somchai", "Anan"], family: ["Srisuk", "Wongsa"] },
  { origin: "Malay / Indonesian", female: ["Siti", "Nurul", "Dewi"], male: ["Ahmad", "Budi", "Hafiz"], family: ["Abdullah", "Santoso", "Ismail"] },
  { origin: "Arab", female: ["Fatima", "Layla", "Mariam"], male: ["Omar", "Yousef", "Khalid"], family: ["Haddad", "Al-Sayed", "Nasser"] },
  { origin: "Persian", female: ["Shirin", "Nazanin"], male: ["Dariush", "Reza"], family: ["Hosseini", "Karimi"] },
  { origin: "Turkish", female: ["Elif", "Zeynep"], male: ["Emre", "Mehmet"], family: ["Yilmaz", "Demir", "Kaya"] },
  { origin: "Nigerian", female: ["Ngozi", "Funmilayo", "Chiamaka"], male: ["Chinedu", "Oluwaseun", "Emeka"], family: ["Okafor", "Adeyemi", "Okonkwo"] },
  { origin: "Ghanaian", female: ["Amara", "Akosua", "Efua"], male: ["Kwame", "Kofi", "Yaw"], family: ["Osei", "Mensah", "Boateng"] },
  { origin: "Kenyan", female: ["Wanjiru", "Achieng"], male: ["Otieno", "Kamau"], family: ["Mwangi", "Odhiambo"] },
  { origin: "Ethiopian", female: ["Tigist", "Hana"], male: ["Dawit", "Tesfaye"], family: ["Bekele", "Haile"] },
  { origin: "Somali", female: ["Hodan", "Ifrah"], male: ["Abdi", "Mohamed"], family: ["Warsame", "Farah"] },
  { origin: "English", female: ["Emily", "Sarah", "Charlotte"], male: ["James", "Thomas", "Oliver"], family: ["Smith", "Taylor", "Clarke"] },
  { origin: "French", female: ["Camille", "Chloé"], male: ["Julien", "Antoine"], family: ["Martin", "Bernard", "Dubois"] },
  { origin: "German", female: ["Anna", "Lena"], male: ["Lukas", "Felix"], family: ["Müller", "Schmidt", "Weber"] },
  { origin: "Polish", female: ["Agnieszka", "Zofia"], male: ["Tomasz", "Piotr"], family: ["Kowalski", "Nowak"], familyFemale: ["Kowalska", "Nowak"] },
  { origin: "Russian", female: ["Olga", "Natalia"], male: ["Dmitri", "Sergei"], family: ["Ivanov", "Petrov"], familyFemale: ["Ivanova", "Petrova"] },
  { origin: "Spanish", female: ["Lucía", "Carmen"], male: ["Javier", "Diego"], family: ["García", "Fernández", "López"] },
  { origin: "Brazilian", female: ["Ana Clara", "Juliana"], male: ["Rafael", "Thiago"], family: ["Silva", "Souza", "Oliveira"] },
  { origin: "Mexican", female: ["Guadalupe", "Sofía"], male: ["Alejandro", "Luis"], family: ["Hernández", "Martínez"] },
];

/** Small seeded PRNG so a session keeps the same name across reloads. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function patientName(seed: string, sex: "F" | "M", pinnedOrigin?: string) {
  const rand = mulberry32(hash(seed));
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const pool = (pinnedOrigin && NAME_POOLS.find((p) => p.origin === pinnedOrigin)) || pick(NAME_POOLS);
  const first = pick(sex === "F" ? pool.female : pool.male);
  const families = sex === "F" && pool.familyFemale ? pool.familyFemale : pool.family;
  const last = pick(families);
  return { first, last, full: `${first} ${last}`, origin: pool.origin };
}
