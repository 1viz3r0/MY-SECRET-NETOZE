// Remaps admin1-meta.json keys to the ACTUAL ISO codes present in
// regions-index.json (Natural Earth 10m admin-1 codes differ from the
// idealized codes used when the meta file was first authored).
import { readFileSync, writeFileSync } from 'node:fs';

const INDEX_URL = new URL('../src/assets/geodata/regions-index.json', import.meta.url);
const META_URL = new URL('../src/assets/geodata/admin1-meta.json', import.meta.url);

const index = JSON.parse(readFileSync(INDEX_URL, 'utf8'));
const meta = JSON.parse(readFileSync(META_URL, 'utf8'));
const codes = new Set(index.map((e) => e.code).filter(Boolean));

// Curated code -> actual dataset code (resolved against the region dumps).
const REMAP = {
  // Japan prefectures (NE uses JP-01..47)
  'JP-HOK': 'JP-01', 'JP-AOM': 'JP-02', 'JP-IWT': 'JP-03', 'JP-MYG': 'JP-04',
  'JP-AKT': 'JP-05', 'JP-YGT': 'JP-06', 'JP-FKS': 'JP-07', 'JP-IBR': 'JP-08',
  'JP-TCG': 'JP-09', 'JP-GUM': 'JP-10', 'JP-SIT': 'JP-11', 'JP-CHB': 'JP-12',
  'JP-TKY': 'JP-13', 'JP-KNG': 'JP-14', 'JP-NIG': 'JP-15', 'JP-TYM': 'JP-16',
  'JP-ISK': 'JP-17', 'JP-FKI': 'JP-18', 'JP-YMN': 'JP-19', 'JP-NGN': 'JP-20',
  'JP-GIF': 'JP-21', 'JP-SZO': 'JP-22', 'JP-AIC': 'JP-23', 'JP-MIE': 'JP-24',
  'JP-SIG': 'JP-25', 'JP-KYT': 'JP-26', 'JP-OSK': 'JP-27', 'JP-HYG': 'JP-28',
  'JP-NAR': 'JP-29', 'JP-WKY': 'JP-30', 'JP-TTR': 'JP-31', 'JP-SMN': 'JP-32',
  'JP-OKY': 'JP-33', 'JP-HRS': 'JP-34', 'JP-YMC': 'JP-35', 'JP-TKS': 'JP-36',
  'JP-KGW': 'JP-37', 'JP-EHM': 'JP-38', 'JP-KCH': 'JP-39', 'JP-FKO': 'JP-40',
  'JP-SAG': 'JP-41', 'JP-NGS': 'JP-42', 'JP-KMT': 'JP-43', 'JP-OIT': 'JP-44',
  'JP-MYZ': 'JP-45', 'JP-KGS': 'JP-46', 'JP-OKN': 'JP-47',
  // UK constituent countries -> capital region in the dataset
  'GB-ENG': 'GB-LND', 'GB-SCT': 'GB-EDH', 'GB-WLS': 'GB-CRF', 'GB-NIR': 'GB-BFS',
  // Spain autonomous communities -> capital province
  'ES-AN': 'ES-SE', 'ES-AR': 'ES-Z', 'ES-AS': 'ES-O', 'ES-CB': 'ES-S',
  'ES-CM': 'ES-TO', 'ES-CL': 'ES-VA', 'ES-CT': 'ES-B', 'ES-EX': 'ES-BA',
  'ES-GA': 'ES-C', 'ES-IB': 'ES-PM', 'ES-CN': 'ES-TF', 'ES-RI': 'ES-LO',
  'ES-MD': 'ES-M', 'ES-MC': 'ES-MU', 'ES-NC': 'ES-NA', 'ES-PV': 'ES-VI',
  'ES-VC': 'ES-V',
  // South Korea provinces
  'KR-32': 'KR-42', 'KR-33': 'KR-43', 'KR-34': 'KR-44', 'KR-35': 'KR-47',
  'KR-36': 'KR-48', 'KR-37': 'KR-45', 'KR-38': 'KR-46', 'KR-39': 'KR-49',
  'KR-40': 'KR-50',
  // Italy regions -> capital province
  'IT-65': 'IT-AQ', 'IT-77': 'IT-PZ', 'IT-78': 'IT-CZ', 'IT-72': 'IT-NA',
  'IT-45': 'IT-BO', 'IT-36': 'IT-TS', 'IT-62': 'IT-RM', 'IT-42': 'IT-GE',
  'IT-25': 'IT-MI', 'IT-57': 'IT-AN', 'IT-67': 'IT-CB', 'IT-21': 'IT-TO',
  'IT-75': 'IT-BA', 'IT-88': 'IT-CA', 'IT-82': 'IT-PA', 'IT-52': 'IT-FI',
  'IT-32': 'IT-TN', 'IT-55': 'IT-PG', 'IT-23': 'IT-AO', 'IT-34': 'IT-VE',
  // Russia, Indonesia, Nigeria, Egypt, Saudi Arabia, Ukraine
  'RU-TAT': 'RU-TA',
  'ID-NTT': 'ID-NT',
  'NG-IB': 'NG-OY', 'NG-RV': 'NG-BY',
  'EG-PT': 'EG-PTS', 'EG-DMY': 'EG-DT', 'EG-MNY': 'EG-MN', 'EG-ASW': 'EG-ASN',
  'EG-JZ': 'EG-SIN', 'EG-QN': 'EG-KN',
  'SA-13': 'SA-09',
  'UA-44': 'UA-09',
  // France regions -> capital departement, overseas -> dataset codes
  'FR-ARA': 'FR-69', 'FR-BFC': 'FR-21', 'FR-BRE': 'FR-35', 'FR-CVL': 'FR-45',
  'FR-COR': 'FR-2A', 'FR-GES': 'FR-67', 'FR-HDF': 'FR-59', 'FR-IDF': 'FR-75',
  'FR-NOR': 'FR-76', 'FR-NAQ': 'FR-33', 'FR-OCC': 'FR-31', 'FR-PDL': 'FR-44',
  'FR-PAC': 'FR-13', 'FR-971': 'FR-GP', 'FR-972': 'FR-MQ', 'FR-973': 'FR-GF',
  'FR-974': 'FR-RE', 'FR-976': 'FR-YT',
};

// Entries that are wrong or unsupported by the dataset: omit entirely.
const DROP = new Set(['EG-SU']);

const out = {};
let remapped = 0;
let dropped = 0;
for (const [key, value] of Object.entries(meta)) {
  if (DROP.has(key)) {
    dropped++;
    continue;
  }
  const target = REMAP[key] ?? key;
  if (!codes.has(target)) {
    console.error(`UNRESOLVED ${key} -> ${target}`);
    process.exitCode = 1;
    continue;
  }
  if (target !== key) {
    if (out[target]) console.error(`COLLISION ${key} -> ${target}`);
    remapped++;
  }
  out[target] = value;
}
writeFileSync(META_URL, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`done: ${Object.keys(out).length} entries (remapped ${remapped}, dropped ${dropped})`);