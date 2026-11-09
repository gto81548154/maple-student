import fs from 'node:fs/promises';
import {validateToeicAnswerKeySet,requireVerifiedToeicAnswerKey} from '../../src/domain/toeicAnswerKeys.mjs';
const [file, flag] = process.argv.slice(2);
if (!file || (flag && flag !== '--draft')) { console.error('node scripts/toeic/validate-answer-keys.mjs <json> [--draft]'); process.exit(2); }
try {
 const data = JSON.parse(await fs.readFile(file, 'utf8'));
 const draft = flag === '--draft';
 const result = validateToeicAnswerKeySet(data, {requireVerified: !draft, allowIncomplete: draft});
 if (!draft && result.ok) for (const key of data.records) await requireVerifiedToeicAnswerKey(key, key.id);
 console.log(JSON.stringify({ ...result, records: data.records?.length, mode: draft ? 'draft-structure-only' : 'verified-for-grading' }, null, 2));
 if (!result.ok) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
