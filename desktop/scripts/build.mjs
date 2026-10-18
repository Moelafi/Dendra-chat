import * as esbuild from 'esbuild'
import { builds } from './build-config.mjs'

await Promise.all(builds.map((options) => esbuild.build(options)))
