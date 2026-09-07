/**
 * Orchestrator: runs all five stages in sequence for all known sources,
 * or a single named stage. Stops on any error.
 *
 * Usage:
 *   tsx lib/runner.ts all               — fetch→parse→resolve→validate→publish for all sources
 *   tsx lib/runner.ts fetch             — only fetch for all sources
 *   tsx lib/runner.ts all daisycon-solmar  — all stages for one source
 */
import 'dotenv/config';
import { fetch }    from '../01-fetch.js';
import { parse }    from '../02-parse.js';
import { parseTradeTrackerProperties } from '../parse-tradetracker-properties.js';
import { resolve }  from '../03-resolve.js';
import { validate } from '../04-validate.js';
import { publish }  from '../05-publish.js';

const ALL_SOURCES = [
  'daisycon-prijsvrij',
  'daisycon-dutchflyguys',
  'tradetracker-bungalownet',
  'daisycon-solmar',
  'tradetracker-corendon',
];

// Route a source to the correct parser based on its XML format.
// Flat-field sources use 02-parse.ts; <properties><property name> sources use
// parse-tradetracker-properties.ts. Add new entries here when onboarding a feed
// with a different format rather than modifying existing parsers.
const PROPERTIES_FORMAT_SOURCES = new Set(['tradetracker-corendon']);

async function dispatchParse(sourceId: string, batchId?: number): Promise<void> {
  if (PROPERTIES_FORMAT_SOURCES.has(sourceId)) {
    await parseTradeTrackerProperties(sourceId, batchId);
  } else {
    await parse(sourceId, batchId);
  }
}

const [stage, targetSource] = process.argv.slice(2);
const sources = targetSource ? [targetSource] : ALL_SOURCES;

async function runAll(sourceId: string): Promise<void> {
  console.log(`\n===== ${sourceId} =====`);
  const batchId = await fetch(sourceId);
  if (batchId === null) { console.log('No change, skipping remaining stages.'); return; }
  await dispatchParse(sourceId, batchId);
  await resolve(sourceId, batchId);
  await publish(sourceId, batchId);  // publish calls validate internally
}

(async () => {
  for (const src of sources) {
    switch (stage) {
      case 'fetch':    await fetch(src); break;
      case 'parse':    await dispatchParse(src); break;
      case 'resolve':  await resolve(src); break;
      case 'validate': await validate(src); break;
      case 'publish':  await publish(src); break;
      case 'all':      await runAll(src); break;
      default:
        console.error(`Unknown stage: ${stage}. Use: fetch|parse|resolve|validate|publish|all`);
        process.exit(1);
    }
  }
  console.log('\n[runner] All done.');
})().catch(e => { console.error(e); process.exit(1); });
