// Fastify application factory. TSK-0001 skeleton: serves the built public site when a directory is given.
// Health checks, the environment schema and the staging access gate arrive in TSK-0003; host routing in TSK-0017.
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'

export interface AppOptions {
  /** Absolute path of the built public site (apps/site/dist). Omitted: no static site is served. */
  siteDir?: string
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  if (options.siteDir) {
    await app.register(fastifyStatic, { root: options.siteDir, extensions: ['html'] })
  }
  return app
}
